const EVENT_KEY = 'spawnDead';
const EVENT_ID = '78955';

const CORPSE_ALIASES = Object.freeze([
  'Porc des bas fond',
  'Porc des bas fonds',
  'Porc des bas-fonds'
]);

const CORPSE_SIDES = Object.freeze([
  Object.freeze({ key: 'neutral', label: 'Neutral' }),
  Object.freeze({ key: 'A', label: 'Side A' }),
  Object.freeze({ key: 'B', label: 'Side B' }),
  Object.freeze({ key: 'both', label: 'Both' })
]);

const CORPSE_STATUSES = Object.freeze([
  Object.freeze({ key: 'lootable', label: 'Corpse lootable' }),
  Object.freeze({ key: 'destroyed', label: 'Corpse destroyed' }),
  Object.freeze({ key: 'empty', label: 'Corpse empty' })
]);

function choiceNode({ id, text, choices }) {
  return Object.freeze({
    id,
    type: 'choices',
    text,
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice)))
  });
}

function actionNode({ id, actions }) {
  return Object.freeze({
    id,
    type: 'action',
    actions: Object.freeze(actions),
    next: `${id}-result`
  });
}

function resultNode({ id, title, text }) {
  return Object.freeze({
    id,
    type: 'result',
    title,
    text,
    includeResults: true,
    next: `${id}-close`
  });
}

function closeNode(id) {
  return Object.freeze({
    id,
    type: 'action',
    actions: Object.freeze(['closeDialogue']),
    endEvent: 'finished'
  });
}

function spawnDeadAction(side, status) {
  return Object.freeze({
    action: 'spawnDead',
    args: Object.freeze({
      entityName: 'Porc des bas-fonds',
      aliases: CORPSE_ALIASES,
      side,
      status,
      reward: status === 'lootable' ? 'random' : false
    })
  });
}

function spawnDeadActions(side, status) {
  if (side !== 'both') return [spawnDeadAction(side, status)];
  return [Object.freeze({
    action: 'sequence',
    args: Object.freeze({
      sequence: Object.freeze([
        spawnDeadAction('A', status),
        spawnDeadAction('B', status)
      ])
    })
  })];
}

function statusChoiceId(side, status) {
  return `${EVENT_ID}-${side}-${status}`;
}

const sideChoices = CORPSE_SIDES.map((side) => ({
  id: `${EVENT_ID}-${side.key}`,
  text: side.label,
  next: `${EVENT_ID}-${side.key}-status`
}));

const nodes = {
  [`${EVENT_ID}-side`]: choiceNode({
    id: `${EVENT_ID}-side`,
    text: 'Choisissez le camp du cadavre.',
    choices: sideChoices
  })
};

CORPSE_SIDES.forEach((side) => {
  nodes[`${EVENT_ID}-${side.key}-status`] = choiceNode({
    id: `${EVENT_ID}-${side.key}-status`,
    text: `Choisissez l’état du cadavre ${side.label}.`,
    choices: CORPSE_STATUSES.map((status) => ({
      id: statusChoiceId(side.key, status.key),
      text: status.label,
      next: statusChoiceId(side.key, status.key)
    }))
  });

  CORPSE_STATUSES.forEach((status) => {
    const actionId = statusChoiceId(side.key, status.key);
    const resultId = `${actionId}-result`;
    nodes[statusChoiceId(side.key, status.key)] = actionNode({
      id: actionId,
      actions: spawnDeadActions(side.key, status.key)
    });
    nodes[resultId] = resultNode({
      id: resultId,
      title: status.label,
      text: `${status.label} · ${side.label}`
    });
    nodes[`${resultId}-close`] = closeNode(`${resultId}-close`);
  });
});

export const spawnDeadEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Dead',
  version: 3,
  startNodeId: `${EVENT_ID}-side`,
  nodes: Object.freeze(nodes)
});
