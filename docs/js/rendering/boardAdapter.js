// The current HTML board is one adapter for the logical grid and its coordinates.
import { createBoardGeometry, footprintCells, footprintCenter } from '../board/model.js';
const geometryCache = new WeakMap();
export const gridForHex = hex => hex?.closest('.hex-grid, #hexGrid') || hex?.parentElement;
export const readHexCoordinates = hex => ({ row: Number(hex?.dataset.row), col: Number(hex?.dataset.col) });
export const projectBoardCell = (row, col, width = 1, rowHeight = .75) => ({
  x: col * width + (Math.round(row) % 2 ? width / 2 : 0), y: row * rowHeight,
});
export function invalidateBoardGeometry(grid) { if (grid) geometryCache.delete(grid); }
export function getBoardGeometry(grid) {
  if (!grid) return null;
  let data = geometryCache.get(grid);
  if (data?.first?.isConnected && data.first.parentElement === grid) return data;
  const cells = [...grid.querySelectorAll('.hex[data-position]')];
  const model = createBoardGeometry(cells.map(hex => ({ id: hex.dataset.position,
    ...readHexCoordinates(hex), x: parseFloat(hex.style.left) || 0, y: parseFloat(hex.style.top) || 0 })));
  data = { cells, model, first: cells[0], byPosition: new Map(cells.map(hex => [hex.dataset.position, hex])),
    points: new Map(cells.map(hex => [hex, model.byId.get(hex.dataset.position)])) };
  geometryCache.set(grid, data);
  return data;
}
export function getFootprintElements(anchor, size = 1) {
  if (!anchor?.isConnected) return [];
  const data = getBoardGeometry(gridForHex(anchor));
  return footprintCells(data.model, anchor.dataset.position, size).map(id => data.byPosition.get(id));
}
export function getFootprintCenter(members) {
  const data = getBoardGeometry(gridForHex(members[0]));
  return footprintCenter(data?.model, members.map(hex => hex.dataset.position));
}
// A view binds IDs to live entities/DOM only at the renderer boundary.
export function getOccupantView(registry, id) {
  const record = registry.model.occupants.get(String(id));
  if (!record) return null;
  return { ...record, ...registry.views.get(record.id),
    anchor: registry.geometry.byPosition.get(record.anchor),
    members: record.members.map(cell => registry.geometry.byPosition.get(cell)) };
}
export function getPlacementViews(registry, plan, entities) {
  return new Map([...plan.moves].map(([id, move]) => [id, {
    entity: entities.get(id), hex: registry.geometry.byPosition.get(move.anchor), size: move.size,
    members: move.members.map(cell => registry.geometry.byPosition.get(cell)),
    ...('cost' in move ? { cost: move.cost } : {}),
  }]));
}
