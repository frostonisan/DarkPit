const EVENT_KEY = 'cockRoachHunt';
const EVENT_ID = '78954';
const COCKROACH_KING_SERIAL = 666;

const ARRIVAL_IMAGE = './media/lore/events/cockroachking-arrival.jpg';
const BARRICADE_SUCCESS_IMAGE = './media/lore/events/cockroachking-barricade-success.jpg';
const BARRICADE_IMAGE = './media/lore/events/cockroachking-barricade.jpg';
const BARRICADE_CHARGE_IMAGE = './media/lore/events/cockroachking-charge-barricade.jpg';
const BARRICADE_CHARGE_SUCCESS = './media/lore/events/cockroachking-barricade-success-charge.jpg';
const PHEROMONES_IMAGE = './media/lore/events/cockroachking-pheromones.jpg';

const BARRICADE_DAMAGE_PERCENT = 25;
const C1_FAIL_DAMAGE_PERCENT = 30;
const C1_FAIL_DAMAGE_TARGET_COUNT = 3;
const CINEMATIC_MODES = new Set(['soft', 'hard']);

/* ========================================================================== */
/* LES QUATRE ÉCRANS                                                          */
/* ========================================================================== */

function cinematicScreenOption(cinematic = null) {
  if (cinematic == null || cinematic === '') return {};

  const mode = String(cinematic).trim().toLowerCase();
  if (!CINEMATIC_MODES.has(mode)) {
    throw new TypeError(
      `Mode cinematic invalide (${String(cinematic)}). Valeurs : soft, hard.`
    );
  }
  return { cinematic: mode };
}

function dialogueScreen({
  id,
  text,
  title = null,
  img = null,
  portrait = null,
  outcome = null,
  cinematic = null,
  actions = null,
  next = null
}) {
  return Object.freeze({
    id,
    type: 'dialogue',
    text,
    ...cinematicScreenOption(cinematic),
    ...(title ? { title } : {}),
    ...(img ? { img } : {}),
    ...(portrait ? { portrait: Object.freeze(portrait) } : {}),
    ...(outcome ? { outcome } : {}),
    ...(Array.isArray(actions) && actions.length > 0 ? { actions: Object.freeze([...actions]) } : {}),
    ...(next ? { next } : {})
  });
}

function actionScreen({
  id,
  actions,
  cinematic = null,
  next = null,
  endEvent = null
}) {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new TypeError(`${id} attend un tableau actions non vide.`);
  }

  return Object.freeze({
    id,
    type: 'action',
    actions: Object.freeze([...actions]),
    ...cinematicScreenOption(cinematic),
    ...(next ? { next } : {}),
    ...(endEvent ? { endEvent } : {})
  });
}

function choiceScreen({
  id,
  text,
  choices,
  title = null,
  img = null,
  cinematic = null
}) {
  return Object.freeze({
    id,
    type: 'choices',
    text,
    choices: Object.freeze([...choices]),
    ...cinematicScreenOption(cinematic),
    ...(title ? { title } : {}),
    ...(img ? { img } : {})
  });
}

function resultScreen({
  id,
  text = '',
  title = 'Résultat',
  img = null,
  includeResults = true,
  cinematic = null,
  next = null
}) {
  return Object.freeze({
    id,
    type: 'result',
    title,
    text,
    includeResults: Boolean(includeResults),
    ...cinematicScreenOption(cinematic),
    ...(img ? { img } : {}),
    ...(next ? { next } : {})
  });
}

function createResolution(approach, outcomes, extra = {}) {
  return Object.freeze({
    approach,
    ...extra,
    outcomes: Object.freeze({ ...outcomes })
  });
}

function outcome(next) {
  return Object.freeze({ next });
}

/* ========================================================================== */
/* ACTIONS MÉTIER — AUCUNE ACTION NE PILOTE LA CINÉMATIQUE                    */
/* ========================================================================== */

function cockroachKingSpawnResult(king) {
  return {
    entity: king,
    eventResults: [{
      type: 'entitySpawned',
      data: {
        entityId: king?.id ?? null,
        serial: COCKROACH_KING_SERIAL,
        side: 'B'
      },
      html: 'Le Souverain des Blattes apparaît dans le niveau.',
      classes: ['event-result-entity-spawned', 'spawn']
    }]
  };
}

async function spawnCockroachKing({ actions, eventKey, levelId }) {
  const king = await actions.spawnMonster({
    serial: COCKROACH_KING_SERIAL,
    side: 'B',
    eventId: eventKey || EVENT_KEY,
    levelId,
    spawnLine: 'middle',
    spawnColumn: 'center',
    spawnAnimation: 'spawnCharge',
    spawnAnimationOptions: {
      duration: 700,
      outsideOffset: 150
    }
  });

  return cockroachKingSpawnResult(king);
}

async function spawnCockroachKingAndWander(context) {
  const result = await spawnCockroachKing(context);

  await context.actions.wanderingTheatre({
    entity: result.entity,
    continuous: true
  });

  return result;
}

async function spawnAndWoundCockroachKing({ actions, eventKey, levelId }) {
  const king = await actions.spawnMonster({
    serial: COCKROACH_KING_SERIAL,
    side: 'B',
    eventId: eventKey || EVENT_KEY,
    levelId,
    requireExisting: true
  });

  return actions.eventEntitydamages({
    side: 'B',
    targetId: king.id,
    percent: BARRICADE_DAMAGE_PERCENT,
    count: 1,
    levelId
  });
}

function markCockroachHuntInitiative() {
  return {
    eventResults: [{
      type: 'initiativeGranted',
      data: {
        eventId: EVENT_ID,
        eventKey: EVENT_KEY
      },
      html: '<div class="event-result-item-text">Vous avez l’initiative.</div>',
      classes: ['event-result-initiative-granted', 'success']
    }]
  };
}

const RUNAWAY_SIDE_A = Object.freeze({
  action: 'runawayTheatre',
  args: Object.freeze({ side: 'sideA' })
});
const RUNAWAY_SIDE_B = Object.freeze({
  action: 'runawayTheatre',
  args: Object.freeze({ side: 'sideB' })
});

const C1_FAIL_ATTACK = Object.freeze({
  action: 'eventEntityAttack',
  args: Object.freeze({
    attackerSide: 'B',
    side: 'A',
    lifeState: 'alive',
    strategy: 'random',
    count: C1_FAIL_DAMAGE_TARGET_COUNT,
    percent: C1_FAIL_DAMAGE_PERCENT,
    executionTime: 500
  })
});

const C2_FAIL_KILL = Object.freeze({
  action: 'killEventEntity',
  args: Object.freeze({
    side: 'A',
    lifeState: 'alive',
    strategy: 'lowestStat',
    statKey: 'intelligence',
    count: 1,
    safeMode: true,
    protectedSide: 'A',
    suppressSingleTargetAnnouncement: true,
    attackerName: 'Le Souverain des Blattes'
  })
});

const LURE_DAMAGE_PERCENT = 40;
const DEAD_CAFARD_LURE = Object.freeze({
  action: 'spawnEventBoardEffect',
  args: Object.freeze({
    id: `${EVENT_ID}-dead-cafard-lure`,
    type: 'passive',
    name: 'Cafard écrasé',
    sprite: './media/assets/effects/dead-cafard.png',
    className: 'event-dead-cafard-lure',
    side: 'neutral',
    line: 'middle',
    column: 'center',
    blocking: false,
    replaceExisting: true
  })
});
const C3_MIDDLE_ATTACK = Object.freeze({
  action: 'eventEntityAttack',
  args: Object.freeze({
    attackerSide: 'B',
    side: 'A',
    lifeState: 'alive',
    strategy: 'lowestStat',
    statKey: 'HP.ratio',
    tieBreakers: Object.freeze([
      Object.freeze({ statKey: 'HP.current', direction: 'lowest' }),
      Object.freeze({ statKey: 'level', direction: 'lowest' }),
      Object.freeze({ random: true })
    ]),
    count: 1,
    percent: LURE_DAMAGE_PERCENT,
    executionTime: 500,
    attackerName: 'Le Souverain des Blattes'
  })
});
const C3_FAIL_MOVE_LURE = Object.freeze({
  action: 'moveEventEntityToBoardPosition',
  args: Object.freeze({
    side: 'A',
    strategy: 'lowestStat',
    statKey: 'level',
    tieBreakers: Object.freeze([
      Object.freeze({ statKey: 'HP.max', direction: 'lowest' }),
      Object.freeze({ random: true })
    ]),
    targetSide: 'neutral',
    line: 'middle',
    column: 'center'
  })
});
const C3_FAIL_CAPTURE = Object.freeze({
  action: 'eventRemoveEntity',
  args: Object.freeze({
    side: 'A',
    lifeState: 'alive',
    strategy: 'lowestStat',
    statKey: 'level',
    tieBreakers: Object.freeze([
      Object.freeze({ statKey: 'HP.max', direction: 'lowest' }),
      Object.freeze({ random: true })
    ]),
    count: 1,
    safeMode: true,
    protectedSide: 'A',
    allowCorpseFallback: false,
    allowResurrectionEscape: false
  })
});

const SCENARIO_1_SUCCESS = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c1-success-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c1-success-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c1-success-outcome`,
      outcome: 'success',
      cinematic: 'hard',
      text: 'Votre armée se replie habilement sans produire le moindre bruit. Vous effacez vos traces afin de faire croire à votre poursuivant que vous n’avez jamais été là, puis vous vous éloignez calmement.',
      next: `${EVENT_ID}-c1-success-runaway`
    }),
    [`${EVENT_ID}-c1-success-runaway`]: actionScreen({
      id: `${EVENT_ID}-c1-success-runaway`,
      cinematic: 'soft',
      actions: [RUNAWAY_SIDE_A],
      next: `${EVENT_ID}-c1-success-d1`
    }),
    [`${EVENT_ID}-c1-success-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c1-success-d1`,
      cinematic: 'hard',
      text: 'Au loin, une immense créature insectoïde atteint enfin votre ancienne position. Elle tourne sur elle-même, fouille les débris et cherche une piste qui n’existe plus.',
      next: `${EVENT_ID}-c1-success-arrival`
    }),
    [`${EVENT_ID}-c1-success-arrival`]: actionScreen({
      id: `${EVENT_ID}-c1-success-arrival`,
      cinematic: 'soft',
      actions: ['spawnCockroachKingAndWander'],
      next: `${EVENT_ID}-c1-success-d2`
    }),
    [`${EVENT_ID}-c1-success-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c1-success-d2`,
      cinematic: 'hard',
      text: 'Les bruits diminuent peu à peu. La bête semble s’apaiser en pensant avoir pourchassé un mirage. Quant à vous, vous êtes déjà loin, hors de danger.',
      next: `${EVENT_ID}-c1-success-result`
    }),
    [`${EVENT_ID}-c1-success-result`]: resultScreen({
      id: `${EVENT_ID}-c1-success-result`,
      cinematic: 'hard',
      includeResults: true,
      text: 'Vous avez pris la fuite.',
      next: `${EVENT_ID}-c1-success-leave`
    }),
    [`${EVENT_ID}-c1-success-leave`]: actionScreen({
      id: `${EVENT_ID}-c1-success-leave`,
      actions: ['quitLevel'],
      endEvent: 'failed'
    })
  })
});

const SCENARIO_1_MIDDLE = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c1-middle-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c1-middle-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c1-middle-outcome`,
      outcome: 'middle',
      cinematic: 'hard',
      text: 'Vous vous élancez dans le sens opposé du bruit.<br>Pendant votre fuite, vous jetez un œil derrière vous et repérez une créature colossale lancée à pleine allure, tentant de vous rattraper.',
      next: `${EVENT_ID}-c1-middle-runaway`
    }),
    [`${EVENT_ID}-c1-middle-runaway`]: actionScreen({
      id: `${EVENT_ID}-c1-middle-runaway`,
      cinematic: 'soft',
      actions: [RUNAWAY_SIDE_A],
      next: `${EVENT_ID}-c1-middle-d1`
    }),
    [`${EVENT_ID}-c1-middle-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c1-middle-d1`,
      cinematic: 'hard',
      text: 'Heureusement, votre armée est plus rapide que la bête.<br><br>Après une longue poursuite, vous vous retournez : elle n’est plus là.<br>Vous l’avez semée.',
      next: `${EVENT_ID}-c1-middle-result`
    }),
    [`${EVENT_ID}-c1-middle-result`]: resultScreen({
      id: `${EVENT_ID}-c1-middle-result`,
      cinematic: 'hard',
      includeResults: true,
      text: 'Vous avez pris la fuite.<br>La créature est semée pour toujours.',
      next: `${EVENT_ID}-c1-middle-leave`
    }),
    [`${EVENT_ID}-c1-middle-leave`]: actionScreen({
      id: `${EVENT_ID}-c1-middle-leave`,
      actions: ['quitLevel'],
      endEvent: 'failed'
    })
  })
});

const SCENARIO_1_FAIL = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c1-fail-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c1-fail-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c1-fail-outcome`,
      outcome: 'fail',
      cinematic: 'hard',
      img: ARRIVAL_IMAGE,
      text: 'Votre armée trébuche pitoyablement et se disperse.<br>Une créature colossale surgit de nulle part et vous charge, détruisant tout sur son passage. Toute retraite est désormais impossible.',
      next: `${EVENT_ID}-c1-fail-spawn`
    }),
    [`${EVENT_ID}-c1-fail-spawn`]: actionScreen({
      id: `${EVENT_ID}-c1-fail-spawn`,
      cinematic: 'soft',
      actions: [
        'spawnCockroachKing',
        Object.freeze({
          action: 'destroyCorpse',
          args: Object.freeze({ sides: Object.freeze(['B']) })
        }),
        'destroyChest'
      ],
      next: `${EVENT_ID}-c1-fail-d1`
    }),
    [`${EVENT_ID}-c1-fail-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c1-fail-d1`,
      cinematic: 'hard',
      img: ARRIVAL_IMAGE,
      text: 'Le Souverain des Blattes traverse vos rangs dispersés.<br><br>Sa charge projette violemment vos combattants au sol, tandis que ses mandibules se referment sur tout ce qui est à leur portée.<br><br>Le monstre détruit tout sur son passage.',
      next: `${EVENT_ID}-c1-fail-attack`
    }),
    [`${EVENT_ID}-c1-fail-attack`]: actionScreen({
      id: `${EVENT_ID}-c1-fail-attack`,
      cinematic: 'soft',
      actions: [C1_FAIL_ATTACK],
      next: `${EVENT_ID}-c1-fail-d2`
    }),
    [`${EVENT_ID}-c1-fail-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c1-fail-d2`,
      cinematic: 'hard',
      text: 'L’attaque est brutale.<br><br>La créature se retourne lentement vers le restant de vos troupes.<br><br>Elle se rue sur vous pour vous achever.',
      next: `${EVENT_ID}-c1-fail-result`
    }),
    [`${EVENT_ID}-c1-fail-result`]: resultScreen({
      id: `${EVENT_ID}-c1-fail-result`,
      cinematic: 'hard',
      includeResults: true,
      text: 'C’est le chaos. Vous avez des blessés.',
      next: `${EVENT_ID}-c1-fail-battle`
    }),
    [`${EVENT_ID}-c1-fail-battle`]: actionScreen({
      id: `${EVENT_ID}-c1-fail-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_1 = Object.freeze({
  choice: Object.freeze({
    id: `${EVENT_ID}-c1`,
    text: 'Vous tentez de disparaître avant son arrivée.',
    resolution: createResolution('agility', {
      success: SCENARIO_1_SUCCESS.resolution,
      middle: SCENARIO_1_MIDDLE.resolution,
      fail: SCENARIO_1_FAIL.resolution
    })
  }),
  nodes: Object.freeze({
    ...SCENARIO_1_SUCCESS.nodes,
    ...SCENARIO_1_MIDDLE.nodes,
    ...SCENARIO_1_FAIL.nodes
  })
});

const SCENARIO_2_SUCCESS = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c2-success-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c2-success-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c2-success-outcome`,
      outcome: 'success',
      cinematic: 'hard',
      img: BARRICADE_SUCCESS_IMAGE,
      text: 'Vos robustes entités sont parvenues à dresser une barricade imposante avec des objets lourds.<br>En plus d\'être solide, elle est réalisée à temps.<br>Votre armée se réfugie derrière.<br>Le sol tremble de plus en plus vite, de plus en plus fort.<br>Vous vous préparez à l\'impact, en priant pour que votre abri de fortune résiste au choc.',
      next: `${EVENT_ID}-c2-success-spawn`
    }),
    [`${EVENT_ID}-c2-success-spawn`]: actionScreen({
      id: `${EVENT_ID}-c2-success-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c2-success-d1`
    }),
    [`${EVENT_ID}-c2-success-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c2-success-d1`,
      cinematic: 'hard',
      img: BARRICADE_CHARGE_SUCCESS,
      text: 'Une immense forme noire surgit de nulle part et percute furieusement la barricade de plein fouet.<br><br>Le choc est incroyablement violent.<br>Dans un nuage de poussière, vous entendez le bois gémir, les attaches se tendent...<br>Les matériaux encaissent le choc tant bien que mal, mais le tout tient !',
      next: `${EVENT_ID}-c2-success-damage`
    }),
    [`${EVENT_ID}-c2-success-damage`]: actionScreen({
      id: `${EVENT_ID}-c2-success-damage`,
      cinematic: 'soft',
      actions: [Object.freeze({
        action: 'shakeScreenEvent',
        args: Object.freeze({ effect: 'damage', times: 1 })
      }), 'spawnAndWoundCockroachKing'],
      next: `${EVENT_ID}-c2-success-d2`
    }),
    [`${EVENT_ID}-c2-success-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c2-success-d2`,
      cinematic: 'hard',
      text: 'La créature est sonnée par l\'impact. Lacérée par les débris de la barricade, elle recule.<br>Les rangs de votre armée se reforment et chargent dans un élan de bravoure, galvanisés par ce succès.',
      next: `${EVENT_ID}-c2-success-result`
    }),
    [`${EVENT_ID}-c2-success-result`]: resultScreen({
      id: `${EVENT_ID}-c2-success-result`,
      cinematic: 'hard',
      includeResults: true,
      text: `Le choc fait perdre ${BARRICADE_DAMAGE_PERCENT} % de ses HP actuels au Souverain des Blattes.`,
      next: `${EVENT_ID}-c2-success-battle`
    }),
    [`${EVENT_ID}-c2-success-battle`]: actionScreen({
      id: `${EVENT_ID}-c2-success-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_2_MIDDLE = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c2-middle-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c2-middle-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c2-middle-outcome`,
      outcome: 'middle',
      cinematic: 'hard',
      img: BARRICADE_IMAGE,
      text: 'Vous construisez une barricade de fortune.<br>Vous ne pouviez pas déplacer sur de trop grandes distances des objets lourds, vous avez donc utilisé ce qui était à proximité immédiate.<br>Au moment où vous vous réfugiez devant un coffre utilisé comme rempart, une masse immense surgit furieusement de nulle part et se jette dans votre direction.',
      next: `${EVENT_ID}-c2-middle-spawn`
    }),
    [`${EVENT_ID}-c2-middle-spawn`]: actionScreen({
      id: `${EVENT_ID}-c2-middle-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c2-middle-d1`
    }),
    [`${EVENT_ID}-c2-middle-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c2-middle-d1`,
      cinematic: 'hard',
      img: BARRICADE_CHARGE_IMAGE,
      text: 'L’impact est d’une rare violence.<br>Votre barricade s’effondre avec fracas dès la première charge.<br>Elle absorbe l’impact, mais les débris détruisent tout sur leur passage.<br>Il ne reste plus rien.',
      next: `${EVENT_ID}-c2-middle-chest`
    }),
    [`${EVENT_ID}-c2-middle-chest`]: actionScreen({
      id: `${EVENT_ID}-c2-middle-chest`,
      cinematic: 'soft',
      actions: ['destroyChest'],
      next: `${EVENT_ID}-c2-middle-d2`
    }),
    [`${EVENT_ID}-c2-middle-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c2-middle-d2`,
      cinematic: 'hard',
      text: 'Le Souverain des Blattes cesse de s’acharner sur les débris lorsqu’il vous aperçoit.<br>Il bondit sur votre armée.',
      next: `${EVENT_ID}-c2-middle-result`
    }),
    [`${EVENT_ID}-c2-middle-result`]: resultScreen({
      id: `${EVENT_ID}-c2-middle-result`,
      cinematic: 'hard',
      includeResults: true,
      text: 'Vous vous préparez au combat.',
      next: `${EVENT_ID}-c2-middle-battle`
    }),
    [`${EVENT_ID}-c2-middle-battle`]: actionScreen({
      id: `${EVENT_ID}-c2-middle-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_2_FAIL = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c2-fail-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c2-fail-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c2-fail-outcome`,
      outcome: 'fail',
      cinematic: 'hard',
      img: BARRICADE_IMAGE,
      text: 'Vos entités n\'étaient pas taillées physiquement pour déplacer les débris les plus robustes qui vous entouraient, afin de constituer une protection suffisamment solide.<br>Malgré vos efforts, vous n\'avez pas le temps de terminer la barricade avant qu\'une masse immense surgisse dans votre direction.',
      next: `${EVENT_ID}-c2-fail-spawn`
    }),

    [`${EVENT_ID}-c2-fail-spawn`]: actionScreen({
      id: `${EVENT_ID}-c2-fail-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c2-fail-d1`
    }),

    [`${EVENT_ID}-c2-fail-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c2-fail-d1`,
      cinematic: 'hard',
      img: BARRICADE_CHARGE_IMAGE,
      text: 'Le Souverain des Blattes percute votre construction inachevée de plein fouet.<br><br>Une de vos créatures, un peu trop zélée, avait cru bon de monter sur la pile de débris censée vous servir de protection afin d\'y ajouter une subtile décoration et de clore l\'ouvrage avec classe.<br><br>L\'impact la fait basculer dans le vide.',
      next: `${EVENT_ID}-c2-fail-chest`
    }),

    [`${EVENT_ID}-c2-fail-chest`]: actionScreen({
      id: `${EVENT_ID}-c2-fail-chest`,
      cinematic: 'soft',
      actions: ['destroyChest'],
      next: `${EVENT_ID}-c2-fail-d2`
    }),

    [`${EVENT_ID}-c2-fail-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c2-fail-d2`,
      cinematic: 'hard',
      text: 'Le Souverain des Blattes la voit chuter.<br><br>En une fraction de seconde, il se place sous son point d\'atterrissage, toutes mandibules ouvertes.<br><br>La pauvre créature atterrit directement dans la gueule du monstre.<br>La scène est aussi cruelle que grotesque.',
      next: `${EVENT_ID}-c2-fail-kill`
    }),

    [`${EVENT_ID}-c2-fail-kill`]: actionScreen({
      id: `${EVENT_ID}-c2-fail-kill`,
      cinematic: 'soft',
      actions: [C2_FAIL_KILL],
      next: `${EVENT_ID}-c2-fail-d3`
    }),

    [`${EVENT_ID}-c2-fail-d3`]: dialogueScreen({
      id: `${EVENT_ID}-c2-fail-d3`,
      cinematic: 'hard',
      text: 'Le Souverain des Blattes n\'est pourtant pas rassasié.<br><br>Il se tourne vers ce qu\'il reste de votre armée et charge avec rage.',
      next: `${EVENT_ID}-c2-fail-result`
    }),

    [`${EVENT_ID}-c2-fail-result`]: resultScreen({
      id: `${EVENT_ID}-c2-fail-result`,
      cinematic: 'hard',
      includeResults: true,
      text: '',
      next: `${EVENT_ID}-c2-fail-battle`
    }),

    [`${EVENT_ID}-c2-fail-battle`]: actionScreen({
      id: `${EVENT_ID}-c2-fail-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_2 = Object.freeze({
  choice: Object.freeze({
    id: `${EVENT_ID}-c2`,
    text: 'Vous tentez de dresser une barricade avec ce que vous trouvez et attendez fermement la charge.',
    img: ARRIVAL_IMAGE,
    resolution: createResolution('strength', {
      success: SCENARIO_2_SUCCESS.resolution,
      middle: SCENARIO_2_MIDDLE.resolution,
      fail: SCENARIO_2_FAIL.resolution
    })
  }),
  nodes: Object.freeze({
    ...SCENARIO_2_SUCCESS.nodes,
    ...SCENARIO_2_MIDDLE.nodes,
    ...SCENARIO_2_FAIL.nodes
  })
});
const SCENARIO_3_SUCCESS = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c3-success-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c3-success-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c3-success-outcome`,
      outcome: 'success',
      cinematic: 'hard',
      img: PHEROMONES_IMAGE,
      text: 'Au lieu de succomber à la panique, vous préférez faire ce que vous savez faire de mieux : réfléchir. Vous faites rapidement le point.<br><br>Si c’est le fait d’avoir écrasé des cafards qui a déclenché la fureur de cette chose, alors peut-être sera-t-elle sensible à la vue ou à l’odeur du cadavre.<br><br>D’un mouvement, vous projetez au loin le cadavre écrasé.',
      next: `${EVENT_ID}-c3-success-lure`
    }),
    [`${EVENT_ID}-c3-success-lure`]: actionScreen({
      id: `${EVENT_ID}-c3-success-lure`,
      cinematic: 'soft',
      actions: [DEAD_CAFARD_LURE],
      next: `${EVENT_ID}-c3-success-spawn`
    }),
    [`${EVENT_ID}-c3-success-spawn`]: actionScreen({
      id: `${EVENT_ID}-c3-success-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing', 'markCockroachHuntInitiative'],
      next: `${EVENT_ID}-c3-success-d1`
    }),
    [`${EVENT_ID}-c3-success-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c3-success-d1`,
      cinematic: 'hard',
      img: PHEROMONES_IMAGE,
      text: 'L’instant d’après, une immense créature insectoïde surgit enfin.<br><br>Vous aviez raison : le monstre est guidé par les phéromones dégagées par le cancrelat. Le Souverain des Blattes se précipite droit vers le cafard écrasé.',
      next: `${EVENT_ID}-c3-success-d2`
    }),
    [`${EVENT_ID}-c3-success-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c3-success-d2`,
      cinematic: 'hard',
      img: PHEROMONES_IMAGE,
      text: 'Le gigantesque Souverain des Blattes se penche alors sur la dépouille et laisse échapper une plainte pitoyable.<br><br>Sa peine est telle qu’il n’a aucune conscience de votre présence. Vous réalisez que vous êtes cruels.<br><br>La créature est comme hypnotisée par les phéromones de son congénère. La diversion est parfaite.<br><br>Vous pouvez profiter de ce pitoyable spectacle pour tirer un avantage tactique.',
      next: `${EVENT_ID}-c3-success-result`
    }),
    [`${EVENT_ID}-c3-success-result`]: resultScreen({
      id: `${EVENT_ID}-c3-success-result`,
      cinematic: 'hard',
      includeResults: true,
      text: '',
      next: `${EVENT_ID}-c3-success-choice`
    }),
    [`${EVENT_ID}-c3-success-choice`]: choiceScreen({
      id: `${EVENT_ID}-c3-success-choice`,
      cinematic: 'hard',
      text: 'La diversion fonctionne. Que décidez-vous de faire ?',
      choices: [
        Object.freeze({
          id: `${EVENT_ID}-c3-success-fight`,
          text: 'Lancer le combat.',
          action: Object.freeze(['forceBattle']),
          startsCombat: true
        }),
        Object.freeze({
          id: `${EVENT_ID}-c3-success-leave`,
          text: 'Quitter le niveau.',
          action: Object.freeze(['quitLevel']),
          end: true
        })
      ]
    })
  })
});

const SCENARIO_3_MIDDLE = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c3-middle-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c3-middle-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c3-middle-outcome`,
      outcome: 'middle',
      cinematic: 'hard',
      text: 'Vous êtes pris de court et ne parvenez pas à réagir de manière absolument rationnelle.<br><br>Vous saisissez un bout de tissu de vos affaires et l’imprégnez de l’odeur du sang d’une entité blessée.<br><br>Cette puissante odeur de sang devrait attirer la créature, qui ne semble pas être herbivore, d’après l’agressivité dont elle semble être dotée.<br><br>Vous lancez au loin votre appât.',
      next: `${EVENT_ID}-c3-middle-spawn`
    }),
    [`${EVENT_ID}-c3-middle-spawn`]: actionScreen({
      id: `${EVENT_ID}-c3-middle-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c3-middle-d1`
    }),
    [`${EVENT_ID}-c3-middle-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c3-middle-d1`,
      cinematic: 'hard',
      img: PHEROMONES_IMAGE,
      text: 'Une infâme créature insectoïde surgit alors de nulle part.<br><br>Le Souverain des Blattes est instantanément attiré par votre appât. Vous êtes soulagé face à l’efficacité de ce stratagème, qui vous donne de précieuses secondes de répit pour vous permettre de vous cacher et d’entamer votre fuite.<br><br>Il engloutit le leurre en quelques secondes.',
      next: `${EVENT_ID}-c3-middle-d2`
    }),
    [`${EVENT_ID}-c3-middle-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c3-middle-d2`,
      cinematic: 'hard',
      text: 'Mais quelque chose ne va pas. Ses multiples antennes s’agitent violemment, puis se tournent lentement vers l’entité qui a donné son sang.<br><br>Le Souverain associe instantanément cette odeur à celle du leurre.<br><br>En une fraction de seconde, la créature remonte brutalement jusqu’à sa cible et l’attaque.',
      next: `${EVENT_ID}-c3-middle-attack`
    }),
    [`${EVENT_ID}-c3-middle-attack`]: actionScreen({
      id: `${EVENT_ID}-c3-middle-attack`,
      cinematic: 'soft',
      actions: [C3_MIDDLE_ATTACK],
      next: `${EVENT_ID}-c3-middle-d3`
    }),
    [`${EVENT_ID}-c3-middle-d3`]: dialogueScreen({
      id: `${EVENT_ID}-c3-middle-d3`,
      cinematic: 'hard',
      text: 'L’odeur du sang est trop puissante, et le coup, d’une violence hargneuse.<br><br>La cible parvient à éviter une mort certaine, mais ressort sévèrement blessée. Le Souverain des Blattes se dresse désormais face à vous.<br><br>Ce n’est plus le moment de réfléchir : il faut se battre.',
      next: `${EVENT_ID}-c3-middle-result`
    }),
    [`${EVENT_ID}-c3-middle-result`]: resultScreen({
      id: `${EVENT_ID}-c3-middle-result`,
      cinematic: 'hard',
      includeResults: true,
      text: '',
      next: `${EVENT_ID}-c3-middle-battle`
    }),
    [`${EVENT_ID}-c3-middle-battle`]: actionScreen({
      id: `${EVENT_ID}-c3-middle-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_3_FAIL = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c3-fail-outcome`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c3-fail-outcome`]: dialogueScreen({
      id: `${EVENT_ID}-c3-fail-outcome`,
      outcome: 'fail',
      cinematic: 'hard',
      text: 'L’idée d’attirer la créature loin de vous avec un leurre vous vient subitement à l’esprit.<br><br>Cependant, vos idées ne sont pas aussi fulgurantes qu’escompté, et vous vous appesantissez un peu trop sur les conséquences potentielles d’une telle stratégie, plutôt que sur le choix de l’appât et l’application de ladite stratégie.<br><br>Le bruit se rapprochant de plus en plus, vous écourtez votre “réflexion” et hurlez sur une de vos entités, qui semble la plus docile, de faire quelque chose, en lui pointant la direction de la source du bruit.<br><br>Elle se dévoue. Vous la voyez s’éloigner en vous regardant, un peu perdue, presque honteuse pour vous de ne pas avoir su quoi lui dire.',
      next: `${EVENT_ID}-c3-fail-move`
    }),
    [`${EVENT_ID}-c3-fail-move`]: actionScreen({
      id: `${EVENT_ID}-c3-fail-move`,
      cinematic: 'soft',
      actions: [C3_FAIL_MOVE_LURE],
      next: `${EVENT_ID}-c3-fail-spawn`
    }),
    [`${EVENT_ID}-c3-fail-spawn`]: actionScreen({
      id: `${EVENT_ID}-c3-fail-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c3-fail-d1`
    }),
    [`${EVENT_ID}-c3-fail-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c3-fail-d1`,
      cinematic: 'hard',
      img: PHEROMONES_IMAGE,
      text: 'Lorsque vous vous rendez compte de cela, il est un peu trop tard.<br><br>Un monstre de chitine, de mandibules et d’ichor se dresse devant l’entité envoyée au loin.<br><br>À ce moment, un étrange sentiment d’effroi et de soulagement vous apparaît : tout est sous contrôle, c’est finalement elle qui servira d’appât.<br><br>Le monstre referme son étreinte d’une violence rare sur sa cible.',
      next: `${EVENT_ID}-c3-fail-remove`
    }),
    [`${EVENT_ID}-c3-fail-remove`]: actionScreen({
      id: `${EVENT_ID}-c3-fail-remove`,
      cinematic: 'soft',
      actions: [C3_FAIL_CAPTURE],
      next: `${EVENT_ID}-c3-fail-d2`
    }),
    [`${EVENT_ID}-c3-fail-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c3-fail-d2`,
      cinematic: 'hard',
      text: 'La créature disparaît aussi brutalement qu’elle est arrivée.<br><br>Derrière votre incompétence et votre intelligence lacunaire, vous tentez de transformer cet échec en réussite en vous disant que vous êtes encore en vie, et hors de danger... mais à quel prix ?',
      next: `${EVENT_ID}-c3-fail-king-leave`
    }),
    [`${EVENT_ID}-c3-fail-king-leave`]: actionScreen({
      id: `${EVENT_ID}-c3-fail-king-leave`,
      cinematic: 'soft',
      actions: [RUNAWAY_SIDE_B],
      next: `${EVENT_ID}-c3-fail-result`
    }),
    [`${EVENT_ID}-c3-fail-result`]: resultScreen({
      id: `${EVENT_ID}-c3-fail-result`,
      cinematic: 'hard',
      includeResults: true,
      text: '',
      next: `${EVENT_ID}-c3-fail-close`
    }),
    [`${EVENT_ID}-c3-fail-close`]: actionScreen({
      id: `${EVENT_ID}-c3-fail-close`,
      actions: ['closeDialogue'],
      endEvent: 'failed'
    })
  })
});

const SCENARIO_3 = Object.freeze({
  choice: Object.freeze({
    id: `${EVENT_ID}-c3`,
    text: 'Vous tentez une diversion en exploitant les phéromones du cafard écrasé.',
    resolution: createResolution('intelligence', {
      success: SCENARIO_3_SUCCESS.resolution,
      middle: SCENARIO_3_MIDDLE.resolution,
      fail: SCENARIO_3_FAIL.resolution
    })
  }),
  nodes: Object.freeze({
    ...SCENARIO_3_SUCCESS.nodes,
    ...SCENARIO_3_MIDDLE.nodes,
    ...SCENARIO_3_FAIL.nodes
  })
});

const SCENARIO_4_SUCCESS = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c4-success-spawn`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c4-success-spawn`]: actionScreen({
      id: `${EVENT_ID}-c4-success-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c4-success-d1`
    }),
    [`${EVENT_ID}-c4-success-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c4-success-d1`,
      cinematic: 'hard',
      text: 'La créature surgit et se précipite irrésistiblement vers l’endroit que vous venez de quitter. Elle cherche, gratte le sol et expose son dos.',
      next: `${EVENT_ID}-c4-success-d2`
    }),
    [`${EVENT_ID}-c4-success-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c4-success-d2`,
      cinematic: 'hard',
      text: 'Toujours dissimulée, votre armée contourne silencieusement le monstre. Chacun attend votre signal pour lui bondir dessus.',
      next: `${EVENT_ID}-c4-success-surprise`
    }),
    [`${EVENT_ID}-c4-success-surprise`]: actionScreen({
      id: `${EVENT_ID}-c4-success-surprise`,
      cinematic: 'soft',
      actions: [Object.freeze({
        action: 'attackSurprise',
        args: Object.freeze({ side: 'sideA' })
      })],
      next: `${EVENT_ID}-c4-success-d3`
    }),
    [`${EVENT_ID}-c4-success-d3`]: dialogueScreen({
      id: `${EVENT_ID}-c4-success-d3`,
      cinematic: 'hard',
      text: 'Le signal est donné. Votre armée jaillit des ombres avant que le Roi des Blattes ne puisse se retourner.',
      next: `${EVENT_ID}-c4-success-battle`
    }),
    [`${EVENT_ID}-c4-success-battle`]: actionScreen({
      id: `${EVENT_ID}-c4-success-battle`,
      actions: ['forceBattle']
    })
  })
});

const SCENARIO_4_FAIL = Object.freeze({
  resolution: outcome(`${EVENT_ID}-c4-fail-spawn`),
  nodes: Object.freeze({
    [`${EVENT_ID}-c4-fail-spawn`]: actionScreen({
      id: `${EVENT_ID}-c4-fail-spawn`,
      cinematic: 'soft',
      actions: ['spawnCockroachKing'],
      next: `${EVENT_ID}-c4-fail-d1`
    }),
    [`${EVENT_ID}-c4-fail-d1`]: dialogueScreen({
      id: `${EVENT_ID}-c4-fail-d1`,
      cinematic: 'hard',
      text: 'Le Roi des Blattes distingue votre mouvement et fond sur votre cachette. Vous l’abandonnez juste avant que ses mandibules ne se referment.',
      next: `${EVENT_ID}-c4-fail-d2`
    }),
    [`${EVENT_ID}-c4-fail-d2`]: dialogueScreen({
      id: `${EVENT_ID}-c4-fail-d2`,
      cinematic: 'hard',
      text: 'La créature vous poursuit sans toucher au coffre, mais elle ne parvient pas à combler la distance. Vous pouvez encore lui échapper.',
      next: `${EVENT_ID}-c4-fail-leave`
    }),
    [`${EVENT_ID}-c4-fail-leave`]: actionScreen({
      id: `${EVENT_ID}-c4-fail-leave`,
      actions: ['quitLevel'],
      endEvent: 'failed'
    })
  })
});

const SCENARIO_4 = Object.freeze({
  choice: Object.freeze({
    id: `${EVENT_ID}-c4`,
    text: 'Vous tentez d’attirer la créature ailleurs avant de vous cacher.',
    resolution: createResolution('agility', {
      success: SCENARIO_4_SUCCESS.resolution,
      fail: SCENARIO_4_FAIL.resolution
    }, {
      condition: 'conditional'
    })
  }),
  nodes: Object.freeze({
    ...SCENARIO_4_SUCCESS.nodes,
    ...SCENARIO_4_FAIL.nodes
  })
});

/* ========================================================================== */
/* EVENT                                                                      */
/* ========================================================================== */

export function removeUnclickedCockroaches() {
  const cockroaches = [...document.querySelectorAll(
    '.chest-cockroach-fx:not(.arrete)'
  )];

  cockroaches.forEach((cockroach) => cockroach.remove());

  return {
    removed: cockroaches.length,
    elements: cockroaches
  };
}

export const cockRoachHuntEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Cockroach Hunt',
  version: 23,
  startNodeId: `${EVENT_ID}-d1`,
  watchedPlayerInfoKeys: ['cockroaches'],
  onStart: removeUnclickedCockroaches,

  canStart({ playerInfo }) {
    return Math.max(0, Number.parseInt(playerInfo?.cockroaches, 10) || 0) >= 1;
  },

  nodes: Object.freeze({
    [`${EVENT_ID}-d1`]: dialogueScreen({
      id: `${EVENT_ID}-d1`,
      cinematic: 'hard',
      text: '<strong>GRRZZZZZZZZZZZZZZZZZzzzzzzzzzzzzzzzzzzzzzz !!!!!!!!!</strong><br><br>À la seconde où vous écrasez cet énième cafard, un hurlement déchire le silence.',
      portrait: {
        id: 915223,
        type: 'sbire'
      },
      next: `${EVENT_ID}-d2`
    }),

    [`${EVENT_ID}-d2`]: dialogueScreen({
      id: `${EVENT_ID}-d2`,
      cinematic: 'hard',
      text: 'Des pas frénétiques martèlent le sol dans votre direction. Quelque chose d’immense approche, renversant tout sur son passage.',
      next: `${EVENT_ID}-d3`
    }),

    [`${EVENT_ID}-d3`]: choiceScreen({
      id: `${EVENT_ID}-d3`,
      cinematic: 'hard',
      text: 'Vous n’avez que quelques secondes pour réagir.',
      choices: [
        SCENARIO_1.choice,
        SCENARIO_2.choice,
        SCENARIO_3.choice,
        SCENARIO_4.choice
      ]
    }),

    ...SCENARIO_1.nodes,
    ...SCENARIO_2.nodes,
    ...SCENARIO_3.nodes,
    ...SCENARIO_4.nodes
  }),

  actions: Object.freeze({
    removeUnclickedCockroaches,
    spawnCockroachKing,
    spawnCockroachKingAndWander,
    spawnAndWoundCockroachKing,
    markCockroachHuntInitiative
  }),

  completion: Object.freeze({
    type: 'entityDeath',
    serial: COCKROACH_KING_SERIAL
  })
});
