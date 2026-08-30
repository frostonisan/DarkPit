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

function nodeId(side, status) {
  return `${EVENT_ID}-${side}-${status}`;
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

CORPSE_SIDES.forEach((side) => {
  CORPSE_STATUSES.forEach((status) => {
    const id = nodeId(side.key, status.key);
    const resultId = `${id}-result`;

    adminBranches.push(Object.freeze({
      id,
      label: `${side.label} - ${status.label}`,
      startNodeId: id
    }));
    nodes[id] = actionNode(id, spawnDeadActions(side.key, status.key));
    nodes[resultId] = resultNode(resultId, status.label, `${status.label} · ${side.label}`);
    nodes[`${resultId}-close`] = closeNode(`${resultId}-close`);
  });
});

export const spawnDeadEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Dead',
  version: 4,
  startNodeId: nodeId('neutral', 'lootable'),
  adminBranches: Object.freeze(adminBranches),
  nodes: Object.freeze(nodes)
});
