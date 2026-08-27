export const stats = [
  // ===== FORCE =====
  { 
    name: "Puissance d’attaque",  
    key: "physicalDamage",  
    attribut: "force",  
    type: "attaque-1",  
    description: "La Puissance Physique (PP) détermine les dégâts physiques des attaques. Réduits par la résistance physique."
  },{ 
    name: "Pénétration d’armure",  
    key: "physicPen",  
    attribut: "force",  
    type: "attaque-2",  
    description: "Ignore un % de la résistance physique." 
  },{ 
    name: "Fureur Sanguinaire",  
    key: "bloodFury",  
    attribut: "force",  
    type: "attaque-3",  
    description: "Les dégâts physiques soignent l'attaquant." 
  },{ 
    name: "Résistance physique",  
    key: "physicalResistance",  
    attribut: "force",  
    type: "defense-1",  
    description: "Réduit les dégâts physiques subis de <span class='physical'>X%</span>." 
  },{ 
    name: "Robustesse",  
    key: "robustness",  
    attribut: "force",  
    type: "defense-2",  
    description: "Gagne une armure protectrice au début du combat." 
  },{ 
    name: "Indestructibilité",
    key: "indestructibility",  
    attribut: "force",  
    type: "defense-3",  
    description: "Chance de nullifier totalement une source de dégâts." 
  },{ 
    name: "Vitalité",  
    key: "vitality",  
    attribut: "force",  
    type: "utilitaire-1",  
    description: "Augmente les HP max. Bonus actuel : <span class='vitality'>X HP</span>." 
  },{ 
    name: "Résilience",  
    key: "resilience",  
    attribut: "force",  
    type: "utilitaire-2",  
    description: "Résiste aux altérations, réduit les critiques." 
  },{ 
    name: "Charge",  
    key: "charge",  
    attribut: "force",  
    type: "utilitaire-3",  
    description: "Augmente la capacité d'équipement." 
  },

  // ===== INTELLIGENCE =====
  { 
    name: "Puissance magique",  
    key: "magicalDamage",  
    attribut: "intelligence",  
    type: "attaque-1",  
    description: "La Puissance Magique (PM) détermine les dégâts magiques des attaques. Réduits par la résistance magique."
  },{ 
    name: "Pénétration magique",  
    key: "magicPen",  
    attribut: "intelligence",  
    type: "attaque-2",  
    description: "Ignore un % de la résistance magique." 
  },{ 
    name: "Hypercognition",  
    key: "hypercognition",  
    attribut: "intelligence",  
    type: "attaque-3",  
    description: "L'intelligence est prise en compte dans le calcul des dégâts magiques." 
  },{ 
    name: "Résistance magique",  
    key: "magicalResistance",  
    attribut: "intelligence",  
    type: "defense-1",  
    description: "Réduit les dégâts magiques subis de <span class='magical'>X%</span>." 
  },{ 
    name: "Astralité",  
    key: "astrality",  
    attribut: "intelligence",  
    type: "defense-2",  
    description: "Chance de survivre à 1 PV au coup fatal." 
  },{ 
    name: "Transcendance",  
    key: "transcendence",  
    attribut: "intelligence",  
    type: "defense-3",  
    description: "Confère des vies supplémentaires."
  },{ 
    name: "Hâte",  
    key: "haste",  
    attribut: "intelligence",  
    type: "utilitaire-1",  
    description: "Réduit le temps d’incantation." 
  },{ 
    name: "Érudition",  
    key: "erudition",  
    attribut: "intelligence",  
    type: "utilitaire-2",  
    description: "Réduit l’aggro générée par ses dégâts." 
  },{ 
    name: "Mysticisme",  
    key: "mysticism",  
    attribut: "intelligence",  
    type: "utilitaire-3",  
    description: "Chance de rentrer en trance arcanique, qui réduit quelques secondes grandement la vitesse de lancement des sorts." 
  },

  // ===== AGILITÉ =====
  { 
    name: "Puissance brute",  
    key: "rawDamage",  
    attribut: "agilite",  
    type: "attaque-1",  
    description: "La puissance Brute (PB) détermine les dégâts bruts. Ils ignorent les résistances." 
  },{ 
    name: "Coup critique",  
    key: "criticalChance",  
    attribut: "agilite",  
    type: "attaque-2",  
    description: "Chance d’infliger des critiques." 
  },{ 
    name: "Ambidextrie",  
    key: "ambidextry",  
    attribut: "agilite",  
    type: "attaque-3",  
    description: "Chance de doubler une attaque." 
  },{ 
    name: "Esquive",  
    key: "dodge",  
    attribut: "agilite",  
    type: "defense-1",  
    description: "Permet d'éviter une attaque physique." 
  },{ 
    name: "Ésotérisme",  
    key: "esoterism",  
    attribut: "agilite",  
    type: "defense-2",  
    description: "Chance de diviser par 2 les dégâts d'un sort." 
  },{ 
    name: "Occultisme",  
    key: "occultism",  
    attribut: "agilite",  
    type: "defense-3",  
    description: "Chance de disparaître quelques secondes." 
  },{ 
    name: "Précision",  
    key: "precision",  
    attribut: "agilite",  
    type: "utilitaire-1",  
    description: "Augmente les chances de toucher avec une attaque physique." 
  },{ 
    name: "Vélocité",  
    key: "velocity",  
    attribut: "agilite",  
    type: "utilitaire-2",  
    description: "Accélère la barre d’action. Bonus actuel : <span class='velocity'>X%</span> (Nouvelle vitesse : Y ms)." 
  },{ 
    name: "Mouvement",  
    key: "movement",  
    attribut: "agilite",  
    type: "utilitaire-3",  
    description: "Augmente les déplacements stockés." 
  },

  // ===== SPÉCIAUX =====
  {
    name: "Points de Vie",
    key: "HP",
    attribut: null,
    type: "special",
    description: "Points de vie de l'entité. S'ils tombent à zéro, l'Entité meurt."
  },{
    name: "Vitesse",
    key: "speed",
    attribut: null,
    type: "special",
    description: "Détermine la vitesse d'action de votre Entité."
  },{
    name: "Dégâts hybrides",
    key: "hybridDamage",
    attribut: null,
    type: "special",
    description: "La Puissance hybride combine Physique et Magique. Chaque résistance réduit 50% des dégâts."
 },{
    name: "Vie supplémentaire",
    key: "extraLife",
    attribut: null,
    type: "special",
    description: "Détermine le nombre de résurrections possibles. L'entité revient à la vie avec 50 % de ses PV max."
  },{
    name: "Force",
    key: "strenght",
    attribut: "master",
    type: "special",
    description: "La Force est l'attribut majeur des Entités utilisant leur aptitude physique pour combattre."
  },{
    name: "Agilité",
    key: "agility",
    attribut: "master",
    type: "special",
    description: "L'Agilité est l'attribut majeur des Entités utilisant leur aptitude de mobilité pour combattre."
  },{
    name: "Intelligence",
    key: "intelligence",
    attribut: "master",
    type: "special",
    description: "L'Intelligence est l'attribut majeur des Entités utilisant leur aptitude mentale pour combattre."
  }
];
