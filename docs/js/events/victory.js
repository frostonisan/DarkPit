const EVENT_KEY = 'victory';
const EVENT_ID = '78957';

export const victoryEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Stage Victory',
  version: 3,
  adminOnly: true,
  startNodeId: `${EVENT_ID}-trigger`,

  nodes: Object.freeze({
    [`${EVENT_ID}-trigger`]: Object.freeze({
      id: `${EVENT_ID}-trigger`,
      type: 'action',
      action: Object.freeze({
        action: 'eventVictory',
        args: Object.freeze({
          stageOutcome: true,
          visualOnly: false,
          endGame: true,
          finishGame: true,
          terminateGame: true,
          skipGameOver: false,
          skipEndGame: false
        })
      }),
      presentation: 'silent',
      endEvent: 'finished'
    })
  })
});
