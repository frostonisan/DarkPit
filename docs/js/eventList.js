import { cockRoachHuntEvent } from './events/cockRoachHunt.js?catalog=20260823i';
import { spawnDeadEvent } from './events/spawnDead.js?catalog=20260823i';
import { spawnChestEvent } from './events/spawnChest.js?catalog=20260823i';
import { victoryEvent } from './events/victory.js?catalog=20260823i';
import { defeatEvent } from './events/defeat.js?catalog=20260823i';

export const eventList = Object.freeze([
  cockRoachHuntEvent,
  spawnDeadEvent,
  spawnChestEvent,
  victoryEvent,
  defeatEvent
]);

export function getEventDefinition(keyOrId) {
  return eventList.find((eventDefinition) => (
    eventDefinition.key === keyOrId
    || String(eventDefinition.id) === String(keyOrId)
  )) || null;
}
