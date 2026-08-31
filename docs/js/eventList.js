import { cockRoachHuntEvent } from './events/cockRoachHunt.js?catalog=20260823i';
import { victoryEvent } from './events/victory.js?catalog=20260823i';
import { defeatEvent } from './events/defeat.js?catalog=20260823i';

export const eventList = Object.freeze([
  cockRoachHuntEvent,
  victoryEvent,
  defeatEvent
]);

export function getEventDefinition(keyOrId) {
  return eventList.find((eventDefinition) => (
    eventDefinition.key === keyOrId
    || String(eventDefinition.id) === String(keyOrId)
  )) || null;
}
