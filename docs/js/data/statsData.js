import { STAT_HELPER_DESCRIPTIONS } from './helpers.js';

// Pool capacities are catalogue data, available before entity enrichment starts.
export const BOOSTABLE_POOL_STAT_KEYS = new Set(["HP", "armor", "extraLife", "shift"]);

// Stat naming is catalogue data, independent of entity/UI initialization.
export const STAT_KEY_ALIASES = Object.freeze({
  cooldownTime: "attackCooldownReduc",
  preparationTime: "attackPreparationReduc",
  executionTime: "attackExecutionReduc",
  recuperationTime: "attackRecoveryReduc",
  recoveryTime: "attackRecoveryReduc",
  projectileTime: "attackProjectileSpeed",
  projectilSpeed: "attackProjectileSpeed",
  piercingPower: "piercingDamage",
  MagicDamage: "magicalDamage",
  fracass: "brutality-old",
  fracassante: "brutality-old",
  intellect: "psionic",
  psionique: "psionic",
});

export const STAT_KEY_DISPLAY = Object.freeze({
  attackCooldownReduc: "cooldownTime",
  attackPreparationReduc: "preparationTime",
  attackExecutionReduc: "executionTime",
  attackRecoveryReduc: "recuperationTime",
  attackProjectileSpeed: "projectileTime",
  rangeAttackTranspiercing: "transpiercingDamage",
  transpiercingPower: "transpiercingDamage",
  "brutality-old": "fracass",
  psionic: "psionic",
});


// ambiant : texte du footer du helper ; une chaîne vide masque ce footer.
export const stats = [
  // ===== FORCE =====
  { 
    name: "Vigueur",  
    key: "vigueur",  
    attribut: "force",  
	adjectif:"costaud",
	nature:"umbra",
    type: "attaque-1",  
    description: STAT_HELPER_DESCRIPTIONS["vigueur"],
    ambiant: "La force prend forme dans chaque geste, avant de s’abattre sans détour."
  },{ 
    name: "Brutalité",  
    key: "brutality", 
	adjectif:"",
	nature:"umbra",	
    attribut: "force",  
    type: "attaque-2",  
    description: STAT_HELPER_DESCRIPTIONS["brutality"],
    ambiant: "Sous le fracas du coup, la défense cède avant la chair."
  },{ 
    name: "Fureur Sanguinaire",  
    key: "bloodFury", 
	adjectif:"sanguinaire",
	nature:"umbra",	
    attribut: "force",  
    type: "attaque-3",  
    description: STAT_HELPER_DESCRIPTIONS["bloodFury"] 
  },{ 
    name: "Constitution",  
    key: "constitution", 
	adjectif:"charpentée",
	nature:"umbra",	
    attribut: "force",  
    type: "defense-1",  
    description: STAT_HELPER_DESCRIPTIONS["constitution"],
    ambiant: "La chair tient bon là où le choc voudrait la faire céder."
  },{ 
    name: "Robustesse",  
    key: "robustness",  
	adjectif:"robuste",
	nature:"umbra",
    attribut: "force",  
    type: "defense-2",  
    description: STAT_HELPER_DESCRIPTIONS["robustness"],
    ambiant: "À l’aube, le rempart se reforme." 
  },{ 
    name: "Indestructibilité",
    key: "indestructibility", 
	adjectif:"indestructible",
	nature:"umbra",	
    attribut: "force",  
    type: "defense-3",  
    description: STAT_HELPER_DESCRIPTIONS["indestructibility"],
    ambiant: "Sous les plaies, quelque chose demeure intact."
  },{ 
    name: "Vitalité",  
    key: "vitality",
	adjectif:"vitalisée",	
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-1",  
    description: STAT_HELPER_DESCRIPTIONS["vitality"] 
  },{ 
    name: "Résilience",  
    key: "resilience", 
	adjectif:"résiliente",
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-2",  
    description: STAT_HELPER_DESCRIPTIONS["resilience"],
    ambiant: "Plier sous le choc, puis retrouver son équilibre."
  },{ 
    name: "Maîtrise d'arme",  
    key: "weaponMastery",
	adjectif:"experte",
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-3",  
    description: STAT_HELPER_DESCRIPTIONS["weaponMastery"] 
  },

  // ===== INTELLIGENCE =====
  { 
    name: "Esprit",  
    key: "esprit", 
    adjectif:"puissante",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "attaque-1",  
    description: STAT_HELPER_DESCRIPTIONS["esprit"],
    ambiant: "L’esprit façonne l’invisible, jusqu’à lui donner la force de frapper."
  },{ 
    name: "Inflexion",  
    key: "inflexion",
adjectif:"",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "attaque-2",  
    description: STAT_HELPER_DESCRIPTIONS["inflexion"],
    ambiant: "La magie trouve un passage là où l’esprit croyait avoir tout fermé."
  },{ 
    name: "Hypercognition",  
    key: "hypercognition",  
	adjectif:"hyper-puissante",
	nature:"umbra",
    attribut: "intelligence", 
    type: "attaque-3",  
    description: STAT_HELPER_DESCRIPTIONS["hypercognition"]
  },{ 
    name: "Intégrité",  
    key: "integrite",  
	adjectif:"",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-1",  
    description: STAT_HELPER_DESCRIPTIONS["integrite"],
    ambiant: "Un esprit qui se connaît ne se laisse pas défaire par la magie."
  },{ 
    name: "Astralité",  
    key: "astrality",  
	adjectif:"astrale",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-2",  
    description: STAT_HELPER_DESCRIPTIONS["astrality"],
    ambiant: "Entre deux mondes, la vie retient encore son souffle."
  },{ 
    name: "Transcendance",  
    key: "transcendence",  
	adjectif:"transcendée",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-3",  
    description: STAT_HELPER_DESCRIPTIONS["transcendence"],
    ambiant: "L’âme connaît désormais le chemin du retour."
  },{ 
    name: "Hâte",  
    key: "haste",  
	adjectif:"hâtive",
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-1",  
    description: STAT_HELPER_DESCRIPTIONS["haste"] 
  },{ 
    name: "Équilibre",  
    key: "equilibre",  
	adjectif:"équilibrée",
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-2",  
    description: STAT_HELPER_DESCRIPTIONS["equilibre"],
    ambiant: "Au cœur du tumulte, l’esprit immobile perçoit ce qui se dérobe."
  },{ 
    name: "Mysticisme",  
    key: "mysticism",
	adjectif:"mystique",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-3",  
    description: STAT_HELPER_DESCRIPTIONS["mysticism"],
    ambiant: "Quand le monde se tait, une puissance ancienne répond."
  },

  // ===== AGILITÉ =====
  { 
    name: "Finesse",  
    key: "finesse", 
	nature:"umbra",	
	adjectif:"perçante",
    attribut: "agilite",  
    type: "attaque-1",  
    description: STAT_HELPER_DESCRIPTIONS["finesse"],
    ambiant: "La voix de l’agilité commence par une grande compréhension de la subtilité."
  },{ 
    name: "Puissance critique",  
    key: "criticalPower", 
	adjectif:"pernicieuse",
	nature:"umbra",	
    attribut: "agilite",  
    type: "attaque-2",  
    description: STAT_HELPER_DESCRIPTIONS["criticalPower"],
    ambiant: "Un instant suffit pour frapper là où tout vacille."
  },{ 
    name: "Ambidextrie",  
    key: "ambidextry",  
	adjectif:"agile à droite comme à gauche",
	nature:"umbra",
    attribut: "agilite",  
    type: "attaque-3",  
    description: STAT_HELPER_DESCRIPTIONS["ambidextry"],
    ambiant: "Une main détourne le regard ; l’autre porte déjà le coup."
  },{ 
    name: "Adresse",  
    key: "adresse",
	adjectif:"adroitement insaisissable",	
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-1",  
    description: STAT_HELPER_DESCRIPTIONS["adresse"],
    ambiant: "Un pas suffit, lorsque le corps sait déjà où le coup va tomber."
  },{ 
    name: "Ésotérisme",  
    key: "esoterism",  
	adjectif:"ésotérique",
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-2",  
    description: STAT_HELPER_DESCRIPTIONS["esoterism"],
    ambiant: "Les signes oubliés murmurent, et la magie perd de sa morsure."
  },{ 
    name: "Occultisme",  
    key: "occultism",  
	adjectif:"confiante en ses capacité de disparition",
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-3",  
    description: STAT_HELPER_DESCRIPTIONS["occultism"],
    ambiant: "L’ombre cache le geste jusqu’à ce qu’il soit trop tard."
  },{ 
    name: "Vision",
    key: "vision",
	adjectif:"précise",
	nature:"umbra",	
    attribut: "agilite",   
    type: "utilitaire-1",  
    description: STAT_HELPER_DESCRIPTIONS["vision"],
    ambiant: "Le regard trouve la faille avant que le geste ne s’élance."
  },{ 
    name: "Vivacité",  
    key: "vivacite",  
	adjectif:"éxitée",
	nature:"umbra",
    attribut: "agilite",  
    type: "utilitaire-2",  
    description: STAT_HELPER_DESCRIPTIONS["vivacite"],
    ambiant: "Le combat bat son rythme ; le corps garde un temps d’avance."
  },{ 
    name: "Mouvement",  
    key: "movement",
	adjectif:"mobile",	
	nature:"umbra",
    attribut: "agilite",  
    type: "utilitaire-3",  
    description: STAT_HELPER_DESCRIPTIONS["movement"] 
  },

  // ===== SPÉCIAUX =====
  { name: 'Survie fatale', key: 'fatalSurvival', nature: 'statistic', attribut: null, type: 'special',
    description: STAT_HELPER_DESCRIPTIONS.fatalSurvival },
  { name: 'Corps astral', key: 'astralBody', nature: 'statistic', attribut: null, type: 'special',
    uniquePassive: true, description: STAT_HELPER_DESCRIPTIONS.astralBody },
  {
    name: "Puissance physique",  
    key: "physicalDamage",  
	adjectif:"costaud",
	nature:"statistic",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["physicalDamage"]
  },{
    name: "Puissance magique",  
    key: "magicalDamage",  
    adjectif:"puissante",	
    nature:"statistic",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["magicalDamage"]
  },{
    name: "Puissance Perçante",  
    key: "piercingDamage", 
    nature:"statistic",	
    adjectif:"perçante",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["piercingDamage"]
  },{
    name: "Pénétration physique",  
    key: "physicalPen", 
    adjectif:"",
    nature:"statistic",	
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["physicalPen"] 
  },{
    name: "Pénétration magique",  
    key: "magicalPen",
    adjectif:"",	
    nature:"statistic",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["magicalPen"] 
  },{
    name: "Résistance physique",  
    key: "physicalResistance", 
    adjectif:"charpentée",
    nature:"statistic",	
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["physicalResistance"] 
  },{
    name: "Résistance magique",  
    key: "magicalResistance",  
    adjectif:"",
    nature:"statistic",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["magicalResistance"] 
  },{
    name: "Vélocité",  
    key: "velocity",  
    adjectif:"éxitée",
    nature:"statistic",
    attribut: null,
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["velocity"] 
  },{
    name: "Esquive",
    key: "dodge",
    adjectif:"agaçante à attraper",
    nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["dodge"]
  },{
    name: "Fracassante",
    key: "fracass",
    adjectif:"fracassante",
    nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["fracass"]
  },{
    name: "Points de Vie",
    key: "HP",
	adjectif:"costaud",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["HP"]
  },{
    name: "Armure",
    key: "armor",
	adjectif:"blindée",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["armor"]
  },{ 
  name: "Poids",  
  key: "weight", 
  adjectif:"massive",
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["weight"] 
},{
    name: "Vitesse",
    key: "speed",
	adjectif:"rapide",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["speed"]
  },{
    name: "Dégâts hybrides",
    key: "hybridalDamage",
	adjectif:"versatile",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["hybridalDamage"]
 },{
    name: "Vie Éternelle",
    key: "eternalLife",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["eternalLife"]
 },{ 
	name: "Vie supplémentaire",
    key: "extraLife",
	nature:"statistic",
	attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["extraLife"]
  },{
	name: "Vie Fannée",
    key: "fadedLife",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["fadedLife"]
	   },{
    name: "Force",
    key: "strength",
	adjectif:"balaise",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["strength"]
  },{
    name: "Agilité",
    key: "agility",
	adjectif:"agile",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["agility"]
  },{
    name: "Intelligence",
    key: "intelligence",
	adjectif:"intellectuelle",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["intelligence"]
  },{
	name: "Volonté",
    key: "will",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["will"]
  },{
	name: "Attaque à distance",
    key: "rangeAttack",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["rangeAttack"]
   },{
	name: "Vol de vie",
    key: "lifesteal",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: STAT_HELPER_DESCRIPTIONS["lifesteal"]
   },{ 
    name: "Charge",  
    key: "charge",  
	nature:"statistic",
    attribut: "null",  
    type: "special",  
    description: STAT_HELPER_DESCRIPTIONS["charge"] 
	},{ 
  name: "Orfèvre armurier",  
  key: "weaponOrfevre",  
  nature: "statistic",
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["weaponOrfevre"] 
},{
  name: "Collectionneur de guerre",
  key: "weaponCollector",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["weaponCollector"]
},{ 
  name: "Soif de sang",  
  key: "bloodThirsty", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["bloodThirsty"] 
},{ 
  name: "Trailer",  
  key: "trailer", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["trailer"] 
},{ 
  name: "Marathonien",  
  key: "marathon", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["marathon"] 
},{ 
  name: "Régénération en combat",  
  key: "hpBattleRegen", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: STAT_HELPER_DESCRIPTIONS["hpBattleRegen"] 
},{ 
  name: "Régénération journalière",
  key: "dayHpRegen",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["dayHpRegen"]
},{
  name: "Déplacements",
  key: "shift",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["shift"]
},{
  name: "Explosion cognitive",
  key: "cognitiveExplosion",
  nature: "statistic",
  attribut: "intelligence",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["cognitiveExplosion"]
},{
  name: "Générateur cognitif",
  key: "cognitiveGenerator",
  nature: "statistic",
  attribut: "intelligence",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["cognitiveGenerator"]
},{
  name: "Transcendance totale",
  key: "transcendenceTotal",
  uniquePassive: true,
  nature: "statistic",
  attribut: "intelligence",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["transcendenceTotal"]
},{
  name: "Chance d'exécution",
  key: "bloodFuryExecutionChance",
  uniquePassive: true,
  umbraParameter: true,
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["bloodFuryExecutionChance"]
},{
  name: "Dégâts d'exécution",
  key: "bloodFuryExecutionDamage",
  uniquePassive: true,
  umbraParameter: true,
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["bloodFuryExecutionDamage"]
},{
  name: "Seuil d'exécution",
  key: "bloodFuryTargetThreshold",
  uniquePassive: true,
  umbraParameter: true,
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["bloodFuryTargetThreshold"]
},{
  name: "Précision",
  key: "precision",
  nature: "statistic",
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["precision"]
},{
  name: "Chance de critique",
  key: "criticalChance",
  nature: "statistic",
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.criticalChance
},{
  name: "Dégâts critiques",
  key: "criticalDamage",
  nature: "statistic",
  uniquePassive: true,
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.criticalDamage
},{
  name: "Résistance aux critiques",
  key: "criticalResistance",
  nature: "statistic",
  attribut: "force",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.criticalResistance
},{
  name: "Résistance aux altérations",
  key: "alterationResistance",
  nature: "statistic",
  attribut: "force",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.alterationResistance
},{
  name: "Résistance aux entraves",
  key: "hindranceResistance",
  nature: "statistic",
  attribut: "force",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.hindranceResistance
},{
  name: "Résilience totale",
  key: "resilienceTotal",
  nature: "statistic",
  attribut: "force",
  type: "special",
  uniquePassive: true,
  description: STAT_HELPER_DESCRIPTIONS.resilienceTotal
},{
  name: "Présence équilibrée",
  key: "equilibreAggroBonus",
  nature: "statistic",
  attribut: "force",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.equilibreAggroBonus
},{
  name: "Réduction d’aggro",
  key: "equilibreAggroReduction",
  nature: "statistic",
  attribut: "intelligence",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.equilibreAggroReduction
},{
  name: "Perception équilibrée",
  key: "equilibreInvisibleDetection",
  nature: "statistic",
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.equilibreInvisibleDetection
},{
  name: "Attaque équilibrée",
  key: "equilibreBalancedAttackChance",
  nature: "statistic",
  attribut: "intelligence",
  type: "special",
  uniquePassive: true,
  description: STAT_HELPER_DESCRIPTIONS.equilibreBalancedAttackChance
},{
  name: "Vitesse contrôlée",
  key: "controlledSpeed",
  nature: "statistic",
  uniquePassive: true,
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS.controlledSpeed
},{
  name: "Bull’s Eye",
  key: "bullsEye",
  nature: "statistic",
  uniquePassive: true,
  attribut: "agilite",
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["bullsEye"]
},{
  name: "Durée de Cooldown",
  key: "cooldownTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["cooldownTime"]
},{
  name: "Durée de Préparation",
  key: "preparationTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["preparationTime"]
},{
  name: "Durée d'Exécution",
  key: "executionTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["executionTime"]
},{
  name: "Vitesse de Projectile",
  key: "projectileTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["projectileTime"]
},{
  name: "Durée de Récupération",
  key: "recuperationTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: STAT_HELPER_DESCRIPTIONS["recuperationTime"]
},
];


export const STAT_INDEX = stats.reduce((acc, s) => {
  const attribut = String(s.attribut ?? '').trim().toLowerCase();
  if (!attribut) return acc;

  if (!acc.byattribut[attribut]) acc.byattribut[attribut] = [];
  acc.byattribut[attribut].push(s.key);

  if (!acc.typeToKey[attribut]) acc.typeToKey[attribut] = {};
  acc.typeToKey[attribut][String(s.type).trim()] = s.key;
  return acc;
}, { byattribut: { force: [], agilite: [], intelligence: [] }, typeToKey: {} });
