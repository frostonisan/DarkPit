const EVENT_KEY = 'defeat';
const EVENT_ID = '78958';

export const defeatEvent = Object.freeze({
  key: EVENT_KEY,
  id: EVENT_ID,
  title: 'Stage Defeat (Game Over)',
  version: 4,
  adminOnly: true,
  startNodeId: `${EVENT_ID}-trigger`,

  nodes: Object.freeze({
    [`${EVENT_ID}-trigger`]: Object.freeze({
      id: `${EVENT_ID}-trigger`,
      type: 'action',
      action: Object.freeze({
        action: 'eventDefeat',
        args: Object.freeze({
          stageOutcome: true,
          showGameOver: true,
          allowDismiss: true,
          preserveSave: true,
          skipSaveDeletion: true,
          visualOnly: false,
          endGame: true,
          finishGame: true,
          terminateGame: false,
          skipGameOver: false,
          skipEndGame: false
        })
      }),
      presentation: 'silent',
      endEvent: 'finished'
    })
  })
});
