const EVENT_KEY = 'spawnChest';
const EVENT_ID = '78956';

const CHEST_SIDES = Object.freeze([
  Object.freeze({ key: 'neutral', label: 'Neutral' }),
  Object.freeze({ key: 'A', label: 'Side A' }),
  Object.freeze({ key: 'B', label: 'Side B' }),
  Object.freeze({ key: 'both', label: 'Both' })
]);

const CHEST_STATUSES = Object.freeze([
  Object.freeze({ key: 'locked', label: 'Chest locked' }),
  Object.freeze({ key: 'lootable', label: 'Chest lootable' }),
  Object.freeze({ key: 'destroyed', label: 'Chest destroyed' })
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

function spawnChestAction(side, status) {
  return Object.freeze({
    action: 'spawnChest',
    args: Object.freeze({
      spawnMode: 'drop',
      random: status === 'lootable',
      forceNew: true,
      side,
      status
    })
  });
}

function spawnChestActions(side, status) {
  if (side !== 'both') return [spawnChestAction(side, status)];
  return [Object.freeze({
    action: 'sequence',
    args: Object.freeze({
      sequence: Object.freeze([
        spawnChestAction('A', status),
        spawnChestAction('B', status)
      ])
    })
  })];
}

function statusChoiceId(side, status) {
  return `${EVENT_ID}-${side}-${status}`;
}

const sideChoices = CHEST_SIDES.map((side) => ({
  id: `${EVENT_ID}-${side.key}`,
  text: side.label,
  next: `${EVENT_ID}-${side.key}-status`
}));

const nodes = {
  [`${EVENT_ID}-side`]: choiceNode({
    id: `${EVENT_ID}-side`,
    text: 'Choisissez le camp du coffre.',
    choices: sideChoices
  })
};

CHEST_SIDES.forEach((side) => {
  nodes[`${EVENT_ID}-${side.key}-status`] = choiceNode({
    id: `${EVENT_ID}-${side.key}-status`,
    text: `Choisissez l’état du coffre ${side.label}.`,
    choices: CHEST_STATUSES.map((status) => ({
      id: statusChoiceId(side.key, status.key),
      text: status.label,
      next: statusChoiceId(side.key, status.key)
    }))
  });

  CHEST_STATUSES.forEach((status) => {
    const actionId = statusChoiceId(side.key, status.key);
    const resultId = `${actionId}-result`;
    nodes[statusChoiceId(side.key, status.key)] = actionNode({
      id: actionId,
      actions: spawnChestActions(side.key, status.key)
    });
    nodes[resultId] = resultNode({
      id: resultId,
      title: status.label,
      text: `${status.label} · ${side.label}`
    });
    nodes[`${resultId}-close`] = closeNode(`${resultId}-close`);
  });
});

export const spawnChestEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Chest',
  version: 2,
  startNodeId: `${EVENT_ID}-side`,
  nodes: Object.freeze(nodes)
});
