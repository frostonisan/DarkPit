const EVENT_KEY = 'spawnDead';
const EVENT_ID = '78955';

const corpseAliases = Object.freeze([
  'Porc des bas fond',
  'Porc des bas fonds',
  'Porc des bas-fonds'
]);

const createSpawnDeadAction = (side) => Object.freeze({
  action: 'spawnDead',
  args: Object.freeze({
    entityName: 'Porc des bas-fonds',
    aliases: corpseAliases,
    side,
    reward: 'random'
  })
});

export const spawnDeadEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Dead',
  version: 2,
  startNodeId: `${EVENT_ID}-spawn`,

  nodes: Object.freeze({
    [`${EVENT_ID}-spawn`]: Object.freeze({
      id: `${EVENT_ID}-spawn`,
      type: 'action',
      actions: Object.freeze([Object.freeze({
        action: 'sequence',
        args: Object.freeze({
          sequence: Object.freeze([
            createSpawnDeadAction('A'),
            createSpawnDeadAction('B')
          ])
        })
      })]),
      presentation: Object.freeze({
        title: 'Cadavres créés',
        preMessage: 'Deux porcs des bas-fonds morts sont déposés dans le niveau : un Side A et un Side B.',
        includeResults: true
      }),
      endEvent: 'finished'
    })
  })
});
