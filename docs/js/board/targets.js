import { getFootprintOccupant } from "./controller.js";

// DOM-backed board access stays here while the logical board is extracted.
export const isHexTarget = target => target?.nodeType === 1 && target.classList.contains('hex');

export function getEntityHex(entity) {
  if (isHexTarget(entity)) return entity.isConnected ? entity : null;
  return document.getElementById(`Box_Entite_${entity?.id}`)?.closest('.hex') || null;
}

export function getHexEntity(hex, entities) {
  const box = getFootprintOccupant(hex);
  return box ? entities.find(entity => String(entity.id) === box.id.replace('Box_Entite_', '')) || null : null;
}
