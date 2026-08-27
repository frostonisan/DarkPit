const EVENT_KEY = 'spawnChest';
const EVENT_ID = '78956';

export const spawnChestEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Spawn Chest',
  version: 1,
  startNodeId: `${EVENT_ID}-spawn`,

  nodes: Object.freeze({
    [`${EVENT_ID}-spawn`]: Object.freeze({
      id: `${EVENT_ID}-spawn`,
      type: 'action',
      action: Object.freeze({
        action: 'spawnChest',
        args: Object.freeze({
          spawnMode: 'drop',
          random: true,
          forceNew: true
        })
      }),
      presentation: Object.freeze({
        title: 'Coffre créé',
        preMessage: 'Un coffre aléatoire tombe dans le niveau.',
        includeResults: true
      }),
      endEvent: 'finished'
    })
  })
});
