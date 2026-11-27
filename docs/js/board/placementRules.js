import { ENTITY_SIZE_OPTIONS, footprintCells, footprintCenter, boardOccupantsAt } from './model.js';

// No writes to the board, entities, random state or presentation while searching.
export function planBoardPlacements(state, requests, {
  push = false, allowedCell = () => true, allowGroundConsumables = false,
} = {}) {
  const fail = reason => ({ valid: false, reason });
  if (!requests.length) return fail('Aucun placement.');
  if (!state) return fail('Terrain introuvable.');
  const data = state.geometry, moves = new Map(), fixed = new Set(), collisions = new Set();
  for (const { id: rawId, anchor, size = 1 } of requests) {
    if (!ENTITY_SIZE_OPTIONS.includes(Number(size))) return fail('Taille invalide : 1, 2, 3 ou 6 cases.');
    const members = footprintCells(data, anchor, Number(size)), id = String(rawId);
    if (members.length !== Number(size)) return fail('Le groupement entier doit rester dans les limites du terrain.');
    if (members.some(cell => fixed.has(cell) || !allowedCell(id, cell))) return fail('Les groupements se chevauchent ou traversent une zone interdite.');
    members.forEach(cell => fixed.add(cell));
    moves.set(id, { id, anchor, size: Number(size), members });
  }
  for (const cell of fixed) for (const occupant of boardOccupantsAt(state, cell)) {
    if (moves.has(occupant.id)) continue;
    if (allowGroundConsumables && !occupant.movable && occupant.groundConsumable) continue;
    if (!push || !occupant.movable) return fail('Une case du groupement est déjà occupée.');
    collisions.add(occupant.id);
  }
  if (!collisions.size) return { valid: true, moves, pushed: [], allowGroundConsumables };
  const occupants = [...state.occupants.values()];
  for (const occupant of occupants) if (!moves.has(occupant.id) && !collisions.has(occupant.id)) occupant.members.forEach(cell => fixed.add(cell));
  const displaced = occupants.filter(o => collisions.has(o.id)).sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));
  const candidates = displaced.map(occupant => {
    const origin = footprintCenter(data, occupant.members);
    return data.cells.map(cell => {
      const members = footprintCells(data, cell.id, occupant.size);
      if (!members.length || members.some(member => fixed.has(member) || !allowedCell(occupant.id, member))) return null;
      const point = footprintCenter(data, members);
      return { id: occupant.id, anchor: cell.id, size: occupant.size, members,
        cost: (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2 };
    }).filter(Boolean).sort((a, b) => a.cost - b.cost);
  });
  // Same bounded, deterministic nearest-first search as the visible game.
  let nodes = 0, best = null, bestCost = Infinity;
  function search(index, reserved, chosen, cost) {
    if (++nodes > 20000 || cost >= bestCost) return;
    if (index === displaced.length) { best = new Map(chosen); bestCost = cost; return; }
    for (const candidate of candidates[index]) {
      if (nodes > 20000 || cost + candidate.cost >= bestCost) break;
      if (candidate.members.some(cell => reserved.has(cell))) continue;
      const next = new Set(reserved); candidate.members.forEach(cell => next.add(cell));
      chosen.set(displaced[index].id, candidate);
      search(index + 1, next, chosen, cost + candidate.cost);
      chosen.delete(displaced[index].id);
    }
  }
  search(0, fixed, new Map(moves), 0);
  return best ? { valid: true, moves: best, pushed: [...collisions], allowGroundConsumables }
    : fail('Aucun placement complet disponible pour repousser les voisins.');
}
