export const stats = [
  // ===== FORCE =====
  { 
    name: "Puissance physique",  
    key: "physicalDamage",  
    attribut: "force",  
	adjectif:"costaud",
	nature:"umbra",
    type: "attaque-1",  
    description: "La Puissance Physique détermine les dégâts physiques des attaques. Réduits par la résistance physique."
  },{ 
    name: "Pénétration d’armure",  
    key: "physicalPen", 
	adjectif:"",
	nature:"umbra",	
    attribut: "force",  
    type: "attaque-2",  
    description: "Ignore un % de la résistance physique." 
  },{ 
    name: "Fureur Sanguinaire",  
    key: "bloodFury", 
	adjectif:"sanguinaire",
	nature:"umbra",	
    attribut: "force",  
    type: "attaque-3",  
    description: "Les dégâts infligés par des attaques au corps à corps soignent l'attaquant." 
  },{ 
    name: "Résistance physique",  
    key: "physicalResistance", 
	adjectif:"charpentée",
	nature:"umbra",	
    attribut: "force",  
    type: "defense-1",  
    description: "Réduit les dégâts physiques subis de <span class='physical'>X%</span>." 
  },{ 
    name: "Robustesse",  
    key: "robustness",  
	adjectif:"robuste",
	nature:"umbra",
    attribut: "force",  
    type: "defense-2",  
    description: "Octroie de l'armure à l'entité." 
  },{ 
    name: "Indestructibilité",
    key: "indestructibility", 
	adjectif:"indestructible",
	nature:"umbra",	
    attribut: "force",  
    type: "defense-3",  
    description: "Chance de nullifier totalement une source de dégâts." 
  },{ 
    name: "Vitalité",  
    key: "vitality",
	adjectif:"vitalisée",	
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-1",  
    description: "Augmente les HP max. Bonus actuel : <span class='vitality'>X HP</span>." 
  },{ 
    name: "Résilience",  
    key: "resilience", 
	adjectif:"résiliente",
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-2",  
    description: "Résiste aux altérations, réduit les critiques." 
  },{ 
    name: "Maîtrise d'arme",  
    key: "weaponMastery",
	adjectif:"experte",
	nature:"umbra",
    attribut: "force",  
    type: "utilitaire-3",  
    description: "Augmente la maîtrise de l'équipement." 
  },

  // ===== INTELLIGENCE =====
  { 
    name: "Puissance magique",  
    key: "magicalDamage", 
    adjectif:"puissante",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "attaque-1",  
    description: "La Puissance Magique détermine les dégâts magiques des attaques. Réduits par la résistance magique."
  },{ 
    name: "Pénétration magique",  
    key: "magicalPen",
adjectif:"",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "attaque-2",  
    description: "Ignore un % de la résistance magique." 
  },{ 
    name: "Hypercognition",  
    key: "hypercognition",  
	adjectif:"hyper-puissante",
	nature:"umbra",
    attribut: "intelligence", 
    type: "attaque-3",  
    description: "L'intelligence est prise en compte dans le calcul des dégâts magiques." 
  },{ 
    name: "Résistance magique",  
    key: "magicalResistance",  
	adjectif:"",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-1",  
    description: "Réduit les dégâts magiques subis de <span class='magical'>X%</span>." 
  },{ 
    name: "Astralité",  
    key: "astrality",  
	adjectif:"astrale",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-2",  
    description: "Chance de survivre à 1 PV au coup fatal." 
  },{ 
    name: "Transcendance",  
    key: "transcendence",  
	adjectif:"transcendée",
	nature:"umbra",
    attribut: "intelligence",  
    type: "defense-3",  
    description: "Confère des vies supplémentaires."
  },{ 
    name: "Hâte",  
    key: "haste",  
	adjectif:"hâtive",
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-1",  
    description: "Réduit le temps d’incantation." 
  },{ 
    name: "Équilibre",  
    key: "equilibre",  
	adjectif:"équilibrée",
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-2",  
    description: "Réduit l’aggro générée par ses dégâts et chance voir les cibles invisible." 
  },{ 
    name: "Mysticisme",  
    key: "mysticism",
	adjectif:"mystique",	
	nature:"umbra",
    attribut: "intelligence",  
    type: "utilitaire-3",  
    description: "Chance de réduire drastiquement la vitesse d’incantation pendant un certain temps." 
  },

  // ===== AGILITÉ =====
  { 
    name: "Puissance Perçante",  
    key: "piercingDamage", 
	nature:"umbra",	
	adjectif:"perçante",
    attribut: "agilite",  
    type: "attaque-1",  
    description: "La Puissance Perçante détermine les dégâts des entités agiles. Ils ignorent les résistances." 
  },{ 
    name: "Coup critique",  
    key: "criticalPower", 
	adjectif:"pernicieuse",
	nature:"umbra",	
    attribut: "agilite",  
    type: "attaque-2",  
    description: "Chance d’infliger des critiques." 
  },{ 
    name: "Ambidextrie",  
    key: "ambidextry",  
	adjectif:"agile à droite comme à gauche",
	nature:"umbra",
    attribut: "agilite",  
    type: "attaque-3",  
    description: "Chance de doubler une attaque." 
  },{ 
    name: "Esquive",  
    key: "dodge",
	adjectif:"agaçante à attraper",	
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-1",  
    description: "Permet d'éviter une attaque physique." 
  },{ 
    name: "Ésotérisme",  
    key: "esoterism",  
	adjectif:"ésotérique",
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-2",  
    description: "Chance de diviser par 2 les dégâts d'un sort." 
  },{ 
    name: "Occultisme",  
    key: "occultism",  
	adjectif:"confiante en ses capacité de disparition",
	nature:"umbra",
    attribut: "agilite",  
    type: "defense-3",  
    description: "Chance de disparaître quelques secondes." 
  },{ 
    name: "Précision",  
    key: "precision",
	adjectif:"précise",
	nature:"umbra",	
    attribut: "agilite",   
    type: "utilitaire-1",  
    description: "Augmente les chances de toucher avec une attaque physique." 
  },{ 
    name: "Vélocité",  
    key: "velocity",  
	adjectif:"éxitée",
	nature:"umbra",
    attribut: "agilite",  
    type: "utilitaire-2",  
    description: "Accélère la barre d’action. Bonus actuel : <span class='velocity'>X%</span> (Nouvelle vitesse : Y ms)." 
  },{ 
    name: "Mouvement",  
    key: "movement",
	adjectif:"mobile",	
	nature:"umbra",
    attribut: "agilite",  
    type: "utilitaire-3",  
    description: "Augmente les déplacements stockés." 
  },

  // ===== SPÉCIAUX =====
  {
    name: "Points de Vie",
    key: "HP",
	adjectif:"costaud",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Points de vie de l'entité. S'ils tombent à zéro, l'Entité meurt."
  },{
    name: "Armure",
    key: "armor",
	adjectif:"blindée",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Protection des points de vie de l'entité. Les points de vie sont protégés jusqu’à destruction de l’armure."
  },{ 
  name: "Poids",  
  key: "weight", 
  adjectif:"massive",
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: "Poids de l'entité. Influence sa manière de se mouvoir en combat." 
},{
    name: "Vitesse",
    key: "speed",
	adjectif:"rapide",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Détermine la vitesse d'action de votre Entité."
  },{
    name: "Dégâts hybrides",
    key: "hybridalDamage",
	adjectif:"versatile",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "La Puissance hybride combine Physique et Magique. Chaque résistance réduit 50% des dégâts."
 },{
    name: "Vie Éternelle",
    key: "eternalLife",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Permet de sauver une entité de la mort. L'entité revient à la vie avec 100 % de ses PV max. Se régénére à chaque nouvelle journée."
 },{ 
	name: "Vie supplémentaire",
    key: "extraLife",
	nature:"statistic",
	attribut: null,
    type: "special",
    description: "Permet de sauver une entité de la mort. L'entité revient à la vie avec 25 % minimum de ses PV max. Nécessite plusieurs journée pour se régénérer."
  },{
	name: "Vie Fannée",
    key: "fadedLife",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Permet de sauver une entité de la mort. L'entité revient à la vie avec 50 % de ses PV max. Ne se régénére pas une fois consommée."
	   },{
    name: "Force",
    key: "strength",
	adjectif:"balaise",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "La Force est l'attribut majeur des Entités utilisant leur aptitude physique pour combattre."
  },{
    name: "Agilité",
    key: "agility",
	adjectif:"agile",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "L'Agilité est l'attribut majeur des Entités utilisant leur aptitude de mobilité pour combattre."
  },{
    name: "Intelligence",
    key: "intelligence",
	adjectif:"intellectuelle",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "L'Intelligence est l'attribut majeur des Entités utilisant leur aptitude mentale pour combattre."
  },{
	name: "Volonté",
    key: "will",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "La Volonté de l'entité est sa capacité à résister aux corruptions de l'Umbra."
  },{
	name: "Attaque à distance",
    key: "rangeAttack",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Attaque à distance de l'entité."
   },{
	name: "Vol de vie",
    key: "lifesteal",
	nature:"statistic",
    attribut: null,
    type: "special",
    description: "Préléve une ponction de HP a chaque attaque."
   },{ 
    name: "Charge",  
    key: "charge",  
	nature:"statistic",
    attribut: "null",  
    type: "special",  
    description: "Augmente la capacité d'équipement." 
	},{ 
  name: "Orfèvre armurier",  
  key: "weaponOrfevre",  
  nature: "statistic",
  attribut: null,  
  type: "special",  
  description: "Augmente l'efficacité des équipements portés." 
},{
  name: "Collectionneur de guerre",
  key: "weaponCollector",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Augmente les chances de trouver des équipements dans les butins de guerre."
},{ 
  name: "Soif de sang",  
  key: "bloodThirsty", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: "Les attaques physiques de l'entité lui procurent du vol de vie sur les HP réellement infligés." 
},{ 
  name: "Trailer",  
  key: "trailer", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: "Chance de générer une charge de déplacement supplémentaire lors de la récupération de mouvement." 
},{ 
  name: "Marathonien",  
  key: "marathon", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: "Chance de ne pas consommer de charge de déplacement lors d'un mouvement." 
},{ 
  name: "Régénération en combat",  
  key: "hpBattleRegen", 
  nature:"statistic",	
  attribut: null,  
  type: "special",  
  description: "Régénération de HP à chaque début de tour." 
},{ 
  name: "Régénération journalière",
  key: "dayHpRegen",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Régénération des points de vie hors combat."
},{
  name: "Déplacements",
  key: "shift",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Nombre de charges de déplacement disponibles."
},{
  name: "Chance d'exécution",
  key: "bloodFuryExecutionChance",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Chance de déclencher une exécution sur une cible vulnérable."
},{
  name: "Dégâts d'exécution",
  key: "bloodFuryExecutionDamage",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Dégâts supplémentaires infligés lors d'une exécution."
},{
  name: "Seuil d'exécution",
  key: "bloodFuryTargetThreshold",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Seuil de points de vie sous lequel une cible devient vulnérable à l'exécution."
},{
  name: "Durée de Cooldown",
  key: "cooldownTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Réduction appliquée à la durée de cooldown."
},{
  name: "Durée de Préparation",
  key: "preparationTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Réduction appliquée à la durée de préparation."
},{
  name: "Durée d'Exécution",
  key: "executionTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Réduction appliquée à la durée d'exécution."
},{
  name: "Vitesse de Projectile",
  key: "projectileTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Augmentation de la vitesse des projectiles."
},{
  name: "Durée de Récupération",
  key: "recuperationTime",
  nature: "statistic",
  attribut: null,
  type: "special",
  description: "Réduction appliquée à la durée de récupération."
},
];
