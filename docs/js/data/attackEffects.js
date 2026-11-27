import { burnRules, EFFECT_APPLICATION_MODES } from "../combat/effectRules.js";
import { stats as STAT_CATALOG, STAT_KEY_ALIASES } from './statsData.js';
export { EFFECT_APPLICATION_MODES };
export const attackEffects = [
  {
    effectId: 'ae0',
    effectDisplay: 'Aucun effet',
    effectName: 'none',
    tacticalConsequence: [],
    tacticalVisualOnly: true,
    effectDuration: 0,
    effectDot: 0,
	effectProjectile: 'none',
   
  },{
    effectId: 'ae1',
    effectDisplay: 'Poison',
    effectName: 'poison',
    effectDescription: 'Empoisonne pendant {effectDuration} secondes, avec un tick toutes les {effectTickInterval} secondes.',
    tacticalConsequence: [],
    effectDuration: 5, // en secondes
	effetFlat:0,
    effectDot: 15, // Total des dégâts à infliger sur la durée
    effectProjectile: 'poison-fx',
	effectPhysicalRatio: 'attacker', // Utilise directement stats.physicalDamage
    effectMagicalRatio: 0.5,        // 50 % de stats.magicalDamage
	type:['alteration'],
 },{
    effectId: 'ae2',
    effectDisplay: 'Brûlure',
    effectName: 'brulure',
    effectDescription: 'Ajoute {effectDot} dégâts par tick au feu collectif. Jusqu’à {effectStack} apports de cette provenance. Un tick toutes les {effectTickInterval} secondes ; chaque apport entretient le feu pendant {effectDuration} secondes.',
    tacticalConsequence: [],
    effectDuration: 15, // en secondes
	effectDot: 5, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 5,
	effectProjectile: 'brulure-fx',
	type:['alteration'],
  },{
    effectId: 'ae3',
    effectDisplay: 'Soin',
    effectName: 'heal',
    tacticalConsequence: ['direct'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'heal-fx',
 },{
    effectId: 'ae4',
    effectDisplay: 'Résurrection',
    effectName: 'rez',
    tacticalConsequence: ['direct'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'rez-fx',
},{
    effectId: 'ae5',
    effectDisplay: 'Invocation Jarret juteux',
    effectName: 'summonJarret',
    tacticalConsequence: ['direct'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'jarret-fx',
	summonType: 'summon-consommable',
	effectSummon: 'jarret-summon',
},{
    effectId: 'ae6',
    effectDisplay: 'Invocation d\'un amas de chair profanée',
    effectName: 'summonProfanation',
    tacticalConsequence: ['direct'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'profanation-fx',
	summonType: 'summon-presence',
	effectSummon: 'ama-profane-summon',
  },{
    effectId: 'ae7',
    effectDisplay: 'Projectil Dead Shot',
    effectName: 'deadshotfx',
    tacticalConsequence: [],
    tacticalVisualOnly: true,
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'deadshot-fx',
  },{
    effectId: 'ae8',
    effectDisplay: 'lifesteal',
    effectName: 'lifesteal',
    tacticalConsequence: ['direct'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'heal-fx',
	effectMagicalRatio: 0.5 ,
  },{
    effectId: 'ae9',
    effectDisplay: 'itemHeal',
    effectName: 'itemHeal',
    tacticalConsequence: ['direct', 'soin', 'proportionnel'],
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'heal-fx',
	effectMagicalRatio: 0.5 ,
  },{
    effectId: 'ae11', effectName: 'grab', effectDisplay: 'Grab',
    effectIcon: './media/assets/ui/picto-grab.svg',
    type: ['entrave'], forcedMovement: true,
    effectDistance: 5, effectDuration: 0, effectDot: 0, effectProjectile: 'none',
    effectDescription: 'Attire la cible de {effectDistance} cases vers l’attaquant, sur la case libre la plus proche accessible dans cette distance. Le déplacement fait reculer la préparation ou l’exécution de {effectMovementRecoilPercent} points de pourcentage.',
    tacticalConsequence: ['direct', 'deplacement_entite'],
  },{
    effectId: 'ae12', effectName: 'lourdeur', effectDisplay: 'Lourdeur',
    type: ['alteration', 'entrave'], increasesMovementCost: true,
    effectWeightPercent: 50, effectDuration: 30, effectDot: 0, effectProjectile: 'none',
    effectDescription: 'Augmente le poids de la cible de {effectWeightPercent} % pendant {effectDuration} secondes.',
    tacticalConsequence: ['temporaire', 'proportionnel'],
  },{
    effectId: 'ae13', effectName: 'immobilisation', effectDisplay: 'Immobilisation',
    type: ['entrave'], blocksMovement: true,
    effectDuration: 5, effectDot: 0, effectProjectile: 'none',
    effectDescription: 'Empêche le déplacement volontaire pendant {effectDuration} secondes. Les attaques et capacités continuent normalement.',
    tacticalConsequence: ['temporaire', 'deplacement_entite'],
  },{
    effectId: 'ae14', effectName: 'stun', effectDisplay: 'Stun',
    type: ['alteration'], effectVisual: './media/assets/effects/stun.gif',
    effectDuration: 5, effectDot: 0, effectProjectile: 'none',
    effectDescription: 'Suspend les timings d’action pendant {effectDuration} secondes, puis reprend leur progression. Le déplacement reste possible.',
    tacticalConsequence: ['temporaire', 'blocage_total'],
  },{
    effectId: 'ae15', effectName: 'silence', effectDisplay: 'Silence',
    type: ['alteration'], effectDuration: 3, effectDot: 0, effectProjectile: 'none',
    effectDescription: 'Interrompt la préparation et remet le sort interrompu en cooldown complet. Empêche tout nouveau lancement pendant {effectDuration} secondes. Le tour et les cooldowns continuent. À la fin, une capacité disponible est choisie selon les priorités et se prépare depuis zéro. Les attaques déjà parties poursuivent leur résolution.',
    tacticalConsequence: ['temporaire', 'blocage_total'],
  }
];

export const EFFECT_TYPES = Object.freeze({ alteration: 'Altération d’état', entrave: 'Entrave' });

const duration = value => ({ label: 'Durée', unit: 's', default: value, min: 0 });
const percent = (label, value) => ({ label, unit: '%', default: value, min: 0, max: 100 });
const count = (label, value) => ({ label, unit: '', default: value, min: 0, integer: true });
const defaultRecoilPercent = 20;
export const EFFECT_PARAMETER_SCHEMAS = {
  gigantisme: { effectDuration: duration(10), effectSize: { label: 'Taille occupée', unit: 'cases', default: 3,
    choices: { 2: '2 cases', 3: '3 cases', 6: '6 cases' } } },
  immobilisation: { effectDuration: duration(5) }, stun: { effectDuration: duration(5) },
  silence: { effectDuration: duration(3) }, interruption: {},
  exaust: {},
  dephasage: { effectAmount: percent('Recul des timings', 10) },
  corruptionPrismatique: { effectAmount: { label: 'PV maximum retirés', unit: '', default: 10, min: 0 } },
  bafouillage: { effectDuration: duration(5), effectSlowPercent: percent('Réduction de vitesse de préparation', 25) },
  lenteur: { effectDuration: duration(5), effectSlowPercent: percent('Réduction de vitesse de tour', 25) },
  folie: { effectDuration: duration(8) },
  insolence: { effectDuration: duration(8),
    effectMinInterval: { ...duration(1), label: 'Espacement minimum des actions', min: 0.05 },
    effectMaxInterval: { ...duration(3), label: 'Espacement maximum des actions', min: 0.05 },
    effectPriorityWeight: count('Poids du changement de priorité', 1), effectActivationWeight: count('Poids du changement d’activation', 1),
  },
  confusion: { effectDuration: duration(5), effectMoveInterval: { ...duration(1), label: 'Intervalle des déplacements', min: 0.05 },
    effectMovementRecoilPercent: percent('Déstabilisation du déplacement', defaultRecoilPercent) },
  charme: { effectDuration: duration(5) }, effroi: { effectDuration: duration(5) },
  sommeil: { effectDuration: duration(5), effectWakeBase: percent('Chance de réveil de base', 10),
    effectWakeRatio: { label: 'Coefficient des HP perdus', unit: '', default: 1, min: 0 },
    effectWakeMovement: percent('Chance de réveil ajoutée par déplacement subi', 10) },
  grab: { effectDistance: { ...count('Distance', 5), unit: 'cases' },
    effectMovementRecoilPercent: percent('Déstabilisation du déplacement', defaultRecoilPercent) },
  lourdeur: { effectDuration: duration(30), effectWeightPercent: { label: 'Augmentation du poids', unit: '%', default: 50, min: 0 } },
};
for (const name of ['poison', 'brulure']) {
  const base = attackEffects.find(effect => effect.effectName === name);
  EFFECT_PARAMETER_SCHEMAS[name] = {
    ...(name === 'poison' ? { effectDuration: duration(base.effectDuration),
      effectTickInterval: { ...duration(1), label: 'Intervalle des ticks', min: 0.05 } } : {}),
    effectDot: { label: name === 'brulure' ? 'Dégâts par tick ajoutés' : 'Dégâts périodiques de base', unit: '', default: base.effectDot, min: 0 },
    ...(name === 'poison' ? {
      effectPhysicalRatio: { label: 'Ratio de puissance physique', unit: '', default: base.effectPhysicalRatio === 'attacker' ? 1 : Number(base.effectPhysicalRatio || 0), min: 0 },
      effectMagicalRatio: { label: 'Ratio de puissance magique', unit: '', default: Number(base.effectMagicalRatio || 0), min: 0 },
    } : { effectStack: { ...count('Cumul maximum', base.effectStack), min: 1 } }),
  };
}
const additions = [
  ['exaust', 'Exaust', ['entrave'], 'Retire un mouvement actuel, sans descendre sous zéro. Soumis aux protections contre les entraves.'],
  ['dephasage', 'Déphasage', ['alteration'], 'Fait reculer les timings actifs de {effectAmount} points de pourcentage : tour, préparation, exécution hors projectile et récupération. La résilience réduit le recul.'],
  ['corruptionPrismatique', 'Corruption prismatique', ['alteration'], 'Retire {effectAmount} PV maximum pendant 20 secondes. Les malus s’additionnent et renouvellent la durée. Ne peut pas tuer. À expiration, les PV maximum reviennent sans soin. La résilience réduit le montant retiré.'],
  ['gigantisme', 'Gigantisme', ['entrave'], 'Agrandit la cible jusqu’à {effectSize} cases pendant {effectDuration} secondes. Ne modifie aucune statistique.'],
  ['interruption', 'Interruption', ['alteration'], 'Interrompt la préparation en cours. La prochaine préparation recommence à zéro.'],
  ['bafouillage', 'Bafouillage', ['alteration'], 'Réduit la vitesse de préparation de {effectSlowPercent} % pendant {effectDuration} secondes.'],
  ['lenteur', 'Lenteur', ['alteration'], 'Réduit la vitesse du tour de {effectSlowPercent} % pendant {effectDuration} secondes.'],
  ['folie', 'Folie', ['alteration'], 'Brouille le ciblage pendant {effectDuration} secondes : toute entité peut être choisie, y compris une cible incompatible. Le sort conserve ses règles et peut échouer.'],
  ['insolence', 'Insolence', ['alteration'], 'Modifie aléatoirement une priorité ou une activation à la fois pendant {effectDuration} secondes, toutes les {effectMinInterval} à {effectMaxInterval} secondes. Les actions manuelles restent possibles.'],
  ['confusion', 'Confusion', ['entrave'], 'Impose un déplacement aléatoire toutes les {effectMoveInterval} secondes pendant {effectDuration} secondes. Chaque déplacement fait reculer la préparation ou l’exécution de {effectMovementRecoilPercent} points de pourcentage.'],
  ['charme', 'Charme', ['alteration'], 'Change le camp de l’entité pendant {effectDuration} secondes.'],
  ['effroi', 'Effroi', ['entrave'], 'Impose une fuite pendant {effectDuration} secondes.'],
  ['sommeil', 'Sommeil', ['alteration', 'entrave'], 'Suspend les actions, les déplacements volontaires, les cooldowns et les déclenchements aléatoires pendant {effectDuration} secondes. Les déplacements imposés restent possibles. Chance de réveil par impact : {effectWakeBase} % + {effectWakeRatio} × le pourcentage de HP perdus par rapport aux HP avant le dégât + {effectWakeMovement} points par déplacement subi, au maximum 100 %. Un seul jet après les dégâts et déplacements ; aucun jet sans perte de HP ni déplacement.'],
];
for (const [effectName, effectDisplay, type, effectDescription] of additions) {
  attackEffects.push({ effectId: `control-${effectName}`, effectName, effectDisplay, type, effectDescription,
    effectDuration: 0, effectDot: 0, effectProjectile: 'none',
    tacticalConsequence: effectName === 'interruption' ? ['direct'] : ['temporaire'],
    ...(effectName === 'sommeil' ? { blocksMovement: true } : {}) });
}
for (const effect of attackEffects) {
  effect.applicationMode ??= effect.effectName === 'brulure' ? 'cumul'
    : ['folie', 'charme', 'insolence'].includes(effect.effectName) ? 'replace' : 'refresh';
  for (const [key, schema] of Object.entries(EFFECT_PARAMETER_SCHEMAS[effect.effectName] || {})) {
    if (effect[key] == null || typeof effect[key] !== 'number') effect[key] = schema.default;
  }
  // New timed effects use their declared default, rather than the instantaneous placeholder.
  if (additions.some(([name]) => name === effect.effectName) && EFFECT_PARAMETER_SCHEMAS[effect.effectName].effectDuration)
    effect.effectDuration = EFFECT_PARAMETER_SCHEMAS[effect.effectName].effectDuration.default;
}

/** Resolve a fresh snapshot; categories belong to effects, never to attack damage natures. */
export function getAttackEffectDefinition(name) {
  const existing = attackEffects.find(effect => effect.effectName === name);
  if (existing) return existing;
  const match = /^(bonus|malus)-(.+)$/.exec(String(name));
  if (!match) return null;
  const stat = STAT_CATALOG.find(row => row.key === match[2]);
  // Consumable lives need a resource grant, not a temporary stat modifier.
  if (!stat || ['eternalLife', 'fadedLife'].includes(stat.key)) return null;
  const statKey = STAT_KEY_ALIASES[stat.key] || stat.key;
  const bonus = match[1] === 'bonus';
  const sign = (bonus ? 1 : -1) * (['speed', 'weight'].includes(statKey) ? -1 : 1);
  const timingNames = { attackCooldownReduc: 'Réduction du cooldown', attackPreparationReduc: 'Réduction de préparation',
    attackExecutionReduc: 'Réduction d’exécution', attackRecoveryReduc: 'Réduction de récupération', attackProjectileSpeed: 'Vitesse des projectiles' };
  const label = timingNames[statKey] || stat.name || stat.key;
  const effect = { effectId: name, effectName: name, effectDisplay: `${bonus ? 'Bonus' : 'Malus'} de ${label}`,
    effectDescription: `${sign > 0 ? 'Augmente' : 'Réduit'} ${label} de {effectValue} {effectUnit} pendant {effectDuration} secondes.`,
    statKey, statVisual: stat.key, modifierSign: sign, beneficial: bonus,
    type: bonus ? [] : ['alteration', ...(['weight', 'shift'].includes(statKey) ? ['entrave'] : [])],
    effectDuration: 10, effectValue: 10, effectModifierMode: 'flat', effectUnit: 'points', effectDot: 0,
    effectProjectile: 'none', applicationMode: 'refresh', tacticalConsequence: ['temporaire', bonus ? 'renforcement' : 'affaiblissement'] };
  EFFECT_PARAMETER_SCHEMAS[name] = {
    effectDuration: duration(10),
    effectModifierMode: { label: 'Unité du montant', unit: '', default: 'flat', choices: { flat: 'Points', percent: 'Pourcentage' } },
    effectValue: { label: 'Montant', unit: '', default: 10, min: 0 },
  };
  attackEffects.push(effect);
  return effect;
}

export function listAttackEffects() {
  // Lazy: the stat catalogue and its helper imports finish loading first.
  for (const stat of STAT_CATALOG) for (const mode of ['bonus', 'malus']) getAttackEffectDefinition(`${mode}-${stat.key}`);
  return attackEffects;
}

export function resolveAttackEffects(attack) {
  const resolve = (names, overrides) => [...new Set(names || [])].filter(name => name !== 'none').flatMap(name => {
    const definition = getAttackEffectDefinition(name);
    if (!definition) return [];
    const effect = { ...definition, parameterFormulas: {} };
    const mode = overrides?.[name]?.applicationMode;
    if (effectApplicationModes(name).includes(mode)) effect.applicationMode = mode;
    if (name === 'brulure') {
      effect.effectDuration = burnRules().maintenanceSeconds;
      effect.effectTickInterval = burnRules().tickSeconds;
    }
    for (const key of Object.keys(EFFECT_PARAMETER_SCHEMAS[name] || {})) {
      const value = overrides?.[name]?.[key];
      if (value == null) continue;
      const schema = EFFECT_PARAMETER_SCHEMAS[name][key];
      if (schema.choices) effect[key] = Object.hasOwn(schema.choices, value) ? (typeof schema.default === 'number' ? Number(value) : value) : schema.default;
      else if (typeof value === 'object') effect.parameterFormulas[key] = structuredClone(value);
      else if (Number.isFinite(Number(value))) effect[key] = Number(value);
    }
    effect.type = [...new Set([].concat(effect.type || []))];
    return [effect];
  });
  attack.resolvedEffects = resolve(attack.effets, attack.effectOverrides);
  attack.resolvedSelfEffects = resolve(attack.selfEffects, attack.selfEffectOverrides);
  attack.effectTypes = [...new Set(attack.resolvedEffects.flatMap(effect => effect.type))];
  attack.selfEffectTypes = [...new Set(attack.resolvedSelfEffects.flatMap(effect => effect.type))];
  return attack;
}

export function getAttackEffect(attack, name, { self = false } = {}) {
  const snapshot = self ? attack?.resolvedSelfEffects : attack?.resolvedEffects;
  if (Array.isArray(snapshot)) return snapshot.find(effect => effect.effectName === name);
  return attack ? resolveAttackEffects({ ...attack })[self ? 'resolvedSelfEffects' : 'resolvedEffects']
    .find(effect => effect.effectName === name) : getAttackEffectDefinition(name);
}

export function describeAttackEffect(effect) {
  return String(effect.effectDescription || effect.effectDisplay || effect.effectName)
    .replace(/\{(\w+)\}/g, (_, key) => typeof effect[key] === 'number'
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(effect[key]) : String(effect[key] ?? ''));
}

// Burn is always the shared fire. Other timed effects retain their own provenance
// or explicitly replace the previous applications of that same effect.
export function effectApplicationModes(name) {
  return name === 'brulure' ? ['cumul'] : EFFECT_PARAMETER_SCHEMAS[name]?.effectDuration ? ['refresh', 'replace'] : [];
}
