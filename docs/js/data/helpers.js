// Helper content by theme. Edit descriptions here, not in combat or UI modules.
// Values and read-only providers are supplied by callers on each render.
import { getStatEffectMaximum } from './balanceData.js';

// No gameplay imports: catalogs can use these texts without an import cycle.
// UI modules retain event binding, positioning, refresh and dismissal.
// Sections: stats / attacks / essences / items / battlefield / Power.

// -----------------------------------------------------------------------------
// Text escaping
// -----------------------------------------------------------------------------

function escapeEssenceHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeEssenceAttribute(value = "") {
  return escapeEssenceHTML(value).replace(/`/g, "&#96;");
}

// Presentation only: values and contributions come from the calculation engine.
export function statMaximumLabel(value, maximum, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(maximum)) return '';
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor >= maximum ? 'MAX' : '';
}
function maximumMarkup(value, maximum) {
  return statMaximumLabel(value, maximum) ? ' <small class="stat-maximum" aria-label="Maximum atteint">MAX</small>' : '';
}
function helperFigure(stat, value, unit = '', { signed = false, icon = stat, state = null, textStyle = '', malus = false, precise = false, maximum } = {}) {
  const numeric = typeof value === 'number';
  const formatted = numeric
    ? (Number.isFinite(value) ? String(precise ? value : Math.round(value * 100) / 100) : '0')
    : String(value ?? 0);
  const prefix = signed && Number(value) > 0 ? '+ ' : '';
  const key = escapeEssenceAttribute(stat);
  return `<span class="helper-figure" data-helper-stat="${key}"${precise ? ' style="overflow-wrap:anywhere"' : ''}>${icon ? `<span class="picto-stat ${key}${icon !== stat ? ` ${escapeEssenceAttribute(icon)}` : ''}" aria-hidden="true"></span>` : ''}<span class="${key}${malus ? ' stat-malus-value' : ''}"${state ? ` data-stat-state="${escapeEssenceAttribute(state)}"` : ''}${textStyle ? ` style="${escapeEssenceAttribute(textStyle)}"` : ''}>${prefix}${escapeEssenceHTML(formatted)}${escapeEssenceHTML(unit)}${maximumMarkup(value, maximum)}</span></span>`;
}

function helperContribution(stat, value, unit = '', options = {}) {
  return Number(value) === 0 || value == null ? '' : helperFigure(stat, value, unit, options);
}

function helperSum(parts) {
  return parts.filter(Boolean).join(' <span class="helper-operator">+</span> ');
}

function helperProduct(parts) {
  return parts.filter(Boolean).join(' <span class="helper-operator">×</span> ');
}

function helperRatioFigure(stat, value, unit = '', id = stat, rounding = '', { icon = null, sourcePoints = null, decimals = 1 } = {}) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return helperFigure(stat, 0, unit, { icon: null });
  const displayed = ratio.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: decimals });
  return `<span class="helper-ratio" data-helper-ratio="${escapeEssenceAttribute(id)}" data-ratio-stat="${escapeEssenceAttribute(stat)}" data-ratio-value="${ratio}" data-ratio-unit="${escapeEssenceAttribute(unit)}"${rounding ? ` data-ratio-rounding="${escapeEssenceAttribute(rounding)}"` : ''}${sourcePoints != null ? ` data-ratio-source-points="${escapeEssenceAttribute(sourcePoints)}"` : ''} tabindex="0" aria-label="Afficher le détail du ratio">${helperFigure(stat, displayed, unit, { icon })}</span>`;
}

export function buildRatioValueHelper(stat, value, unit = '', rounding = '', sourcePoints = null) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return '';
  if (sourcePoints != null && Number.isFinite(Number(sourcePoints))) {
    const points = Number(sourcePoints);
    // Equivalent coefficient for this entity's current ratio, for display only.
    // The native ratio still includes its base of 1 when the attribute is zero.
    const rawCoefficient = points > 0 ? ratio / points : ratio;
    const coefficient = Math.abs(rawCoefficient) > 0 && Math.abs(rawCoefficient) < .001
      ? rawCoefficient.toLocaleString('fr-FR', { maximumSignificantDigits: 4, useGrouping: false })
      : rawCoefficient.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false });
    return points > 0 ? helperProduct([helperFigure(stat, points), helperFigure(stat, coefficient, unit, { icon: null })])
      : `Ratio de base : ${helperFigure(stat, coefficient, unit)}`;
  }
  const precise = ratio.toLocaleString('fr-FR', { maximumFractionDigits: 4, useGrouping: false });
  return `${helperFigure(stat, precise, unit, { icon: null })}<br><span class="helper-calculation-note">Ratio réel avant arrondi${rounding === 'nearest' ? ' au plus proche' : ''}.</span>`;
}

function helperCalculation(stat, value, unit = '', contributions = [], { signed = false, icon = stat, state = null, rounded = false, malus = false, maximum } = {}) {
  const detail = Array.isArray(contributions) ? helperSum(contributions) : contributions;
  return `<span class="helper-calculation"${rounded ? ' data-helper-rounded="true"' : ''}><span class="helper-calculation-result">${helperFigure(stat, value, unit, { signed, icon, state, malus, maximum })}</span>${detail ? ` <span class="helper-calculation-detail">( ${detail} )</span>` : ''}</span>`;
}

function buildUmbraCalculation(key, model, options = {}) {
  const parts = model.parts.map((part, index) =>
    part.roundingAdjustment ? '' : `${index ? ` <span class="helper-operator">${escapeEssenceHTML(part.operator || '+')}</span> ` : ''}${buildUmbraSource(key, model, index)}`).join('');
  return helperCalculation(model.stat, options.displayValue ?? model.value, options.displayUnit ?? model.unit ?? '', parts, { maximum: model.maximum, ...options, state: model.system?.state });
}

function buildUmbraSource(key, model, index = 0, content = null) {
  const part = model.parts[index];
  if (!part) return content ?? helperFigure(model.stat, model.value, model.unit || '');
  const figure = content ?? helperFigure(part.stat, part.value, part.unit || '');
  return part.fixed || part.compact || part.progression || part.curvePreview || part.arithmetic || part.calculation
    ? `<span data-umbra-calculation="${escapeEssenceAttribute(key)}" data-umbra-part="${index}" tabindex="0">${figure}</span>` : figure;
}

export function buildAutonomousConversionHelper(calculated) {
  const models = calculated.umbraHelperCalculations || {};
  const conversion = models.autonomousConversion;
  if (!conversion) return '';
  const source = models.generatedUmbraTarget;
  const parts = source?.parts.map((part, index) => part.fixed
    ? helperFigure(part.stat, part.value, part.unit || '')
    : buildUmbraContributionHelper(source, index) || helperFigure(part.stat, part.value, part.unit || ''));
  return (source ? helperCalculation(source.stat, source.value, source.unit || '', parts)
    : helperFigure(conversion.stat, conversion.parts[0]?.value ?? 0))
    + ` <span class="helper-operator">→</span> ${helperFigure(conversion.stat, conversion.value, conversion.unit || '', { maximum: conversion.maximum })}`
    + buildCalculationSources(source);
}

function buildCalculationSources(model) {
  const sources = buildStatisticOrigins({ contributions: (model?.parts || []).filter(part => part.sources?.length)
    .map(part => ({ key: part.stat, sources: part.sources, unit: part.unit || '' })) });
  return sources ? ` ${sources}` : '';
}

function helperUmbraIcon(umbra) {
  const key = escapeEssenceAttribute(umbra);
  return umbra ? `<span class="picto-stat ${key}" data-helper-umbra-source="${key}" aria-hidden="true"></span> ` : '';
}

function helperStatisticLabel(stat, name, state = 'normal', umbra = null) {
  return `${helperUmbraIcon(umbra)}<span class="${escapeEssenceAttribute(stat)}" data-stat-state="${state}">${escapeEssenceHTML(name)}${['normal', 'umbra', 'attribute'].includes(state) ? '' : ` ${escapeEssenceHTML(state)}`}</span>`;
}

export function buildAutonomousCalculationHelper(model, resultHTML, statName = model.stat) {
  if (model.stat === 'shift' && model.system) statName = 'Déplacements max';
  if (model.umbraCardTotal) {
    const effect = model.effectiveness;
    const effectLine = effect ? `<br><div class="helper-total-effect">${escapeEssenceHTML(effect.label)} : ${helperFigure(model.stat, effect.value, ' %')}.</div>` : '';
    const native = model.system?.critical && model.system.fixed ? `<br><span class="helper-calculation-note">Inclut ${model.system.fixed} % de supplément critique de base.</span>` : '';
    return `<div class="helper-score-total">Total de l’entité : ${helperFigure(model.stat, model.value, model.unit)}</div>${effectLine}${native}`;
  }
  if (model.contributions || model.kind) {
    const entries = (model.contributions || [model]).filter(part => part.value !== 0);
    const lines = entries.map((part, index) => {
      const subtract = part.value < 0;
      const separator = model.contributions && (index || subtract)
        ? `<div class="helper-operator${subtract ? ' stat-malus-value' : ''}" data-autonomous-operator="${subtract ? '−' : '+'}">${subtract ? '−' : '+'}</div>` : '';
      return `${separator}<div class="helper-calculation" data-autonomous-kind="${part.kind}" data-contribution-value="${part.value}">${helperStatisticLabel(model.stat, part.kind === 'native' ? 'Supplément critique de base' : statName, part.state, part.umbra)} : ${helperCalculation(model.stat, model.contributions ? Math.abs(part.value) : part.value, model.unit, [], { signed: !model.contributions, state: part.state, malus: subtract })}</div>`;
    });
    return lines.join('');
  }
  if (model.system) {
    const row = model.system;
    const line = (kind, value, label, state, umbra = null) => {
      return `<div class="helper-calculation" data-autonomous-kind="${kind}">${helperStatisticLabel(model.stat, label, state, umbra)} : ${helperCalculation(model.stat, value, row.unit, [], { state, signed: kind === 'base' })}</div>`;
    };
    const base = row.normal + row.plusApplied + (row.umbraFlat || 0);
    const lines = [
      line('base', base, 'Stat de base', 'normal'),
      line('total', row.value, statName, row.state, row.umbra > 0 ? row.origin : null),
    ];
    return lines.join('');
  }
  const parts = helperCalculationParts(model);
  return `<span class="helper-calculation">${resultHTML}${parts ? ` <span class="helper-calculation-detail">( ${parts} )</span>` : ''}</span>`
    + buildCalculationSources(model);
}

function helperCalculationParts(model, { concise = false, ratioPath = 'calculation' } = {}) {
  if (model.passiveCurve) {
    const c = model.passiveCurve;
    const vision = helperFigure(c.origin || 'vision', c.points);
    const attribute = c.attribute || 'agility';
    const ratio = helperRatioFigure(attribute, c.ratio, '', `${ratioPath}:${attribute}`, 'nearest',
      { icon: attribute, sourcePoints: c.attributePoints ?? c.agility, decimals: c.ratioDecimals ?? 1 });
    return helperProduct([vision, ratio]);
  }
  const visible = { ...model, parts: model.parts.filter(part => !part.roundingAdjustment) };
  return visible.parts.map((part, index) => {
    const ratio = Number.isFinite(part.coefficient) ? { points: part.points, value: part.coefficient, decimals: part.ratioDecimals }
      : part.compact?.source ? { points: part.compact.source.value, value: part.compact.multiplier.value,
        stat: part.compact.source.stat, ratioStat: part.compact.multiplier.stat, unit: part.compact.multiplier.unit, decimals: part.compact.multiplier.decimals } : null;
    const detail = concise && part.calculation
      ? `( ${helperCalculationParts(part.calculation, { concise: true, ratioPath: `${ratioPath}:${index}` })} )`
      : concise && ratio
      ? helperProduct([helperFigure(ratio.stat || part.stat, ratio.points),
        helperRatioFigure(ratio.ratioStat || ratio.stat || part.stat, ratio.value, ratio.unit || '', `${ratioPath}:${index}`, Number.isFinite(part.coefficient) ? 'nearest' : part.rounding || '', { decimals: ratio.decimals ?? 1 })])
      : concise && part.arithmetic
        ? part.arithmetic.terms.map((term, termIndex, terms) => typeof term === 'string'
          ? ` <span class="helper-operator">${escapeEssenceHTML(term)}</span> `
          : ['×', '*'].includes(terms[termIndex - 1])
            ? helperRatioFigure(term.stat === 'neutral' ? part.stat : term.stat, term.value, term.unit || '', `${ratioPath}:${index}:${termIndex}`)
          : helperFigure(term.stat, Number(term.value), term.unit || '', { icon: term.icon === undefined ? term.stat : term.icon })).join('')
      : concise && (part.curvePreview || part.progression)
        ? helperFigure(part.stat, part.value, part.unit || '')
      : part.fixed && part.grantedLevel == null
      ? helperFigure(part.stat, part.value, part.unit || '', { state: part.state, malus: part.malus, icon: part.icon === undefined ? part.stat : part.icon })
        + (part.label ? ` <span class="${escapeEssenceAttribute(part.stat)}">${escapeEssenceHTML(part.label)}</span>` : '')
      : buildUmbraContributionHelper(visible, index) || helperFigure(part.stat, part.value, part.unit || '');
    return `${index || part.operator === '\u2212' ? ` <span class="helper-operator">${escapeEssenceHTML(part.operator || '+')}</span> ` : ''}${detail}`;
  }).join('');
}

export function buildUmbraContributionHelper(model, index) {
  const part = model?.parts?.[index];
  if (!part) return '';
  const compact = part.compact;
  // Show the actual engine coefficient and product before integer rounding.
  const progressiveRatio = Number.isFinite(part.coefficient);
  let detail;
  if (progressiveRatio) {
    const exact = (value, icon = null) => helperFigure(part.stat, value, '', { icon, precise: true });
    detail = `( ${helperProduct([exact(part.points, part.stat), exact(part.coefficient)])} = ${exact(part.raw)} avant arrondi`;
    detail += part.points > part.normalPoints
      ? ` ; retenu : ${exact(part.value)} )`
      : ` ; arrondi au plus proche : ${exact(part.value)} )`;
  } else if (part.calculation) {
    detail = `( ${helperCalculationParts(part.calculation)} ) <span class="helper-operator">\u2192</span> ${helperFigure(model.stat, part.value, part.unit || '')}`;
  } else if (part.fixed) {
    detail = helperFigure(part.stat, part.value, part.unit || '', { icon: null });
    if (part.grantedLevel != null) detail += `<br>Niveau accordé lors de l'invocation : ${helperFigure('neutral', part.grantedLevel, '', { icon: null })}.`;
  } else if (part.progression) {
    const outputStat = part.progression.stat || model.stat;
    const milestone = step => `${helperFigure(part.stat, step.points)} <span class="helper-operator">→</span> ${helperFigure(outputStat, step.count, '', { icon: part.progression.icon || outputStat })}`;
    detail = `<span class="neutral">Palier ${part.progression.current.count} :</span> `
      + milestone({ points: part.progression.threshold, count: part.progression.current.count });
  } else if (part.curvePreview) {
    const contribution = step => (step.points == null ? '' : `${helperFigure(part.stat, step.points)} <span class="helper-operator">→</span> `)
      + helperFigure(part.stat, step.value, part.outputUnit ?? part.unit ?? '', { icon: null });
    detail = contribution(part.curvePreview.current);
  } else if (part.arithmetic) {
    detail = part.arithmetic.terms.map(term => typeof term === 'string'
      ? ` <span class="helper-operator">${escapeEssenceHTML(term)}</span> `
      : helperFigure(term.stat, term.value, term.unit, { icon: term.icon === undefined ? term.stat : term.icon })).join('');
    if (part.arithmetic.minimum != null) {
      detail += ` <span class="neutral">· Minimum : ${escapeEssenceHTML(part.arithmetic.minimum)}${escapeEssenceHTML(part.unit || '')}</span>`;
    }
  } else {
    if (!compact?.source) return '';
    detail = helperProduct([
      helperFigure(compact.source.stat, compact.source.value),
      helperFigure(compact.multiplier.stat === 'neutral' ? compact.source.stat : compact.multiplier.stat,
        String(Number(compact.multiplier.value.toPrecision(6))), compact.multiplier.unit, { icon: null }),
    ]);
    if (part.rounded && Math.abs(compact.source.value * compact.multiplier.value - part.value) > 0.000001) {
      detail += ` <span class="helper-operator">\u2192</span> ${helperFigure(part.stat, part.value, part.unit || '')}`;
    }
  }
  return `<span class="helper-calculation"><span class="helper-calculation-detail">${detail}</span></span>`
    + (part.note && !progressiveRatio ? `<br>${escapeEssenceHTML(part.note)}` : '')
    + buildCalculationSources({ parts: [part] });
}

function helperEffectTitle(stat, label, { bonus = false, icon = stat, state = null, umbra = null } = {}) {
  const key = escapeEssenceAttribute(stat);
  const picto = umbra ? helperUmbraIcon(umbra) : `<span class="picto-stat ${key}${icon !== stat ? ` ${escapeEssenceAttribute(icon)}` : ''}${bonus ? ' picto-stat--bonus' : ''}" aria-hidden="true"></span>`;
  const suffix = state && state !== 'normal' ? ` ${escapeEssenceHTML(state)}` : bonus ? ' +' : '';
  return `${picto}<span class="${key}" data-helper-effect="${escapeEssenceAttribute(icon)}"${state || bonus ? ` data-stat-state="${escapeEssenceAttribute(state || '+')}"` : ''}>${escapeEssenceHTML(label)}${suffix}</span>`;
}

const HASTE_EFFECT_ICONS = {
  cooldownTime: 'cooldown-haste',
  preparationTime: 'preparation-haste',
  executionTime: 'execution-haste',
  projectileTime: 'projectile-speed-haste',
  recuperationTime: 'recuperation-haste',
};

// Labels for visual effects that are not standalone entries in statsData.
export const HELPER_PICTOGRAM_NAMES = {
  day: 'Début de la journée',
  criticalChance: 'Chance de critique',
  criticalDamage: 'Dégâts critiques',
  cognitiveExplosion: 'Explosion cognitive',
  cognitiveGenerator: 'Générateur cognitif',
  'essence-hyperco': "Essence d'intelligence hypercognitive",
  indestructibleSkin: 'Peau indestructible',
  ambidextryChance: 'Chance de deuxième coup',
  dominantArm: 'Dégâts du deuxième coup',
  controlledSpeed: 'Vitesse contrôlée',
  agileRetreat: 'Retraite agile',
  resilienceTotal: 'Résilience totale',
  criticalResistance: 'Résistance aux critiques',
  alterationResistance: 'Résistance aux altérations',
  hindranceResistance: 'Résistance aux entraves',
  indestructibilityTotal: 'Indestructibilité totale',
  indestructibilityCooldown: 'Cooldown d’Indestructibilité',
  esoterismChance: 'Protection ésotérique',
  esoterismReduction: 'Réduction magique',
  esoterismPiercingChance: 'Protection perçante',
  esoterismPiercingReduction: 'Réduction perçante',
  esoterismCooldown: 'Cooldown d’Ésotérisme',
  solarArmor: 'Armure solaire',
  astralReturn: 'Retour astral',
  astralCooldown: 'Cooldown astral',
  transcendentalCooldown: 'Cooldown transcendantal',
  improvedResurrection: 'Résurrection améliorée',
  mysticTrance: 'Trance mystique',
  'cooldown-haste': 'Cooldown +',
  'preparation-haste': 'Préparation +',
  'execution-haste': 'Exécution +',
  'projectile-speed-haste': 'Vitesse des projectiles +',
  'recuperation-haste': 'Récupération +',
  'balance-view': 'Perception équilibrée',
  'balance-strike': 'Attaque équilibrée',
  aggro: 'Aggro',
  alteration: "Altération d'état",
  entrave: 'Entrave',
  bloodExecution: 'Exécution',
  bloodCrazy: 'Démence sanguinaire',
  bloodGlutony: 'Voracité sanguinaire',
  fragility: 'Fragilité des ombres',
  indiscretion: 'Discrétion',
  overkill: 'Overkill',
  psionic: 'Psionique',
  brokenSpell: 'Surcharge',
  meleeAttack: 'Corps à corps',
  healing: 'Soin',
  dot: 'Dégâts sur la durée',
  transpiercingDamage: 'Puissance perçante',
};

// -----------------------------------------------------------------------------
// Shared explanations
// -----------------------------------------------------------------------------

export const HELPER_TEXT = {
  criticalDamageName: (exclusive = false) => exclusive ? 'Super dégât critique' : 'Dégâts critiques',
  attributeTitle: name => `Attribut : ${escapeEssenceHTML(name)}`,
  umbraCalculationTitle: statName => `Détail du ratio : ${escapeEssenceHTML(statName)}`,
  ratioValueTitle: statName => `Valeur du ratio ${/^[aeiouhàâäéèêëîïôöùûü]/i.test(statName) ? 'd’' : 'de '}${escapeEssenceHTML(statName)}`,
  calculationTitle: 'Détail du calcul',
  sourcesTitle: 'Source',
  statTitle: (name, isUmbra = false) => `${isUmbra ? 'Umbra' : 'Statistique'} : ${escapeEssenceHTML(name)}`,
  malusTypeTitle: (name, stat) => `Type de malus : ${stat ? helperEffectTitle(stat, name) : escapeEssenceHTML(name)}`,
  exclusivePassiveTitle: (name, umbra) => `Passive exclusive ${umbra ? `de ${escapeEssenceHTML(umbra)}` : 'à l’Umbra'} : ${escapeEssenceHTML(name)}`,
  statNameFallback: name => escapeEssenceHTML(name),
  umbraFixedValueTitle: 'Valeur fixe',
  umbraRoundedValue: 'La valeur finale est arrondie.',
  statRoundedValue: 'La stat est arrondie.',
  umbraMayBeRounded: 'La statistique peut être arrondie.',
  improvedStatistic: "L'Umbra accorde une version améliorée de cette statistique qui lui permet de bénéficier de ratios d'amélioration.",
  dayStart: "Après chaque visite d'une zone, une nouvelle journée commence. À chaque nouvelle journée, des actions se produisent. Les ennemis progressent, la vie devient plus chère, certaines entités pansent leurs blessures, d'autres non, etc.",
  restrictedUmbra: 'L’entité doit être éveillée pour utiliser les Umbras.',
  destroyedChest: "Ce coffre est détruit. Il n'y a plus rien a en tirer.",
  destroyedCorpse: "Ces restes ont été complétement broyés. Ils ne sont bon qu'a nourrir les rats...",
  inertResistance: 'Les attaques Inertes sont dépouillées de toute forme d’essence. Cette attaque est réduite par toutes les résistances du jeu : physique puis magique sur la totalité des dégâts restants.',
  attackUmbraCompatibility: "La compatibilité concerne les Umbras offensifs de cette attaque. Les Umbras défensifs et utilitaires restent actifs. Les essences n'accordent aucun Umbra non appris ; un équipement n'accorde que sa propre contribution.",
  attackPriorityAuto: '<strong>Priorité automatique</strong><br>Classe les attaques selon leur cooldown effectif : le cooldown le plus long reçoit la priorité 1.<br><br>Les rangs restent modifiables. Changer manuellement une priorité quitte le mode automatique.',
  attackPriority: '<strong>Priorité de l\'attaque</strong><br>La priorité 1 est la plus forte. Parmi les attaques disponibles disposant d\'une cible valide, le rang pondère le choix et la fréquence d\'utilisation sans condamner les priorités inférieures.<br><br>Choisir un rang déjà occupé échange les deux attaques et active le réglage manuel.',
  unusedPhysicalRatio: '<br><br>Cette attaque n\'utilise pas la puissance physique.',
  unusedMagicalRatio: '<br><br>Cette attaque n\'utilise pas la puissance magique.',
  inertReduction: 'Réductions successives sur les dégâts arrivant aux résistances, après le passage dans l’armure. Le pourcentage total est pondéré par les dégâts soumis, hors esquives et annulations. Ce ne sont pas des HP préservés.',
  roleDuration: 'Selon le temps passé vivant dans chaque rôle pendant le combat. Un combat peut compter pour plusieurs rôles, une seule fois par rôle.',
  summonResistance: 'Dégâts réels aux HP et à l’armure, divisés par le nombre d’invocations de ce type. Inclut les invocations encore vivantes.',
  frozenEntity: 'Reste Égarée. Les Umbras de rang 2 et 3 sont inactives, même après résurrection ou reset ombilical.',
  dayState: "État de l'entité au changement de jour du jeu. Les séries sont interrompues par une mort ou une résurrection."
};


// -----------------------------------------------------------------------------
// Stats, Umbras and timings
// -----------------------------------------------------------------------------

const GENERATED_STAT_HELPERS = Object.fromEntries([
  ['physicalDamage', 'Puissance physique', 'vigueur', 'Vigueur', 'strength', 'Force'],
  ['magicalDamage', 'Puissance magique', 'esprit', 'Esprit', 'intelligence', 'Intelligence'],
  ['piercingDamage', 'Puissance perçante', 'finesse', 'Finesse', 'agility', 'Agilité'],
  ['physicalPen', 'Pénétration physique', 'brutality', 'Brutalité', 'strength', 'Force'],
  ['magicalPen', 'Pénétration magique', 'inflexion', 'Inflexion', 'intelligence', 'Intelligence'],
  ['physicalResistance', 'Résistance physique', 'constitution', 'Constitution', 'strength', 'Force'],
  ['magicalResistance', 'Résistance magique', 'integrite', 'Intégrité', 'intelligence', 'Intelligence'],
  ['dodge', 'Esquive', 'adresse', 'Adresse', 'agility', 'Agilité'],
  ['precision', 'Précision', 'vision', 'Vision', 'agility', 'Agilité'],
  ['hindranceResistance', 'Résistance aux entraves', 'resilience', 'Résilience', 'agility', 'Agilité'],
  ['alterationResistance', 'Résistance aux altérations', 'resilience', 'Résilience', 'intelligence', 'Intelligence'],
  ['criticalResistance', 'Résistance aux critiques', 'resilience', 'Résilience', 'strength', 'Force'],
  ['equilibreAggroBonus', 'Présence équilibrée', 'equilibre', 'Équilibre', 'strength', 'Force'],
  ['equilibreInvisibleDetection', 'Perception équilibrée', 'equilibre', 'Équilibre', 'agility', 'Agilité'],
  ['equilibreAggroReduction', 'Réduction d’aggro', 'equilibre', 'Équilibre', 'intelligence', 'Intelligence'],
  ['criticalChance', 'Chance de critique', 'criticalPower', 'Puissance critique', 'agility', 'Agilité'],
  ['velocity', 'Vélocité', 'vivacite', 'Vivacité', 'agility', 'Agilité'],
  ['armor', 'Armure', 'robustness', 'Robustesse', 'strength', 'Force'],
  ['fatalSurvival', 'Survie fatale', 'astrality', 'Astralité', 'intelligence', 'Intelligence'],
  ['bloodThirsty', 'Soif de sang', 'bloodFury', 'Fureur sanguinaire', 'strength', 'Force'],
  ['cognitiveExplosion', 'Explosion cognitive', 'hypercognition', 'Hypercognition', 'intelligence', 'Intelligence'],
].map(([target, name, source, sourceName, attribute, attributeName]) =>
  [target, { target, name, source, sourceName, attribute, attributeName }]));
const GENERATED_UMBRA_HELPERS = Object.fromEntries(Object.values(GENERATED_STAT_HELPERS).map(family => [family.source, family]));
const partitive = name => /^[aeiouhàâäéèêëîïôöùûü]/i.test(name) ? "de l'" : 'de la ';
const possessive = name => /^[aeiouhàâäéèêëîïôöùûü]/i.test(name) ? 'son' : 'sa';
const RANGE_PENALTY_EFFECT = { name: 'Malus distance', icon: 'rangeAttack' };

export const STAT_HELPER_DESCRIPTIONS = {
  ...Object.fromEntries(Object.values(GENERATED_STAT_HELPERS).flatMap(family => {
    const target = helperEffectTitle(family.target, family.name);
    const attribute = `${possessive(family.attributeName)} ${helperEffectTitle(family.attribute, family.attributeName)}`;
    const source = helperEffectTitle(family.source, family.sourceName);
    return [
      [family.source, `Confère ${partitive(family.sourceName)}${source} et la capacité d'utiliser ${helperEffectTitle(family.target, family.name, { state: 'X' })}.`],
      [`${family.target}Plus`, `Fournit ${partitive(family.name)}${target} et permet à l'entité d'utiliser ${attribute} pour améliorer son total de ${target}.`],
      [`${family.target}X`, `L'entité utilise ${attribute} et ${possessive(family.sourceName)} ${source} pour améliorer ${possessive(family.name)} ${target}.`],
    ];
  })),
  "bloodFury": `Confère ${helperEffectTitle('bloodThirsty', 'Soif de sang', { state: 'X' })} et les passives exclusives ${helperEffectTitle('bloodExecution', 'Exécution')}, ${helperEffectTitle('bloodCrazy', 'Démence sanguinaire')} et ${helperEffectTitle('bloodGlutony', 'Voracité sanguinaire')}.`,
  bloodExecution: "Au corps à corps, chaque attaque a une chance d’infliger des dégâts supplémentaires si la cible est au seuil de HP indiqué ou en dessous. Une exécution réussie ne garantit pas sa mort.",
  bloodCrazy: "Tuer une cible par exécution permet à la prochaine attaque d’ignorer le seuil de HP requis. La chance d’exécution reste nécessaire ; une attaque incompatible consomme aussi cet effet.",
  bloodGlutony: "Une exécution mortelle avec un overkill restaure tous les HP de l’entité. Les surdégâts doivent atteindre au moins 150 % des HP que la cible possédait avant le coup.",
  solarArmor: "Au début de chaque journée, restaure entièrement l’armure accordée par Robustesse si l’entité est vivante. Les réserves des équipements, sorts et bonus autonomes ne sont pas rechargées.",
  "indestructibility": "Permet d’annuler des dégâts, de les atténuer et de régénérer des HP en combat.",
  indestructibilityTotal: 'Lorsque l’armure est épuisée, peut annuler les dégâts restants d’un impact. Les effets associés restent appliqués. Une réussite déclenche le cooldown d’Indestructibilité.',
  indestructibleSkin: 'Réduit les dégâts reçus sur les HP lorsque l’armure est épuisée.',
  esoterismChance: 'Chance de déclencher la protection ésotérique sur une attaque magique ou perçante. L’effet partage un même cooldown pour les deux protections.',
  esoterismReduction: 'Réduit les dégâts magiques reçus quand Ésotérisme réussit, y compris la partie magique des attaques hybrides. L’Agilité renforce cette réduction.',
  esoterismPiercingChance: 'Après une activation d’Ésotérisme, chance de protéger aussi contre les dégâts perçants. La Force augmente cette chance. Fonctionne également contre une attaque purement perçante.',
  esoterismPiercingReduction: 'Dégâts perçants évités lorsque leur protection réussit. Cette réduction vaut la moitié de la réduction magique.',
  esoterismCooldown: 'Délai après une protection réussie avant de pouvoir déclencher à nouveau Ésotérisme. L’Intelligence réduit ce délai, partagé par les dégâts magiques et perçants. Une tentative échouée ne déclenche aucun cooldown.',
  indestructibilityCooldown: 'Délai après une annulation réussie avant de pouvoir déclencher à nouveau Indestructibilité totale. La Force réduit ce délai. Peau indestructible et la régénération restent actives.',
  "vitality": `Augmente les ${helperEffectTitle('HP', 'HP max')}.`,
  "resilience": `Atténue le supplément des coups critiques et les altérations subies. Permet aussi d’annuler les altérations et les entraves.`,
  "criticalResistance": `Réduit le supplément des ${helperEffectTitle('criticalChance', 'coups critiques')}. Le coup reste critique et conserve ses dégâts de base.`,
  "criticalResistancePlus": `Réduit le supplément des ${helperEffectTitle('criticalChance', 'coups critiques')}. Le coup reste critique et conserve ses dégâts de base.`,
  "criticalResistanceX": `Réduit le supplément des ${helperEffectTitle('criticalChance', 'coups critiques')}. Le coup reste critique et conserve ses dégâts de base.`,
  "alteration": `Les ${helperEffectTitle('alteration', 'altérations d’état')} sont des malus qui entraînent une instabilité chez la cible et restent sur elle pendant une certaine durée du combat. Elles peuvent l’empêcher de lancer des sorts, ralentir sa vitesse d’incantation, lui infliger des dégâts sur la durée, etc.`,
  "entrave": `Les ${helperEffectTitle('entrave', 'entraves')} sont des malus qui entraînent des répercussions négatives sur le positionnement de l’entité : mouvement forcé, paralysie partielle ou totale, etc.`,
  "alterationResistance": `Atténue les dégâts, l’intensité ou la durée des ${helperEffectTitle('alteration', 'altérations d’état')}, selon leur règle.`,
  "alterationResistancePlus": `Atténue les dégâts, l’intensité ou la durée des ${helperEffectTitle('alteration', 'altérations d’état')}, selon leur règle.`,
  "alterationResistanceX": `Atténue les dégâts, l’intensité ou la durée des ${helperEffectTitle('alteration', 'altérations d’état')}, selon leur règle.`,
  "hindranceResistance": `Chance d’annuler les ${helperEffectTitle('entrave', 'entraves')} après l’échec du jet de Résilience totale.`,
  "hindranceResistancePlus": `Chance d’annuler les ${helperEffectTitle('entrave', 'entraves')} après l’échec du jet de Résilience totale.`,
  "hindranceResistanceX": `Chance d’annuler les ${helperEffectTitle('entrave', 'entraves')} après l’échec du jet de Résilience totale.`,
  "resilienceTotal": `Premier jet pour annuler entièrement une ${helperEffectTitle('alteration', 'altération d’état')} ou une ${helperEffectTitle('entrave', 'entrave')} à son application.`,
  "weaponMastery": `La ${helperEffectTitle('weaponMastery', "Maîtrise d'arme")} représente l'art de choisir, porter et exploiter l'équipement de guerre.`,
  "hypercognition": `L'${helperEffectTitle('hypercognition', 'hypercognition')} transforme l'entité en réacteur magique.`,
  "cognitiveExplosion": "Ce bonus s'ajoute aux dégâts de l'attaque sans en changer la nature.",
  "cognitiveGenerator": "L'entité peut générer elle-même ses essences d'intelligence hypercognitive.",
  "transcendenceTotal": "Chance de ressusciter sans consommer la vie utilisée. Une réussite déclenche le cooldown transcendantal ; pendant ce délai, les résurrections consomment normalement leurs vies.",
  transcendentalCooldown: "Délai après une réussite de Transcendance totale. L’Intelligence avec Transcendance réduit la durée de 5 secondes vers 2 secondes. Un jet échoué ne déclenche aucun cooldown. Sans l’Umbra, les protections autonomes utilisent 5 secondes.",
  improvedResurrection: `Avec l’Umbra ${helperEffectTitle('transcendence', 'Transcendance')}, l’${helperEffectTitle('intelligence', 'Intelligence')} augmente les HP rendus par une ${helperEffectTitle('extraLife', 'vie supplémentaire')}. Sans cette Umbra, seul le soin de base s’applique.`,
  "astrality": `Accorde Survie fatale X, Retour astral et Corps astral.`,
  fatalSurvival: "Chance de rester à 1 HP lorsqu’un coup devrait tuer l’entité. Sans Astralité, cette statistique ne donne ni Retour astral ni Corps astral.",
  astralReturn: "Après une Survie fatale réussie avec Astralité, restaure progressivement des HP. Seule la Force augmente le soin, de 10 % vers 99 % des HP maximum. Le budget est réparti sur le cooldown astral ; seule l’Agilité avec l’Umbra réduit cette durée. Survie fatale, bonus autonomes compris, reste indisponible jusqu’à la fin prévue, même si les HP sont pleins.",
  astralCooldown: "Détermine la durée entre deux Survies fatales réussies, toutes sources confondues. Sans Umbra, le délai de base est fixe. Avec Astralité, seule l’Agilité le réduit. Retour astral distribue son soin pendant ce même délai, sans cooldown supplémentaire. Corps astral garde son cycle indépendant.",
  astralBody: "Un jet est effectué à intervalle régulier lorsque Corps astral est inactif. Une réussite fait rater les attaques magiques pures hostiles : dégâts et malus annulés. La durée de base est multipliée par le ratio d’Astralité. Après la fin, une nouvelle attente précède le prochain jet. Les attaques composées sont inchangées.",
  "transcendence": "Accorde une affinité avec les résurrections.",
  "haste": `La ${helperEffectTitle('haste', 'Hâte')} permet à l'entité d'enchaîner ses attaques plus rapidement.`,
  "equilibreAggroReduction": "Réduit l’aggro générée par les dégâts de l’entité.",
  equilibreAggroBonus: "Augmente l’aggro générée par les dégâts, les soins et les éliminations de l’entité. Le bonus s’applique après la réduction d’aggro des dégâts et se cumule avec le multiplicateur du rôle. Les dégâts d’une attaque équilibrée ne génèrent toujours aucune aggro.",
  equilibreAggroBonusPlus: `Augmente l’aggro générée par les dégâts, les soins et les éliminations, avec l’aide de la ${helperEffectTitle('strength', 'Force')}.`,
  equilibreAggroBonusX: `L’entité utilise sa ${helperEffectTitle('strength', 'Force')} et son ${helperEffectTitle('equilibre', 'Équilibre')} pour augmenter l’aggro générée par ses dégâts, ses soins et ses éliminations.`,
  "equilibreAggroReductionPlus": `Réduit l’aggro générée par les dégâts de l’entité, avec l’aide de son ${helperEffectTitle('intelligence', 'Intelligence')}.`,
  "equilibreAggroReductionX": `L’entité utilise son ${helperEffectTitle('intelligence', 'Intelligence')} et son ${helperEffectTitle('equilibre', 'Équilibre')} pour réduire l’aggro générée par ses dégâts.`,
  "equilibreInvisibleDetection": "Réduit l’évitement du ciblage des ennemis invisibles, en points de pourcentage. L’évitement restant ne peut pas être négatif.",
  "equilibreInvisibleDetectionPlus": `Réduit l’évitement du ciblage des ennemis invisibles, avec l’aide de l’${helperEffectTitle('agility', 'Agilité')}.`,
  "equilibreInvisibleDetectionX": `L’entité utilise son ${helperEffectTitle('agility', 'Agilité')} et son ${helperEffectTitle('equilibre', 'Équilibre')} pour réduire l’évitement du ciblage des ennemis invisibles.`,
  "equilibreBalancedAttackChance": `Chance que l’attaque ne génère aucune aggro. Passive exclusive à ${helperEffectTitle('equilibre', 'Équilibre')}, renforcée par l’${helperEffectTitle('intelligence', 'Intelligence')}.`,
  "equilibre": `L'${helperEffectTitle('equilibre', 'Équilibre')} module l’attention des ennemis selon ses attributs et améliore sa perception des cibles invisibles.`,
  "mysticism": `Le ${helperEffectTitle('mysticism', 'Mysticisme')} peut déclencher une ${helperEffectTitle('mysticism', 'transe mystique')} pendant la ${helperEffectTitle('preparationTime', 'préparation')} de l'attaque.`,
  "criticalPower": `Confère ${helperEffectTitle('criticalChance', 'Chance de critique', { state: 'X' })} et la passive exclusive ${helperEffectTitle('criticalDamage', HELPER_TEXT.criticalDamageName(true))}.`,
  "ambidextry": "L'entité est si agile qu'elle peut manier ses deux bras pour attaquer plusieurs fois.",
  "esoterism": `Chance de réduire les ${helperEffectTitle('magicalDamage', 'dégâts magiques')} subis.`,
  "occultism": `L’${helperEffectTitle('occultism', 'Occultisme')} accorde la maîtrise des arts occultes de l’assassinat. L’entité a une chance de devenir invisible afin de préparer une attaque puissante.`,
  "vision": `Confère de la ${helperEffectTitle('vision', 'Vision')} et la capacité d'utiliser ${helperEffectTitle('precision', 'Précision', { state: 'X' })} et ${helperEffectTitle('bullsEye', 'Bull’s Eye')}.`,
  "precision": "Améliore la capacité à toucher en réduisant l’esquive adverse et l’évitement dû à l’invisibilité. Concerne les attaques physiques, perçantes, cinétiques, hybrides, spectrales, prismatiques et inertes.",
  "bullsEye": `Réduit la réduction des dégâts due au ${helperEffectTitle(RANGE_PENALTY_EFFECT.icon, RANGE_PENALTY_EFFECT.name)} sur les parties non magiques des attaques à distance. Les attaques prismatiques sont exemptées de ce malus.`,
  "movement": `Le ${helperEffectTitle('movement', 'Mouvement')} améliore les capacités de ${helperEffectTitle('shift', 'déplacement')} de l'entité pendant les combats.`,
  "physicalDamage": `La ${helperEffectTitle('physicalDamage', 'Puissance Physique')} détermine les dégâts physiques des attaques. Réduits par la ${helperEffectTitle('physicalResistance', 'résistance physique')}.`,
  "magicalDamage": `La ${helperEffectTitle('magicalDamage', 'Puissance Magique')} détermine les dégâts magiques des attaques. Réduits par la ${helperEffectTitle('magicalResistance', 'résistance magique')}.`,
  "piercingDamage": `La ${helperEffectTitle('piercingDamage', 'Puissance Perçante')} détermine les dégâts perçants.`,
  "physicalPen": `Ignore un % de la ${helperEffectTitle('physicalResistance', 'résistance physique')}.`,
  "magicalPen": `Ignore un % de la ${helperEffectTitle('magicalResistance', 'résistance magique')}.`,
  "physicalResistance": `Réduit les ${helperEffectTitle('physicalDamage', 'dégâts physiques')} subis.`,
  "magicalResistance": 'Protection de base contre la puissance magique.',
  "magicalResistancePlus": 'Bonne protection contre la puissance magique. Elle est renforcée par l’Intelligence de l’entité.',
  "magicalResistanceX": 'Ultime protection contre la puissance magique. Elle est renforcée par l’Intelligence et l’Intégrité de l’entité.',
  "velocity": "Réduit le délai de remplissage de la barre d’action. La Vélocité améliore aussi les chances de fuite.",
  "controlledSpeed": "Atténue le recul de progression de la préparation ou de l’exécution au corps à corps lors des déplacements commandés par le joueur, y compris les échanges de cases entre alliés. Les déplacements imposés par un effet ne sont pas atténués. Passive exclusive à Vivacité, renforcée par l’Agilité. L’atténuation tend vers 99 % au maximum.",
  "agileRetreat": "La Vélocité améliore les chances de réussir chaque tentative de fuite. Le jet conserve ses conditions habituelles : une entité empêchée de fuir ne peut pas partir.",
  "dodge": "Améliore l’esquive.",
  "criticalChance": `Les attaques qui le peuvent ont une chance de réaliser un ${helperEffectTitle('criticalChance', 'coup critique')}.`,
  "criticalChancePlus": `Améliore la chance de critique avec le ratio fixe d’${helperEffectTitle('agility', 'Agilité')}. Les gains sont exprimés en %.`,
  "criticalChanceX": `Améliore la chance de critique avec les ratios évolutifs de ${helperEffectTitle('criticalPower', 'Puissance critique')} et de l’${helperEffectTitle('agility', 'Agilité')}. Les gains sont exprimés en %.`,
  "criticalDamage": 'Augmente le supplément de dégâts des coups critiques.',
  "superCriticalDamage": `Passive exclusive de ${helperEffectTitle('criticalPower', 'Puissance critique')}. Regroupe les dégâts critiques de l’entité et les renforce avec le ratio de cette Umbra.`,
  "fracass": "Renforce les attaques purement physiques : la force brute fracasse littéralement la cible.",
  "HP": `${helperEffectTitle('HP', 'Points de vie')} de l'entité. S'ils tombent à zéro, l'Entité meurt.`,
  "armor": `Protection des ${helperEffectTitle('HP', 'points de vie')} de l'entité. Les points de vie sont protégés jusqu’à destruction de l’${helperEffectTitle('armor', 'armure')}.`,
  "weight": "Poids de l'entité. Influence sa manière de se mouvoir en combat.",
  "speed": "Détermine la vitesse d'action de votre Entité.",
  "hybridalDamage": "La Puissance hybride combine Physique et Magique. Chaque résistance réduit 50% des dégâts.",
  "eternalLife": `Permet de sauver une entité de la mort. L'entité revient à la vie avec ${helperEffectTitle('HP', '100 % de ses PV max')}. Se régénère à chaque nouvelle journée.`,
  "extraLife": `Permet de sauver une entité de la mort en restaurant une partie de ses ${helperEffectTitle('HP', 'HP maximum')}. Avec l’Umbra ${helperEffectTitle('transcendence', 'Transcendance')}, l’${helperEffectTitle('intelligence', 'Intelligence')} augmente ce soin. Nécessite plusieurs journées pour se régénérer.`,
  "fadedLife": `Permet de sauver une entité de la mort. L'entité revient à la vie avec ${helperEffectTitle('HP', '50 % de ses PV max')}. Ne se régénère pas une fois consommée.`,
  "strength": "La Force est l'attribut majeur des Entités utilisant leur aptitude physique pour combattre.",
  "agility": "L'Agilité est l'attribut majeur des Entités utilisant leur aptitude de mobilité pour combattre.",
  "intelligence": "L'Intelligence est l'attribut majeur des Entités utilisant leur aptitude mentale pour combattre.",
  "will": "La Volonté de l'entité est sa capacité à résister aux corruptions de l'Umbra.",
  "rangeAttack": "Attaque à distance de l'entité.",
  "lifesteal": "Préléve une ponction de HP a chaque attaque.",
  "charge": "Augmente la capacité d'équipement.",
  "weaponOrfevre": "Augmente l'efficacité des équipements portés.",
  "weaponCollector": "Augmente les chances de trouver des équipements dans les butins de guerre.",
  "bloodThirsty": "Les attaques qui le permettent rendent des HP à l’entité selon les dégâts réellement infligés.",
  "trailer": "Chance de générer une charge de déplacement supplémentaire lors de la récupération de mouvement.",
  "marathon": "Chance de ne pas consommer de charge de déplacement lors d'un mouvement.",
  "hpBattleRegen": "Restaure un pourcentage des HP maximum au début du tour de l’entité, à partir du deuxième tour, dans la limite des HP manquants.",
  "dayHpRegen": "Régénération des points de vie hors combat.",
  "shift": "Nombre de charges de déplacement disponibles.",
  "bloodFuryExecutionChance": "Chance de déclencher une exécution sur une cible vulnérable.",
  "bloodFuryExecutionDamage": "Dégâts supplémentaires infligés lors d'une exécution.",
  "bloodFuryTargetThreshold": "Seuil de points de vie sous lequel une cible devient vulnérable à l'exécution.",
  "cooldownTime": "Réduction appliquée à la durée de cooldown.",
  "preparationTime": "Réduction appliquée à la durée de préparation.",
  "executionTime": "Réduction appliquée à la durée d'exécution.",
  "projectileTime": "Augmentation de la vitesse des projectiles.",
  "recuperationTime": "Réduction appliquée à la durée de récupération."
};

export const UMBRA_PRESENTATIONS = {
  vigueur: 'Renforce grandement la puissance physique.',
  esprit: 'Renforce grandement la puissance magique.',
  finesse: 'Renforce grandement la puissance perçante.',
  brutality: 'Permet d’ignorer une partie de la résistance physique adverse.',
  inflexion: 'Permet d’ignorer une partie de la résistance magique adverse.',
  constitution: 'Renforce la protection contre les dégâts physiques.',
  integrite: 'Renforce la protection contre les dégâts magiques.',
  adresse: 'Améliore la capacité à esquiver les attaques.',
  astrality: 'Repousse la mort et protège des attaques purement magiques.',
  robustness: 'Accorde une armure qui se régénère chaque jour.',
  resilience: 'Atténue les coups critiques et aide à résister aux altérations et aux entraves.',
  equilibre: 'Module l’aggro générée selon la Force et l’Intelligence, et améliore la détection des cibles invisibles.',
  vivacite: 'Accélère les tours et facilite les déplacements en combat.',
  vision: 'Améliore la précision et l’efficacité des attaques à distance.',
  criticalPower: 'Renforce la fréquence et la puissance des coups critiques.',
  vitality: 'Augmente les points de vie et leur régénération journalière.',
  haste: 'Accélère les différentes phases des attaques.',
  indestructibility: 'Permet d’annuler des dégâts, de les atténuer et de récupérer des points de vie.',
  esoterism: 'Atténue les dégâts magiques et peut étendre sa protection aux dégâts perçants.',
  ambidextry: 'Permet de porter un deuxième coup avec les attaques compatibles.',
  bloodFury: 'Permet d’exécuter les cibles vulnérables et de se soigner en attaquant.',
  hypercognition: 'Ajoute des dégâts aux attaques sans modifier leur nature et génère des essences hypercognitives.',
  transcendence: 'Renforce les réserves de résurrection et peut éviter leur consommation.',
  mysticism: 'Permet d’entrer en transe pour préparer plus vite des attaques renforcées.',
  occultism: 'Permet de devenir invisible pour préparer une attaque.',
  movement: 'Améliore la réserve de déplacements et son utilisation.',
  weaponMastery: 'Améliore les capacités d’équipement et les butins de guerre.',
};

const PLAYER_STAT_DESCRIPTIONS = {
  astrality: 'Renforce la survie aux coups fatals et débloque Retour astral et Corps astral.',
  astralReturn: 'Après une survie astrale, restaure progressivement une partie des HP maximum de l’entité pendant le cooldown astral. Atteindre tous ses HP ne termine pas ce cooldown.',
  astralCooldown: 'Temps d’attente après une Survie fatale réussie avant de pouvoir survivre à nouveau. Retour astral soigne pendant ce même délai. Corps astral fonctionne indépendamment.',
  astralBody: 'S’active périodiquement pour faire échouer les attaques purement magiques hostiles, dégâts et malus compris. Les attaques physiques, composées et les dégâts déjà périodiques restent inchangés. Une nouvelle attente commence à la fin de l’effet.',
  dodge: 'Permet d’esquiver les dégâts physiques et perçants. La Précision adverse réduit cette chance. Les dégâts magiques ne peuvent pas être esquivés, même dans une attaque composée.',
  controlledSpeed: 'Atténue le recul de préparation ou d’exécution au corps à corps lors des déplacements commandés. Les déplacements imposés par un effet ne sont pas concernés.',
  superCriticalDamage: 'Renforce le supplément de dégâts des coups critiques.',
};

export function buildPlayerStatDescription(stat, fallback = '') {
  return PLAYER_STAT_DESCRIPTIONS[stat] || UMBRA_PRESENTATIONS[stat]
    || STAT_HELPER_DESCRIPTIONS[stat] || escapeEssenceHTML(fallback);
}

function resilienceLimitHelper(stat) {
  if (!['criticalResistance', 'alterationResistance', 'hindranceResistance', 'resilienceTotal'].includes(stat)) return '';
  const maximum = getStatEffectMaximum(stat);
  return `<p class="helper-calculation-note" data-resilience-limit="${maximum}">Limite de l’effet, toutes sources comprises : ${helperFigure(stat, maximum, ' %', { icon: null })}.</p>`;
}

// These sentences consume calculated results; no combat formula is evaluated here.
function buildResurrectionHealingHelper(result) {
  const labels = { extraLife: 'Vie supplémentaire', fadedLife: 'Vie fanée', eternalLife: 'Vie éternelle' };
  const rows = (result.resurrectionHealing || []).map(life =>
    `<p data-resurrection-pool="${life.pool}">${helperEffectTitle(life.pool, labels[life.pool])} : ${helperFigure(life.pool, life.totalPercent, ' %', { icon: null, signed: true })}<br><strong>Total : ${helperFigure(life.pool, life.totalPercent, ' %', { icon: null, signed: true })} (${helperFigure('HP', life.restoredHP, ' HP', { icon: null })})</strong>${life.current <= 0 ? '<br><small>Réserve en recharge.</small>' : ''}</p>`).join('');
  return rows ? `<div class="resurrection-healing">${rows}</div>` : '<p>Aucune vie de résurrection possédée.</p>';
}

export function buildPlayerStatHelper(stat, result, fallback = '', { includeDescription = true } = {}) {
  if (stat === 'improvedResurrection') return buildResurrectionHealingHelper(result);
  const figure = (key, value, unit = '') => helperFigure(key, value, unit, { icon: null,
    maximum: unit.trim() === '%' ? getStatEffectMaximum(({ dodge: 'dodgeChance', precision: 'precisionChance', physicalResistance: 'resistanceReduction', magicalResistance: 'resistanceReduction' })[key] || key) : result.statSystem?.maximum });
  const description = buildPlayerStatDescription(stat, fallback);
  let effect = '';
  if (stat === 'astralReturn' && result.astralReturn) {
    effect = `L’entité récupère ${figure(stat, result.astralReturn.percent, ' %')} de ses HP maximum en ${figure('astralCooldown', result.astralReturn.seconds, ' s')}.`;
  } else if (stat === 'astralCooldown' && result.astralCooldown) {
    effect = `Cet effet a ${figure(stat, result.astralCooldown.seconds, ' s')} de cooldown.`;
  } else if (stat === 'fatalSurvival' && result.astralCooldown) {
    effect = `L’entité a ${figure(stat, result.statSystem?.value ?? result.astralityTotal, ' %')} de chance de survivre à un coup fatal avec ${figure('HP', 1)} HP. Cooldown : ${figure('astralCooldown', result.astralCooldown.seconds, ' s')}.`;
  } else if (stat === 'astralBody' && result.astralBody) {
    effect = `${figure(stat, result.astralBody.value, ' %')} de chance d’activation toutes les ${figure(stat, result.astralBody.checkSeconds, ' s')} d’inactivité. Durée : ${figure(stat, result.astralBody.seconds, ' s')}.`;
  } else if (result.statSystem) {
    const row = result.statSystem;
    effect = `Valeur actuelle : ${figure(stat, row.value, row.unit || '')}.`;
    if (row.resistancePoints) effect += ` Réduction des dégâts : ${figure(stat, row.reductionRatio * 100, ' %')}.`;
    if (row.dodgePoints || row.precisionPoints) effect += ` ${row.dodgePoints ? 'Chance d’esquive' : 'Réduction de l’esquive adverse'} : ${figure(stat, row.chancePercent, ' %')}.`;
  } else if (typeof result.displayValue === 'number') {
    effect = `Valeur actuelle : ${figure(stat, result.displayValue)}.`;
  }
  return `${includeDescription ? `<div class="helper-player-description">${description}</div>` : ''}${effect ? `<p class="helper-player-value">${effect}</p>` : ''}${resilienceLimitHelper(stat)}`;
}

// Follow the existing calculation's sources, including nested contributions and
// exclusive passive curves. No ratio or game value is calculated for the colors.
function umbraRatioGradient(model, umbra) {
  const attributes = new Set();
  const add = stat => { if (['strength', 'intelligence', 'agility'].includes(stat)) attributes.add(stat); };
  const visit = calculation => {
    add(calculation?.passiveCurve?.attribute);
    for (const part of calculation?.parts || []) {
      add(part.stat);
      add(part.compact?.source?.stat);
      add(part.compact?.multiplier?.stat);
      if (part.calculation) visit(part.calculation);
    }
  };
  visit(model);
  // Without an attribute ratio, use the granting Umbra's own color.
  return { from: attributes.size ? [...attributes] : [umbra], to: umbra };
}

function umbraEntryTextOptions(entry) {
  return entry.state === 'X' && entry.gradient ? { state: 'X', textStyle: `--stat-x-from:${entry.gradient.from.map(key => `var(--color-${key})`).join(',')};--stat-x-to:var(--color-${entry.gradient.to})` }
    : { state: entry.state || null };
}

function umbraEntryValue(entry, { icon = null, result = null, scope = entry.id, collectCalculation = null } = {}) {
  const picto = icon ? `<span class="picto-stat ${escapeEssenceAttribute(icon)}" data-helper-picto-stat="${escapeEssenceAttribute(entry.stat)}" tabindex="0" aria-label="Décrire ${escapeEssenceAttribute(entry.name)}"></span>` : '';
  const value = `<span data-helper-value="${escapeEssenceAttribute(entry.id)}" tabindex="0" aria-label="Détail du calcul de ${escapeEssenceAttribute(entry.name)}">${helperFigure(entry.stat, entry.value, entry.unit, { icon: null, signed: entry.grant || entry.signed, maximum: entry.maximum })}</span>`;
  const calculation = result && buildUmbraInlineCalculation(entry, result, scope);
  if (calculation && collectCalculation) collectCalculation(calculation.formula);
  return picto + (calculation ? `<span class="umbra-value-calculation"><span class="umbra-value-control">${value}${calculation.button}</span>${collectCalculation ? '' : calculation.formula}</span>` : value);
}

// Context links reuse the existing source-helper interaction and lifecycle.
function umbraContextLink(key, label, title, description) {
  return `<span class="helper-source" data-helper-source="umbra-${escapeEssenceAttribute(key)}" tabindex="0" aria-label="${escapeEssenceAttribute(title)}">${label}<template data-helper-source-detail data-helper-source-title="${escapeEssenceAttribute(title)}">${description}</template></span>`;
}

function umbraHealthMaximum(label = 'HP maximum') {
  return umbraContextLink('hp-maximum', label, 'Points de vie maximum',
    'La réserve maximale de points de vie de l’entité. Un soin exprimé en pourcentage des HP maximum se base sur cette réserve, même si les HP actuels sont faibles.');
}

function umbraPureMagic(label = 'attaques purement magiques') {
  return umbraContextLink('pure-magic', label, 'Attaques purement magiques',
    'Attaques dont la seule nature de dégâts est magique. Une attaque qui combine la magie avec une autre nature est une attaque composée.');
}

function umbraEffectReference(id, label) {
  return `<span data-helper-entry="${escapeEssenceAttribute(id)}" tabindex="0">${label}</span>`;
}

function umbraEntryLabel(entry, framed = false) {
  const picto = `<span class="picto-stat ${escapeEssenceAttribute(entry.icon || entry.stat)}" aria-hidden="true"></span>`;
  const icon = framed ? `<span class="umbra-passive-icon" aria-hidden="true">${picto}</span>` : picto;
  const options = umbraEntryTextOptions(entry);
  const text = label => `<span class="${escapeEssenceAttribute(entry.stat)}"${options.state ? ` data-stat-state="${options.state}"` : ''}${options.textStyle ? ` style="${escapeEssenceAttribute(options.textStyle)}"` : ''}>${escapeEssenceHTML(label)}</span>`;
  return `<span class="umbra-effect-name ${escapeEssenceAttribute(entry.stat)}" data-helper-entry="${escapeEssenceAttribute(entry.id)}" data-helper-picto-stat="${escapeEssenceAttribute(entry.stat)}" tabindex="0">${icon}${text(entry.name + (entry.state === 'X' ? ' X' : ''))}</span>`;
}

export function buildEntityStatTotal(model) {
  return model && Number.isFinite(model.value) ? `<div class="helper-score-total"><span>Total de l’entité :</span>${helperFigure(model.stat, model.value, model.unit || '', { icon: null, maximum: model.maximum })}</div>` : '';
}

export function buildUmbraEntryExplanation(entry, result, { admin = false } = {}) {
  const model = result.umbraHelperCalculations?.[entry.explanationId || entry.id];
  const appearance = { icon: null, maximum: entry.maximum };
  const value = entry.value == null ? '' : entry.stat === 'astralReturn'
    ? `L’entité récupère ${helperFigure(entry.stat, entry.value, ' %', appearance)} de ses HP maximum en ${helperFigure('astralCooldown', result.astralReturn.seconds, ' s', { icon: null })}.`
    : `${entry.grant ? 'Accordé par l’Umbra' : entry.name} : ${helperFigure(entry.stat, entry.value, entry.unit, { ...appearance, signed: entry.grant || entry.signed })}.`;
  const total = entry.total;
  const entityTotal = buildEntityStatTotal(total);
  const system = total?.system;
  const effectiveness = system?.resistancePoints ? { name: 'Réduction des dégâts', value: system.reductionRatio * 100 }
    : system?.dodgePoints ? { name: 'Chance d’esquive', value: system.chancePercent }
    : system?.precisionPoints ? { name: 'Réduction de l’esquive adverse', value: system.chancePercent } : null;
  const effect = effectiveness ? `<p class="helper-total-effect">${effectiveness.name} : ${helperFigure(entry.stat, effectiveness.value, ' %', { icon: null, maximum: getStatEffectMaximum(system.resistancePoints ? 'resistanceReduction' : system.dodgePoints ? 'dodgeChance' : 'precisionChance') })}.</p>` : '';
  let technical = '';
  if (admin) {
    technical = model ? buildTechnicalStatCalculation(entry.stat === 'improvedResurrection' ? { ...model, note: '' } : model) : '';
    if (entry.stat === 'astralReturn') {
      const r = result.astralReturn;
      technical += `<p>Soin : ${r.points > 0 ? `${r.basePercent} + (${r.maxPercent} − ${r.basePercent}) × ${r.weight} / (${r.constant} + ${r.weight})` : '0 (Astralité inactive)'} = ${helperFigure(entry.stat, r.percent, ' %', { icon: null })}.</p><p>${r.maxHP} HP × ${r.percent} / 100 → ${r.amount} HP, par versements de ${r.tickAmount} HP pendant ${r.seconds} s.</p>`;
    } else if (entry.stat === 'transcendenceTotal' && model?.passiveCurve) {
      const c = model.passiveCurve, weight = c.points * c.curveRatio;
      technical += `<p>Intelligence : ${c.attributePoints} points ; ratio progressif ×${c.curveRatio}. Score : ${c.points} Transcendance × ${c.curveRatio} = ${weight}.</p><p>Chance : ${c.max} × ${weight} / (${c.constant} + ${weight}) = ${helperFigure(entry.stat, c.percent, ' %', { icon: null, maximum: c.max })}.</p>`;
    } else if (['astralCooldown', 'transcendentalCooldown', 'indestructibilityCooldown', 'esoterismCooldown'].includes(entry.stat)) {
      const r = result[entry.stat];
      technical += `<p>Durée : ${r.baseSeconds} − (${r.baseSeconds} − ${r.minSeconds}) × ${r.weight} / (${r.constant} + ${r.weight}) = ${helperFigure(entry.stat, r.seconds, ' s', { icon: null })}.</p>`;
    }
  }
  const technicalSection = technical ? `<section class="helper-technical" data-helper-technical>${technical}</section>` : '';
  const healing = entry.stat === 'hpBattleRegen' ? `<p class="helper-player-value">Régénération totale : ${helperFigure('hpBattleRegen', result.hpBattleRegenPercent, ' %', { maximum: 99 })} des HP maximum → ${helperFigure('HP', result.hpBattleRegenAmount, ' HP')}, dans la limite des HP manquants.</p>` : '';
  if (entry.stat === 'improvedResurrection') return buildResurrectionHealingHelper(result) + entityTotal + technicalSection;
  if (entry.grant && total) {
    const direct = entry.component ? 0 : system?.umbraFlat;
    const breakdown = direct ? `<div class="helper-umbra-breakdown"><span>Bonus direct : ${helperFigure(entry.stat, direct, entry.unit, { ...appearance, signed: true })}</span><span>Renforcement : ${helperFigure(entry.stat, entry.value - direct, entry.unit, { ...appearance, signed: true })}</span></div>` : '';
    const icon = `<span class="picto-stat ${escapeEssenceAttribute(entry.icon || entry.stat)}" data-helper-picto-stat="${escapeEssenceAttribute(entry.stat)}" data-helper-stat-state="${escapeEssenceAttribute(entry.state || 'normal')}" tabindex="0" aria-label="${escapeEssenceAttribute(entry.name)}"></span>`;
    const effectiveResult = effectiveness ? `<div class="helper-total-effect"><span class="helper-total-effect-label">${effectiveness.name}</span>${helperFigure(entry.stat, effectiveness.value, ' %', { icon: null, maximum: getStatEffectMaximum(system.resistancePoints ? 'resistanceReduction' : system.dodgePoints ? 'dodgeChance' : 'precisionChance') })}</div>` : '';
    const sourceLabel = entry.component === 'flat' ? 'Bonus direct de l’Umbra' : entry.component === 'reinforcement' ? 'Renforcement de l’Umbra' : 'Total Umbra';
    return `<div class="helper-umbra-grant"><div class="helper-umbra-total helper-player-value"><span>${sourceLabel} :</span><strong class="helper-umbra-amount">${helperFigure(entry.stat, entry.value, entry.unit, { ...appearance, signed: true })}${icon}</strong></div>${breakdown}<div class="separation-line" aria-hidden="true"></div>${entityTotal}${effectiveResult}${healing}${resilienceLimitHelper(entry.stat)}</div>${technicalSection}`;
  }
  const composition = !admin && model?.contributions ? buildAutonomousCalculationHelper(model, '', entry.name) : '';
  return `${composition}${value ? `<p class="helper-player-value">${value}</p>` : ''}${entityTotal}${effect}${healing}${resilienceLimitHelper(entry.stat)}${technicalSection}`;
}

export function buildTechnicalStatCalculation(model) {
  if (!model) return '';
  const parts = helperCalculationParts(model);
  return `<div class="helper-technical-formula">${parts}${parts ? ' = ' : ''}${helperFigure(model.stat, model.value, model.unit || '', { icon: null, maximum: model.maximum })}</div>${model.note ? `<p>${escapeEssenceHTML(model.note)}</p>` : ''}${buildCalculationSources(model)}`;
}

export function buildUmbraCard(result) {
  const presentation = result.umbraPresentation;
  if (!presentation) return '';
  return buildUmbraPresentationCard(presentation, { result });
}

// Players and admins can reveal the same inline ratios, globally or per row.
function buildUmbraInlineCalculation(entry, result, scope) {
  const models = result.umbraHelperCalculations || {};
  const calculationId = entry.calculationId || entry.id;
  const model = models[calculationId];
  if (!model?.parts) return '';
  return {
    button: `<button type="button" class="umbra-detail-toggle" data-umbra-detail-toggle="${escapeEssenceAttribute(scope)}" aria-expanded="false" title="Voir les ratios de la stat" aria-label="Voir les ratios de la stat : ${escapeEssenceAttribute(entry.name)}"><span class="umbra-detail-triangle" aria-hidden="true">▶</span></button>`,
    formula: `<span data-umbra-section="calculation" data-umbra-calculation-details="${escapeEssenceAttribute(scope)}" data-umbra-inline-detail="${escapeEssenceAttribute(calculationId)}" data-helper-technical hidden>${helperCalculationParts(model, { concise: true, ratioPath: scope }) || helperFigure(entry.stat, 0)}</span>`,
  };
}

function buildUmbraPresentationCard(presentation, { result } = {}) {
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const separator = '<div class="umbra-card-line" aria-hidden="true"></div>';
  const value = (entry, { calculation = true, ...options } = {}) => umbraEntryValue(entry, { ...options, result: calculation ? result : null });
  const section = entry => {
    const passiveStyle = entry.exclusive && !entry.outsidePassiveFrame && !entry.passiveOf;
    const formulas = [];
    const rowValue = (detail, options = {}) => value(detail, { ...options, collectCalculation: formula => formulas.push(formula) });
    // A fixed gift and its reinforcement feed the same stat. Keep their
    // individual values, then reuse the engine's complete Umbra contribution.
    const reinforcement = entry.grant && !entry.exclusive && entry.total?.system?.umbraFlat
      ? presentation.detailEntries.find(detail => detail.id === entry.calculationId && detail.value !== 0) : null;
    const displayedEntry = reinforcement ? { ...reinforcement, state: entry.state } : entry;
    const total = reinforcement ? `<div class="umbra-card-totals" data-umbra-combined-total="${entry.id}"><span class="umbra-card-total-label" data-helper-value="${entry.id}" tabindex="0">Total fourni par l’Umbra :</span><div class="umbra-card-total" data-umbra-section="total"><div class="umbra-card-total-content"><span class="helper-calculation" data-helper-value="${entry.id}" tabindex="0" aria-label="Total de ${escapeEssenceAttribute(entry.name)} fourni par l’Umbra">${helperFigure(entry.stat, entry.value, entry.unit, { icon: entry.icon || entry.stat, signed: true, maximum: entry.maximum })}</span></div></div></div>` : '';
    const sentence = entry.sentenceParts ? entry.sentenceParts.map(part => typeof part === 'string' ? part
      : rowValue([...presentation.entries, ...presentation.detailEntries].find(candidate => candidate.id === part.value), { scope: `${entry.id}:${part.value}`, calculation: part.value === entry.id })).join('') : entry.sentence;
    const heading = `<div class="${passiveStyle ? 'umbra-passive-value' : 'umbra-effect-heading'}">${umbraEntryLabel(entry, passiveStyle)}${entry.value == null || entry.sentenceContainsValue ? '' : (passiveStyle ? ' : ' : '') + rowValue(displayedEntry, { scope: entry.id })}</div>`;
    const description = sentence ? `<p class="umbra-effect-sentence" data-helper-entry="${entry.id}" tabindex="0">${sentence}</p>` : '';
    return `<section class="umbra-effect-row" data-umbra-capacity="${entry.id}"${entry.exclusive && !entry.passiveOf ? ` data-umbra-passive="${entry.stat}"` : ''}>${heading}${entry.sentenceContainsValue ? description + formulas.join('') : formulas.join('') + description}${total}</section>`;
  };
  const passives = presentation.entries.filter(entry => entry.exclusive && !entry.outsidePassiveFrame && !entry.passiveOf);
  const passiveEntries = passives.flatMap(passive => [passive, ...presentation.entries.filter(entry => entry.passiveOf === passive.stat)]);
  const normal = presentation.entries.filter(entry => !passiveEntries.includes(entry));
  const grant = umbraContextLink('grant', helperFigure(presentation.key, presentation.points, '', { signed: true }),
    `Umbra : ${presentation.name}`, buildPlayerStatDescription(presentation.key, presentation.name));
  const directGrants = (presentation.directGrants || []).map(entry => {
    const name = entry.name.replace(/ · Bonus direct$/, '');
    return umbraContextLink(`grant-${entry.stat}`, helperFigure(entry.stat, entry.value, entry.unit, { signed: true }),
      HELPER_TEXT.statTitle(name), buildPlayerStatDescription(entry.stat, name));
  });
  const passiveTitle = umbraContextLink('exclusive-passives', passives.length > 1 ? 'Passives exclusives' : 'Passive exclusive',
    `Passives exclusives · ${presentation.name}`,
    `Ces capacités sont accordées par l’Umbra ${escapeEssenceHTML(presentation.name)}. Elles agissent automatiquement lorsque leurs conditions sont réunies : ${passives.map(entry => escapeEssenceHTML(entry.name)).join(', ')}.`);
  const passiveContent = ['bloodFury', 'esoterism'].includes(presentation.key)
    ? passives.map(passive => `<div class="umbra-passive-group" data-passive-group="${passive.stat}">${[passive, ...presentation.entries.filter(entry => entry.passiveOf === passive.stat)].map(section).join(separator)}</div>`).join('')
    : passiveEntries.map(section).join(separator);
  const passiveFrame = passives.length ? `<section class="umbra-unique-passive" data-umbra-passives="${presentation.key}">${corners.map(corner => `<span class="umbra-passive-corner ${corner}" aria-hidden="true"></span>`).join('')}<div class="umbra-passive-heading">${passiveTitle}</div>${separator}${passiveContent}</section>` : '';
  const content = normal.map(section).join(separator) + (passiveFrame ? separator + passiveFrame : '');
  const role = `<div class="umbra-role" data-umbra-section="presentation"><span data-helper-picto-stat="${presentation.key}" tabindex="0">${escapeEssenceHTML(presentation.role)}</span></div>${separator}`;
  const footer = presentation.ambiance ? `<footer class="umbra-card-ambiance" data-umbra-section="ambiance">${separator}<div class="helper-calculation-note">${escapeEssenceHTML(presentation.ambiance).replace(/\r?\n/g, '<br>')}</div></footer>` : '';
  return `<div data-umbra-layout="card" class="umbra-card-summary-last umbra-card-readable">${corners.map(corner => `<span class="umbra-card-corner ${corner}" aria-hidden="true"></span>`).join('')}${role}<div data-umbra-section="introduction"><span class="short-descri">Confère ${[grant, ...directGrants].join(', ')}.</span></div>${separator}${content}${footer}</div>`;
}

function helperStatIntroduction(stat, { icon = false, value = null, flatValue = null, state = 'normal', exclusive = false } = {}) {
  const target = stat === 'piercingPower' ? 'piercingDamage' : stat;
  const key = stat === 'criticalDamage' && exclusive ? 'superCriticalDamage'
    : GENERATED_STAT_HELPERS[target] && ['+', 'X'].includes(state) ? `${target}${state === '+' ? 'Plus' : 'X'}` : stat;
  let description = STAT_HELPER_DESCRIPTIONS[key];
  if (!description) return '';
  const family = GENERATED_UMBRA_HELPERS[stat];
  if (family && value != null) {
    const amount = Number(value) > 0 ? `+${Number(value)}` : value;
    const flatGift = Number(flatValue) > 0
      ? `, ${helperFigure(family.target, `+${Number(flatValue)}`, '', { icon: null })} <span class="picto-stat ${family.target}" role="img" aria-label="${family.name}"></span>` : '';
    const abilities = [helperEffectTitle(family.target, family.name, { state: 'X' }),
      ...(stat === 'resilience' ? [helperEffectTitle('alterationResistance', 'Résistance aux altérations', { state: 'X' }), helperEffectTitle('hindranceResistance', 'Résistance aux entraves', { state: 'X' }), helperEffectTitle('resilienceTotal', 'Résilience totale')] : []),
      ...(stat === 'equilibre' ? [helperEffectTitle('equilibreAggroBonus', 'Présence équilibrée', { state: 'X' }), helperEffectTitle('equilibreInvisibleDetection', 'Perception équilibrée', { state: 'X' }), helperEffectTitle('equilibreBalancedAttackChance', 'Attaque équilibrée')] : []),
      ...(stat === 'astrality' ? [helperEffectTitle('astralCooldown', 'Cooldown astral'), helperEffectTitle('astralReturn', 'Retour astral'), helperEffectTitle('astralBody', 'Corps astral')] : []),
      ...(stat === 'bloodFury' ? [helperEffectTitle('bloodExecution', 'Exécution'), helperEffectTitle('bloodCrazy', 'Démence sanguinaire'), helperEffectTitle('bloodGlutony', 'Voracité sanguinaire')] : []),
      ...(stat === 'hypercognition' ? [helperEffectTitle('cognitiveGenerator', 'Générateur cognitif')] : []),
      ...(stat === 'robustness' ? [helperEffectTitle('solarArmor', 'Armure solaire')] : []),
      ...(stat === 'vivacite' ? [helperEffectTitle('controlledSpeed', 'Vitesse contrôlée')] : []),
      ...(stat === 'vision' ? [helperEffectTitle('bullsEye', 'Bull’s Eye')] : []),
      ...(stat === 'criticalPower' ? [helperEffectTitle('criticalDamage', HELPER_TEXT.criticalDamageName(true))] : [])];
    description = `Confère ${helperFigure(stat, amount, '', { icon: null })} <span class="picto-stat ${stat}" role="img" aria-label="${family.sourceName}"></span>${flatGift} et la capacité d'utiliser ${abilities.join(' et ')}.${stat === 'vivacite' ? ` La Vélocité renforce ${helperEffectTitle('agileRetreat', 'Retraite agile')}.` : ''}`;
  }
  const picto = icon && !description.includes('class="picto-stat ')
    ? `<span class="picto-stat ${escapeEssenceAttribute(stat)}" aria-hidden="true"></span> ` : '';
  return `<span class="short-descri" data-stat-description="${escapeEssenceAttribute(key)}">${picto}${description}</span>`;
}

export function buildStatDescriptionHelper(stat, state = 'normal', { exclusive = false } = {}) {
  return helperStatIntroduction(stat, { state, exclusive });
}

export function buildStatHelperContent({
  nestedHelper = false,
  safe,
  statValue,
  result,
  balanceData,
  roundBalance,
  getAttackPurity,
  entite,
  getDisplayStatKey,
  getAttackNatureRules,
  baseSpeedMs,
  stats,
  normalizeStatKey,
  statKey,
  isUmbraRestricted,
  readUmbraTotal
}) {
const output = {};
if (statKey === 'magicalDamage') {
  output.totalMagicalDamageHelp = helperFigure('magicalDamage', result.calculateMagicalTotalValue);
}
const isObjectStatValue = (value) =>
  value && typeof value === "object" && ("current" in value || "max" in value);

const formatStatNumber = (value) => {
  const number = Number(value) || 0;
  if (!Number.isFinite(number)) return "0";
  if (Number.isInteger(number)) return String(number);
  return String(Math.round(number * 100) / 100).replace(/\.0+$/, "");
};

const formatSignedStatNumber = (value, { signedZero = false } = {}) => {
  const number = Number(value) || 0;
  const sign = number > 0 || (signedZero && number === 0) ? "+" : "";
  return `${sign}${formatStatNumber(number)}`;
};

const formatModifierValue = (value, { signed = true, signedZero = false } = {}) => {
  if (isObjectStatValue(value)) {
    const current = Number(value.current ?? value.max ?? 0) || 0;
    const max = Number(value.max ?? value.current ?? 0) || 0;

    if (current !== max) {
      return signed
        ? `${formatSignedStatNumber(current, { signedZero })} / ${formatSignedStatNumber(max, { signedZero })}`
        : `${formatStatNumber(current)} / ${formatStatNumber(max)}`;
    }

    return signed ? formatSignedStatNumber(max, { signedZero }) : formatStatNumber(max);
  }

  if (value && typeof value === "object") {
    const parts = [];
    const flat = Number(value.flat ?? 0) || 0;
    const percent = Number(value.percent ?? 0) || 0;

    if (flat || (signedZero && !percent)) {
      parts.push(signed ? formatSignedStatNumber(flat, { signedZero }) : formatStatNumber(flat));
    }
    if (percent) {
      const formatted = signed
        ? formatSignedStatNumber(percent, { signedZero })
        : formatStatNumber(percent);
      parts.push(`${formatted}%`);
    }

    return parts.length ? parts.join(" / ") : signed && signedZero ? "+0" : "0";
  }

  return signed ? formatSignedStatNumber(value, { signedZero }) : formatStatNumber(value);
};

const figure = helperFigure;
const contribution = helperContribution;
const isUmbraHelper = stats.some(definition => definition.key === normalizeStatKey(statKey) && definition.nature === 'umbra');
const calculation = (stat, value, unit = '', parts = [], options = {}) => {
  const match = !isUmbraHelper && Object.entries(result.umbraHelperCalculations || {}).find(([, model]) =>
    model.stat === getDisplayStatKey(stat) && Number(model.value) === Number(value) && (model.unit || '') === unit);
  if (match?.[0] === 'autonomousConversion') {
    return `<span class="helper-calculation"><span class="helper-calculation-result" data-umbra-calculation="autonomousConversion" data-umbra-summary tabindex="0">${figure(stat, value, unit, options)}</span></span>`;
  }
  return match ? buildUmbraCalculation(match[0], match[1], options) : helperCalculation(stat, value, unit, parts, options);
};
const umbra = (key, fallback, options = {}) => result.umbraHelperCalculations?.[key]
  ? buildUmbraCalculation(key, result.umbraHelperCalculations[key], options) : fallback;
const autonomous = (fallback = '', options = {}) => umbra('autonomousTotal', fallback, options);
const umbraSource = (key, fallback) => result.umbraHelperCalculations?.[key]
  ? buildUmbraSource(key, result.umbraHelperCalculations[key]) : fallback;
const umbraValue = (key, html) => result.umbraHelperCalculations?.[key]
  ? buildUmbraSource(key, result.umbraHelperCalculations[key], 0, html) : html;
const product = helperProduct;
const effectTitle = (stat, label, options = {}) => {
  const system = result.statSystem && getDisplayStatKey(result.statSystem.key) === stat ? result.statSystem : null;
  const umbra = system?.umbra > 0 ? system.origin
    : isUmbraHelper && options.bonus && Number(safe(statKey, 0)) > 0 ? normalizeStatKey(statKey) : null;
  return helperEffectTitle(stat, label, { ...options, umbra,
    ...(system ? { bonus: system.state !== 'normal', state: system.state } : {}) });
};
const constant = (value, unit = '') => contribution('neutral', value, unit);
const dayStart = effectTitle('day', 'début de la journée');
const percent = (key, total, parts = [], options = {}) => calculation(key, total, ' %', parts, options);
const nonlinear = (key, total, source, value, unit = '') =>
  calculation(key, total, unit, [contribution(source, value)]);
const ratioProduct = (key, value, ratioKey, ratio) => {
  if (!Number(value) || !Number(ratio)) return '';
  return product([figure(key, value), Number(ratio) === 1 ? '' : figure(ratioKey, ratio)]);
};
const seconds = value => String(Number((Number(value || 0) / 1000).toFixed(3)));
const turnSeconds = seconds(result.umbraHelperCalculations?.speedTotal?.value ?? safe('speed', 0));
const percentPart = (key, value, options = {}) => contribution(key, value, ' %', options);
const detail = result.helperDetails || {};
const active = key => detail.active?.[key] === true;

const buildOrfevreDetailHelper = (item) => {
  if (!item) return '';
  const stat = item.visualStat || 'weaponOrfevre';
  const line = entry => calculation(stat, formatModifierValue(entry.total, { signed: false }), '', [
    figure(stat, formatModifierValue(entry.raw, { signed: false })),
    figure('weaponOrfevre', formatModifierValue(entry.exactBonus, { signed: false })),
  ]);
  return `${line(item)}<br><br>Renforce les bonus de l'équipement et atténue ses malus.${item.previewDetail ? `<br><br>Aperçu : ${line(item.previewDetail)}` : ''}`;
};
const timingPart = (part, stat) => percentPart(part.stat, part.value,
  part.stat === 'haste' && HASTE_EFFECT_ICONS[stat] ? { icon: HASTE_EFFECT_ICONS[stat] } : {});
const sourceParts = (key, timingStat) => (detail.sources?.[key] || []).map(part => timingPart(part, timingStat));
const hasteLine = (stat, prefix) => percent(stat, result[`${prefix}Total`], sourceParts(prefix, stat));
const attackCooldownReducDetailLine = hasteLine('cooldownTime', 'attackCooldownReduc');
const attackPreparationReducDetailLine = hasteLine('preparationTime', 'attackPreparationReduc');
const attackExecutionReducDetailLine = hasteLine('executionTime', 'attackExecutionReduc');
const attackRecoveryReducDetailLine = hasteLine('recuperationTime', 'attackRecoveryReduc');
const attackProjectileSpeedDetailLine = hasteLine('projectileTime', 'attackProjectileSpeed');
const timingHelper = () => {
  const timing = detail.timing;
  if (!timing) return '';
  const groups = timing.groups.filter(group => Number(group.value)).map(group => {
    const parts = group.parts.filter(part => Number(part.value)).map((part, index) => {
      const operator = part.operator || (part.value < 0 ? '−' : '+');
      return `${index || operator === '−' ? ` <span class="helper-operator">${escapeEssenceHTML(operator)}</span> ` : ''}${timingPart({ ...part, value: Math.abs(part.value) }, group.stat)}`;
    }).join('');
    const umbra = group.sources?.find(source => source.category === 'umbra')?.umbra;
    return `${helperEffectTitle(group.stat, TIMING_HELPER_NAMES[group.stat], { umbra })} : ${percent(group.stat, group.value, parts)}`;
  });
  const bonus = percent(timing.stat, timing.bonus, groups.join('<br>') || figure(timing.stat, 0, ' %'));
  const durationDetail = product([
    figure(timing.stat, seconds(timing.baseMs), ' s'), figure(timing.stat, 100 - timing.bonus, ' %'),
  ]) + (timing.minimumMs > timing.calculatedMs ? `<br>Minimum appliqué : ${figure(timing.stat, seconds(timing.minimumMs), ' s')}` : '');
  const duration = calculation(timing.stat, seconds(timing.effectiveMs), ' s', durationDetail,
    { rounded: timing.minimumMs <= timing.calculatedMs && Math.abs(timing.baseMs * (1 - timing.bonus / 100) - timing.calculatedMs) > 1e-6 });
  return `Durée : ${duration}<br><br>Réduction : ${bonus}.${timing.preparation ? '<br><br>Une transe ou une invisibilité en cours peut encore modifier cette durée pendant le combat.' : ''}`;
};
const cooldownTimeDetailHelper = `Temps nécessaire avant de pouvoir relancer l'attaque.<br><br>${timingHelper()}`;
const preparationTimeDetailHelper = `Temps nécessaire avant le lancement.<br><br>${timingHelper()}`;
const executionTimeDetailHelper = `Temps nécessaire pour porter le coup.<br><br>${timingHelper()}`;
const executionRangeTimeDetailHelper = `Le projectile voyage pendant la récupération et les actions suivantes.<br><br>${timingHelper()}`;
const recoveryTimeDetailHelper = `Temps nécessaire après le lancement ou le coup avant d'agir à nouveau.<br><br>${timingHelper()}`;
const meleeExecHelperBlock = `Réduction d'exécution : ${percent('executionTime', result.meleeExecTotalReduc, [
  percentPart('shortRange', result.meleeExecBaseBonus), percentPart('strength', result.meleeExecStrengthBonus),
  percentPart('executionTime', result.meleeExecHasteReduc),
])}<br>`;
const piercingRecupHelperBlock = `Réduction de récupération : ${percent('recuperationTime', result.piercingRecupTotalReduc, [
  percentPart('piercingDamage', result.piercingRecupBaseBonus), percentPart('agility', result.piercingRecupAgiBonus),
])}<br>`;
const critical = detail.critical || {};
const critChanceParts = [percentPart('criticalChance', critical.chanceFlat), percentPart('criticalPower', critical.chancePower), percentPart('agility', critical.chanceAgility)];
const critDamageParts = [constant(critical.damageNative, ' %'), percentPart('criticalDamage', critical.damageFlat),
  percentPart('criticalPower', critical.damagePower), percentPart('agility', critical.damageAgility)];
const executionChance = total => calculation('bloodFuryExecutionChance', total, ' %', []);
const executionThreshold = total => calculation('bloodFuryTargetThreshold', total, ' %', []);
const executionDamage = total => calculation('bloodFuryExecutionDamage', total, '', [], { signed: true });
const battleRegen = umbra('hpBattleRegenPercent', percent('hpBattleRegen', result.hpBattleRegenPercent, [
  percentPart('hpBattleRegen', result.hpBattleRegenBase), percentPart('strength', result.hpBattleRegenStrengthRatio),
  percentPart('indestructibility', result.hpBattleRegenIndestructibilityRatio),
  percentPart('hpBattleRegen', result.hpBattleRegenModifier),
]));
// Shared sentences keep the Umbra overview and each statistic's helper in sync.
const ambidextrySecondHitBaseDamagePercent = active('ambidextry') ? balanceData.ambidextry.damage.basePercent : 0;
const statEffects = {
  indestructibilityBonus: `• ${effectTitle('indestructibility', 'Indestructibilité totale', { icon: 'indestructibilityTotal' })} : l'entité a ${umbra('indestructibilityBonus', nonlinear('indestructibility', result.indestructibilityBonus, 'indestructibility', statValue ?? safe('indestructibility', 0), ' %'), { icon: 'indestructibilityTotal' })} de chance de nullifier totalement une source de dégâts.`,
  indestructibilityReductionTotal: `• ${effectTitle('indestructibility', 'Peau indestructible', { icon: 'indestructibleSkin' })} : l'entité subit ${umbra('indestructibilityReductionTotal', percent('indestructibility', result.indestructibilityReductionTotal, [percentPart('indestructibility', result.indestructibilityReduction), active('indestructibility') ? percentPart('strength', result.indestructibilityStrengthReduction) : ''], { icon: 'indestructibleSkin' }), { icon: 'indestructibleSkin' })} de dégâts en moins.`,
  resilienceCritTotalBonus: `• Le supplément de dégâts des ${effectTitle('criticalPower', 'coups critiques')} subis par l'entité est réduit de ${umbra('resilienceCritTotalBonus', percent('resilience', result.resilienceCritTotalBonus, [percentPart('resilience', result.resilienceCritBonus), percentPart('strength', result.resiStrengthCritBonus)]))}.`,
  resilienceAlteTotalBonus: `• Les ${effectTitle('alteration', "altérations d'état")} subies par l'entité ont leurs effets réduits de ${umbra('resilienceAlteTotalBonus', percent('resilience', result.resilienceAlteTotalBonus, [percentPart('resilience', result.resilienceAlteBonus), percentPart('intelligence', result.resiIntelCritBonus)]))}.`,
  resilienceTotalCancelBonus: `• ${effectTitle('resilience', 'Résilience totale', { icon: 'resilienceTotal' })} : les ${effectTitle('alteration', "altérations d'état")} et ${effectTitle('entrave', 'entraves')} subies par l'entité ont ${umbra('resilienceTotalCancelBonus', percent('resilience', result.resilienceTotalCancelBonus, [percentPart('resilience', result.resilienceCancelBonus), active('resilience') ? percentPart('strength', result.resiStrengthCancelBonus) : '']), { icon: 'resilienceTotal' })} de chance d'échouer totalement.`,
  ambidextryTotalChance: `• ${effectTitle('ambidextry', 'Chance de deuxième coup', { icon: 'ambidextryChance' })} : l'entité a ${umbra('ambidextryTotalChance', percent('ambidextry', result.ambidextryTotalChance, [percentPart('ambidextry', result.ambidextryProcBonus), percentPart('agility', result.ambidextryAgiChance)], { icon: 'ambidextryChance' }), { icon: 'ambidextryChance' })} de chance de réaliser un deuxième coup lors de son attaque.`,
  ambidextryDamageBonus: `• ${effectTitle('ambidextry', 'Dégâts du deuxième coup', { icon: 'dominantArm' })} : le premier coup fait ${figure('neutral', 100, ' %')} des dégâts ; le deuxième fait ${umbra('ambidextryDamageBonus', percent('ambidextry', result.ambidextryDamageBonus, [constant(ambidextrySecondHitBaseDamagePercent, ' %'), percentPart('ambidextry', result.ambidextryRatioBonus), percentPart('agility', result.ambidextryAgiRatioBonus)], { icon: 'dominantArm' }), { icon: 'dominantArm' })} du premier.<br>Les effets du premier coup peuvent également être réappliqués.`,
  mysticismProcChance: `• ${effectTitle('mysticism', 'Trance mystique', { icon: 'mysticTrance' })} : l'entité a ${umbra('mysticismProcChance', percent('mysticism', result.mysticismProcChance, [constant(result.mysticismBaseProcChance, ' %'), percentPart('intelligence', result.mysticismIntelProcChance)], { icon: 'mysticTrance' }), { icon: 'mysticTrance' })} de chance d'entrer en transe.`,
  mysticismTranceDuration: `• La transe dure ${umbra('mysticismTranceDuration', calculation('mysticism', seconds(result.mysticismTranceDuration), ' s', [constant(seconds(result.mysticismBaseTranceDuration), ' s'), contribution('intelligence', seconds(result.mysticismIntelTranceDuration), ' s')]))}.`,
  mysticismPreparationAcceleration: `• ${effectTitle('preparationTime', 'Préparation', { bonus: true })} : pendant la transe, la préparation est accélérée de ${umbra('mysticismPreparationAcceleration', percent('mysticism', result.mysticismPreparationAcceleration, [constant(result.mysticismBasePreparationAcceleration, ' %'), percentPart('intelligence', result.mysticismIntelPreparationAcceleration)], { signed: true }), { signed: true })}.`,
  mysticismDamageBonus: `• Si l'attaque est lancée pendant la transe, elle gagne ${umbra('mysticismDamageBonus', percent('mysticism', result.mysticismDamageBonus, [constant(result.mysticismBaseDamageBonus, ' %'), percentPart('intelligence', result.mysticismIntelDamageBonus)], { signed: true }), { signed: true })} de dégâts.`,
  equilibreAggroReduction: `• L'${effectTitle('aggro', 'aggro')} générée par ses dégâts est réduite de ${umbra('equilibreAggroReduction', percent('equilibre', result.equilibreAggroReduction, [constant(result.equilibreBaseAggroReduction, ' %'), percentPart('intelligence', result.equilibreIntelAggroReduction)]))}.`,
  equilibreInvisibleDetection: `• ${effectTitle('balance-view', 'Perception équilibrée')} : l'entité a ${umbra('equilibreInvisibleDetection', percent('balance-view', result.equilibreInvisibleDetection, [constant(result.equilibreBaseInvisibleDetection, ' %'), percentPart('agility', result.equilibreAgiInvisibleDetection)]))} de réduction de l’évitement du ciblage des ennemis invisibles, en points de pourcentage.`,
  equilibreBalancedAttackChance: `• ${effectTitle('balance-strike', 'Attaque équilibrée')} : l'entité a ${umbra('equilibreBalancedAttackChance', percent('balance-strike', result.equilibreBalancedAttackChance, [constant(result.equilibreBaseBalancedAttackChance, ' %'), percentPart('intelligence', result.equilibreIntelBalancedAttackChance)]))} de chance que sa prochaine attaque ne génère aucune aggro.`,
  occultismInvisibilityChance: `• L'entité a ${umbra('occultismInvisibilityChance', percent('occultism', result.occultismInvisibilityChance, [constant(result.occultismBaseInvisibilityChance, ' %'), percentPart('agility', result.occultismAgiInvisibilityChance)]))} de chance de devenir invisible pendant la préparation de son attaque.`,
  occultismCritChanceBonus: `• ${effectTitle('criticalChance', 'Critique chance', { bonus: true })} : l'invisibilité augmente sa chance de critique de ${umbra('occultismCritChanceBonus', percent('criticalChance', result.occultismCritChanceBonus, [percentPart('agility', result.occultismAgiCritChanceBonus)], { signed: true }), { signed: true })}.`,
  occultismTargetableChance: `• Invisible, l'entité n'a que ${umbra('occultismTargetableChance', percent('occultism', result.occultismTargetableChance, [constant(result.occultismBaseTargetableChance, ' %'), percentPart('agility', result.occultismAgiTargetableChance)]))} de chance de pouvoir être ciblée. Si elle est la seule cible possible, elle peut encore être visée.<br>Contre la dernière cible admissible invisible, toute attaque offensive au corps à corps ou à distance subit 50 % d’évitement, réduit par la Précision de l’attaquant. Seules les attaques magiques pures sont exemptées. L’Agilité améliore l’évitement du ciblage ; la détection d’Équilibre le diminue.`,
  occultismDodgeBonus: `• ${effectTitle('dodge', 'Esquive', { bonus: true })} : l'entité gagne temporairement ${umbra('occultismDodgeBonus', calculation('dodge', result.occultismDodgeBonus, '', [constant(result.occultismBaseDodgeBonus), contribution('agility', result.occultismAgiDodgeBonus)], { signed: true }), { signed: true })} en esquive.`,
  esoterismBonus: `• L'entité a ${umbra('esoterismBonus', nonlinear('esoterism', result.esoterismBonus, 'esoterism', statValue ?? safe('esoterism', 0), ' %'))} de chance de réduire une source de ${effectTitle('magicalDamage', 'dégâts magiques')} subis.`,
  esoterismTotalReduction: `• L'entité réduit de ${umbra('esoterismTotalReduction', percent('esoterism', result.esoterismTotalReduction, [constant(result.esoterismBaseReduction, ' %'), percentPart('agility', result.esoterismAgiReduction)]))} une source de ${effectTitle('magicalDamage', 'dégâts magiques')} subis lorsque l'Ésotérisme se déclenche.`,
  levelMaximum: `Niveau maximum que l'entité peut atteindre : ${umbra('levelMaximum', () => calculation('will', result.lvlMaxEntite, '', `${figure('neutral', result.lvlMaxBase)} ${escapeEssenceHTML(result.lvlMaxBonusOp || '+')} ${figure('will', result.lvlMaxBonusAbs)}`))}.`,
};
output.statEffectHelpers = {
  ...statEffects,
  ambidextryTotalChance: `Les attaques qui le peuvent ont ${umbra('ambidextryTotalChance', '', { icon: 'ambidextryChance' })} de chance de réaliser un deuxième coup.`,
  ambidextryDamageBonus: `Les dégâts du deuxième coup représentent ${umbra('ambidextryDamageBonus', '', { icon: 'dominantArm' })} des dégâts du premier coup.`,
  indestructibilityBonus: `L'entité a ${umbra('indestructibilityBonus', '', { icon: 'indestructibilityTotal' })} de chance d’annuler les dégâts restants lorsque son armure est épuisée.`,
  indestructibilityReductionTotal: `Lorsque l’armure est épuisée, l’entité réduit les dégâts subis sur ses HP de ${umbra('indestructibilityReductionTotal', '', { icon: 'indestructibleSkin' })}.`,
  resilienceCritTotalBonus: `Le supplément de dégâts des coups critiques subis est réduit de ${umbra('resilienceCritTotalBonus', '')}.`,
  resilienceAlteTotalBonus: `Les ${effectTitle('alteration', "altérations d'état")} subies par l'entité sont ${umbra('resilienceAlteTotalBonus', '')} moins efficaces.`,
  resilienceTotalCancelBonus: `Les ${effectTitle('alteration', "altérations d'état")} et ${effectTitle('entrave', 'entraves')} subies par l'entité ont ${umbra('resilienceTotalCancelBonus', '', { icon: 'resilienceTotal' })} de chance d'échouer totalement.`,
  occultismInvisibilityChance: `L'entité a ${umbra('occultismInvisibilityChance', '')} de chance de devenir invisible.`,
  occultismTargetableChance: `L'entité n'a que ${umbra('occultismTargetableChance', '')} de chance d'être prise pour cible quand elle est invisible.`,
  occultismCritChanceBonus: `L'attaque qui se prépare pendant l'invisibilité aura ${umbra('occultismCritChanceBonus', '', { signed: true })} de chance de coup critique supplémentaire.`,
  equilibreAggroReduction: `L'entité génère ${umbra('equilibreAggroReduction', '')} d'aggro en moins en attaquant.`,
  equilibreInvisibleDetection: `L’entité réduit l’évitement du ciblage des ennemis invisibles de ${umbra('equilibreInvisibleDetection', '')} points de pourcentage.`,
  equilibreBalancedAttackChance: `L'entité a ${umbra('equilibreBalancedAttackChance', '')} de chance que son attaque soit équilibrée : elle ne génère alors pas d'aggro.`,
  mysticismProcChance: `L'entité a ${umbra('mysticismProcChance', '', { icon: 'mysticTrance' })} de chance d'entrer en transe mystique.`,
  mysticismTranceDuration: `Les transes mystiques durent ${umbra('mysticismTranceDuration', '')}.`,
  mysticismPreparationAcceleration: `Durant une transe mystique, la vitesse de préparation de l'attaque est ${umbra('mysticismPreparationAcceleration', '')} plus rapide.`,
  mysticismDamageBonus: `Une attaque lancée pendant la transe mystique inflige ${umbra('mysticismDamageBonus', '')} de dégâts supplémentaires.`,
};
const movementChargeCost = 1 + result.shiftWeightMalus;
const movementCost = figure('shift', movementChargeCost, movementChargeCost === 1 ? ' charge' : ' charges');
const weightMovementText = {
  'feather-weight': `Ses déplacements ne coûtent que ${movementCost} chacun.`,
  'light-weight': `Ses déplacements coûtent ${movementCost} chacun.`,
  'middle-weight': `L'entité effectue des déplacements moyens, qui coûtent chacun ${movementCost}.`,
  'heavy-weight': `L'entité effectue des déplacements lourds, qui coûtent chacun ${movementCost}.`,
  'super-heavy-weight': `L'entité effectue des déplacements grotesques, qui coûtent chacun ${movementCost}.`,
};
const weightDetailHelper = `${figure(result.shiftWeightClass, `${result.shiftWeightLabel} : ${result.shiftWeightScore}`)}.<br><br>${weightMovementText[result.shiftWeightClass] || ''}`;
const movementRefillRule = `La récupération naturelle, ${effectTitle('trailer', 'Trailer')} compris, s'arrête aux ${helperEffectTitle('shift', 'Déplacements max')}. Elle ne recharge pas les charges de l'équipement et ne retire pas les déplacements déjà au-delà du maximum.`;
const shiftDetailHelper = `Déplacements disponibles : ${figure('shift', result.shiftCurrent)}.<br>
${helperEffectTitle('shift', 'Déplacements max')} : ${autonomous(figure('shift', result.shiftMax), { icon: null })}.${result.shiftSupplementalCharges > 0 ? `<br>Dont ${helperEffectTitle('shift', 'Déplacements sup.')} : ${figure('shift', result.shiftSupplementalCharges)}.` : ''}<br><br>
À chaque nouvelle journée, sa réserve revient à ${umbra('shiftStartingCharges', figure('shift', result.shiftStartingCharges))} déplacements disponibles${result.shiftEquipmentCharges > 0 ? `, dont ${figure('shift', result.shiftEquipmentCharges)} ${helperEffectTitle('shift', 'Déplacements sup.')} restants du stuff équipé` : ''}.<br><br>
${movementRefillRule}<br><br>
Poids actuel : ${figure(result.shiftWeightClass, `${result.shiftWeightScore} · ${result.shiftWeightLabel}`)}.<br>
Coût d'un déplacement : ${movementCost}.`;
const chargeNaturalSlots = Math.max(0, result.chargeEquipmentSlots - result.weaponMasteryChargeBonus);
const fullAttackDamagePercent = balanceData.attackDamage.basePercent;
const hybridSplitPercent = roundBalance(balanceData.resistance.hybrid.splitRatio * 100, 0);
const movementRefillBaseAmount = balanceData.movement.charges.refillBaseAmount;
const movementTrailerRefillAmount = balanceData.movement.charges.trailerRefillAmount;
const attackPurityBonus = getAttackPurity(entite?.currentAttack).bonus;
const psionicPiercingBasePercent = balanceData.damageIntensifiers.psionic.piercingBasePercent;
const brutalityPiercingBasePercent = balanceData.damageIntensifiers.brutality.piercingBasePercent;
function buildGeneratedUmbraTargetSourceLine(result) {
  const value = result.generatedUmbraTarget;
  if (!value || result.umbraHelperCalculations?.autonomousConversion) return '';
  if (result.umbraHelperCalculations?.generatedUmbraTarget) {
    return `<br><br>${buildUmbraCalculation('generatedUmbraTarget', result.umbraHelperCalculations.generatedUmbraTarget)}`;
  }
  const total = value.target === 'magicalDamage' ? result.calculateMagicalTotalValue : value.finalValue;
  const limited = value.generatedBonus < value.bonus;
  return `<br><br>${calculation(getDisplayStatKey(value.target), total, '', [
    contribution(getDisplayStatKey(value.target), value.autonomousValue),
    ...(limited ? [contribution(getDisplayStatKey(value.source), value.generatedBonus)]
      : value.ratios ? [
        contribution(getDisplayStatKey(value.target), value.flatBonus),
        contribution(getDisplayStatKey(value.source), value.sourceBonus),
        contribution(getDisplayStatKey(value.attribute), value.attributeBonus),
      ] : [ratioProduct(getDisplayStatKey(value.source), value.sourceValue, getDisplayStatKey(value.attribute), value.ratio)]),
  ])}`;
}
const overloadPurityReduction = getAttackNatureRules(entite?.currentAttack).overloadReduction;
const overloadChance = percent('brokenSpell', result.brokenSpellChanceTotal, product([
  `( ${figure('brokenSpell', result.baseBrokenSpellChance, ' %')} − ${figure('intelligence', result.intelBrokenSpellChanceReduc, ' %')} )`,
  overloadPurityReduction ? figure('intelligence', (1 - overloadPurityReduction / 100).toFixed(3)) : '',
]));
const helpContent = {
  solarArmor: STAT_HELPER_DESCRIPTIONS.solarArmor,
  criticalResistance: `${STAT_HELPER_DESCRIPTIONS.criticalResistance}<br><br>L’entité réduit ce supplément de ${autonomous(percent('criticalResistance', result.statSystem?.value ?? result.resilienceCritTotalBonus ?? safe('criticalResistance', 0)))}.`,
  alterationResistance: `${STAT_HELPER_DESCRIPTIONS.alterationResistance}<br><br>L’entité les atténue de ${autonomous(percent('alterationResistance', result.statSystem?.value ?? result.resilienceAlteTotalBonus ?? safe('alterationResistance', 0)))}. La brûlure perd des dégâts. Rupture et Dissolution perdent de l’intensité par charge, sans supprimer de charges. Corruption prismatique retire moins de HP maximum. Déphasage applique moins de recul. Les contrôles d’altération qui agissent sur la durée sont raccourcis.`,
  resilienceTotal: `${STAT_HELPER_DESCRIPTIONS.resilienceTotal}<br><br>L’entité a ${autonomous(percent('resilienceTotal', result.statSystem?.value ?? result.resilienceTotalCancelBonus ?? safe('resilienceTotal', 0)))} de chance d’annuler totalement une altération ou une entrave.`,
  equilibreAggroReduction: `${STAT_HELPER_DESCRIPTIONS.equilibreAggroReduction}<br><br>Réduction d’aggro : ${autonomous(percent('equilibreAggroReduction', result.statSystem?.value ?? safe('equilibreAggroReduction', 0)))}.`,
  equilibreAggroBonus: `${STAT_HELPER_DESCRIPTIONS.equilibreAggroBonus}<br><br>Bonus d’aggro : ${autonomous(percent('equilibreAggroBonus', result.statSystem?.value ?? safe('equilibreAggroBonus', 0)))}.`,
  equilibreInvisibleDetection: `${STAT_HELPER_DESCRIPTIONS.equilibreInvisibleDetection}<br><br>Réduction de l’évitement adverse : ${autonomous(percent('equilibreInvisibleDetection', result.statSystem?.value ?? safe('equilibreInvisibleDetection', 0)))}.`,
  equilibreBalancedAttackChance: `${STAT_HELPER_DESCRIPTIONS.equilibreBalancedAttackChance}<br><br>Chance de déclenchement : ${autonomous(percent('equilibreBalancedAttackChance', result.statSystem?.value ?? safe('equilibreBalancedAttackChance', 0)))}.`,
  fatalSurvival: `${STAT_HELPER_DESCRIPTIONS.fatalSurvival}<br><br>Chance totale : ${autonomous('', { icon: 'fatalSurvival' })}.<br>${helperEffectTitle('astralCooldown', 'Cooldown astral')} : ${formatStatNumber(result.astralCooldown?.seconds)} s après chaque réussite.${safe('astrality', 0) > 0 ? ' Réduit par l’Agilité grâce à Astralité.' : ' Délai de base ; l’Agilité ne le réduit pas sans Umbra.'}${result.astralUnavailableSeconds > 0 ? `<br>Récupération : ${formatStatNumber(result.astralUnavailableSeconds)} s restantes.` : ''}`,
  astralCooldown: `${STAT_HELPER_DESCRIPTIONS.astralCooldown}<br><br>Délai : ${formatStatNumber(result.astralCooldown?.seconds)} s. Base : ${formatStatNumber(result.astralCooldown?.baseSeconds)} s ; minimum à l’infini : ${formatStatNumber(result.astralCooldown?.minSeconds)} s.${result.astralUnavailableSeconds > 0 ? `<br>Récupération : ${formatStatNumber(result.astralUnavailableSeconds)} s restantes.` : ''}`,
  astralReturn: `${STAT_HELPER_DESCRIPTIONS.astralReturn}<br><br>${formatStatNumber(result.astralReturn?.amount)} HP (${formatStatNumber(result.astralReturn?.percent)} %) en ${formatStatNumber(result.astralReturn?.seconds)} secondes.`,
  astralBody: `${STAT_HELPER_DESCRIPTIONS.astralBody}<br><br>Chance par contrôle : ${autonomous('', { icon: 'astralBody' })}.<br>Contrôle toutes les ${formatStatNumber(result.astralBody?.checkSeconds)} s d’inactivité. Durée : ${formatStatNumber(result.astralBody?.seconds)} s.`,
  hindranceResistance: `${STAT_HELPER_DESCRIPTIONS.hindranceResistance}<br><br>L’entité a ${autonomous(percent('hindranceResistance', result.statSystem?.value ?? result.resilienceHindranceBonus ?? safe('hindranceResistance', 0)))} de chance de résister totalement aux entraves.`,
  cognitiveExplosion: `Ajoute ${autonomous('', { icon: 'cognitiveExplosion' })} dégâts à l’attaque sans modifier sa nature.`,
  cognitiveGenerator: `Génère ${autonomous('')} essences d'intelligence hypercognitive.`,
  transcendenceTotal: `L'entité a ${umbra('autonomousTotal', '')} de chance de ne pas consommer de ressource de résurrection lors d'une utilisation.<br>${helperEffectTitle('transcendentalCooldown', 'Cooldown transcendantal')} : ${formatStatNumber(result.transcendentalCooldown?.seconds)} s après une réussite.${result.transcendentalUnavailableSeconds > 0 ? `<br>Récupération : ${formatStatNumber(result.transcendentalUnavailableSeconds)} s restantes.` : ''}`,
  transcendentalCooldown: `${STAT_HELPER_DESCRIPTIONS.transcendentalCooldown}<br><br>Délai : ${formatStatNumber(result.transcendentalCooldown?.seconds)} s.${result.transcendentalUnavailableSeconds > 0 ? `<br>Récupération : ${formatStatNumber(result.transcendentalUnavailableSeconds)} s restantes.` : ''}`,
  day: HELPER_TEXT.dayStart,
  fadedLife: `Lorsque l'entité est sur le point de mourir, elle consomme cette Vie pour continuer à se battre.<br><br>Chaque ${effectTitle('fadedLife', 'Vie fanée')} consommée restaure ${figure('neutral', 50, ' %')} des ${effectTitle('HP', 'HP')} max de l'entité et l'empêche de mourir.<br>Les Vies fanées consommées sont définitivement perdues.`,
  eternalLife: `Lorsque l'entité est sur le point de mourir, elle consomme cette Vie pour continuer à se battre.<br><br>La ${effectTitle('eternalLife', 'Vie Éternelle')} consommée restaure ${figure('neutral', 100, ' %')} des ${effectTitle('HP', 'HP')} max de l'entité et l'empêche de mourir.<br>Chaque vie consommée se régénère au ${dayStart}, si l'entité est encore en vie. Les vies d'équipement sont consommées avant les vies naturelles, dans l'ordre des emplacements.`,
meleeAttackPhysical: `${meleeExecHelperBlock}Dégâts de mêlée : <span class="meleeAttack">${fullAttackDamagePercent} %</span>.<br>Si le lanceur meurt avant l'impact, le coup est annulé : son clone s'immobilise, tremble en rouge une seconde, puis disparaît dans un éclat de sang.`,
meleeAttackPiercing: `${meleeExecHelperBlock} ${piercingRecupHelperBlock}Dégâts de mêlée : <span class="meleeAttack">${fullAttackDamagePercent} %</span>.<br>Si le lanceur meurt avant l'impact, seul le clone s'arrête, tremble en rouge une seconde puis disparaît dans un éclat de sang.`,
rangeAttackPiercing: `${piercingRecupHelperBlock}Le projectile perçant vise la case au lancement. La cible peut se déplacer pour l'éviter, mais une autre entité prenant sa place peut être touchée.<br>Pas de jet aléatoire de ratage ; le tir persiste après la mort du lanceur.`,

	
	meleeAttack: `Les attaques de mêlée suivent la cible et infligent <span class="meleeAttack">${fullAttackDamagePercent} %</span> des dégâts après leur temps d'exécution.<br>Si le lanceur meurt avant l'impact, le coup est annulé : son clone s'immobilise, tremble en rouge pendant une seconde, puis disparaît dans un éclat de sang. Le cadavre du lanceur n'est pas teinté.`,
	
	meleeAttackMagical: `${meleeExecHelperBlock}L'attaque magique de mêlée suit la cible. Si le lanceur meurt avant l'impact, le clone s'arrête, tremble en rouge une seconde puis disparaît dans un éclat de sang ; aucun effet n'est appliqué.`,
	
	meleeAttackHybridal: `${meleeExecHelperBlock}L'attaque hybride de mêlée suit sa cible. La mort du lanceur avant l'impact annule le coup : seul le clone s'arrête, tremble en rouge une seconde puis disparaît dans un éclat de sang.`,
	// meleeAttackPiercing: `Les <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">attaques de mêlée piercinges</span> ont un bonus de <div class="picto-stat recuperationTime"></div><span class="recuperationTime">vitesse de récupération</span> de <span class="recuperationTime">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.<br>
// • Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchement</span> peuvent se produire.`,

	// rangeAttackPiercing: `Les <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">attaques perçantes à distance</span> ont un bonus de <div class="picto-stat recuperationTime"></div><span class="recuperationTime">vitesse de récupération</span> de <span class="recuperationTime">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.`,

	rangeAttackPhysical: `Tire un projectile physique en direction d'une cible qui peut se déplacer pour ne pas prendre les dégâts du projectile.<br><br>Le tir reste dirigé vers la case visée au lancement : une autre entité qui prend sa place peut être touchée, quel que soit son camp. Une case vide ne subit aucun dégât.<br>Le projectile continue après la mort du tireur. La dernière cible admissible invisible peut éviter le tir : 50 % × (1 − Précision / 100).<br><br>La récupération commence dès le départ du projectile.<br>Réduction des dégâts à distance : ${helperFigure('rangeAttack', result.calculateRangeRatioTotal, ' %', { precise: true })}.`,
	
	rangeAttackMagical: `Lance un projectile magique qui suit sa cible. Si le lanceur meurt avant l'impact, le sort se dissipe.<br>La récupération commence dès le départ du projectile.<br><br>L'effet conserve sa fonction : un soin exige une cible vivante, une résurrection une cible morte. Un changement de camp pendant le vol ne l'annule pas.<br><br>Surcharge magique : <span class="brokenSpell">${result.brokenSpellChanceTotal} %</span> de risque sur les attaques offensives. En cas d'échec, le lanceur subit <span class="magicalDamage">${result.brokenSpellDamageTotal} %</span> des dégâts de son sort.`,

	rangeAttackHybridal: `Le projectile hybride suit sa cible tant que son lanceur est vivant. La dernière cible admissible invisible peut éviter le tir : 50 % × (1 − Précision / 100).<br>Si le lanceur meurt avant l'impact, sa part magique se disperse. Le noyau physique poursuit alors seul sa course vers la case occupée par la cible au moment de la mort : la cible peut l'esquiver en se déplaçant, tandis qu'une autre entité prenant sa place peut être touchée.<br><br>Avec les trois natures (force, intelligence et agilité), le projectile reste guidé et conserve toutes ses contributions même si le lanceur meurt.<br>La récupération commence dès le lancement.`,

	attackEssenceRed: `<div class="picto-stat strength"></div><span class="strength">Essence de Force</span> : essence d'attaque qui ajoute ou remplace une nature <div class="picto-stat physicalDamage"></div><span class="physicalDamage">physique</span> dans une chasse.<br><br>La nature finale de l'attaque est calculée avec toutes les essences actives. Sans essence active, l'attaque devient <span class="inerte">Inerte</span>.`,
	attackEssenceBlue: `<div class="picto-stat intelligence"></div><span class="intelligence">Essence d'Intelligence</span> : essence d'attaque qui ajoute ou remplace une nature <div class="picto-stat magicalDamage"></div><span class="magicalDamage">magique</span> dans une chasse.<br><br>La nature finale de l'attaque est calculée avec toutes les essences actives. Sans essence active, l'attaque devient <span class="inerte">Inerte</span>.`,
	attackEssenceYellow: `<div class="picto-stat agility"></div><span class="agility">Essence d'Agilité</span> : essence d'attaque qui ajoute ou remplace une nature <div class="picto-stat piercingDamage"></div><span class="piercingDamage">perçante</span> dans une chasse.<br><br>La nature finale de l'attaque est calculée avec toutes les essences actives. Sans essence active, l'attaque devient <span class="inerte">Inerte</span>.`,
	attackEssenceEmpty: `<span class="neutral">Chasse vide</span> : enchassez une essence pour altérer la nature de votre attaque et lui donner des spécificités.<br><br>La dernière essence peut être retirée. Sans essence active, l'attaque devient <span class="inerte">Inerte</span>.`,

  physicalDamage: `Renforce les dégâts des attaques qui utilisent la puissance physique de ${autonomous(calculation('physicalDamage', safe('physicalDamage', 0)))}.`,
    hybridalDamage: `• La <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">puissance hybride</span> est la fusion de la <div class="picto-stat physicalDamage"></div><span class="physical">puissance physique</span> et de la <div class="picto-stat magicalDamage"></div><span class="magical">puissance magiques</span>.<br>
	• Les dégats <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">hybride</span> entrainent <span class="physicalDamage">${hybridSplitPercent}%</span> de dégats <div class="picto-stat physicalDamage"></div><span class="physical"> physique</span> et <span class="magicalDamage">${hybridSplitPercent}%</span> de dégats <div class="picto-stat magicalDamage"></div><span class="magical">magiques</span> à la cible.<br>
	• La cible utilise <span class="physicalResistance">${hybridSplitPercent}%</span> de sa <div class="picto-stat physicalResistance"></div><span class="physicalResistance">résistance physique</span> et <span class="magicalResistance">${hybridSplitPercent}%</span> de sa <div class="picto-stat magicalResistance"></div><span class="magicalResistance">résistance magique</span> pour résister aux dégats hybrides. <br>
	• L'attaquant utilise <span class="physicalPen">${hybridSplitPercent}%</span> de sa <div class="picto-stat physicalPen"></div><span class="physicalPen">pénétration physique</span></div> et <span class="magicalPen">${hybridSplitPercent}%</span> de sa <div class="picto-stat magicalPen"></div><span class="magicalPen">pénétration magique</span> pour pénétrer les résistances de sa cible.<br>
	• Seule la partie physique des <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> est <div class="picto-stat dodge"></div><span class="dodge">esquivable</span>. Leur partie magique atteint la cible.<br>
	• Les <div class="picto-stat criticalPower"></div><span class="criticalPower">coups critiques</span> sont possibles sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat ambidextry"></div> <span class="ambidextry">Ambidextrie</span> fonctionne sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat esoterism"></div><span class="esoterism">Ésoterisme</span> marche sur la part <div class="picto-stat magicalDamage"></div><span class="magical">magique</span> des <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> ne peuvent pas <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>.`,
	
  magicalDamage: `Renforce les dégâts des attaques qui utilisent la puissance magique de ${autonomous(calculation('magicalDamage', result.calculateMagicalTotalValue))}.`,
  piercingPower: `Renforce les dégâts des attaques qui utilisent la puissance perçante de ${autonomous(calculation('piercingPower', safe('piercingDamage', 0)))}.`,
  will: `La ${effectTitle('will', 'Volonté')} détermine la puissance de l'âme de l'entité. Une âme puissante résistera aux corruptions du monde et bénéficiera d'un potentiel élevé.<br><br>• L'entité possède un cycle d'éveil de ${nonlinear('will', result.willAwakeBonus, 'will', statValue ?? safe('will', 0))} niveaux.<br><br>• ${statEffects.levelMaximum}`,
  magicalResistance: result.statSystem?.resistancePoints
    ? `Les dégâts de nature magique subis sont réduits de ${helperFigure('magicalResistance', Number(result.reductionPercent.toFixed(2)), ' %', { maximum: getStatEffectMaximum('resistanceReduction') })}.<br>Résistance magique totale : ${autonomous(calculation('magicalResistance', result.statSystem.value))}.`
    : `Les dégâts de nature magique subis sont réduits de ${autonomous(nonlinear('magicalResistance', result.reductionPercent, 'magicalResistance', statValue ?? safe('magicalResistance', 0), ' %'))}.`,
  physicalResistance: result.statSystem?.resistancePoints
    ? `Les dégâts de nature physique subis sont réduits de ${helperFigure('physicalResistance', Number(result.reductionPercent.toFixed(2)), ' %', { maximum: getStatEffectMaximum('resistanceReduction') })}.<br>Résistance physique totale : ${autonomous(calculation('physicalResistance', result.statSystem.value))}.`
    : `Les dégâts de nature physique subis sont réduits de ${autonomous(nonlinear('physicalResistance', result.reductionPercent, 'physicalResistance', statValue ?? safe('physicalResistance', 0), ' %'))}.`,
  magicalPen: `Les attaques de nature magique ignorent ${autonomous(nonlinear('magicalPen', result.magicPenBonus, 'magicalPen', statValue ?? safe('magicalPen', 0), ' %'))} de la résistance magique de la cible.`,
  physicalPen: `Les attaques de nature physique ignorent ${autonomous(nonlinear('physicalPen', result.physicPenBonus, 'physicalPen', statValue ?? safe('physicalPen', 0), ' %'))} de la résistance physique de la cible.`,
  velocity: `Améliore la ${effectTitle('speed', 'vitesse')} de l'entité.<br>Le délai de remplissage de la barre d’action est réduit de ${autonomous(figure('velocity', result.velocityReductionPercent, ' %'))}.<br><br>Durée d'action : ${calculation('speed', seconds(result.velocityAdjustedSpeedMs), ' s', `${figure('speed', seconds(baseSpeedMs), ' s')} × ( ${figure('neutral', 100, ' %')} − ${figure('velocity', result.velocityReductionPercent, ' %')} )${result.velocityTimingAdjustmentMs ? ` ${result.velocityTimingAdjustmentMs < 0 ? '−' : '+'} ${figure('speed', seconds(Math.abs(result.velocityTimingAdjustmentMs)), ' s')}` : ''}`)}.${buildGeneratedUmbraTargetSourceLine(result)}`,
  controlledSpeed: `${STAT_HELPER_DESCRIPTIONS.controlledSpeed}<br><br>Atténuation : ${autonomous(percent('controlledSpeed', result.statSystem?.value ?? safe('controlledSpeed', 0)))}.`,
  agileRetreat: `${STAT_HELPER_DESCRIPTIONS.agileRetreat}<br><br>Chance par tentative : ${figure('agileRetreat', result.agileRetreatChance, ' %')}.`,
  speed: `L'entité met ${umbra('speedTotal', figure('speed', turnSeconds, ' s'), { displayValue: turnSeconds, displayUnit: ' s' })} à charger son tour.`,
	HP: `Les <div class="picto-stat HP"></div><span class="HP">points de vie</span> de l'entité determinent combien elle peut encaisser de dégats avant de mourir.<br>Ils determinent aussi le<div class="picto-stat picto-malus-hp"></div><span class="danger">poids de l'entité</span>.`,
	weight: weightDetailHelper,
cooldownTimeDetail: cooldownTimeDetailHelper,
preparationTimeDetail: preparationTimeDetailHelper,
executionTimeDetail: executionTimeDetailHelper,
executionRangeTimeDetail: executionRangeTimeDetailHelper,
recoveryTimeDetail: recoveryTimeDetailHelper,

  cooldownTime: `Le cooldown des attaques de l'entité est réduit de ${autonomous(attackCooldownReducDetailLine)}.`,
  preparationTime: `La durée de préparation des attaques de l'entité est réduite de ${autonomous(attackPreparationReducDetailLine)}.`,
  executionTime: `La durée d'exécution des attaques de l'entité est réduite de ${autonomous(attackExecutionReducDetailLine)}.`,
  recuperationTime: `La durée de récupération des attaques de l'entité est réduite de ${autonomous(attackRecoveryReducDetailLine)}.`,
  projectileTime: `Les projectiles de l'entité sont ${autonomous(attackProjectileSpeedDetailLine)} plus rapides.`,
  piercingDamage: `Renforce les dégâts des attaques qui utilisent la puissance perçante de ${autonomous(calculation('piercingDamage', safe('piercingDamage', 0)))}.`,
  transpiercingDamage: `Réduction de récupération : ${percent('recuperationTime', result.transpiercingRecupTotalReduc, [percentPart('transpiercingDamage', result.transpiercingRecupBaseBonus), percentPart('agility', result.transpiercingRecupAgiBonus)])}.`,
  dayHpRegen: `L'entité récupère ${autonomous(calculation('dayHpRegen', result.dayHpRegenTotal, '', [contribution('dayHpRegen', result.dayHpRegenBase), contribution('vitality', result.dayHpRegenFromVitality)]))} HP au début de chaque nouvelle journée.`,
  dodge: `Chance d’esquive : ${helperFigure('dodge', result.calculateTotalDodgeBonus, ' %', { precise: true })}.<br><br>Score d’esquive total : ${helperFigure('dodge', result.statSystem?.value ?? result.dodgeValue, '', { precise: true })} points.<br>Conversion : 99 × score / (score + 98).<br>La Précision adverse réduit cette chance. Les dégâts magiques sont inesquivables, y compris dans une attaque composite.`,
  precision: `${helperStatIntroduction('precision')}<br><br>Réduction de l’esquive adverse : ${helperFigure('precision', result.statSystem?.chancePercent ?? result.precisionBonus, ' %', { precise: true })}.<br>Score de Précision : ${helperFigure('precision', result.statSystem?.value ?? statValue ?? safe('precision', 0), '', { precise: true })} points.<br>Contre la dernière cible admissible invisible : 50 % d’évitement × (1 − Précision / 100). Les attaques magiques pures sont exemptées.`,
  bullsEye: `${helperStatIntroduction('bullsEye')}<br><br>Réduction du malus à distance : ${helperFigure('bullsEye', result.statSystem?.value ?? result.bullsEyePercent, ' %')}.<br>L’Agilité améliore la progression de Bull’s Eye.<br><br>Le malus dépend de la durée d’exécution effective, après Hâte et vitesse de projectile.<br>Malus final = malus lié à la durée × (1 − Bull’s Eye / 100).<br>Les parties magiques et les attaques prismatiques sont exemptées. Les attaques inertes sont concernées.`,
  hpBattleRegen: `Au début de son tour, à partir du deuxième, l’entité restaure ${autonomous(battleRegen)} de ses HP maximum, soit ${figure('HP', result.hpBattleRegenAmount, ' HP')}, dans la limite des HP manquants.`,
	armor:`L'${effectTitle('armor', 'armure')} protège les points de vie de l'entité de presque toutes les sources de dégâts.<br>L'armure fournie par la ${effectTitle('robustness', 'robustesse')} se régénère à chaque ${dayStart}, seulement si l'entité est vivante à cet instant.`,
  bloodThirsty: `Les attaques qui le peuvent soignent l'attaquant de ${autonomous(nonlinear('bloodThirsty', result.bloodThirstyLifestealBonus, 'bloodThirsty', result.bloodThirstyValue, ' %'))} des dégâts infligés.`,
  bloodFuryExecutionChance: `Une attaque qui le peut a ${autonomous(executionChance(result.bloodFuryExecutionChanceTotal))} de chance d'exécuter sa cible.`,
  bloodFuryTargetThreshold: `Les cibles avec ${autonomous(executionThreshold(result.bloodFuryTargetThresholdTotal))} de leurs HP max ou moins sont exécutables par les attaques qui le peuvent.`,
  bloodFuryExecutionDamage: `Les exécutions infligent ${autonomous(executionDamage(result.bloodFuryExecutionDamageTotal))} dégâts supplémentaires.`,
  criticalDamage: `Les coups critiques infligent ${autonomous(percent('criticalDamage', result.criticalDamageTotal, critDamageParts))} de dégâts supplémentaires.<br><br>${helperStatIntroduction('criticalDamage', { exclusive: (result.statSystem?.umbra ?? safe('criticalPower', 0)) > 0 })}`,
  criticalChance: `Les attaques qui le peuvent ont ${autonomous(percent('criticalChance', result.criticalChanceTotal, critChanceParts))} de chance de réaliser un coup critique.`,
  extraLife: `L'entité gagne ${autonomous(figure('extraLife', result.extraLifeMax))} vies transcendées supplémentaires.`,
	rangeAttackTranspiercing: `Tire un projectile transperçant vers la case visée au lancement. La cible peut se déplacer pour l'éviter ; une autre entité prenant sa place peut être touchée.<br>Aucun jet aléatoire de ratage. Le projectile continue après la mort du tireur.<br>La récupération commence dès son départ.`,
  transpiercingPower: `Bonus de l'attaque pure : ${calculation('transpiercingDamage', result.transpiercingPowerTotal, '', [contribution('piercingDamage', result.transpiercingPowerPiercing), ratioProduct('agility', result.transpiercingPowerAgility, 'agility', result.transpiercingPowerRatio)])}.`,
	rangeAttack: `Les attaques à distance commencent leur récupération dès le lancement, sans attendre l'impact.<br><br>Physique et Perçante : projectiles balistiques persistants.<br>Cinétique : physique + perçant, sans aucune part magique ; projectile balistique persistant.<br>Magique : suit la cible, mais se dissipe si le lanceur meurt.<br>Hybride : suit la cible tant que le lanceur vit ; à sa mort, la magie se dissipe et le noyau physique continue vers la dernière case verrouillée.<br>Spectrale : suit la cible tant que le lanceur vit ; à sa mort, la magie se dissipe et la part perçante continue vers la dernière case verrouillée.<br>Prismatique : guidage et persistance de toutes les contributions.<br><br>Réduction des dégâts physiques et perçants à distance : ${helperFigure('rangeAttack', result.calculateRangeRatioTotal, ' %', { precise: true })}. Le malus augmente avec la durée d’exécution effective, après Hâte et vitesse de projectile. Bull’s Eye réduit ce malus. Les parties magiques et les attaques prismatiques en sont exemptées. Les attaques inertes sont concernées.`,
  psionic: `L'attaque est si chargée en magie qu'elle devient ${effectTitle('psionic', 'psionique')}. L'intelligence du porteur est telle qu'elle frappe directement l'esprit de la cible.<br><br>Elle exploite ${percent('psionic', result.psionicPercantBonus, [constant(psionicPiercingBasePercent, ' %'), percentPart('psionic', attackPurityBonus), percentPart('intelligence', result.psionicBonus)])} de la puissance magique de l'attaquant.<br><br>Bonus obtenu : ${figure('psionic', result.psionicPMBonus, '', { signed: true })}.<br>Puissance magique après bonus : ${calculation('magicalDamage', result.psionicTotalBonus, '', [contribution('magicalDamage', result.psionicMagicalPower), contribution('psionic', result.psionicPMBonus)])}.`,
  fracass: `L'attaque est pure force physique : ${effectTitle('fracass', 'Fracassante')}. Elle fracasse littéralement sa cible en exploitant ${percent('fracass', result.brutalityPercantBonus, [constant(brutalityPiercingBasePercent, ' %'), percentPart('fracass', attackPurityBonus), percentPart('strength', result.brutalityBonus)])} de la puissance physique de l'attaquant.<br><br>Bonus obtenu : ${figure('fracass', result.brutalityPhysicalPowerBonus, '', { signed: true })}.<br>Puissance physique après bonus : ${calculation('physicalDamage', result.brutalityTotalBonus, '', [contribution('physicalDamage', result.brutalityPhysicalPower), contribution('fracass', result.brutalityPhysicalPowerBonus)])}.`,
  brokenSpell: `Risque de surcharge : ${overloadChance}.<br>En cas d'échec, le projectile est annulé et le lanceur subit ${figure('magicalDamage', result.brokenSpellDamageTotal, ' %')} des dégâts de son attaque. Le retour de dégâts n'est pas réduit par la pureté.`,
  messedSpell: `Risque de surcharge : ${overloadChance}.<br>En cas d'échec en mêlée, l'attaque inflige ${figure('magicalDamage', result.brokenSpellDamageTotal, ' %')} de ses dégâts à la cible et au lanceur. Le retour de dégâts n'est pas réduit par la pureté.`,
	undogeable: `L'attaque ne peut pas être <div class="picto-stat dodge"></div><span class="dodge">esquivée</span> par la cible. D'aucune manière.`,
	perforation: `<span class="piercingDamage">${getAttackNatureRules(entite?.currentAttack).armorBypassPercent} %</span> des dégâts contournent l'<div class="picto-stat armor"></div><span class="armor">armure</span>. La part restante suit le traitement normal. Perforation progresse de 10 % au niveau 1 à 100 % au niveau 10 d'une attaque pure perçante.`,
	executionMelee: `Les attaques au <div class="picto-stat meleeAttack"></div><span class="meleeAttack">corps à corps</span> ont un bonus de <div class="picto-stat executionTime"></div><span class="executionTime">${result.meleeExecBaseBonus}%</span> sur la vitesse d'exécution.`,
  marathon: `• Lorsqu'elle se déplace, l'entité a ${percent('marathon', result.marathonChance, sourceParts('marathon'))} de chance de ne pas consommer de charge de déplacement.`,
  trailer: `• Au début de son tour, l'entité a ${percent('trailer', result.trailerChance, sourceParts('trailer'))} de chance de récupérer ${figure('shift', movementTrailerRefillAmount)} déplacements au lieu de ${figure('shift', movementRefillBaseAmount)}.<br><br>${movementRefillRule}`,
shift: shiftDetailHelper,
  weaponOrfevre: `• L'entité améliore l'efficacité de ses équipements de ${percent('weaponOrfevre', result.weaponOrfevreChance, sourceParts('weaponOrfevre'))}. Les bonus sont renforcés et les malus atténués.<br><br>Bonus appliqué aux équipements portés : ${figure('weaponOrfevre', result.weaponOrfevreStuffActiveBonus, ' %')}.`,
  weaponCollector: `• Quand l'entité est victorieuse, elle augmente les chances de trouver des équipements dans les butins de guerre de ${percent('weaponCollector', result.weaponCollectorChance, sourceParts('weaponCollector'))}.`,
  charge: `L'entité peut porter jusqu'à ${calculation('charge', result.chargeEquipmentSlots, '', [contribution('charge', chargeNaturalSlots), contribution('weaponMastery', result.weaponMasteryChargeBonus)])} équipements.`,
["orfevre-detail"]: buildOrfevreDetailHelper(result.orfevreDetail),
stuffSlot: `Emplacement d'équipement vide.<br>Vous pouvez équiper un équipement dans cet emplacement en réalisant un <div class="picto-stat dragNdrop"></div><span class="dragNdrop">Drag&Drop</span> de l'équipement que vous souhaitez équiper, depuis l'inventaire vers l'emplacement d'équipement vide.<br>Faites un <div class="picto-stat doubleclic"></div><span class="doubleclic">Double clic</span> pour déséquiper.<br>`,
};

const ambianceContent = {
  bloodFury: `Une rage ancienne pulse dans le sang. Chaque blessure ouverte appelle une fin plus brutale.`,
  vitality: `La chair refuse de céder. Chaque souffle maintient l’entité un peu plus longtemps dans le combat.`,
  physicalDamage: `La force brute parle sans détour. Ce qui résiste finit par rompre.`,
  weaponMastery: `Les armes révèlent leur véritable puissance entre les mains de ceux qui savent les écouter.`,
  movement: `Rien ne sert de courir, il faut partir à temps... Mais c'est bien aussi de courir vite !`,
  haste: `Certaines cultures mettent la ponctualité au centre de leur savoir-faire. D'autres, font tout simplement l'inverse, et placent tout leur savoir-faire bien avant la ponctualité...`,
  hypercognition: `Les nœuds de son esprit sont si tendu et inervé de magie, que l'entité donne l'impression qu'elle peut exploser à tout moment`,
  bloodThirsty: `Chaque plaie ouverte nourrit la suivante. Le sang versé refuse d'être perdu.`,
};

// One presentation for every Umbra. All amounts/models remain supplied by the
// existing calculators; the order below follows the former capability lists.
// The optional final flag marks an additive grant, never a displayed final total.
const umbraAbilities = {
  vitality: [
    ['vitalityBonus', 'HP max', `Augmente les ${umbraHealthMaximum('points de vie maximum')} de l’entité.`, 'HP', null, true],
    ['HpRegenAmount', 'Régénération journalière', `Restaure ces HP au ${umbraContextLink('day-start', 'début de chaque nouvelle journée', 'Régénération journalière', 'Cette régénération se déclenche au changement de journée du jeu, si l’entité est vivante.')}, si l’entité est vivante.`, 'dayHpRegen', null, true],
  ],
  haste: [
    ['hastePreparation', 'Préparation', "Réduit la durée de préparation des attaques.", 'attackPreparationReduc', 'preparation-haste', true],
    ['hasteCDReduc', 'Cooldown', "Réduit le délai avant de pouvoir relancer une attaque.", 'attackCooldownReduc', 'cooldown-haste', true],
    ['hasteExecutionReduc', 'Exécution', "Réduit la durée d’exécution des attaques.", 'attackExecutionReduc', 'execution-haste', true],
    ['hasteProjectilSpeed', 'Vitesse des projectiles', "Augmente la vitesse des projectiles.", 'attackProjectileSpeed', 'projectile-speed-haste', true],
    ['hasteRecupReduc', 'Récupération', "Réduit la durée de récupération après les attaques.", 'attackRecoveryReduc', 'recuperation-haste', true],
  ],
  indestructibility: [
    ['indestructibilityBonus', 'Indestructibilité totale', STAT_HELPER_DESCRIPTIONS.indestructibilityTotal, null, 'indestructibilityTotal'],
    ['indestructibilityReductionTotal', 'Peau indestructible', STAT_HELPER_DESCRIPTIONS.indestructibleSkin, null, 'indestructibleSkin'],
    ['hpBattleRegenPercent', 'Régénération de combat', `Restaure ce pourcentage des ${umbraHealthMaximum('HP max')} au ${umbraContextLink('turn-start', 'début du tour, à partir du deuxième', 'Régénération de combat', 'Cette régénération se déclenche au début du tour de l’entité, à partir du deuxième tour, dans la limite des HP manquants.')}.`, 'hpBattleRegen'],
  ],
  esoterism: [
    ['esoterismBonus', 'Protection ésotérique', 'Chance de réduire les dégâts magiques reçus.', null, 'esoterismChance'],
    ['esoterismTotalReduction', 'Réduction magique', '', null, 'esoterismReduction'],
    ['esoterismPiercingChance', 'Protection perçante', 'À l’activation d’Ésotérisme, chance de protéger aussi contre les dégâts perçants.', null, 'esoterismPiercingChance'],
    ['esoterismPiercingReduction', 'Réduction perçante', '', null, 'esoterismPiercingReduction'],
  ],
  astrality: [
    ['astralityTotal', 'Survie au coup fatal', `Chance de survivre à un coup fatal avec ${helperFigure('HP', 1)} HP.`],
  ],
  resilience: [
    ['resilienceCritTotalBonus', 'Résistance aux critiques', STAT_HELPER_DESCRIPTIONS.criticalResistance, 'criticalResistance'],
    ['resilienceAlteTotalBonus', 'Résistance aux altérations', STAT_HELPER_DESCRIPTIONS.alterationResistance],
    ['resilienceTotalCancelBonus', 'Résilience totale', STAT_HELPER_DESCRIPTIONS.resilienceTotal, null, 'resilienceTotal'],
  ],
  criticalPower: [
    ['critTotalChance', 'Chance de critique', "Chance de réaliser un coup critique avec les attaques qui le permettent.", 'criticalChance'],
    ['critDamageBonus', HELPER_TEXT.criticalDamageName(true), "Dégâts supplémentaires des coups critiques. Le coup conserve la nature de ses dégâts.", 'criticalDamage'],
  ],
  ambidextry: [
    ['ambidextryTotalChance', 'Chance de deuxième coup', "Chance de réaliser un deuxième coup avec les attaques qui le permettent.", null, 'ambidextryChance'],
    ['ambidextryDamageBonus', 'Dégâts du deuxième coup', `Pourcentage des dégâts du premier coup infligé par le deuxième. Le premier inflige ${umbraContextLink('first-hit-base', '100 %', 'Dégâts du premier coup', 'Le premier coup conserve la totalité de ses dégâts habituels. Le pourcentage du deuxième coup indique la part de ces dégâts qu’il reproduit.')} de ses dégâts ; ses effets peuvent être réappliqués.`, null, 'dominantArm'],
  ],
  hypercognition: [
    ['hypercognitionBonus', 'Explosion cognitive', "Ajoute des dégâts aux attaques sans modifier leur nature.", 'cognitiveExplosion', 'cognitiveExplosion', true],
    ['hypercognitionEssences', 'Générateur cognitif', "Nombre d’essences d’intelligence hypercognitive générées par l’entité.", 'cognitiveGenerator', 'essence-hyperco', true],
  ],
  transcendence: [
    ['transcendenceExBonus', 'Vies supplémentaires', "Augmente le nombre maximum de vies supplémentaires.", 'extraLife', null, true],
    ['transcendenceConsoProtectionPercent', 'Transcendance totale', STAT_HELPER_DESCRIPTIONS.transcendenceTotal, 'transcendenceTotal', 'transcendenceTotal'],
  ],
  equilibre: [
    ['equilibreAggroBonus', 'Présence équilibrée', STAT_HELPER_DESCRIPTIONS.equilibreAggroBonus, 'equilibreAggroBonus'],
    ['equilibreAggroReduction', 'Réduction d’aggro', "Réduit l’aggro générée par les dégâts de l’entité."],
    ['equilibreInvisibleDetection', 'Perception équilibrée', "Réduit l’évitement du ciblage des ennemis invisibles, en points de pourcentage.", null, 'balance-view'],
    ['equilibreBalancedAttackChance', 'Attaque équilibrée', "Chance que la prochaine attaque ne génère aucune aggro.", null, 'balance-strike'],
  ],
  mysticism: [
    ['mysticismProcChance', 'Transe mystique', "Chance d’entrer en transe pendant la préparation de l’attaque.", null, 'mysticTrance'],
    ['mysticismTranceDuration', 'Durée de la transe', "Durée de chaque transe mystique."],
    ['mysticismPreparationAcceleration', 'Préparation en transe', "Accélère la préparation pendant la transe.", null, null, true],
    ['mysticismDamageBonus', 'Dégâts en transe', "Dégâts supplémentaires si l’attaque est lancée pendant la transe.", null, null, true],
  ],
  occultism: [
    ['occultismInvisibilityChance', 'Invisibilité', "Chance de devenir invisible pendant la préparation de l’attaque."],
    ['occultismCritChanceBonus', 'Critique en invisibilité', "Augmente temporairement la chance de critique pendant l’invisibilité.", null, null, true],
    ['occultismTargetableChance', 'Chance d’être ciblée', "Chance de pouvoir être ciblée pendant l’invisibilité. L’entité peut encore être visée si elle est la dernière cible admissible.<br>Dans ce cas, les attaques offensives subissent 50 % d’évitement, réduit par la Précision de l’attaquant ; les attaques magiques pures sont exemptées. L’Agilité améliore l’évitement du ciblage et la détection d’Équilibre le réduit."],
    ['occultismDodgeBonus', 'Esquive en invisibilité', "Points d’esquive supplémentaires pendant l’invisibilité.", null, null, true],
    ['occultismPreparationSpeedDebuff', 'Discrétion', "Ralentit la préparation de l’attaque pendant l’invisibilité."],
    ['occultismShadowFragilityPercent', 'Fragilité des ombres', "Augmente les dégâts reçus pendant l’invisibilité."],
  ],
  movement: [
    ['movementMaxCharges', 'Déplacements max', "Capacité de la réserve de déplacements.", 'shift', null, true],
    ['movementStartingTotalCurrent', 'Réserve de départ', "Pourcentage de la réserve disponible au début du combat."],
    ['movementStartingCharges', 'Charges de départ', "Nombre de charges de déplacement disponibles au début du combat."],
    ['movementMarathonChance', 'Marathonien', "Chance de ne pas consommer de charge lors d’un déplacement.", 'marathon', null, true],
    ['movementTrailerChance', 'Traînard', `Chance de récupérer ${umbraContextLink('trailer-refill', helperFigure('shift', movementTrailerRefillAmount), 'Déplacements avec Traînard', `En cas de réussite, l’entité récupère ${movementTrailerRefillAmount} charges de déplacement au début de son tour, dans la limite de sa réserve.`)} déplacements au début du tour au lieu de ${umbraContextLink('base-refill', helperFigure('shift', movementRefillBaseAmount), 'Récupération habituelle de déplacements', `Sans déclenchement de Traînard, l’entité récupère ${movementRefillBaseAmount} charge de déplacement au début de son tour, dans la limite de sa réserve.`)}.<br>${movementRefillRule}`, 'trailer', null, true],
  ],
  weaponMastery: [
    ['weaponMasteryChargeBonus', 'Charge', "Accorde des emplacements d’équipement supplémentaires.", 'charge', null, true],
    ['weaponOrfevreBonus', 'Orfèvre armurier', "Renforce les bonus des équipements portés et atténue leurs malus.", 'weaponOrfevre', null, true],
    ['weaponMasteryTrophyChance', 'Collectionneur de guerre', "Augmente les chances de trouver des équipements dans les butins de guerre après une victoire.", 'weaponCollector', null, true],
  ],
};

function structuredUmbraHelper() {
  const key = normalizeStatKey(statKey);
  const models = result.umbraHelperCalculations || {};
  const family = GENERATED_UMBRA_HELPERS[key];
  const abilities = family ? [
    ['generatedUmbraSource', family.name, buildPlayerStatDescription(family.target), family.target],
    ...(key === 'hypercognition' ? [['hypercognitionEssences', 'Générateur cognitif', 'Essences d’intelligence hypercognitive liées à l’entité, équipées et disponibles comprises. Aucun emplacement supplémentaire.', 'cognitiveGenerator', 'essence-hyperco', true]] : []),
    ...(key === 'resilience' ? [['resilienceAlteTotalBonus', 'Résistance aux altérations', '', 'alterationResistance'], ['resilienceHindranceBonus', 'Résistance aux entraves', '', 'hindranceResistance'], ['resilienceTotalCancelBonus', 'Résilience totale', '', 'resilienceTotal']] : []),
    ...(key === 'equilibre' ? [['equilibreAggroBonus', 'Présence équilibrée', '', 'equilibreAggroBonus'], ['equilibreInvisibleDetection', 'Perception équilibrée', '', 'equilibreInvisibleDetection'], ['equilibreBalancedAttackChance', 'Attaque équilibrée', '', 'equilibreBalancedAttackChance']] : []),
    ...(key === 'bloodFury' ? [
      ['bloodFuryExecutionBonus', 'Chance d’exécution', STAT_HELPER_DESCRIPTIONS.bloodFuryExecutionChance, 'bloodFuryExecutionChance'],
      ['bloodFuryExecChanceBonus', 'Seuil de HP', STAT_HELPER_DESCRIPTIONS.bloodFuryTargetThreshold, 'bloodFuryTargetThreshold'],
      ['bloodFuryExecDamage', 'Dégâts supplémentaires', STAT_HELPER_DESCRIPTIONS.bloodFuryExecutionDamage, 'bloodFuryExecutionDamage'],
    ] : []),
    ...(key === 'astrality' ? [['astralBodySource', 'Corps astral', '', 'astralBody']] : []),
    ...(key === 'vivacite' ? [['controlledSpeedSource', 'Vitesse contrôlée', '', 'controlledSpeed']] : []),
    ...(key === 'vision' ? [['bullsEyeSource', 'Bull’s Eye', '', 'bullsEye']] : []),
    ...(key === 'criticalPower' ? [['critDamageBonus', HELPER_TEXT.criticalDamageName(true), '', 'criticalDamage']] : []),
  ] : umbraAbilities[key];
  if (!abilities?.length) return null;
  const points = result.generatedUmbraSource?.sourceValue ?? result.displayValue ?? statValue ?? safe(key, 0);
  const entries = abilities.flatMap(([modelKey, name, description, target, icon, additiveGrant = false]) => {
    const source = models[modelKey];
    if (!source) return [];
    const total = target ? (target === 'armor' ? readUmbraTotal('armor') : models[target + 'Total'] || readUmbraTotal(target, source.unit)) : null;
    const contribution = total?.contributions?.find(part => part.kind === 'umbra');
    const model = contribution || source;
    // Keep existing calculation preference keys when an Umbra joins the shared family.
    const id = key === 'bloodFury' ? (target === 'bloodThirsty' ? 'bloodFuryBloodThirstyBonus' : modelKey)
      : key === 'hypercognition' ? (target === 'cognitiveExplosion' ? 'hypercognitionBonus' : 'hypercognitionEssences')
      : family ? target + (['fatalSurvival', 'criticalDamage'].includes(target) ? 'Total' : 'UmbraGrant') : modelKey;
    const explanationId = id === `${target}Total` ? modelKey : id;
    models[explanationId] = { ...model, name };
    const stat = target || icon || source.stat;
    const exclusive = ['ambidextry', 'esoterism'].includes(key) || Boolean(total?.system?.uniquePassive);
    const calculationId = family && !exclusive && total?.improvement && target !== 'criticalDamage' ? `${target}Ratio` : explanationId;
    if (calculationId !== explanationId) models[calculationId] = total.system?.umbraFlat
      ? { ...total.improvement, name, value: model.value - total.system.umbraFlat, unit: model.unit }
      : { ...model, name };
    return [{ id, stat, name, icon: icon || stat, value: model.value, unit: model.unit || '',
      grant: additiveGrant || Boolean(family && !exclusive), exclusive, total, calculationId, explanationId,
      maximum: model.maximum ?? getStatEffectMaximum(modelKey),
      gradient: umbraRatioGradient(models[calculationId], key),
      state: family && !exclusive && target !== 'cognitiveGenerator' ? 'X' : '',
      description: description || buildPlayerStatDescription(stat, name),
      sentence: family ? '' : description,
    }];
  });
  const detailEntries = entries.filter(entry => entry.calculationId !== entry.id).map(entry => ({
    id: entry.calculationId, stat: entry.stat, name: `${entry.name} · Renforcement de l’Umbra`,
    value: models[entry.calculationId].value, unit: entry.unit, grant: true, component: 'reinforcement', total: entry.total,
    description: 'Bonus du renforcement accordé par l’Umbra. Il s’ajoute à son éventuel bonus direct pour former le montant total accordé.',
    gradient: entry.gradient,
  }));
  const directGrants = entries.flatMap(entry => {
    const value = entry.total?.system?.umbraFlat;
    if (!Number.isFinite(value) || value === 0) return [];
    const gift = { id: `${entry.stat}UmbraFlat`, stat: entry.stat, name: `${entry.name} · Bonus direct`,
      value, unit: entry.unit, grant: true, component: 'flat', total: entry.total,
      description: `Bonus direct de ${escapeEssenceHTML(entry.name)} accordé par l’Umbra. Il s’ajoute au renforcement indiqué dans la carte.` };
    models[gift.id] = { stat: gift.stat, value, unit: gift.unit, parts: [{ stat: gift.stat, value, unit: gift.unit, fixed: true }] };
    return [gift];
  });
  detailEntries.push(...directGrants);
  if (key === 'astrality') {
    const survivalHP = { id: 'fatalSurvivalHP', stat: 'HP', name: 'HP après une Survie fatale', value: 1, unit: ' HP',
      description: 'Après une Survie fatale réussie, l’entité reste à 1 HP. Avec Astralité, Retour astral peut ensuite restaurer progressivement ses points de vie.' };
    const bodyCheck = { id: 'astralBodyCheck', stat: 'astralBody', name: 'Intervalle d’activation du Corps astral', value: result.astralBody.checkSeconds, unit: ' s',
      description: 'Quand Corps astral est inactif, une nouvelle chance d’activation se présente à chaque intervalle. Aucun nouveau déclenchement n’est tenté pendant son activité. Une nouvelle attente commence à la fin de l’effet.' };
    detailEntries.push(survivalHP, bodyCheck);
    for (const entry of [survivalHP, bodyCheck]) models[entry.id] = {
      stat: entry.stat, value: entry.value, unit: entry.unit,
      parts: [{ stat: entry.stat, value: entry.value, unit: entry.unit, fixed: true }],
    };
    const survival = entries.find(entry => entry.stat === 'fatalSurvival');
    survival.sentenceParts = ['de chance de survivre à un coup fatal avec ', { value: survivalHP.id }, '.'];
    const cooldown = { id: 'astralCooldown', stat: 'astralCooldown', name: 'Cooldown astral', value: result.astralCooldown.seconds, unit: ' s', gradient: umbraRatioGradient(models.astralCooldownScore, key) };
    models.astralCooldown = models.astralCooldownScore;
    entries.splice(1, 0, cooldown);
    const healing = { id: 'astralReturn', stat: 'astralReturn', name: 'Retour astral', value: result.astralReturn.percent, unit: ' %', maximum: result.astralReturn.maxPercent, exclusive: true, outsidePassiveFrame: true, gradient: umbraRatioGradient(models.astralReturnScore, key) };
    models.astralReturn = models.astralReturnScore;
    healing.sentenceParts = ['Après une survie astrale, l’entité récupère ', { value: healing.id }, ' de ses ' + umbraHealthMaximum() + ' en ', { value: cooldown.id }, '.'];
    healing.sentenceContainsValue = true;
    entries.splice(2, 0, healing);
    const duration = { id: 'astralBodyDuration', stat: 'astralBody', name: 'Durée du Corps astral', value: result.astralBody.seconds, unit: ' s',
      description: 'Durée pendant laquelle Corps astral fait échouer les attaques purement magiques hostiles.' };
    detailEntries.push(duration);
    const body = entries.find(entry => entry.stat === 'astralBody');
    body.sentenceParts = ['de chance d’activation toutes les ', { value: bodyCheck.id }, ' d’inactivité. Protection contre les ' + umbraPureMagic() + ' pendant ', { value: duration.id }, '.'];
  }
  if (key === 'esoterism') {
    for (const entry of entries) {
      entry.description = STAT_HELPER_DESCRIPTIONS[entry.stat];
      if (entry.id === 'esoterismTotalReduction') entry.passiveOf = 'esoterismChance';
      if (entry.id === 'esoterismPiercingReduction') {
        entry.passiveOf = 'esoterismPiercingChance';
        entry.gradient = umbraRatioGradient(models.esoterismTotalReduction, key);
      }
    }
    entries.splice(2, 0, { id: 'esoterismCooldown', stat: 'esoterismCooldown', icon: 'esoterismCooldown',
      passiveOf: 'esoterismChance', name: 'Cooldown d’Ésotérisme', value: result.esoterismCooldown.seconds, unit: ' s',
      gradient: umbraRatioGradient(models.esoterismCooldown, key), description: STAT_HELPER_DESCRIPTIONS.esoterismCooldown });
  }
  if (key === 'indestructibility') {
    for (const id of ['indestructibilityBonus', 'indestructibilityReductionTotal']) {
      entries.find(entry => entry.id === id).exclusive = true;
    }
    const regen = entries.find(entry => entry.stat === 'hpBattleRegen');
    regen.state = result.indestructibilityRegenSystem.state;
    regen.grant = true;
    entries.push({ id: 'indestructibilityCooldown', stat: 'indestructibilityCooldown', icon: 'indestructibilityCooldown',
      passiveOf: 'indestructibilityTotal', name: 'Cooldown d’Indestructibilité',
      value: result.indestructibilityCooldown.seconds, unit: ' s',
      description: STAT_HELPER_DESCRIPTIONS.indestructibilityCooldown });
  }
  if (key === 'transcendence') {
    entries.push({ id: 'improvedResurrection', stat: 'improvedResurrection', icon: 'extraLife', exclusive: true,
      name: 'Résurrection améliorée', value: result.improvedResurrection.totalPercent, unit: ' %',
      maximum: balanceData.extraLife.resurrect.maxPercent,
      sentence: 'HP récupérés avec une vie supplémentaire.', description: buildResurrectionHealingHelper(result) });
    entries.push({ id: 'transcendentalCooldown', stat: 'transcendentalCooldown', icon: 'transcendentalCooldown',
      passiveOf: 'transcendenceTotal',
      name: 'Cooldown transcendantal', value: result.transcendentalCooldown.seconds, unit: ' s',
      description: STAT_HELPER_DESCRIPTIONS.transcendentalCooldown });
  }
  if (key === 'bloodFury') {
    for (const entry of entries) if (entry.stat !== 'bloodThirsty') {
      entry.passiveOf = 'bloodExecution';
      entry.signed = entry.stat === 'bloodFuryExecutionDamage';
    }
    entries.splice(1, 0, { id: 'bloodExecution', stat: 'bloodExecution', name: 'Exécution', exclusive: true,
      description: STAT_HELPER_DESCRIPTIONS.bloodExecution, sentence: STAT_HELPER_DESCRIPTIONS.bloodExecution });
    entries.push({ id: 'bloodCrazy', stat: 'bloodCrazy', name: 'Démence sanguinaire', exclusive: true,
      description: STAT_HELPER_DESCRIPTIONS.bloodCrazy,
      sentence: 'Après une exécution mortelle, la prochaine attaque ignore le seuil de HP.' });
    entries.push({ id: 'bloodGlutony', stat: 'bloodGlutony', name: 'Voracité sanguinaire', exclusive: true,
      description: STAT_HELPER_DESCRIPTIONS.bloodGlutony,
      sentence: 'Une exécution mortelle avec un overkill restaure tous les HP.' });
  }
  if (key === 'robustness') entries.push({ id: 'solarArmor', stat: 'solarArmor', name: 'Armure solaire', exclusive: true, gradient: umbraRatioGradient(null, key),
    description: STAT_HELPER_DESCRIPTIONS.solarArmor, sentence: STAT_HELPER_DESCRIPTIONS.solarArmor });
  if (key === 'vivacite' && models.agileRetreat) entries.push({ id: 'agileRetreat', stat: 'agileRetreat', name: 'Retraite agile', grant: true,
    value: models.agileRetreat.value, unit: ' %', maximum: models.agileRetreat.maximum, total: models.agileRetreatTotal,
    description: 'Augmente la chance de retraite grâce à la Vélocité fournie par Vivacité.', gradient: umbraRatioGradient(models.agileRetreat, key) });
  // A value helper always has a total, including direct gifts, reinforcement,
  // equal totals and exclusive parameters with no autonomous counterpart.
  const totalTargets = { fatalSurvivalHP: 'HP', occultismCritChanceBonus: 'criticalChance', occultismDodgeBonus: 'dodge',
    movementStartingCharges: 'shiftStartingCharges', movementStartingTotalCurrent: 'shiftStartingPercent' };
  for (const entry of [...entries, ...detailEntries]) {
    if (entry.value == null || entry.total) continue;
    entry.total = totalTargets[entry.id] ? readUmbraTotal(totalTargets[entry.id], entry.unit)
      : { stat: entry.stat, value: entry.value, unit: entry.unit || '', maximum: entry.maximum };
  }
  const role = UMBRA_PRESENTATIONS[key] || buildPlayerStatDescription(key, statMeta?.name);
  result.umbraPresentation = { key, name: statMeta?.name || key, points, role, entries, detailEntries, directGrants, ambiance: String(statMeta?.ambiant ?? ambianceContent[key] ?? '').trim() };
  return buildUmbraCard(result);
}

    const statMeta = Array.isArray(stats)
        ? stats.find(s => normalizeStatKey(s.key) === normalizeStatKey(statKey))
        : null;

    // Priorité : clé affichable, clé canonique, ancienne clé brute, description de stats.
    const canonicalHelpKey = normalizeStatKey(statKey);
    const displayHelpKey = getDisplayStatKey(canonicalHelpKey);
    const metaDisplayKey = statMeta?.key ? getDisplayStatKey(normalizeStatKey(statMeta.key)) : "";

    const structuredUmbra = isUmbraHelper ? structuredUmbraHelper() : null;
    if (structuredUmbra) {
        output.helpContent = structuredUmbra;
    } else if (helpContent[displayHelpKey]) {
        output.helpContent = helpContent[displayHelpKey];
    } else if (helpContent[canonicalHelpKey]) {
        output.helpContent = helpContent[canonicalHelpKey];
    } else if (helpContent[statKey]) {
        output.helpContent = helpContent[statKey];
    } else if (metaDisplayKey && helpContent[metaDisplayKey]) {
        output.helpContent = helpContent[metaDisplayKey];
    } else if (statMeta?.key && helpContent[statMeta.key]) {
        output.helpContent = helpContent[statMeta.key];
    } else if (statMeta?.description) {
        output.helpContent = statMeta.description;
    } else {
        output.helpContent = "";
    }
const simpleResistanceHelper = ['criticalResistance', 'alterationResistance', 'hindranceResistance', 'resilienceTotal', 'equilibreAggroBonus', 'equilibreAggroReduction', 'equilibreInvisibleDetection', 'equilibreBalancedAttackChance', 'controlledSpeed', 'velocity'].includes(canonicalHelpKey);
if (!isUmbraHelper) output.helpContent += resilienceLimitHelper(canonicalHelpKey);
if (!simpleResistanceHelper
    && (GENERATED_STAT_HELPERS[canonicalHelpKey] || canonicalHelpKey === 'bullsEye') && result.statSystem) {
  if (result.statSystem.state !== 'normal') output.helpContent += `<br><br>${helperStatIntroduction(canonicalHelpKey, { state: result.statSystem.state })}`;
  if (result.umbraHelperCalculations?.autonomousTotal?.rounded) output.helpContent += `<br><span class="helper-calculation-note">${HELPER_TEXT.statRoundedValue}</span>`;
}
if (isUmbraRestricted(entite, statKey)) output.helpContent += `<p class="umbra-restricted-note">${HELPER_TEXT.restrictedUmbra}</p>`;
if (!isUmbraHelper && !simpleResistanceHelper && result.umbraHelperCalculations?.autonomousTotal && !output.helpContent.includes('data-umbra-calculation="autonomousTotal"')) {
  output.helpContent += `<br><br>${buildUmbraCalculation('autonomousTotal', result.umbraHelperCalculations.autonomousTotal)}.`;
}
output.ambianceContent = ambianceContent[displayHelpKey] || ambianceContent[canonicalHelpKey] || ambianceContent[statKey] || "";

return output;
}

export function buildLifeSlotHelper({ stat, source, position, current, duration, isReady, next, alive }) {
  const label = stat === 'eternalLife' ? 'Vie Éternelle' : 'Vie supplémentaire';
  const origin = source === 'stuff' ? `Équipement · emplacement ${position}` : 'Naturelle';
  return `${helperEffectTitle(stat, label)} : ${isReady ? 'prête' : 'en recharge'}.<br>`
    + `Recharge : ${helperFigure(stat, `${current}/${duration}`, ' j')}.<br>`
    + (next ? 'Prochaine vie consommée.<br>' : '')
    + `Les vies se rechargent toutes en parallèle.${!alive ? " Recharge suspendue : l'entité est morte." : ''}`
    + (source === 'stuff' ? "<br>Déséquiper suspend la recharge. Le transfert conserve sa progression." : '')
    + `<div class="separation-line golden"></div><small class="life-equipment-source"><i>Source : ${origin}</i></small>`;
}

export function buildStatSourcesHelper({ sources, escape, statClass }) {
  if (!sources.length) return '';
  if (sources.some(source => source.malus)) {
    return '<div class="stat-source-details"><div class="separation-line golden"></div>Modificateurs :<br>' + sources.map(source =>
      `<span class="stat-modifier-source${source.malus ? ' stat-modifier-malus' : ''}">${escape(source.source)}${source.id ? ` (${escape(source.id)})` : ''} : ${helperFigure(statClass, source.value, source.mode === 'percent' ? ' % de la valeur' : statClass === 'speed' ? ' ms' : '', { signed: true, malus: source.malus })}</span>`
    ).join('<br>') + '</div>';
  }
  return '<div class="stat-source-details"><div class="separation-line golden"></div>Augmenté par :<br>' + sources.map(source =>
    `${escape(source.source)}${source.id ? ` (${escape(source.id)})` : ''} : <span class="${escape(statClass)}">${source.value > 0 ? '+' : ''}${source.value}${source.mode === 'percent' ? ' %' : ''}</span>`
  ).join('<br>') + '</div>';
}

// These are display identities, not new stats or gameplay calculators.
export const STAT_EFFECT_HELPERS = {
  calculateAmbidextryTotalChance: 'ambidextryTotalChance',
  calculateAmbidextryDamageBonus: 'ambidextryDamageBonus',
  calculateIndestructibilityPercentFromEntity: 'indestructibilityBonus',
  caluclateIndestructibilityReductionTotal: 'indestructibilityReductionTotal',
  calculateResilienceCritTotalBonus: 'resilienceCritTotalBonus',
  calculateResilienceAlterationTotalBonus: 'resilienceAlteTotalBonus',
  calculateResilienceTotalCancelBonus: 'resilienceTotalCancelBonus',
  calculateOccultismInvisibilityChance: 'occultismInvisibilityChance',
  calculateOccultismTargetableChanceDisplay: 'occultismTargetableChance',
  calculateOccultismCritChanceBonus: 'occultismCritChanceBonus',
  calculateOccultismDodgeBonus: 'occultismDodgeBonus',
  calculateEquilibreAggroReduction: 'equilibreAggroReduction',
  calculateEquilibreAggroBonus: 'equilibreAggroBonus',
  calculateEquilibreInvisibleDetection: 'equilibreInvisibleDetection',
  calculateEquilibreAttackChance: 'equilibreBalancedAttackChance',
  calculateMysticismProcChance: 'mysticismProcChance',
  calculateMysticismTranceDuration: 'mysticismTranceDuration',
  calculateMysticismPreparationAcceleration: 'mysticismPreparationAcceleration',
  calculateMysticismTotalDamageBonus: 'mysticismDamageBonus',
  calculateEsoterismPercent: 'esoterismBonus',
  calculateEsoterismtotalReduction: 'esoterismTotalReduction',
  calculateLvlMaxEntiteWithWill: 'levelMaximum',
};

export function selectStatisticHelper(calculated, effectKey) {
  const content = calculated.statEffectHelpers?.[effectKey];
  if (!content) return calculated;
  const model = calculated.umbraHelperCalculations?.[effectKey];
  return {
    ...calculated, helpContent: content, ambianceContent: '',
    umbraHelperCalculations: model ? { [effectKey]: model } : {},
  };
}

const TIMING_HELPER_NAMES = {
  cooldownTime: 'Cooldown', preparationTime: 'Préparation', executionTime: 'Exécution',
  recuperationTime: 'Récupération', projectileTime: 'Vitesse des projectiles',
  shortRange: 'Corps à corps', piercingDamage: 'Puissance perçante', transpiercingDamage: 'Puissance transperçante',
  strength: 'Force', agility: 'Agilité',
};

function statisticSourceInput(source, statName, { provenance = false, exclusive = false } = {}) {
  const label = source.name || (source.stat === 'shift' ? 'Déplacements max' : statName) || HELPER_PICTOGRAM_NAMES[source.stat] || source.stat;
  const unit = source.mode === 'percent' ? ' % de la valeur' : source.unit || '';
  const state = source.displayState || source.state || 'normal';
  const origin = source.equipment ? `Stuff · ${source.source}` : source.source;
  const orfevre = source.orfevreBonus ? ` <span class="helper-calculation-detail">( ${helperFigure(source.stat, source.rawValue, unit, { state, malus: source.malus })} + ${helperFigure('weaponOrfevre', source.orfevreBonus, unit)} )</span>` : '';
  return `<span class="${provenance ? 'stat-source-provenance' : 'stat-modifier-source'}${source.malus ? ' stat-modifier-malus' : ''}" data-source-id="${escapeEssenceAttribute(source.id || '')}"${source.provenance ? ` data-provenance="${escapeEssenceAttribute(source.provenance)}"` : ''}>${provenance && !exclusive ? 'Dont ' : ''}${escapeEssenceHTML(origin)} : ${helperStatisticLabel(source.stat, label, state, state === 'umbra' ? source.stat : null)} ${helperFigure(source.stat, source.value, unit, { signed: true, state, icon: state === 'umbra' ? null : source.stat, malus: source.malus })}${orfevre}${source.improvementKind ? buildImprovementHelperFooter(source.improvementKind, source.stat, { malus: source.value < 0, belowZero: source.underflow > 0 }) : ''}</span>`;
}

export function buildImprovementHelperFooter(kind, stat = null, { malus = false, belowZero = false } = {}) {
  if (stat && !Object.hasOwn(UMBRA_PRESENTATIONS, stat) && !['strength', 'intelligence', 'agility'].includes(stat)) return '';
  const quality = { standard: '', external: ' supérieur', intense: ' exceptionnel' }[kind];
  if (quality == null) return '';
  const qualified = !malus || belowZero;
  const label = (malus ? 'Malus' : 'Bonus') + (qualified ? quality : '');
  const degree = { standard: '', external: ' grandement', intense: ' extraordinairement' }[kind];
  const description = malus
    ? qualified ? `Cette source de malus permet de descendre${degree} sous zéro. Seule la portion sous zéro reçoit le rendement de sa qualité.`
      : 'Ce malus s’applique intégralement jusqu’à zéro. Sa qualité ne s’applique qu’à la portion située sous zéro.'
    : `Cette source de bonus permet de dépasser${degree} les limites de l’entité.`;
  return `<div class="helper-calculation-note" data-improvement-kind="${kind}" data-improvement-active="${qualified}"><small>${label}</small><br><small>${description}</small></div>`;
}

export function buildStatisticOrigins({ origins = [], contributions = [], constants = [], compact = false, totals, statName, modifiers = [] }) {
  if (compact && totals) {
    const labels = { umbra: 'Umbra', fixed: 'Base', plus: 'Stat +', stat: 'Progression', consumable: 'Consommable', equipment: 'Stuff', spell: 'Sort', combat: 'Effet' };
    const titles = { umbra: 'Stat fournie par les Umbras', fixed: 'Stat de base possédée', stat: 'Stat acquise par progression',
      plus: 'Statistique +', equipment: "Stat fournie par l'équipement", combat: 'Stat fournie par les effets', consumable: 'Réserve des consommables', spell: 'Réserve des sorts' };
    const inputsOnly = !totals.length && modifiers.length > 0;
    const exclusiveTotals = totals.some(total => total.exclusive);
    if (exclusiveTotals) { labels.fixed = 'Stat fixe'; titles.fixed = 'Stat fixe'; }
    const family = (category, source) => exclusiveTotals && source
      ? category === 'umbra' ? 'umbra' : source.state === '+' ? 'plus' : 'fixed'
      : category === 'equipment' && (inputsOnly || totals.some(total => total.category === category && total.family)) ? 'fixed' : category;
    const penalties = new Map();
    for (const source of [...modifiers, ...totals.flatMap(total => total.provenance || [])]) {
      if (source.malus) penalties.set(JSON.stringify([source.stat, source.state, source.mode, source.id, source.source]), source);
    }
    // Group already-calculated deltas for presentation; do not evaluate ratios again.
    const groupedTotals = new Map();
    for (const total of totals) {
      const category = total.family || total.category;
      const key = JSON.stringify([category, total.stat, total.unit, total.label, total.duration, total.movementKind, total.remainingStock, total.umbra]);
      const existing = groupedTotals.get(key);
      if (!existing) { groupedTotals.set(key, { ...total, category, provenance: [...(total.provenance || [])] }); continue; }
      if (existing.normalValue != null || total.normalValue != null) {
        existing.normalValue = Math.round(((existing.normalValue ?? existing.value) + (total.normalValue ?? total.value)) * 1e6) / 1e6;
        existing.improvedValue = Math.round(((existing.improvedValue || 0) + (total.improvedValue || 0)) * 1e6) / 1e6;
      }
      existing.value = Math.round((existing.value + total.value) * 1e6) / 1e6;
      if (existing.calculations || total.calculations) existing.calculations = Object.fromEntries(['normal', 'improved'].map(kind => {
        const first = existing.calculations?.[kind];
        const second = total.calculations?.[kind];
        return [kind, { ...(first || second), parts: [...(first?.parts || []), ...(second?.parts || [])] }];
      }));
      existing.provenance.push(...(total.provenance || []));
    }
    const presented = [...groupedTotals.values()];
    const categories = exclusiveTotals ? ['umbra', 'plus', 'fixed', ...Object.keys(labels).filter(category => !['umbra', 'plus', 'fixed'].includes(category))] : Object.keys(labels);
    const groups = categories.filter(category => presented.some(total => total.category === category)
      || modifiers.some(source => family(source.category, source) === category && !source.malus)).map(category => {
      const name = labels[category];
      const inputs = modifiers.filter(source => family(source.category, source) === category);
      const positiveInputs = inputs.filter(source => !source.malus);
      const ownPenalties = inputs.filter(source => source.malus);
      const categoryTotals = presented.filter(total => total.category === category);
      const exclusive = categoryTotals.some(total => total.exclusive);
      if (!exclusive && ownPenalties.length && !positiveInputs.length && !categoryTotals.some(total => total.remainingStock || total.duration)) return '';
      const showInputs = inputsOnly || ownPenalties.length > 0 && !exclusive;
      const lines = showInputs ? [] : categoryTotals.map(total => {
        const label = total.duration ? 'Durée de base' : total.label || statName || TIMING_HELPER_NAMES[total.stat] || HELPER_PICTOGRAM_NAMES[total.stat] || total.stat;
        const line = (value, state) => {
          const net = total.provenance.some(source => source.malus) ? ' (après malus)' : '';
          const calculation = total.calculations?.[state === 'normal' ? 'normal' : 'improved'];
          const displayState = total.exclusive ? calculation?.state || state : state;
          const parts = calculation?.parts;
          const detail = parts?.length && (parts.length > 1 || !parts[0].fixed) ? helperCalculationParts(calculation) : '';
          return `${helperStatisticLabel(total.stat, label, displayState, total.umbra)} : ${helperCalculation(total.stat, total.duration ? String(value) : value, total.unit, detail, { signed: !total.duration, state: displayState, malus: total.exclusive && value < 0 })}${net}`;
        };
        const variants = [
          total.normalValue ? line(total.normalValue, 'normal') : '',
          total.improvedValue ? line(total.improvedValue, '+') : '',
        ].filter(Boolean);
        return variants.length ? variants.join('<br>') : line(total.value, category === 'umbra' ? '+' : 'normal');
      });
      const modifierLines = showInputs ? `<div class="stat-modifier-details">${inputsOnly ? '' : 'Apports avant calcul :<br>'}${positiveInputs.map(source => statisticSourceInput({ ...source,
        unit: source.unit || categoryTotals.find(total => total.stat === source.stat)?.unit }, statName)).join('<br>')}</div>` : '';
      const provenanceLines = !showInputs ? categoryTotals.flatMap(total => total.provenance).filter(source => !source.malus)
        .map(source => statisticSourceInput(source, statName, { provenance: true, exclusive: exclusiveTotals })).join('<br>') : '';
      const detail = `<div class="stat-source-details attack-bonus-source">${lines.join('<br>')}${modifierLines}${provenanceLines ? `<br>${provenanceLines}` : ''}</div>`
        + (inputs.some(source => !source.improvementKind && (Object.hasOwn(UMBRA_PRESENTATIONS, source.stat) || ['strength', 'intelligence', 'agility'].includes(source.stat)))
          ? buildImprovementHelperFooter(category === 'stat' ? 'standard' : ['equipment', 'combat'].includes(category) ? 'external' : '') : '');
      return `<span class="helper-source" data-helper-source="${escapeEssenceAttribute(category)}" tabindex="0" aria-label="${name}">${name}<template data-helper-source-detail data-helper-source-title="${escapeEssenceAttribute(titles[category])}">${detail}</template></span>`;
    }).filter(Boolean);
    const malus = penalties.size ? `<span class="helper-source stat-malus-value" data-helper-source="malus" tabindex="0" aria-label="Malus">− Malus<template data-helper-source-detail data-helper-source-title="Malus"><div class="stat-source-details stat-source-malus">${[...penalties.values()].map(source => statisticSourceInput(source, statName)).join('')}</div></template></span>` : '';
    return groups.length || malus ? `<div class="stat-source-details attack-bonus-source"><div class="separation-line golden"></div>${HELPER_TEXT.sourcesTitle} : ${groups.join(' + ')}${malus ? ` ${malus}` : ''}</div>` : '';
  }
  if (compact) {
    const groups = new Map();
    const add = (key, name) => {
      if (!groups.has(key)) groups.set(key, { key, name, origins: [], contributions: [], constants: [] });
      return groups.get(key);
    };
    if (origins.length) add('umbra', 'Umbra').origins = origins;
    if (constants.length) add('fixed', 'Base').constants = constants;
    for (const contribution of contributions) for (const source of contribution.sources) {
      const origin = origins.find(origin => origin.key === contribution.key || source.source === `Umbra : ${origin.name}`);
      const group = source.combat
          ? add('combat', 'Effet')
          : origin ? groups.get('umbra') : source.equipment || source.category === 'fixed' ? add('fixed', 'Base') : add('stat', 'Stat');
      let detail = group.contributions.find(detail => detail.key === contribution.key);
      if (!detail) {
        detail = { ...contribution, sources: [] };
        group.contributions.push(detail);
      }
      detail.sources.push(source);
    }
    const labels = [...groups.values()].map(group =>
      `<span class="helper-source" data-helper-source="${escapeEssenceHTML(group.key)}" tabindex="0" aria-label="${escapeEssenceHTML(group.name)}">${escapeEssenceHTML(group.name)}<template data-helper-source-detail>${buildStatisticOrigins(group)}</template></span>`);
    return labels.length ? `<div class="stat-source-details attack-bonus-source"><div class="separation-line golden"></div>${HELPER_TEXT.sourcesTitle} : ${labels.join(' + ')}</div>` : '';
  }
  const lines = [];
  for (const origin of origins) lines.push(`${helperFigure(origin.key, '')} Umbra : ${escapeEssenceHTML(origin.name)}`);
  if (constants.length) lines.push(`Valeur fixe : ${constants.map(part => helperFigure('neutral', part.value, part.unit || '', { icon: null })).join(' + ')}`);
  for (const group of contributions) {
    if (!group.sources.length) continue;
    lines.push((group.name ? `${helperFigure(group.key, '')} ${escapeEssenceHTML(group.name)} : ` : '') + group.sources.map(source => {
      const label = ({ occultismInvisible: 'Occultisme : invisibilité', occultismExitCrit: 'Occultisme : sortie d’invisibilité' })[source.source] || source.source;
      const unit = source.mode === 'percent' ? ' %' : group.unit || '';
      const value = amount => helperFigure(group.key, amount, unit, { signed: true, icon: null, malus: source.malus && amount === source.value });
      const orfevre = source.orfevreBonus ? ` (${value(source.rawValue)} + ${helperFigure('weaponOrfevre', source.orfevreBonus, unit, { icon: 'weaponOrfevre' })})` : '';
      return `${source.combat ? 'Effet de combat : ' : source.equipment ? 'Équipement : ' : ''}${escapeEssenceHTML(label)}${source.id && !source.combat ? ` (${escapeEssenceHTML(source.id)})` : ''} : ${value(source.value)}${orfevre}`;
    }).join('<br>'));
  }
  return lines.length ? `<div class="stat-source-details attack-bonus-source"><div class="separation-line golden"></div>${HELPER_TEXT.sourcesTitle} : ${lines.join('<br>')}</div>` : '';
}

export function umbraDescription(nature, attribut, type, key = '') {
  const [classeType, niveauType] = String(type).split("-");

  const labels = {
    agilite: "Agilité",
    force: "Force",
    intelligence: "Intelligence",
    umbra: "Umbra",
  };

  const natureLabel = labels[nature] || nature;
  const attributLabel = labels[attribut] || attribut;

  const deOrD = (word) => /^[aeiouhàâäéèêëîïôöùûü]/i.test(word) ? "d’" : "de ";

  const classeLabel = { attaque: "d’attaque", defense: "de défense", utilitaire: "utilitaire" }[classeType] || classeType;
  if (key) {
    const categoryText = {
      attaque: 'Une Umbra d’attaque renforce les capacités offensives de l’entité.',
      defense: 'Une Umbra de défense améliore la protection ou la survie de l’entité.',
      utilitaire: 'Une Umbra utilitaire apporte des capacités de soutien, de mobilité ou de maîtrise.',
    }[classeType];
    const category = umbraContextLink('category', escapeEssenceHTML(classeLabel), `Umbra ${classeLabel}`, categoryText);
    const attribute = { force: 'strength', agilite: 'agility', intelligence: 'intelligence' }[attribut];
    const rank = umbraContextLink('rank', `niveau ${escapeEssenceHTML(niveauType)}`, `Niveau ${niveauType} de l’Umbra`,
      `Cette Umbra est générée lorsqu’un point ${deOrD(attributLabel)}${escapeEssenceHTML(attributLabel)} est investi dans une milestone ${escapeEssenceHTML(classeLabel)} de niveau ${escapeEssenceHTML(niveauType)}.`);
    return `<span data-helper-picto-stat="${escapeEssenceAttribute(key)}" tabindex="0">${natureLabel}</span> ${category} ${deOrD(attributLabel)}<span data-helper-picto-stat="${attribute}" tabindex="0">${attributLabel}</span> ${rank}`;
  }
  return `${natureLabel} ${classeLabel} ${deOrD(attributLabel)}${attributLabel} niveau ${niveauType}`;
}

export function buildStatHoverCard({ umbraHTML, helperHTML, ambianceHTML, umbraTitle }) {
  return `
    ${umbraTitle ? `<div class="umbra-title-card"><span class="umbra-title-content" data-helper-picto-stat="${escapeEssenceAttribute(umbraTitle.key)}" tabindex="0"><span class="picto-stat ${escapeEssenceAttribute(umbraTitle.key)}" aria-hidden="true"></span><span class="umbra-header-name ${escapeEssenceAttribute(umbraTitle.key)}">${escapeEssenceHTML(umbraTitle.name)}</span></span><button type="button" class="umbra-info-button" data-umbra-info-toggle title="Voir tous les détails des stats" aria-label="Voir tous les détails des stats" aria-expanded="false">i</button></div>` : ''}
    <div class="stat-hover-header">
      ${
        umbraHTML
          ? `<div class="umbra-description">${umbraHTML}</div>`
          : ""
      }
      <div class="separation-line"></div>
    </div>

    <div class="stat-hover-body">
      ${helperHTML}
    </div>

    <div class="stat-hover-footer">
      <div class="separation-line"></div>
      ${
        ambianceHTML
          ? `<div class="stat-lore">${ambianceHTML}</div>`
          : ""
      }
    </div>
  `;


}

export function buildStatGraphHelper(slice) {
  return `${slice.label} : ${slice.value}%`;
}

export function buildStatCurseHelper(sources, { compact = false } = {}) {
  if (compact) {
    const groups = new Map();
    for (const source of sources) {
      const unit = source.mode === 'percent' ? ' % relatif' : source.unit || '';
      const key = `${source.state || 'normal'}:${source.mode}:${unit}`;
      const group = groups.get(key) || { value: 0, unit, state: source.state };
      group.value += Number(source.value) || 0;
      groups.set(key, group);
    }
    return [...groups.values()].map(({ value, unit, state }) =>
      `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}${unit}${state === '+' ? ' (+)' : ''}`).join(' ; ');
  }
  return `Stat maudite : ${sources.map(source => `${source.source} : ${source.value}${source.mode === 'percent' ? ' %' : ''}`).join(' ; ')}`;
}

export function buildDefenseHpHelper(key) {
  return key === 'astrality'
    ? 'Convention Astralité : dégâts du coup fatal après réductions, moins 1. Ce montant est distinct des HP réellement perdus.'
    : key === 'indestructible' || key === 'dodge'
      ? 'HP préservés estimés après armure et défenses passives, limités aux HP disponibles. Aucun jet de critique, exécution ou autre proc non résolu n’est inventé.'
      : 'HP qui auraient été perdus sans cet effet uniquement, avec les mêmes autres modificateurs. Hors overkill. Ces contributions ne sont pas additionnables.';
}

export function buildRoleDurationHelper(seconds) {
  return `${seconds} s dans ce rôle`;
}


// -----------------------------------------------------------------------------
// Attacks: damage, ratios and compact descriptions
// -----------------------------------------------------------------------------

const ATTACK_DAMAGE_SOURCE_KEYS = ["piercingDamage", "physical", "magical", "hybridalDamage"];

function formatAttackDamageValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function attackDamageToken(statKey, value, extraClass = "") {
  const n = Number(value) || 0;
  if (n <= 0) return "";

  return `
    <span class="attack-damage-token ${extraClass}">
      <div class="picto-stat ${statKey} minor-icon"></div>
      <span class="${statKey}">${formatAttackDamageValue(n)}</span>
    </span>
  `;
}

function getAttackDamageSourceMeta(sourceKey, preview) {
  if (preview?.details?.nature?.isInert) return { stat: 'inerte', label: 'Dégâts inertes' };
  if (sourceKey === "piercingDamage") {
    const isTranspiercing = Boolean(preview?.details?.piercing?.isPureTranspiercing);
    return {
      stat: isTranspiercing ? "transpiercingDamage" : "piercingDamage",
      label: isTranspiercing ? "Dégâts transperçants" : "Dégâts perçants",
    };
  }

  if (sourceKey === "physical") {
    return { stat: "physicalDamage", label: "Dégâts physiques" };
  }

  if (sourceKey === "magical") {
    return { stat: "magicalDamage", label: "Dégâts magiques" };
  }

  if (sourceKey === "hybridalDamage") {
    return { stat: "hybridalDamage", label: "Dégâts hybrides" };
  }

  return { stat: "neutral", label: "Dégâts" };
}

function getAttackDamageSummaryMeta(activeSources = [], preview = {}) {
  const stat = preview?.details?.nature?.stat;
  const labels = {
    physicalDamage: 'Dégâts physiques',
    magicalDamage: 'Dégâts magiques',
    piercingDamage: 'Dégâts perçants',
    transpiercingDamage: 'Dégâts transperçants',
    hybridalDamage: 'Dégâts hybrides',
    physicalPiercingDamage: 'Dégâts cinétiques',
    magicalPiercingDamage: 'Dégâts spectraux',
    hybridalPiercingDamage: 'Dégâts prismatiques',
    inerte: 'Dégâts inertes',
    neutral: 'Dégâts',
  };
  if (stat && labels[stat]) return { stat, label: labels[stat] };
  if (activeSources.length === 1) {
    return getAttackDamageSourceMeta(activeSources[0], preview);
  }

  const has = sourceKey => activeSources.includes(sourceKey);
  if (has("hybridalDamage") && has("piercingDamage")) {
    return { stat: "hybridalPiercingDamage", label: "Dégâts hybrides perçants" };
  }
  if (has("hybridalDamage")) {
    return { stat: "hybridalDamage", label: "Dégâts hybrides" };
  }
  if (has("physical") && has("piercingDamage") && !has("magical")) {
    return { stat: "physicalPiercingDamage", label: "Dégâts physiques perçants" };
  }
  if (has("magical") && has("piercingDamage") && !has("physical")) {
    return { stat: "magicalPiercingDamage", label: "Dégâts magiques perçants" };
  }
  if (has("physical") && has("magical")) {
    return { stat: "hybridalDamage", label: "Dégâts physiques-magiques" };
  }

  return { stat: "neutral", label: "Dégâts totaux" };
}

function buildHypercognitionBonusCalculation(result) {
  const calculation = result.hypercognitionCalculation;
  return helperCalculation('hypercognition', result.cognitiveExplosionTotal ?? result.hypercognitionBonus, '', [
    helperContribution('hypercognition', calculation?.direct ?? result.hypercognitionBonus),
    helperContribution('hypercognition', calculation?.source.value),
    helperContribution('intelligence', calculation?.attribute.value),
    helperContribution('cognitiveExplosion', result.cognitiveExplosionAutonomous),
  ], { signed: true, icon: 'cognitiveExplosion' });
}

export function buildHypercognitionBonusHelper(result) {
  const total = result.umbraHelperCalculations?.autonomousTotal;
  if (total) {
    const sources = [
      result.helperDetails?.active?.hypercognition ? 'Umbra Hypercognition' : '',
      result.cognitiveExplosionAutonomous ? 'Explosion cognitive autonome' : '',
    ].filter(Boolean);
    return `<strong>${helperEffectTitle('hypercognition', 'Explosion cognitive', { icon: 'cognitiveExplosion' })}</strong><br><br>${buildHypercognitionBonusCalculation(result)}<br><br><span class="attack-bonus-source" style="color: #ff9b00;">Source : ${sources.join(' + ')}</span>`;
  }
  return `<strong>${helperEffectTitle('hypercognition', 'Explosion cognitive', { icon: 'cognitiveExplosion' })}</strong><br><br>${buildHypercognitionBonusCalculation(result)}<br><br><span class="attack-bonus-source" style="color: #ff9b00;">Source : Umbra Hypercognition</span>`;
}

function renderAttackPowerCalculation(preview) {
  const details = preview.details;
  const terms = [
    ['physical', 'physicalDamage', 'physicalRatio', 'puissance physique'],
    ['magical', 'magicalDamage', 'magicalRatio', 'puissance magique'],
    ['piercing', 'piercingDamage', 'piercingRatio', 'puissance perçante'],
  ].filter(([, , field]) => details.ratios[field] > 0).map(([source, stat, field, label]) => {
    const coefficient = details.ratios[field] === 1 ? ''
      : `<span class="neutral"> × <span class="attack-power-ratio">${Number(details.ratios[field].toFixed(10))}</span></span>`;
    return `<span class="attack-power-source ${stat}" data-power-source="${stat}" aria-label="${label}"><span class="picto-stat ${stat} minor-icon" aria-hidden="true"></span>${formatAttackDamageValue(details.powers[source])}${coefficient}</span>`;
  });
  for (const [source, stat, label] of [
    ['transpiercing', 'transpiercingPower', 'Transpercement'],
    ['resonance', 'hybridalDamage', 'Résonance'],
    ['hypercognition', 'hypercognition', 'Hypercognition'],
  ]) {
    const hover = source === 'hypercognition' ? ' data-stat="attackHypercognitionBonus" data-hover="true" tabindex="0"' : '';
    if (details.powerSources[source] > 0) terms.push(
      `<span class="attack-power-bonus ${stat}" aria-label="${label}"${hover}><span class="picto-stat ${stat}${source === 'hypercognition' ? ' cognitiveExplosion' : ''} minor-icon" aria-hidden="true"></span>${formatAttackDamageValue(details.powerSources[source])}</span>`);
  }
  return terms.length ? `<span class="attack-power-calculation">(${terms.join(' + ')})</span>` : '';
}

function renderAttackDamageSourceLine(sourceKey, preview) {
  const meta = getAttackDamageSourceMeta(sourceKey, preview);
  const total = Number(preview?.sources?.[sourceKey] || 0);
  const beforeModifiers = Number(preview?.sourcesBeforeModifiers?.[sourceKey] || 0);
  const modifierPart = beforeModifiers !== total ? ` <span class="neutral">(avant modificateurs : ${formatAttackDamageValue(beforeModifiers)})</span>` : '';
  return `<span class="attack-damage-source-line">${attackDamageToken(meta.stat, total)}<span>${meta.label}</span>${modifierPart}</span>`;
}

export function renderAttackDamagePreview(preview) {
  const activeSources = ATTACK_DAMAGE_SOURCE_KEYS
    .filter(sourceKey => Number(preview?.sources?.[sourceKey] || 0) > 0);

  const mainMeta = getAttackDamageSummaryMeta(activeSources, preview);

  const lines = activeSources
    .map(sourceKey => renderAttackDamageSourceLine(sourceKey, preview))
    .join("");

  return `
    <span class="showdetails damage damage-block attack-damage-summary">
      <span class="picto-stat ${mainMeta.stat}" aria-hidden="true"></span>
      <span class="${mainMeta.stat} total-damage major damage-total">${formatAttackDamageValue(preview.totalDamage)}</span>
    </span>
    <span class="detail total-damage damage-table attack-damage-preview">
      <span class="detail-damage-legend">${mainMeta.label} :</span>
      ${lines || '<span>Aucun dégât.</span>'}
    </span>
    ${renderAttackPowerCalculation(preview)}
  `;
}

export function renderAttackDescription(attack, preview, powers, summon, evaluateFormula) {

  const details = preview?.details || {};

  const totalDamage = renderAttackDamagePreview(preview);
  const effectDot = Number(attack?.effectDot || 0);
  const effectMagicalRatio = Number(attack?.effectMagicalRatio || 0);
  const effectPhysicalRatio = Number(attack?.effectPhysicalRatio || 0);
  const effectDuration = Number(attack?.effectDuration || 0);
  const physicalValue = powers.physical;
  const magicalValue = powers.magical;
  const piercingValue = powers.piercing;

  let dynamicDescription = attack?.attackDescription || "";
  if (dynamicDescription.includes('{profanationLevel}') || dynamicDescription.includes('{profanationCalculation}')) {

    const format = value => value.toLocaleString('fr-FR', { maximumFractionDigits: 10 });
    const calculation = `<span class="attack-power-calculation">(<span class="helper-figure"><span class="picto-stat picto-level" aria-hidden="true"></span><span class="neutral">${summon.casterLevel}</span></span> × ${helperFigure('intelligence', format(summon.intelligence))}${summon.ratio === 1 ? '' : ` × ${helperFigure('intelligence', format(summon.ratio))}`})</span>`;
    dynamicDescription = dynamicDescription.replaceAll('{profanationLevel}', `<span class="lvl">${summon.level}</span>`)
      .replaceAll('{profanationCalculation}', calculation);
  }
  const replacements = {
    "{$totalDamage}": totalDamage,
    "{baseDamage}": Number(attack?.baseDamage || 0),
    "{physicalRatio}": Number((details.ratios?.physicalRatio || 0).toFixed(10)),
    "{magicalRatio}": Number((details.ratios?.magicalRatio || 0).toFixed(10)),
    "{effectMagicalRatio}": effectMagicalRatio,
    "{effectPhysicalRatio}": effectPhysicalRatio,
    "{physicalDamage}": physicalValue,
    "{magicalDamage}": magicalValue,
    "{piercingDamage}": piercingValue,
    "{effectDot}": effectDot,
    "{effectDuration}": effectDuration,
    "{totalPhysicalDamage}": details.physical?.total || details.hybridal?.physicalPart || 0,
    "{totalMagicalDamage}": details.magical?.total || details.hybridal?.magicalPart || 0,
    "{totalPiercingDamage}": preview.sources?.piercingDamage || 0,
    "{totalpiercingDamage}": preview.sources?.piercingDamage || 0,
    "{totalHybridalDamage}": preview.sources?.hybridalDamage || 0,
    "{totalExecutionDamage}": preview.totalDamage || 0,
  };

  for (const [key, value] of Object.entries(replacements)) {
    dynamicDescription = dynamicDescription.replaceAll(key, String(value));
  }

  dynamicDescription = dynamicDescription.replace(/\[([^\]]+)\]/g, (_, expr) => {
    return evaluateFormula(expr);
  });

  return `
    <div class="attack-description">
      ${dynamicDescription}
    </div>
  `;
}

export function buildActiveEffectHelper({ remaining, html }) {
  return `<div>Durée restante : <strong>${escapeEssenceHTML(remaining.toFixed(1).replace('.', ','))} s</strong></div>${html}`;
}

export function buildAttackLightDescription({ attackKey, attackClass, attackName, powerValue, description, preview, isHealing }) {
  const content = document.createElement('div');
  content.className = 'combat-attack-helper attack-light-description';
  content.dataset.attackKey = attackKey;
  const title = document.createElement('div');
  title.className = `combat-attack-helper-name ${attackClass}`;
  title.textContent = attackName;
  title.appendChild(powerValue);
  if (preview) {
    const line = document.createElement('div');
    line.className = 'attack-light-amount';
    line.append(document.createTextNode(isHealing ? 'Soin : ' : 'Dégâts bruts : '));
    const values = document.createElement('span');
    values.innerHTML = renderAttackDamagePreview(preview);
    values.querySelectorAll('.detail, .attack-power-calculation').forEach(node => node.remove());
    line.append(values);
    description.append(line);
  }
  content.append(title, description);
  return content;
}


// -----------------------------------------------------------------------------
// Attacks: role, target, nature, properties and controls
// -----------------------------------------------------------------------------

export function buildAttackAttributeHelpers(attack, nature, { roleLabel, targetLabel }, { normArr, balanceData }) {
  const formatPercent = value => Number(value).toFixed(1).replace(/\.0$/, '');
  const share = color => `<span class="${{ red: 'physicalDamage', blue: 'magicalDamage', yellow: 'piercingDamage' }[color]}">${formatPercent(nature.profile.total ? nature.profile[color] / nature.profile.total * 100 : 0)} %</span>`;
  const signature = nature.signature
    ? `<br><br>Propriété accordée : <span class="${nature.stat}">${nature.signature.label} ${nature.signature.level}</span>.`
    : '';
  const role = roleLabel === 'Support'
    ? '<span class="Support">Support</span><br>Cette capacité produit un effet bénéfique sur la cible.'
    : '<span class="Attaquant">Attaque</span><br>Cette capacité produit un effet hostile sur la cible.';
  const target = {
    Entité: 'Cette capacité cible les entités.',
    Terrain: 'Cette capacité cible les cases du terrain.',
    Cadavre: 'Cette capacité cible les cadavres.',
  }[targetLabel];
  const rangeRules = {
    red: 'Projectile balistique. Il persiste après la mort du lanceur.',
    yellow: 'Projectile balistique. Il persiste après la mort du lanceur.',
    blue: 'Projectile guidé. Il est dissipé si le lanceur meurt.',
    hybrid: 'Projectile guidé tant que le lanceur vit. À sa mort, sa partie magique se dissipe et sa partie physique poursuit sa trajectoire.',
    'physical-piercing': 'Projectile balistique cinétique, sans composante magique. Il persiste après la mort du lanceur.',
    'magical-piercing': 'Projectile guidé tant que le lanceur vit. À sa mort, sa partie magique se dissipe et sa partie perçante poursuit sa trajectoire.',
    prism: 'Projectile guidé et persistant après la mort du lanceur. Ignore le malus de dégâts à distance, quelle que soit la durée d’exécution du projectile.',
    none: 'Projectile balistique. Il persiste après la mort du lanceur.',
  };
  const isMelee = normArr(attack?.attackRange).includes('melee');
  const range = isMelee
    ? 'Cette compétence nécessite un déplacement de l’attaquant vers sa cible. Elle ne peut fonctionner que si l’attaquant entre en contact avec sa cible.'
    : `Cette compétence nécessite un projectile de l’attaquant vers sa cible. Une fois lancé, le projectile est autonome : l’attaquant n’est pas forcé d’attendre qu’il ait touché sa cible pour lancer une autre attaque.<br><br>${rangeRules[nature.key]}`;
  const natureRules = {
    red: 'L’attaque est encaissée par la résistance physique de la cible.',
    blue: 'L’attaque est encaissée par la résistance magique de la cible.',
    yellow: 'L’attaque retourne la force de l’adversaire contre lui. Elle exploite sa résistance physique. Après pénétration, une résistance physique supérieure à la résistance magique amplifie les dégâts perçants ; l’inverse les réduit. À égalité, ils sont inchangés.',
    hybrid: 'Les dégâts sont encaissés comme <span class="physicalDamage">50 %</span> physiques et <span class="magicalDamage">50 %</span> magiques.',
    'physical-piercing': `Les dégâts sont répartis entre physique et perçant selon les essences actives : ${share('red')} physique / ${share('yellow')} perçant.`,
    'magical-piercing': `Les dégâts sont répartis entre magique et perçant selon les essences actives : ${share('blue')} magique / ${share('yellow')} perçant.`,
    prism: `Les trois natures participent aux dégâts selon les essences actives : ${share('red')} physique / ${share('blue')} magique / ${share('yellow')} perçant. Ignore le malus de dégâts à distance, quelle que soit la durée d’exécution du projectile.`,
    none: `Les attaques Inertes sont dépouillées de toute forme d’essence. Leurs ratios sont réduits de <span class="inerte">${balanceData.attackNature.inertRatioReductionPercent} %</span>. Cette attaque est ensuite réduite par toutes les résistances du jeu : physique puis magique sur la totalité des dégâts restants. Aucune Umbra offensive ni propriété de nature ne s’applique. À distance, le malus lié à la durée d’exécution s’applique et Bull’s Eye le réduit.`,
  };
  const criticalRules = {
    red: 'Supplément physique immédiat. Bonus critique effectif ÷ 10 : autant de points de précision et de % de vol de vie sur les PV réellement retirés.',
    blue: 'Supplément magique en brûlure sur bonus critique effectif ÷ 10 secondes. Le même supplément est partagé entre tous les alliés adjacents de la cible, arrondi à l’inférieur par entité. Ces explosions magiques peuvent critiquer à leur tour sur leur propre montant.',
    yellow: 'Supplément perçant immédiat, soumis au même écart entre les résistances physique et magique.',
    hybrid: 'Supplément partagé à 50/50 : physique immédiat et magique en brûlure. Bonus critique effectif ÷ 20 : durée de brûlure en secondes et vol de vie en %, à l’impact et sur les ticks.',
    'physical-piercing': 'Supplément physique et perçant selon les parts d’essences. Vol de vie : bonus critique effectif ÷ 10 × part physique, en %. Rupture : bonus ÷ 10 charges arrondies, plafond 10. Exaust retire un mouvement actuel, minimum zéro.',
    'magical-piercing': 'Supplément magique en brûlure et perçant immédiat selon les parts d’essences. Durée de brûlure : bonus critique effectif ÷ 10 × part magique. Dissolution : bonus ÷ 10 charges arrondies, plafond 10. Chaque impact et tick fait reculer les timings du pourcentage de PV maximum perdu, après protections, sans toucher aux projectiles, mouvements ou cooldowns.',
    prism: 'Le supplément devient autant de PV maximum retirés par Corruption prismatique. Cumul additif, durée de 20 secondes renouvelée, résilience sur le montant. Minimum 1 PV, perdu à la mort ; les PV maximum reviennent sans soin.',
    none: 'Supplément immédiat soumis aux défenses habituelles des dégâts inertes.',
  };
  return {
    role,
    target,
    range,
    nature: `<span class="${nature.stat}">${nature.label}</span><br>${natureRules[nature.key]}${signature}`
      + (roleLabel === 'Support' ? '' : `<br><br>Critique : ${criticalRules[nature.key]} La résistance critique réduit d’abord le bonus utilisé. Les ticks de brûlure ne critiquent jamais.<br><br>${attack.isUndodgeable === true || nature.key === 'blue' ? 'Cette attaque est inesquivable.'
        : ['hybrid', 'magical-piercing', 'prism'].includes(nature.key) ? 'L’esquive évite les parties physiques et perçantes. La partie magique reste inesquivable.' : 'Cette attaque est esquivable.'}`),
  };
}

export function buildAttackSignatureHelper({ resonance, balanceData, signature, getSafe, view, nature, attack }) {
let descriptionText;
  let helper;
  if (resonance) {
    descriptionText = `+${resonance.bonus} puissance hybride (${resonance.percent.toFixed(2)} %).`;
    const cfg = balanceData.attackNature.resonance;
    const cap = cfg.normalCap + (signature.level - 1) * cfg.capPerLevel;
    const reference = helperCalculation('hybridalDamage', resonance.reference.toFixed(2), '',
      `( ${helperProduct([helperFigure('physicalDamage', getSafe(view, 'physicalDamage')), helperFigure('strength', nature.profile.red)])} + ${helperProduct([helperFigure('magicalDamage', getSafe(view, 'magicalDamage')), helperFigure('intelligence', nature.profile.blue)])} ) / ${helperFigure('hybridalDamage', nature.profile.total)}`);
    const bonus = helperCalculation('hybridalDamage', resonance.bonus, '', [helperProduct([
      helperFigure('hybridalDamage', resonance.reference.toFixed(2)), helperFigure('hybridalDamage', resonance.percent.toFixed(2), ' %'),
    ])], { signed: true });
    helper = `Bonus : ${bonus}.<br><br>Référence : ${reference}.<br><br>Proximité des deux puissances : ${helperFigure('hybridalDamage', (resonance.proximity * 100).toFixed(2), ' %')} ; rapport entre la plus petite et la plus grande.<br>Seuil : ${helperFigure('hybridalDamage', cfg.threshold * 100, ' %')}. Progression de ${helperFigure('hybridalDamage', cfg.startPercent, ' %')} à ${helperFigure('hybridalDamage', cap, ' %')}. Une égalité parfaite ajoute ${helperFigure('hybridalDamage', cfg.perfectJump)} points de pourcentage.<br>Le bonus est réparti entre les deux puissances selon les essences, puis utilise les ratios habituels de l'attaque.`;
  } else if (signature.resistance) {
    descriptionText = `${signature.sign > 0 ? '+' : '−'}${signature.amount} résistance ${signature.resistance === 'physicalResistance' ? 'physique' : 'magique'} par cumul, ${signature.cap} maximum, ${signature.durationMs / 1000} s.`;
    helper = `Un impact ordinaire ajoute un cumul. Un critique offensif ajoute le bonus critique effectif divisé par 10, arrondi au plus proche. La résilience réduit le malus de résistance, sans retirer de charges. La durée est rafraîchie à chaque application ; tous les cumuls expirent ensemble.<br>L'effet appartient à la cible et bénéficie à toutes les sources. À différents niveaux, chaque cumul conserve sa valeur ; au plafond, un cumul plus fort remplace le plus faible.`;
  } else {
    descriptionText = `${signature.key === 'effusion' ? 'Soigne' : 'Inflige'} ${signature.percent} % des PV maximum de la cible.`;
    helper = signature.key === 'effusion' ? 'Soin supplémentaire à chaque soutien réussi, y compris si la cible est déjà à pleine vie.'
      : 'Dégât supplémentaire physique, magique ou perçant, tiré à parts égales. Il suit le traitement habituel de cette nature.';
    helper += '<br>Cet effet ne déclenche ni une nouvelle signature, ni un critique, ni un gain supplémentaire de maîtrise.';
  }
  if (attack.attackTarget?.includes('hexa')) helper += '<br>La propriété est transmise aux effets produits par l’invocation, pas appliquée à la case.';

return { descriptionText, helper };
}

export function buildSignatureStackHelper({ signature, effect, value }) {
return `${helperCalculation(signature.resistance, value, '', effect.amounts.map(amount => helperContribution(signature.stat, Number(amount) * signature.sign)), { signed: true })}<br>${effect.amounts.length}/${signature.cap} cumuls.<br>La durée est rafraîchie à chaque application. Tous les cumuls expirent ensemble.`;
}

export function buildInertEnergyHelper({ loss }) {
return `Les ratios de l’attaque sont réduits de ${helperFigure('inerte', loss, ' %')} tant qu’elle reste Inerte. Ils retrouvent leur valeur normale dès qu’une essence est active.`;
}

export function buildAttackUmbraCompatibilityHelper({ entry, showMissingRequirement, colorNames, escape }) {
      const equipmentOnly = !entry.compatible && entry.equipment > 0;
      let compatibilityHelper = '';
      if (!entry.usable && showMissingRequirement) {
        const missing = Math.max(0, entry.tier - entry.count);
        const requirement = `${missing} essence${missing > 1 ? 's' : ''} supplémentaire${missing > 1 ? 's' : ''} de ${colorNames[entry.color]} dans cette attaque, ou une attaque pure de cette couleur.`;
        compatibilityHelper = `<div class="separation-line golden"></div><strong>Manquant pour utiliser :</strong><br>${escape(requirement)}`;
      } else if (equipmentOnly) {
        compatibilityHelper = `<div class="separation-line golden"></div>Pour cette attaque, seule la contribution accordée par l'équipement est active.`;
      }

return compatibilityHelper;
}

export function buildAttackActivationHelper(enabled) {
  return enabled
    ? 'Cette attaque peut être sélectionnée automatiquement lorsqu’elle possède une cible valide et que son cooldown est terminé.'
    : 'Cette attaque reste possédée et modifiable, mais ne sera pas utilisée en combat.';
}

export function buildAttackMasteryHelper({ progress, gains }) {
return `<strong>Niveau de maîtrise ${progress.level}</strong><br>`
      + (progress.maxed ? 'Niveau maximal atteint.' : `${progress.current} / ${progress.cost} points. ${progress.remaining} points restants avant le niveau ${progress.level + 1}.`)
      + `<br><br>Chaque niveau débloque une chasse vide supplémentaire, jusqu'à 10 chasses. Aucune essence n'est créée.`
      + `<br><br>+${gains.launch} au lancement de l'attaque.<br>+${gains.impact} par impact direct réussi, y compris l'ambidextrie.<br>+${gains.critical} par impact critique valide.`
      + `<br>Un soin appliqué compte même à pleine vie. Une invocation compte dès sa mise en place sur le terrain.`
      + `<br>Les dégâts et soins périodiques ne rapportent rien. L'entité doit être vivante au moment du gain.`;
}

export function buildAttackRateHelper({ isHealing, title, rate, format, admin = false }) {
    const playerExplanation = `<strong>DPS : Dégâts par seconde bruts estimés</strong><br><br>Ce montant est théorique et ne tient pas compte des résistances de la cible.<br><br>Il estime les dégâts moyens de cette attaque utilisée en continu, avec les statistiques actuelles de l'entité, son rythme d'attaque, ses critiques et ses effets supplémentaires possibles. Les coups sont supposés toucher ; les bonus dépendant de la cible ne sont pas inclus.`;
    if (!isHealing && !admin) return playerExplanation;
    const convention = isHealing
      ? 'Capacité utilisée seule, en boucle, sur une cible alliée vivante toujours suffisamment blessée. Tous les impacts sont supposés réussir, sans sursoin.'
      : 'Sans défense ni esquive de la cible. Les impacts sont supposés atteindre une cible valide.';
    const amountLabel = isHealing ? 'Soins moyens' : 'Dégâts moyens';
    let html = `<strong>${title}</strong><br>Projection de ${rate.projectedCycles} cycles avec les statistiques actuelles du porteur. ${convention}<br>Cycle moyen : ${format(rate.expectedCycle / 1000)} s. ${amountLabel} par cycle : ${format(rate.expectedAmount)}.<br>Critiques : <span class="criticalChance">${format(rate.critChance * 100)}</span> % ; ambidextrie : <span class="ambidextry">${format(rate.expectedProcs)}</span> déclenchements attendus sur ${rate.projectedCycles} cycles.${rate.brokenChance ? `<br>Sort brisé : <span class="brokenSpell">${format(rate.brokenChance * 100)}</span> % des utilisations.` : ''}<br>${rate.range === 'distance' ? 'Le vol du projectile se déroule en parallèle de la récupération.' : 'L’exécution de mêlée précède la récupération.'} Les bonus dépendant de la cible ou d’un changement d’état pendant le combat ne sont pas chiffrés.`;
    if (isHealing) {
      html += `<br>Dans cette moyenne : <span class="healing">${format(rate.directHealing)}</span> HP pour le premier soin et <span class="ambidextry">${format(rate.procHealing)}</span> HP pour les seconds soins ambidextres, critiques inclus.<br>Débit soutenu : <span class="healing">${format(rate.healingPerMinute)}</span> HP/minute. Le premier impact est attendu après ${format(rate.firstImpact / 1000)} s ; ce débit ne décrit pas exactement la première minute.<br>Les résistances ne réduisent pas les soins. Les protections accordées ne sont pas comptées comme des HP restaurés.`;
      if (rate.targetDependentHealing) {
        html += `<br>${rate.targetDependentHealing.label} exclue : son soin supplémentaire dépend des HP maximum de la cible (<span class="healing">${format(rate.targetDependentHealing.percent)}</span> % par impact).`;
      }
    }

return isHealing ? html : `${playerExplanation}<br><br><div class="attack-rate-technical"><strong>Détail technique (admin)</strong><br>${html}</div>`;
}

export function buildAttackPurityHelper(level) {
  return level != null ? `<br><br>Niveau d'essence ${Number(level)}. La propriété progresse avec le nombre d'essences de sa couleur ; ses valeurs affichées tiennent compte de ce niveau.` : '';
}


// -----------------------------------------------------------------------------
// Essences
// -----------------------------------------------------------------------------

export const ESSENCE_EFFECT_HELPERS = {
  "physical-damage": {
    "name": "Degats physiques",
    "icon": "physicalDamage",
    "condition": "Essence rouge",
    "description": "Ajoute une source physique a l'attaque.",
    "ratio": "part rouge / total essences"
  },
  "vigueur": {
    "name": "Vigueur",
    "icon": "vigueur",
    "condition": "Essence rouge",
    "description": "Umbra offensive Force niveau 1 : puissance physique.",
    "ratio": "flat physique + ratio Force"
  },
  "brutality": {
    "name": "Brutalite",
    "icon": "brutality",
    "condition": "Essence rouge",
    "description": "Umbra offensive Force niveau 2 : penetration physique.",
    "ratio": "physicalPen + ratio Force"
  },
  "bloodFury": {
    "name": "Fureur sanguinaire",
    "icon": "bloodFury",
    "condition": "Essence rouge",
    "description": "Umbra offensive Force niveau 3 : execution et vol de vie.",
    "ratio": "seuil, chance et degats d'execution"
  },
  "magical-damage": {
    "name": "Degats magiques",
    "icon": "magicalDamage",
    "condition": "Essence bleue",
    "description": "Ajoute une source magique a l'attaque.",
    "ratio": "part bleue / total essences"
  },
  "esprit": {
    "name": "Esprit",
    "icon": "esprit",
    "condition": "Essence bleue",
    "description": "Umbra offensive Intelligence niveau 1 : puissance magique.",
    "ratio": "flat magique + ratio Intelligence"
  },
  "inflexion": {
    "name": "Inflexion",
    "icon": "inflexion",
    "condition": "Essence bleue",
    "description": "Umbra offensive Intelligence niveau 2 : penetration magique.",
    "ratio": "magicalPen + ratio Intelligence"
  },
  "piercing-damage": {
    "name": "Degats percants",
    "icon": "piercingDamage",
    "condition": "Essence jaune",
    "description": "Ajoute une source percante a l'attaque.",
    "ratio": "part jaune / total essences"
  },
  "finesse": {
    "name": "Finesse",
    "icon": "finesse",
    "condition": "Essence jaune",
    "description": "Umbra offensive Agilite niveau 1 : puissance percante.",
    "ratio": "flat percant + ratio Agilite"
  },
  "critical": {
    "name": "Puissance critique",
    "icon": "criticalPower",
    "condition": "Attaque pure jaune ou au moins deux essences jaunes",
    "description": "Umbra offensive Agilite niveau 2 : critique.",
    "ratio": "Chance : Puissance critique + Agilité. Dégâts critiques : Puissance critique uniquement."
  },
  "ambidextry": {
    "name": "Ambidextrie",
    "icon": "ambidextry",
    "condition": "Essence jaune et non pure magique",
    "description": "Umbra offensive Agilite niveau 3 : second coup.",
    "ratio": "chance + degats du second coup"
  },
  "piercing-recovery": {
    "name": "Recuperation percante",
    "icon": "recuperationTime",
    "condition": "Essence jaune",
    "description": "Reduit la recuperation si l'attaque possede une part percante.",
    "ratio": "piercing recovery + Agilite"
  },
  "transpiercing": {
    "name": "Transpercement",
    "icon": "transpiercingDamage",
    "condition": "Pure jaune",
    "description": "Une attaque purement percante devient transpercante.",
    "ratio": "piercingDamage + ratio Agilite"
  },
  "perforation": {
    "name": "Perforation",
    "icon": "perforation",
    "condition": "Pure jaune",
    "description": "Ignore l'armure sur une attaque purement percante.",
    "ratio": "actif uniquement en purete jaune"
  },
  "fracass": {
    "name": "Fracassante",
    "icon": "fracass",
    "condition": "Pure rouge",
    "description": "L'attaque est pure force physique et fracasse sa cible.",
    "ratio": "physicalDamage + ratio Force"
  },
  "psionic": {
    "name": "Psionique",
    "icon": "psionic",
    "condition": "Pure bleue",
    "description": "L'attaque est si chargee en magie qu'elle devient psionique.",
    "ratio": "magicalDamage + ratio Intelligence"
  },
  "messed-spell": {
    "name": "Surcharge magique",
    "icon": "messedSpell",
    "condition": "Melee pure bleue",
    "description": "L'attaque est tellement surchargee de magie qu'elle peut foirer.",
    "ratio": "chance pilotee par Intelligence"
  },
  "broken-spell": {
    "name": "Petage magique",
    "icon": "brokenSpell",
    "condition": "Distance pure bleue",
    "description": "Le sort peut peter pendant son incantation et blesser le lanceur.",
    "ratio": "chance pilotee par Intelligence"
  },
  "undogeable": {
    "name": "Inesquivable",
    "icon": "undogeable",
    "condition": "Pure bleue",
    "description": "Ignore l'esquive.",
    "ratio": "pas de jet dodge"
  },
  "range-penalty": {
    ...RANGE_PENALTY_EFFECT,
    "condition": "Distance et source physique/percante",
    "description": "Les projectiles physiques ou percants subissent le ratio distance.",
    "ratio": "calculateRangeRatio"
  },
  "accuracy": {
    "name": "Chance d'atteindre",
    "icon": "miss-shot",
    "condition": "Distance et non pure magique",
    "description": "Évitement de la dernière cible admissible invisible, réduit par la Précision.",
    "ratio": "calculateInvisibleTargetAvoidChance"
  },
  "projectile-speed": {
    "name": "Vitesse projectile",
    "icon": "executionTime",
    "condition": "Distance",
    "description": "Le temps d'execution pilote le trajet du projectile.",
    "ratio": "executionTime + projectileTime"
  },
  "short-range": {
    "name": "Courte portee",
    "icon": "meleeAttack",
    "condition": "Melee",
    "description": "Bonus d'execution natif du corps a corps.",
    "ratio": "base melee + Force"
  }
};

export function buildMilestoneEssenceHelper(hasColor, { preview = false } = {}) {
  if (preview) return hasColor
    ? "Essence liée de l'attribut investi. Gain validé avec la confirmation des niveaux."
    : "Ce jalon accorde une essence liée de la couleur de l'attribut investi.";
  return hasColor ? 'Essence liée gagnée avec cet attribut.'
    : 'Ce jalon accorde une essence liée de la couleur de l’attribut investi.';
}

function getEssenceDePrefix(label = "") {
  return /^[aeiouhàâäéèêëîïôöùûü]/i.test(String(label || "")) ? "d’" : "de ";
}

function createInfusedEssencePhraseHTML({ spriteClass = "neutral", infusedPrefix = "de ", infusedLabel = "", hyperco = false } = {}) {
  return `
    <span class="essence-helper-infused-token">
      <span class="picto-stat ${escapeEssenceAttribute(hyperco ? 'essence-hyperco' : spriteClass)}" aria-hidden="true"></span>
      <span class="${escapeEssenceAttribute(spriteClass)}${hyperco ? ' hyperco' : ''}">essence ${escapeEssenceHTML(infusedPrefix)}${escapeEssenceHTML(infusedLabel)}</span>
    </span>
  `;
}

export function createUniversalEssenceAmbianceHTML() {
  return "Elle pulse d'une énergie profonde. Elle a soif d'umbra, et donnera à son porteur les moyens d'<strong>étancher</strong> cet insatiable besoin.";
}

export function renderUniversalEssenceHelperHTML(normalizedColor, definition) {
  const name = definition.universalName || `Essence universelle de ${definition.attributeLabel || definition.infusedLabel || definition.name}`;
  const attributeLabel = definition.attributeLabel || definition.infusedLabel || definition.name;
  const titlePrefix = getEssenceDePrefix(attributeLabel);
  const infusedLabel = String(definition.infusedLabel || attributeLabel.toLowerCase());
  const infusedPrefix = getEssenceDePrefix(infusedLabel);
  const spriteClass = definition.spriteClass || "neutral";
  const qualityLabel = definition.qualityLabel || "Épique";
  const qualityColor = definition.qualityColor || "#c000ff";

  return `
    <div class="essence-universal-helper-card ${normalizedColor}">
      <div class="essence-universal-helper-name" style="color: ${escapeEssenceAttribute(qualityColor)};">
        ${escapeEssenceHTML(name)}
      </div>
      <div class="essence-universal-helper-bound">Liée quand enchâssée</div>
      <div class="essence-universal-helper-type">Essence universelle</div>
      <div class="item-combat-restriction">Non utilisable en combat</div>
      <div class="essence-universal-helper-quality">Qualité : ${escapeEssenceHTML(qualityLabel)}</div>
      <div class="separation-line golden essence-universal-helper-line"></div>
      <div class="essence-universal-helper-effect">
        <span>L’essence universelle ${escapeEssenceHTML(titlePrefix)}${escapeEssenceHTML(attributeLabel)} altère la nature d’une attaque en lui insufflant une</span>
        ${createInfusedEssencePhraseHTML({ spriteClass, infusedPrefix, infusedLabel })}
        <span>.</span>
      </div>
      <div class="essence-universal-helper-effect">
        <span class="neutral">Lien :</span>
        <span>Cette essence est universelle, elle pourra donc être utilisée par n’importe quelle entité, mais sera définitivement liée après son premier enchâssement.</span>
      </div>
    </div>
  `;
}

export function renderLinkedEssenceHelperHTML(normalizedColor, definition, options = {}, LINKED_ESSENCE_QUALITY) {
  const hyperco = normalizedColor === 'blue' && options.hyperco === true;
  const attributeLabel = (definition.attributeLabel || definition.infusedLabel || definition.name)
    + (hyperco ? ' Hypercognitive' : '');
  const titlePrefix = getEssenceDePrefix(attributeLabel);
  const infusedLabel = hyperco ? attributeLabel.toLowerCase() : String(definition.infusedLabel || attributeLabel.toLowerCase());
  const infusedPrefix = getEssenceDePrefix(infusedLabel);
  const spriteClass = definition.spriteClass || "neutral";
  const qualityLabel = LINKED_ESSENCE_QUALITY.qualityLabel;
  const qualityColor = LINKED_ESSENCE_QUALITY.qualityColor;
  const entityName = String(options.entityName || "").trim();
  const attackName = String(options.attackName || "").trim();
  const slotLabel = options.slot ? `, chasse ${Math.max(1, Number(options.slot) || 1)}` : "";
  const ownerLabel = entityName || "cette entité";
  const stateText = options.used === true
    ? `État : Enchâssée${attackName ? ` dans ${escapeEssenceHTML(attackName)}` : ""}${slotLabel}.`
    : `État : Disponible pour ${escapeEssenceHTML(ownerLabel)}.`;

  return `
    <div class="essence-linked-helper-card ${normalizedColor}${hyperco ? ' hyperco' : ''}">
      <div class="essence-linked-helper-name" style="color: ${escapeEssenceAttribute(qualityColor)};">
        Essence liée ${escapeEssenceHTML(titlePrefix)}${escapeEssenceHTML(attributeLabel)}
      </div>
      <div class="essence-linked-helper-bound">Liée à ${escapeEssenceHTML(ownerLabel)}</div>
      <div class="essence-linked-helper-type">Essence liée</div>
      <div class="essence-linked-helper-quality">Qualité : ${escapeEssenceHTML(qualityLabel)}</div>
      <div class="separation-line golden essence-linked-helper-line"></div>
      <div class="essence-linked-helper-effect">
        <span>L’essence liée ${escapeEssenceHTML(titlePrefix)}${escapeEssenceHTML(attributeLabel)} altère la nature d’une attaque en lui insufflant une</span>
        ${createInfusedEssencePhraseHTML({ spriteClass, infusedPrefix, infusedLabel, hyperco })}
        <span>.</span>
      </div>
      <div class="essence-linked-helper-effect">
        <span class="neutral">Lien :</span>
        <span>Cette essence appartient désormais à ${escapeEssenceHTML(ownerLabel)}. Elle peut être déplacée entre les attaques de cette entité, mais ne peut plus être utilisée par une autre entité.</span>
      </div>
      ${hyperco ? `<div class="essence-linked-helper-effect essence-linked-helper-origin">
        <span class="neutral">Origine :</span>
        <span>Générée par le Générateur cognitif de ${escapeEssenceHTML(ownerLabel)}.</span>
      </div>` : ''}
      <div class="essence-linked-helper-effect essence-linked-helper-state">
        ${stateText}
      </div>
    </div>
  `;
}

export function buildEssenceInventoryHelperHTML(entry, { getInventoryEntityName, createUniversalEssenceHelperHTML, createLinkedEssenceHelperHTML }) {
    const entityName = entry.entity ? getInventoryEntityName(entry.entity) : '';
    if (entry.source === 'universal') {
        return createUniversalEssenceHelperHTML(entry.color);
    }

    return createLinkedEssenceHelperHTML(entry.color, {
        hyperco: entry.hyperco,
        entityName,
        attackName: entry.attack?.name || '',
        slot: entry.slot,
        used: entry.used === true,
    });
}


// -----------------------------------------------------------------------------
// Items and equipment
// -----------------------------------------------------------------------------

export const ITEM_EFFECT_HELPERS = {
  itemMovement: 'Déplacements sup. : {MovementAmount}.',
  itemFadedLife: 'Accorde {FadedLifeAmount} vie(s) fanée(s). Chaque vie consommée est définitivement perdue.',
  itemExtraLife: 'Accorde {ExtraLifeAmount} vie(s) fanée(s). Une vie rechargeable donnée par un consommable devient une vie fanée.',
  itemEternalLife: 'Accorde {EternalLifeAmount} vie(s) fanée(s). Une vie rechargeable donnée par un consommable devient une vie fanée.',
  "itemHeal": 'Soigne {HealAmount} points de vie à la cible qui consomme cet objet.',
  "itemDamage": 'Inflige {TotalDamages} points de dégats à la cible qui consomme cet objet.',
  "itemRez": 'Réssucite la cible qui consomme cet objet, et lui restitue {HealAmount} points de vie.',
  "itemResetProgression": 'Purifie une entité vivante de son emprise à l\'Umbra : la ramène au niveau 1 et à ses statistiques de base.<br>Vous récupèrez tout de même 30 % + la valeur en <div class="picto-stat will"></div>  <span class="will">volonté</span> de l\'entité, de son experience accumulée.'
};

export function generateEffectDescription(effect, attacker, item) {
    const dotValue = Math.ceil(effect.effectDot || 0);

    const getTotalDamagesBlock = () => {
        if (!item) return '';

        const types = [
            { key: 'MagicDamage', className: 'magicalDamage' },
            { key: 'physicalDamage', className: 'physicalDamage' },
            { key: 'hybridalDamage', className: 'hybridalDamage' },
            { key: 'piercingDamage', className: 'piercingDamage' }
        ];

        const segments = types
            .filter(type => item[type.key] != null && item[type.key] > 0)
            .map(type => {
                return `<div class="picto-stat ${type.className}"></div><span class="${type.className} total-damage major">${item[type.key]}</span>`;
            });

        // 🔥 Ajout HealAmount si aucun dégât, ou en complément si souhaité
        if ((segments.length === 0) && item.HealAmount > 0) {
            segments.push(`<div class="picto-stat healing"></div><span class="healing total-damage major">${item.HealAmount}</span>`);
        }

        if (segments.length === 0) return '';
        return `<div class="showdetails damage">${segments.join(' + ')}</div>`;
    };

    const map = {
        '{MagicDamage}': item?.MagicDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat magicalDamage"></div>
                <span class="magicalDamage total-damage major">${item.MagicDamage}</span>
            </div>
        ` : '',

        '{physicalDamage}': item?.physicalDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat physicalDamage"></div>
                <span class="physicalDamage total-damage major">${item.physicalDamage}</span>
            </div>
        ` : '',

        '{piercingDamage}': item?.piercingDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat piercingDamage"></div>
                <span class="piercingDamage total-damage major">${item.piercingDamage}</span>
            </div>
        ` : '',

        '{hybridalDamage}': item?.hybridalDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat hybridalDamage"></div>
                <span class="hybridalDamage total-damage major">${item.hybridalDamage}</span>
            </div>
        ` : '',

        '{HealAmount}': item?.HealAmount > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat healing"></div>
                <span class="healing total-damage major">${item.HealAmount}</span>
            </div>
        ` : '',

        '{TotalDamages}': getTotalDamagesBlock(),
        '{MovementAmount}': `<span class="shift"><span class="picto-stat shift"></span>+${Math.max(0, Number(item?.MovementAmount) || 0)}</span>`,
        '{FadedLifeAmount}': `<span class="fadedLife"><span class="picto-stat fadedLife"></span>${Math.max(0, Number(item?.FadedLifeAmount) || 0)}</span>`,
        '{ExtraLifeAmount}': helperFigure('fadedLife', item?.ExtraLifeAmount || 0, '', { signed: true }),
        '{EternalLifeAmount}': helperFigure('fadedLife', item?.EternalLifeAmount || 0, '', { signed: true }),

        '{effectDot}': dotValue > 0 ? `<span class="dot power-damage">${dotValue}</span>` : '',
        '{effectDuration}': effect.effectDuration ? `<span class="duration power-damage">${effect.effectDuration}</span>` : '',
        '{effectStack}': effect.effectStack ? `<span class="stack power-damage">${effect.effectStack}</span>` : '',

        '{effectDotResult}': dotValue > 0 ? `
            <span class="dot total-damage major">
                <div class="picto-stat dot"></div>${dotValue}
            </span>` : ''
    };

    let description = String(effect.effectDescription || effect.effectDisplay || effect.effectName || '')
      .replace(/\{(effectDuration|effectDistance|effectWeightPercent)\}/g, (_, key) => String(effect[key] ?? ''));
    for (const key in map) {
        description = description.replaceAll(key, map[key]);
    }

    return `
        <div class="effect-description">
            ${description}
        </div>
    `;
}

export function appendItemHelperHeader({ color, item, types, norm, detailCard, isBattleConsumable }) {
  const name = document.createElement('div');
  name.classList.add('item-name');
  name.style.color = color;
  name.textContent = item.displayName;

  const type = document.createElement('div');
  type.classList.add('item-type');
  type.textContent = types.includes('permanent') ? 'Objet permanent' : types.length
    ? types.map(t => t === 'consumable' ? 'Objet consommable' : t === 'stuff' ? 'Équipement' : t === 'relic' ? 'Relique' : t).join(', ')
    : 'Objet';

  const quality = document.createElement('div');
  quality.classList.add('item-quality');
  quality.textContent = `Qualité : ${norm}`;

  const desc = document.createElement('div');
  desc.classList.add('item-lore');
  desc.textContent = item.itemDescription || '';

  if (types.includes('permanent') && item.permanentStat) {
    const grant = item.permanentStat;
    const icon = grant.icon || item.statIcon;
    detailCard.classList.add('crystal-helper');
    if (icon) detailCard.classList.add(icon);
    detailCard.dataset.crystalStat = grant.key;
    const emblem = document.createElement('div');
    emblem.className = 'crystal-helper-emblem';
    emblem.setAttribute('aria-hidden', 'true');
    const picto = document.createElement('div');
    picto.classList.add('picto-stat');
    if (icon) picto.classList.add(icon);
    emblem.appendChild(picto);
    detailCard.appendChild(emblem);
    // The existing stat row carries the name, unit and gain, without duplicating it in the title.
    name.textContent = "Crystal d'Umbra";
    name.style.removeProperty('color');
    const qualityValue = document.createElement('span');
    qualityValue.style.color = color;
    qualityValue.textContent = norm;
    quality.replaceChildren('Qualité : ', qualityValue);
  }

  detailCard.appendChild(name);
  detailCard.appendChild(type);
  detailCard.appendChild(quality);
  if (types.includes('consumable') && !isBattleConsumable(item)) {
    const restriction = document.createElement('div');
    restriction.className = 'item-combat-restriction';
    restriction.textContent = 'Non utilisable en combat';
    detailCard.appendChild(restriction);
  }


return desc;
}

const ITEM_EFFECT_STAT_HELPERS = {
  itemMovement: { rows: [{ field: 'MovementAmount', stat: 'shift', label: 'Déplacements sup.' }] },
  itemHeal: { rows: [{ field: 'HealAmount', stat: 'healing', label: 'Soins' }] },
  itemRez: {
    rows: [{ field: 'HealAmount', stat: 'healing', label: 'Points de vie restitués' }],
    description: 'Ressuscite la cible qui consomme cet objet.',
  },
  itemDamage: { rows: [
    { field: 'physicalDamage', stat: 'physicalDamage', label: 'Dégâts physiques', signed: false },
    { field: 'MagicDamage', stat: 'magicalDamage', label: 'Dégâts magiques', signed: false },
    { field: 'hybridalDamage', stat: 'hybridalDamage', label: 'Dégâts hybrides', signed: false },
    { field: 'piercingDamage', stat: 'piercingDamage', label: 'Dégâts perçants', signed: false },
  ] },
  itemFadedLife: {
    rows: [{ field: 'FadedLifeAmount', stat: 'fadedLife', label: 'Vies fanées' }],
    description: 'Chaque vie consommée est définitivement perdue.',
  },
  itemExtraLife: {
    rows: [{ field: 'ExtraLifeAmount', stat: 'fadedLife', label: 'Vies fanées' }],
    description: 'Une vie rechargeable donnée par un consommable devient une vie fanée.',
  },
  itemEternalLife: {
    rows: [{ field: 'EternalLifeAmount', stat: 'fadedLife', label: 'Vies fanées' }],
    description: 'Une vie rechargeable donnée par un consommable devient une vie fanée.',
  },
};

export function appendItemEffectHelpers({ item, itemEffects, generateEffectDescription, detailCard, appendStatRow }) {
  // --- Effets consommables ---
  if (Array.isArray(item.effets)) {
    let hasDescription = false;
    item.effets.forEach(effectName => {
      const effectData = Array.isArray(itemEffects) ? itemEffects.find(e => e.effectName === effectName) : null;
      if (effectName === 'itemPermanentStat' && item.permanentStat && appendStatRow) {
        const grant = item.permanentStat;
        const block = document.createElement('div');
        block.className = 'item-stats-block consumable permanent';
        block.dataset.itemEffect = effectName;
        const section = document.createElement('div');
        section.className = 'stuff-stat-section stuff-stat-section--bonus';
        block.appendChild(section);
        appendStatRow(section, { stat: grant.key, label: grant.name, isUmbra: grant.isUmbra,
          rawValue: grant.amount, totalValue: grant.amount, unit: grant.unit });
        detailCard.appendChild(block);
        hasDescription = true;
        return;
      }
      const presentation = ITEM_EFFECT_STAT_HELPERS[effectName];
      const rows = presentation?.rows.filter(({ field }) => Number.isFinite(Number(item[field])) && Number(item[field]) > 0);
      if (effectData && rows?.length && appendStatRow) {
        const block = document.createElement('div');
        block.className = 'item-stats-block consumable';
        block.dataset.itemEffect = effectName;
        const section = document.createElement('div');
        section.className = 'stuff-stat-section stuff-stat-section--bonus';
        block.appendChild(section);
        for (const { field, ...row } of rows) {
          const value = Number(item[field]);
          appendStatRow(section, { ...row, rawValue: value, totalValue: value });
        }
        if (presentation.description) {
          const description = document.createElement('div');
          description.className = 'stat-lore';
          description.textContent = presentation.description;
          block.appendChild(description);
        }
        detailCard.appendChild(block);
        hasDescription = true;
        return;
      }
      if (effectData?.effectDescription && typeof generateEffectDescription === 'function') {
        const html = generateEffectDescription(effectData, null, item);
        detailCard.insertAdjacentHTML('beforeend', html);
        hasDescription = true;
      }
    });
    if (!hasDescription) {
      const unknown = document.createElement('p');
      unknown.textContent = "Effets de l'objet inconnus";
      unknown.classList.add('unknown-effect');
      detailCard.appendChild(unknown);
    }
  }


}

export function appendEntityHelperContent({ entity, createEntityPowerValue, detailCard, getEntityPriceAndQuality, getItemQualityData, applyCombatProfileView }) {
    const name = document.createElement('h3');
    name.textContent = entity.nickname ?? entity.name;
    name.appendChild(createEntityPowerValue(entity));
    detailCard.appendChild(name);

    const type = document.createElement('p');
    type.textContent = `Type : Entité`;
    detailCard.appendChild(type);

    const { quality } = getEntityPriceAndQuality(entity);
    const { norm, color } = getItemQualityData(quality);

    const rarity = document.createElement('p');
    rarity.innerHTML = `Qualité : <span style="color: ${color}; font-weight: bold;">${norm}</span>`;
    detailCard.appendChild(rarity);

    const level = document.createElement('p');
    level.textContent = `Niveau : ${entity.level.current}`;
    detailCard.appendChild(level);

    const hp = document.createElement('p');
    hp.className = 'HP';
    hp.textContent = `HP : ${entity.stats.HP.current} / ${entity.stats.HP.max}`;
    detailCard.appendChild(hp);

    if (entity.stats.extraLife) {
        const extralife = document.createElement('p');
        extralife.className = 'extraLife';
        extralife.textContent = `Vie bonus : ${entity.stats.extraLife.current} / ${entity.stats.extraLife.max}`;
        detailCard.appendChild(extralife);
    }

    const stats = document.createElement('p');
    stats.innerHTML = `Dégâts : <span class="piercingDamage">${escapeEssenceHTML(String(entity.stats.piercingDamage))}</span> | Vitesse : <span class="speed">${escapeEssenceHTML(String(entity.stats.speed))}</span>`;
    detailCard.appendChild(stats);

    if (entity.attacks?.length) {
        const role = document.createElement('p');
        applyCombatProfileView(role, entity, { text: true });
        detailCard.appendChild(role);
    }


}

export function renderStuffContributionValue(target, value, boostDetail = null, rawValue = null, stat = null, { hasVisibleOrfevreExactBonus, formatStuffContribution, createStuffPicto, getDisplayStatKey, signed = true, unit = null }) {
  target.textContent = "";

  const hasOrfevreBoost = hasVisibleOrfevreExactBonus(boostDetail);
  target.classList.toggle("stuff-stat-orfevre-main", hasOrfevreBoost);
  const effective = document.createElement("span");
  effective.className = `stuff-stat-effective ${getDisplayStatKey(stat)}`;
  const movementReserve = getDisplayStatKey(stat) === 'shift' && value?.reserve === true;
  effective.textContent = movementReserve
    ? formatStuffContribution(value.current) + (value.current !== value.max
      ? ` / ${formatStuffContribution(value.max, { signed: false })}` : '')
    : formatStuffContribution(value, { signed: signed && value?.reserve !== true });
  if (unit !== null) effective.append(unit);
  else if (typeof value === 'number' && ['physicalPen', 'magicalPen'].includes(getDisplayStatKey(stat))) {
    effective.append(' %');
  }
  target.appendChild(effective);

  if (hasOrfevreBoost && stat) {
    const statPicto = createStuffPicto(stat);
    statPicto.classList.add("stuff-stat-inline-picto");
    target.appendChild(statPicto);
  }
}

function buildItemStatContributionHelper({ stat, label, value, valueText, state, resourceReserve, lifeSlot, itemEffect }) {
  if (stat === 'dodge' && itemEffect !== 'itemPermanentStat') return 'Améliore l’esquive.';
  const description = STAT_HELPER_DESCRIPTIONS[stat];
  const introduction = helperStatIntroduction(stat, { icon: true, value: GENERATED_UMBRA_HELPERS[stat] ? valueText : null, state });
  if (lifeSlot) {
    const remaining = Math.max(0, lifeSlot.maxRegen - lifeSlot.currentRegen);
    return `${introduction}<br>Recharge : ${helperFigure(stat, lifeSlot.maxRegen, ' j', { state })}.<br>`
      + (remaining > 0 ? `Disponible dans ${helperFigure(stat, remaining, ' j', { state })}.` : 'Disponible.');
  }
  const plural = Math.abs(Number(value)) !== 1;
  let name;
  if (stat === 'shift') {
    name = resourceReserve || itemEffect === 'itemMovement'
      ? (plural ? 'charges de déplacement supplémentaires' : 'charge de déplacement supplémentaire')
      : (plural ? 'déplacements maximum' : 'déplacement maximum');
  } else {
    name = {
      armor: plural ? "points d'armure" : "point d'armure",
      fadedLife: plural ? 'vies fanées' : 'vie fanée',
      extraLife: plural ? 'vies supplémentaires' : 'vie supplémentaire',
      eternalLife: plural ? 'vies éternelles' : 'vie éternelle',
      healing: plural ? 'points de vie' : 'point de vie',
    }[stat];
  }
  const figure = helperFigure(stat, valueText, '', { state });
  const term = `<span class="${escapeEssenceAttribute(stat)}" data-stat-state="${escapeEssenceAttribute(state)}">${escapeEssenceHTML(name || label)}</span>`;
  if (itemEffect === 'itemPermanentStat') return `Accorde définitivement ${figure} ${term} à l'entité.`;
  if (itemEffect === 'itemDamage') return `${introduction}${introduction ? '<br>' : ''}Inflige ${figure} ${term} à l'entité.`;
  if (itemEffect === 'itemHeal' || itemEffect === 'itemRez') return `${introduction}${introduction ? '<br>' : ''}Rend ${figure} ${term} à l'entité.`;
  if (description && !name) return introduction;
  return `${introduction}${introduction ? '<br>' : ''}Donne ${figure} ${name ? '' : 'en '}${term} à l'entité.`;
}

export function renderItemStatHelperRow(parent, {
  stat,
  label,
  rawValue,
  totalValue,
  boostDetail,
  previewBoostDetail,
  isPreviewPrimary = false,
  isMalus = false,
  powerScore = 0,
  ownerEntity,
  armorReserve = null,
  resourceReserve = null,
  lifeSlot = null,
  retainOrfevreDetail = false,
  isUmbra = false,
  signed = true,
  unit = null,
}, { getDisplayStatKey, isUmbraRestricted, hasVisibleOrfevreExactBonus, createStuffPicto, appendStuffContributionValue, appendStuffOrfevreBoostDetail }) {
  const visualStat = getDisplayStatKey(stat);
  const row = document.createElement('div');
  row.className = `stuff-stat-row ${visualStat}-stat stat-container`;
  row.dataset.stat = stat;
  row.dataset.hover = "true";
  row.dataset.powerScore = String(powerScore || 0);
  if (lifeSlot) row.dataset.resourceLifeId = lifeSlot.id;
  if (ownerEntity?.id) row.dataset.entityId = ownerEntity.id;
  if (isUmbraRestricted(ownerEntity, stat)) {
    row.classList.add('umbra-restricted');
    row.title = HELPER_TEXT.restrictedUmbra;
  }
  if (isMalus) {
    row.classList.add('stuff-stat-malus');
  } else {
    row.classList.add('stuff-stat-bonus');
  }
  if (hasVisibleOrfevreExactBonus(boostDetail)) {
    row.classList.add('upgraded', 'stuff-stat-boosted');
  } else if (boostDetail) {
    row.classList.add('stuff-stat-orfevre-detail');
  }
  if (previewBoostDetail) row.classList.add('stuff-stat-has-preview');
  if (armorReserve) {
    row.classList.add('stuff-stat-armor-reserve');
    if (armorReserve.max > 0 && armorReserve.current <= 0) row.classList.add('stuff-stat-armor-empty');
    if (armorReserve.orfevreBonus > 0) row.classList.add('upgraded', 'stuff-stat-armor-orfevre');
  }
  if (resourceReserve) {
    row.classList.add('stuff-stat-resource-reserve');
    if (resourceReserve.current <= 0) row.classList.add('stuff-stat-resource-empty');
  }

  const statLine = document.createElement('div');
  statLine.className = `stat-line stat-picto-valeur ${visualStat} ${isMalus ? 'malus' : 'bonus'}`;
  statLine.appendChild(createStuffPicto(stat));
  const statName = document.createElement('span');
  statName.className = `stat-name ${visualStat}`;
  const nameText = document.createElement('span');
  if (stat.endsWith('Plus')) nameText.className = 'stat-improved-label';
  nameText.dataset.statState = stat.endsWith('Plus') ? '+' : isUmbra ? 'umbra' : 'normal';
  nameText.textContent = label;
  statName.appendChild(nameText);
  statLine.appendChild(statName);

  statLine.setAttribute('aria-label', label);

  const valueDiv = document.createElement('div');
  valueDiv.className = 'entite-stat';
  valueDiv.dataset.stat = stat;
  valueDiv.dataset.hover = "true";
  if (ownerEntity?.id) valueDiv.dataset.entityId = ownerEntity.id;
  if (lifeSlot) {
    const duration = document.createElement('span');
    duration.className = `stuff-stat-effective ${visualStat}`;
    duration.textContent = lifeSlot.currentRegen < lifeSlot.maxRegen
      ? `${lifeSlot.currentRegen}/${lifeSlot.maxRegen} j`
      : `${lifeSlot.maxRegen} j`;
    valueDiv.appendChild(duration);
  } else appendStuffContributionValue(valueDiv, totalValue, boostDetail, rawValue, stat, { signed, unit });
  for (const value of valueDiv.querySelectorAll('.stuff-stat-effective')) value.dataset.statState = nameText.dataset.statState;
  statLine.appendChild(valueDiv);

  row.appendChild(statLine);

  // Describe this item's contribution, never the owner's complete stat sheet.
  const contribution = armorReserve || resourceReserve ? totalValue.current : totalValue;
  const helperValue = document.createElement('span');
  appendStuffContributionValue(helperValue, contribution, null, rawValue, stat, { signed, unit });
  row.dataset.helperText = buildItemStatContributionHelper({
    stat: visualStat, label, value: contribution, valueText: helperValue.textContent,
    state: nameText.dataset.statState, resourceReserve, lifeSlot,
    itemEffect: parent.closest('[data-item-effect]')?.dataset.itemEffect,
  }) + buildImprovementHelperFooter(parent.closest('[data-item-effect]')?.dataset.itemEffect === 'itemPermanentStat' ? 'intense'
    : !lifeSlot && !resourceReserve && !armorReserve ? 'external' : '', stat, { malus: isMalus, belowZero: Number(ownerEntity?.stats?.[stat]) < 0 });

  if (boostDetail && (hasVisibleOrfevreExactBonus(boostDetail) || retainOrfevreDetail)) {
    appendStuffOrfevreBoostDetail(row, {
      stat,
      label,
      detail: boostDetail,
      previewDetail: isPreviewPrimary ? null : previewBoostDetail,
      ownerEntity,
      preview: isPreviewPrimary,
    });
  }

  parent.appendChild(row);
}

export function appendOrfevreHelperDetail({ preview, buildStuffOrfevreDetailPayload, stat, label, detail, previewDetail, ownerEntity, formatStuffContribution, createStuffPicto, getDisplayStatKey, parent }) {
  const detailNode = document.createElement("div");
  detailNode.className = `boost-detail boost-detail--orfevre${preview ? " boost-detail--preview" : ""}`;
  detailNode.dataset.stat = "orfevre-detail";
  detailNode.dataset.hover = "true";
  detailNode.dataset.orfevreDetail = buildStuffOrfevreDetailPayload(stat, label, detail, previewDetail, { preview });
  if (ownerEntity?.id) detailNode.dataset.entityId = ownerEntity.id;

  const open = document.createElement("span");
  open.className = "boost-detail-paren neutral";
  open.textContent = "(";
  detailNode.appendChild(open);

  const base = document.createElement("span");
  base.className = `stuff-stat-orfevre-base ${getDisplayStatKey(stat)}`;
  base.textContent = formatStuffContribution(detail.raw, { signed: false });

  const statPicto = createStuffPicto(stat);
  statPicto.classList.add("stuff-stat-inline-picto");
  detailNode.appendChild(statPicto);
  detailNode.appendChild(base);

  const separator = document.createElement("span");
  separator.className = "stuff-stat-orfevre-separator neutral";
  separator.textContent = "+";
  detailNode.appendChild(separator);

  const bonus = document.createElement("span");
  bonus.className = "stuff-stat-orfevre-bonus weaponOrfevre";
  bonus.textContent = formatStuffContribution(detail.exactBonus, { signed: false });

  const orfevrePicto = createStuffPicto("weaponOrfevre");
  orfevrePicto.classList.add("stuff-stat-inline-picto");
  detailNode.appendChild(orfevrePicto);
  detailNode.appendChild(bonus);

  const close = document.createElement("span");
  close.className = "boost-detail-paren neutral";
  close.textContent = ")";
  detailNode.appendChild(close);

  parent.appendChild(detailNode);
}


// -----------------------------------------------------------------------------
// Battlefield, levels and general help
// -----------------------------------------------------------------------------

export function buildCombatProfileHelper({ entity, domains, attacks, describeAttackCombat, range, combatFunction, label }) {
    const rankHelp = entity.type === 'lord'
        ? 'Cette entité est un Lord. Son rang la protège du ciblage prioritaire des Sbires ; ses attaques offensives sur les vivants utilisent la menace pour choisir leur cible.'
        : 'Cette entité est un Sbire. En bataille, son rôle dans la formation guide ses priorités de ciblage ; ses attaques offensives sur les vivants privilégient les Sbires adverses avant les Lords.';
    const scope = [];
    const joinSides = list => list.includes('ally') && list.includes('enemy') ? 'alliés ou ennemis' : list.includes('ally') ? 'alliés' : 'ennemis';
    for (const domain of domains) {
        const concerned = attacks.filter(attack => describeAttackCombat(attack).domains.includes(domain));
        const sides = concerned.flatMap(attack => attack.attackTarget);
        scope.push(domain === 'necro' ? `les cadavres ${joinSides(sides)}`
            : domain === 'combattant' ? `les êtres vivants ${joinSides(sides)}` : 'les cases du terrain');
    }
    const rangeHelp = range === 'multi' ? 'au corps à corps et à distance' : range === 'melee' ? 'au corps à corps' : 'à distance';
    const functionHelp = combatFunction === 'Arbitre' ? 'offensives et de soutien' : combatFunction === 'Support' ? 'de soutien' : 'offensives';
    const helper = `<strong>Rôle sur le champ de bataille</strong><p>${label}</p><p>${rankHelp}</p>`
        + `<p>Son arsenal comporte des actions ${functionHelp}, ${rangeHelp}. Selon l'attaque, elle peut agir sur ${scope.join(', ')}.</p>`
        + `<p>Chaque attaque conserve ses propres cibles et sa portée. Consultez les attaques de l'entité pour en savoir plus.</p>`;

return helper;
}

export function buildLevelHelper({ levelType, biome, statut, reward, permanentReward, infosDisponibles, isAdminMode, totalpoints, moyennepower, maxutilisation, variation, difficulte, lord, storageId }) {
            const rewards = [reward && escapeEssenceHTML(reward), permanentReward
                && '<span class="level-permanent-reward"><img src="media/assets/misc/permanent-cristal-lvl-2-02.png" alt="">permanent-crystal</span>'].filter(Boolean).join(' + ');
            let tooltipHTML = `
                <strong>Infos du niveau :</strong><br>
                Type : ${levelType}<br>
                Biome : ${biome}<br>
                Statut : ${statut}<br>
                ${rewards ? `Récompenses : ${rewards}<br>` : ''}`;

            if (infosDisponibles && isAdminMode()) {
                tooltipHTML += `
                    Total points : ${totalpoints}<br>
                    Niveau moyen : ${moyennepower}<br>
                    Max utilisation : ${maxutilisation}<br>
                    Variation : ${variation}<br>
                    Difficulté : ${difficulte}<br>
                    Lords : ${lord}<br>`;
            } else if (isAdminMode()) {
                tooltipHTML += `Données insuffisantes !<br>`;
            }

            tooltipHTML += `ID : ${storageId}<br>`;

return tooltipHTML;
}

export function HelpText() {
    return `
  <!-- <div class="container-help-intro"> -->
  <!-- <span class="title-1">The Pit</span> -->
     <!-- <span class="title-2">Tactical AutoBattle</span> -->
   <!-- <p class="help-text">The Pit est un projet de tactical auto-battle en temps réél, dans lequel vous devez exterminer l'armée adverse.<br>Placez vos troupes de manière stratégique, et adaptez votre formation en temps réel suivant l'évolution du combat pour remporter la bataille.</p> -->
  <!-- </div> -->
  <div class="container-help">
    <div class="help-partie-1">
		 <!-- <span class="title-3">The Pit </span> -->
      <!-- <div class="help"><p>The Pit est un projet de tactical auto-battle en temps réél, dans lequel vous devez exterminer l'armée adverse.<br>Placez vos troupes de manière stratégique, et adaptez votre formation en temps réel suivant l'évolution du combat pour remporter la bataille.</p></div> -->
	 <span class="title-3"> I - L'OBJECTIF</span>
      <div class="help"><p>Deux armées s'affrontent.<br>Votre armée se trouve à <strong>gauche</strong> de l'écran, l'armée adverse à <strong>droite</strong>.<br>Vous devez vaincre toutes les <strong>Entités</strong> adverses pour remporter la partie. Positionez stratégiquement vos troupes, de maniére à éliminer les éléments clefs de l'adversaires et preservez les votre, et cliquez sur lancer les combats quand vous êtes prêts.</p></div>
	  	  <div class="title-3"><p>II - LES ENTITÉS</p></div>
      <div class="help"><p>Elles constituent les armées, et vont s'attaquer automatiquement, selon leur propres caractéristiques. Elles sont de deux types : les <strong>Lords</strong> et les <strong>Sbires</strong>.<br>
	  <div style="text-align:center;">• Les Lords sont les <strong>commandants</strong>. Ces puissantes Entités sont représentées par une aura dorée qui les entoure.<br>• Les Sbires sont l'<strong>armée régulière</strong> et leur puissance varie grandement d'un Sbire à l'autre.</div><br>
	  Les Lords <strong>attaquent toujours</strong> la cible qui représente <strong>la plus grande menace</strong> dans l'armée adverse. En plus, ils sont <strong>protégés par leurs Sbires</strong> : Ils ne peuvent pas être pris pour cible par les Sbires adverses, <strong>tant qu'ils ont des Sbires vivant dans leur armée</strong>.<br> Les Sbires choisissent leur cible <strong>en fonction du rôle qu'ils occupent</strong>, et ne peuvent <strong>cibler le Lord adverse</strong> que quand les Sbires adverses sont <strong>tous morts</strong>.</p></div>
	   <span class="title-3"> III - LE POSITIONNEMENT</span>
	  <div class="help"><p><strong>Positionnez vos Entités</strong> sur les cases hexagonales du plateau de jeux (board).<br>Chaque case donnera à l'Entité qui l'occupe un <strong>rôle spécifique durant la bataille</strong>.<br>Créez votre formation avant de lancer le combat, et déplacez vos entités <strong>pendant la bataille</strong>, pour <strong>adapter</strong> votre formation à la situation <strong>en temps réel</strong>.</p></div>
   
    </div>

	
<div class="help-partie-2">
 <span class="title-3"> IV - LE BOARD</span>
	 <div class="help"><p>Faites un <strong>glissé/déposé</strong> pour <strong>positionner les Entités</strong> sur les cases hexagonales. Il ne peut y avoir qu'une Entité par case.<br>Il existe <strong>4 types de cases</strong> :</p></div>
			<div class="helper-bloc-images"> 
				<!-- Case neutre -->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case fantassin" src="./media/assets/board/hex-helper-neutral.svg">
							<span class="helper-block-title">Case Neutre</span>
							<p>Elles composent la plupart du board. Toute entité positionnée dessus aura pour rôle <strong>Gueux</strong>.</p>
					</div>
					<!-- Case tank-->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case tank" src="./media/assets/board/hex-helper-tank.svg">
							<span class="helper-block-title">Case Tank</span>
							<p>En première ligne de votre armée. Toute entité positionnée dessus aura pour rôle <strong>Tank</strong>.</p>
					</div>
					<!-- Case fantassin-->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case fantassin" src="./media/assets/board/hex-helper-fantassin.svg">
							<span class="helper-block-title">Case Fantassin</span>
							<p>Au milieu de votre armée. Toute entité positionnée dessus aura pour rôle <strong>Fantassin</strong>.</p>
					</div>
					<!-- Case mage -->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case mage" src="./media/assets/board/hex-helper-mage.svg">
							<span class="helper-block-title">Case Mage</span>
							<p>À l'arrière votre armée. Toute entité positionnée dessus aura pour rôle <strong>Mage</strong>.</p>
					</div>
			</div>
 <span class="title-3"> V - LES RÔLES</span>
  
	  			<div class="helper-bloc-role"> 
				<div style="display: flex; margin-bottom: 5%;"><p style="width: 63%;margin-right: 3%;">Le rôle du Sbire détermine son  <strong>ciblage</strong> : Quel <strong>Sbire</strong> il pourra  <strong>prendre pour cible</strong>, et quel <strong>Sbire</strong> pourra <strong>le prendre pour cible </strong>.<br><i class="helper-legend">La bare de vie indique en temps réél le  Role de l'Entité (1) et ce qu'elle cible (2).<br></i></p><img src="./media/assets/ui/tuto-hud.jpg" class="image-tuto-role" alt="image explicative du hu" style="width: 25%;"></div>
				<!-- Case neutre -->
				<p>Il existe 4 rôles :</p>
					<div class="helper-part-role">
						<img class="helper-roles" alt="case fantassin" src="./media/assets/ui/picto-gueux.svg">
							
							<p><span class="helper-block-title">Le Gueux :</span> Il est le rôle misérable par excellence. Il sera la <strong>cible prioritaire</strong> de tous les Sbires adverses, et ses alliés Supports rechigneront à l'aider.</p>
					</div>
					<!-- Case tank-->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case tank" src="./media/assets/ui/picto-tank.svg">
							
							<p><span class="helper-block-title">Le Tank :</span> Il sera <strong>pris pour cible par le plus grand nombre d'Entité</strong>. Il est la première ligne de votre armée et se doit d'être <strong>robuste</strong>.</p>
					</div>
					<!-- Case fantassin-->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case fantassin" src="./media/assets/ui/picto-fantassin.svg">
							
							<p><span class="helper-block-title">Le Fantassin :</span> Il est l'armée régulière. Il ciblera d'abord <strong>les premières lignes</strong>, puis les <strong>arrières lignes</strong>.</p>
					</div>
					<!-- Case mage -->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case mage" src="./media/assets/ui/picto-mage.svg">
							
							<p> <span class="helper-block-title">Le Mage :</span> Il se bat <strong>loin</strong> des zones de conflits. <strong>Protégé</strong> par ses premières lignes, il cible les <strong>Fantassins</strong>.</p>
					</div>
			</div>
<!-- Types et fonctions -->
 <span class="title-3"> VI - TYPES ET FONCTIONS</span>
	<div class="help"><p>Les Entités sont des <strong>Sbires</strong>, des <strong>Lords</strong> ou des <strong>Invocateurs</strong>. Leur fonction peut être offensive ou de support.</p></div>
<div><div class="helper-part-role">
		<img class="helper-roles" alt="classe support" src="./media/assets/ui/picto-support.svg" style="height: 40px;">
	  <p><span class="helper-block-title">Le Support : </span>Il cible les Entités alliées. Souvent pour leur venir en aide. Et parfois même quand elle sont mortes...</p></div>
<div class="helper-part-role">
		<img class="helper-roles" alt="classe attaquant" src="./media/assets/ui/picto-attaquant.svg" style="height: 40px;">
	  <p><span class="helper-block-title">L'Attaquant :</span> Il cible les Entités ennemies</strong>, et il ne leur veut pas du bien...</p>
</div><div class="helper-part-role">
		<img class="helper-roles" alt="classe invocateur" src="./media/assets/ui/picto-invocateur.svg" style="height: 40px;">
	  <p><span class="helper-block-title">L'Invocateur :</span> Il cible les cases du terrain et peut y produire des effets offensifs ou de support.</p>
</div></div></div>
  
    <div class="help-partie-3">
	<span class="title-3"> VII - CONTRÔLES</span>
	  <p style="font-size: 13px;"><strong>Drag n' drop (glissé-déposé)</strong> : Déplacer une Entité sur la case disponible de votre choix.<br>
	  <strong>Clic simple :</strong> Voir les cibles de l'Entité.<br>
	  <strong>Double clic :</strong> Information sur l'Entité.<br><strong>Molette avant/arriére :</strong> Changer l'angle de vue.</p><br>
      <span class="title-3"> VIII - ASTUCES</span>
      <div class="help"><p>• Attribuer le <strong>bon rôle</strong> à la <strong>bonne Entité</strong>, au <strong>bon moment</strong> est la clef pour gagner la partie.<br>N'hésitez pas à <strong>déplacer</strong> vos troupes <strong>pendant la bataille</strong>. Vous pouvez également échanger la place de deux Entités (swap).</p></div>
	   <div class="help"><p>• Il n'est pas possible de controler directement le ciblage d'une Entité, mais avec un <strong>placement astucieux</strong>, il est possible de l'influencer, voire de le <strong>prévoir</strong>.</p></div>
	   <div class="help"><p>• Vous pouvez voir les cibles en temps réel de chaque Entité en clicant dessus. Si c'est un attaquant, ses cibles apparaitront en rouge si c'est un support, elles apparaitrons en bleux, si c'est un invocateur, vous verrez les cases qu'il peut cibler. </p></div>
	   <img src="./media/assets/ui/tuto-cible.jpg" class="image-tuto-role" alt="image explicative de la selection du ciblage">
	   <div class="help"><p>• N'oubliez pas que le Lord est un véritable électron libre, qui pourra potentiellement <strong>changer de cible à chaque tour</strong>, pour attaquer l'Entité adverse <strong>la plus dangereuse</strong> pour son équipe.</p></div>
	   <div class="help"><p>• Certaines Entités, comme les Invocateurs, necessiteront des actions en temps réel de votre part (comme récolter des ressources) <strong> alors soyez réactif.</p></div>
    </div>
  </div>
</div>`;
}


// -----------------------------------------------------------------------------
// Power explanations
// -----------------------------------------------------------------------------

export const POWER_RATE_HELPER_TEXT = {
  summonLimit: 'Invocation recursive ou limite de parcours atteinte : contribution descendante non evaluee.',
  profanation: 'Un cadavre disponible ; une invocation ; présence jusqu’à la fin des 60 secondes. Moyenne des archétypes admissibles.',
  jarret: 'Chaque jarret sain est consommé par une cible blessée ; 15 % de jarrets pourris, poison exclu.',
  entity: 'Potentiel théorique : toutes les attaques possédées, priorités automatiques, cibles valides sans résistance, sans overheal ni overkill.',
};

export function buildPowerRateAssumption(kind, label, message) {
  if (kind === 'secondary') return `${label} : composante secondaire non chiffree, forfait provisoire ; impact direct evalue separement.`;
  if (kind === 'targetDependent') return `${label} : effet dependant de la cible, evalue au forfait hors degats/soins directs.`;
  if (kind === 'error') return `${label} : ${message}. Évaluation au forfait.`;
  return '';
}

export function buildEntityRateHelper(rates) {
  return `${rates.convention} Hors soins passifs et effets dépendant de la cible.\n${rates.assumptions.map(entry => entry.convention).join('\n')}`;
}

export const POWER_HELPER_LABELS = {
  dps: 'DPS intrinsèque', hps: 'HPS intrinsèque', equipment: 'Prime équipement',
  equippedItem: 'Équipement', additionalAttack: 'Attaques supplémentaires',
  resurrectionSpell: 'Résurrection par sort', itemRez: 'Résurrection par objet',
  attackEffect: 'Effet non mesuré', entity: 'Entité', rounding: 'Ajustement d’arrondi', scoreCap: 'Plafond du score',
  summonPotential: 'Potentiel intrinsèque des invocations (hors DPS/HPS)', summonTactical: 'Socles et tactique des invocations',
};

export function buildPowerUncertaintyHelper(rates, { roundPower }) {
  if (!rates) return [];
  const lines = [];
  for (const assumption of rates.assumptions || []) {
    if (assumption.convention) lines.push(assumption.convention);
    if (assumption.samples) {
      lines.push(`${assumption.samples} profils : DPS ${roundPower(assumption.dpsMin)} à ${roundPower(assumption.dpsMax)} ; écart-type ${roundPower(assumption.dpsDeviation)}.`);
    }
  }
  if (rates.unmeasured?.length) lines.push(`Effets évalués au forfait : ${rates.unmeasured.join(', ')}.`);
  if (rates.requestedDurationMs > rates.durationMs) lines.push('Horizon borné : le débit est normalisé sur la durée réellement évaluée.');
  return lines;
}

export function buildPowerBreakdownHelper(result, context) {
  const { roundPower, powerLabels, metadata, describePowerUncertainty, TACTICAL_RULES } = context;
  if (!result) return [];
  const lines = [
    `Power : ${roundPower(result.score)}`,
    `Niveau équivalent : ${result.equivalentLevel}`,
    `Bonus : ${result.positiveScore} ; malus : ${result.negativeScore}`,
    `Barème provisoire v${result.version}`,
  ];
  if (result.categories) lines.push(`Attaque : ${result.categories.attack} ; défense : ${result.categories.defense} ; utilitaire : ${result.categories.utility}`);
  for (const detail of result.details || []) {
    if (detail.tactical) {
      const row = detail.tactical;
      lines.push(`${row.keyword} : socle ${row.floor} + base ${roundPower(row.basis)} × ${row.coefficient} = ${detail.score}`);
      for (const path of row.sources) lines.push(`  Source : ${path.join(' > ')}`);
      continue;
    }
    const label = powerLabels[detail.stat] || metadata.get(detail.stat)?.name || detail.stat;
    const quantity = roundPower(detail.quantity);
    const unit = detail.unit === 'percent' ? ' %' : '';
    const fallback = detail.fallback ? ` [repli : ${(detail.path || []).join(' > ')}]` : '';
    lines.push(`${label} : ${quantity}${unit} × ${roundPower(detail.coefficient)} = ${roundPower(detail.score)}${fallback}`);
    if (detail.breakdown) lines.push(...buildPowerBreakdownHelper(detail.breakdown, context).map(line => `  ${line}`));
  }
  if (result.rates) {
    lines.push(`DPS : ${roundPower(result.rates.dps)} ; HPS : ${roundPower(result.rates.hps)}`);
    if (result.rates.incomplete) lines.push('Estimation partielle : consulter les effets non évalués.');
    lines.push(...describePowerUncertainty(result.rates));
  }
  for (const diagnostic of (result.rates?.tactical || result.tactical)?.diagnostics || []) lines.push(`Tactique partielle : ${diagnostic.reason} (${diagnostic.path.join(' > ')}).`);
  if (result.saturated) lines.push(`Score plafonné à ${TACTICAL_RULES.maxScore}.`);
  return lines;
}

