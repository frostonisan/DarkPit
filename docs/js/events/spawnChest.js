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

function nodeId(side, status) {
  return `${EVENT_ID}-${side}-${status}`;
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

function actionNode(id, actions) {
  return Object.freeze({
    id,
    type: 'action',
    actions: Object.freeze(actions),
    next: `${id}-result`
  });
}

function resultNode(id, title, text) {
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

const nodes = {};
const adminBranches = [];

CHEST_SIDES.forEach((side) => {
  CHEST_STATUSES.forEach((status) => {
    const id = nodeId(side.key, status.key);
    const resultId = `${id}-result`;

    adminBranches.push(Object.freeze({
      id,
      group: side.label,
      label: status.label,
      startNodeId: id
    }));
    nodes[id] = actionNode(id, spawnChestActions(side.key, status.key));
    nodes[resultId] = resultNode(resultId, status.label, `${status.label} · ${side.label}`);
    nodes[`${resultId}-close`] = closeNode(`${resultId}-close`);
  });
});

export const spawnChestEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Chest',
  version: 3,
  startNodeId: nodeId('neutral', 'lootable'),
  adminBranches: Object.freeze(adminBranches),
  nodes: Object.freeze(nodes)
});
