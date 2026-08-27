import { cockRoachHuntEvent } from './events/cockRoachHunt.js?catalog=20260823i';
import { spawnDeadEvent } from './events/spawnDead.js?catalog=20260823i';
import { spawnChestEvent } from './events/spawnChest.js?catalog=20260823i';

export const eventList = Object.freeze([
  cockRoachHuntEvent,
  spawnDeadEvent,
  spawnChestEvent
]);

export function getEventDefinition(keyOrId) {
  return eventList.find((eventDefinition) => (
    eventDefinition.key === keyOrId
    || String(eventDefinition.id) === String(keyOrId)
  )) || null;
}
