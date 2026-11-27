// Logical hex geometry and occupancy. Values and IDs only: no elements or entity instances.
export const ENTITY_SIZE_OPTIONS = Object.freeze([1, 2, 3, 6]);
const SHAPES = { 1: [[0, 0]], 2: [[0, 0], [1, 0]], 3: [[0, 0], [1, 0], [0, 1]],
  6: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] };
const key = (q, r) => `${q},${r}`;
export const entitySizeInCells = entity => ENTITY_SIZE_OPTIONS.includes(Number(entity?.sizeInCells)) ? Number(entity.sizeInCells) : 1;
export const offsetToAxial = (row, col) => ({ q: col - (row - (row & 1)) / 2, r: row });
export const axialDistance = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));

export function createBoardGeometry(input) {
  const cells = input.map(cell => ({ id: String(cell.id), row: cell.row, col: cell.col,
    ...offsetToAxial(cell.row, cell.col), x: cell.x, y: cell.y }));
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  const byAxial = new Map(cells.filter(cell => Number.isFinite(cell.q) && Number.isFinite(cell.r))
    .map(cell => [key(cell.q, cell.r), cell.id]));
  // Build footprints once; planning only reads this cache, including on a restored board.
  const footprints = new Map();
  for (const cell of cells) for (const size of ENTITY_SIZE_OPTIONS) {
    const members = SHAPES[size].map(([q, r]) => byAxial.get(key(cell.q + q, cell.r + r)));
    footprints.set(`${cell.id}:${size}`, size === 1 ? [cell.id] : members.every(Boolean) ? members : []);
  }
  return { cells, byId, footprints };
}

export function footprintCells(geometry, anchor, size = 1) {
  return geometry?.footprints.get(`${anchor}:${size}`) || [];
}

export function footprintCenter(geometry, members) {
  return members.reduce((point, id) => {
    const cell = geometry.byId.get(id);
    return { x: point.x + cell.x / members.length, y: point.y + cell.y / members.length };
  }, { x: 0, y: 0 });
}

export function chooseFootprintRole(roles, previous = 'gueux') {
  const order = ['gueux', 'tank', 'fantassin', 'mage'], counts = new Map(order.map(role => [role, 0]));
  for (const role of roles) counts.set(role, counts.get(role) + 1);
  const winners = order.filter(role => counts.get(role) === Math.max(...counts.values()));
  return winners.includes(String(previous)) ? String(previous) : winners[0];
}

export function createBoardState(geometry) {
  return { geometry, occupants: new Map(), byCell: new Map() };
}

export function removeBoardOccupant(state, id) {
  const record = state.occupants.get(String(id));
  if (!record) return;
  state.occupants.delete(record.id);
  for (const cell of record.members) {
    const ids = state.byCell.get(cell);
    ids?.delete(record.id);
    if (!ids?.size) state.byCell.delete(cell);
  }
}

export function putBoardOccupant(state, input) {
  const record = { id: String(input.id), anchor: input.anchor, size: input.size,
    members: [...input.members], movable: input.movable === true,
    groundConsumable: input.groundConsumable === true };
  removeBoardOccupant(state, record.id);
  state.occupants.set(record.id, record);
  for (const cell of record.members) {
    if (!state.byCell.has(cell)) state.byCell.set(cell, new Set());
    state.byCell.get(cell).add(record.id);
  }
  return record;
}

export function boardOccupantsAt(state, cell) {
  return [...(state?.byCell.get(cell) || [])].map(id => state.occupants.get(id));
}

// Commit the entire validated group before any renderer or gameplay notification runs.
export function applyBoardPlacements(state, plan) {
  if (!plan?.valid) return false;
  for (const move of plan.moves.values()) removeBoardOccupant(state, move.id);
  for (const move of plan.moves.values()) putBoardOccupant(state, { ...move, movable: true });
  return true;
}

export function snapshotBoardState(state) {
  return { cells: state.geometry.cells.map(cell => ({ ...cell })),
    occupants: [...state.occupants.values()].map(record => ({ ...record, members: [...record.members] })) };
}
