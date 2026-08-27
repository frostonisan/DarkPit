export const attackEffects = [
  {
    effectId: 'ae0',
    effectDisplay: 'Aucun effet',
    effectName: 'none',
    effectDuration: 0,
    effectDot: 0,
	effectProjectile: 'none',
   
  },{
    effectId: 'ae1',
    effectDisplay: 'Poison',
    effectName: 'poison',
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
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'heal-fx',
 },{
    effectId: 'ae4',
    effectDisplay: 'Résurrection',
    effectName: 'rez',
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'rez-fx',
},{
    effectId: 'ae5',
    effectDisplay: 'Invocation Jarret juteux',
    effectName: 'summonJarret',
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
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'deadshot-fx',
  },{
    effectId: 'ae8',
    effectDisplay: 'lifesteal',
    effectName: 'lifesteal',
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
    effectDuration: 0, // en secondes
	effectDot: 0, // Total des Dégâts à infliger sur la durée effectDuration
	effectFlat:0,
	effectStack: 0,
	effectProjectile: 'heal-fx',
	effectMagicalRatio: 0.5 ,
  }
];