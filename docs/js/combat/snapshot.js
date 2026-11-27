// Launch and simulation snapshots: copy data without retaining live browser objects.
const OMIT_COMBAT_VALUE = Symbol('omit-combat-value');
function sanitizeCombatData(value, path, dropped, seen) {
  if (typeof value === 'function' || typeof value === 'symbol') {
    dropped.push(path);
    return OMIT_COMBAT_VALUE;
  }
  if (value === null || typeof value !== 'object') return value;
  if (typeof Node !== 'undefined' && value instanceof Node) {
    dropped.push(path);
    return OMIT_COMBAT_VALUE;
  }
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  Object.entries(value).forEach(([key, entry]) => {
    const clean = sanitizeCombatData(entry, `${path}.${key}`, dropped, seen);
    if (clean !== OMIT_COMBAT_VALUE) clone[key] = clean;
  });
  return clone;
}

export function cloneCombatSnapshot(value, label = 'combat-data') {
  const dropped = [];
  const clone = sanitizeCombatData(value, label, dropped, new WeakMap());
  if (dropped.length) {
    console.warn(`[AttackFlight] Donnees runtime retirees de ${label}`, {
      dropped,
    });
  }
  return clone === OMIT_COMBAT_VALUE ? null : clone;
}
