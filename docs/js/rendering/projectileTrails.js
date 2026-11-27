import { requestAnimationFrame, cancelAnimationFrame, registerCombatState, clockNow } from '../combat/clock.js';

const trails = new Set();
let pending = new Set(), frame = null;

// Heads and their attached trails share one RAF callback for the projectile
// group. No independent animation clock; idle = zero.
export function scheduleProjectileFrame(callback) {
  pending.add(callback);
  if (frame !== null) return;
  frame = requestAnimationFrame((now, stamp) => {
    frame = null;
    const callbacks = pending; pending = new Set();
    try { for (const callback of callbacks) void callback(now, stamp); }
    finally { flushProjectileTrails(); }
  });
}

export function createProjectileTrail(node, visual) {
  const trail = { node, visual, nx: 0, ny: 1 };
  trails.add(trail); node.appendChild(visual);
  return trail;
}

export function removeProjectileTrail(trail) {
  if (trail && trails.delete(trail)) trail.visual.remove();
}

function orientTrail(trail, dx, dy, length) {
  trail.nx = -dy; trail.ny = dx;
  const stretch = length / 96;
  const transform = `matrix(${dx * stretch}, ${dy * stretch}, ${-dy}, ${dx}, 0, 0)`;
  if (trail.transform !== transform) trail.visual.style.transform = trail.transform = transform;
  const opacity = length > .1 ? '0.84' : '0';
  if (trail.opacity !== opacity) trail.visual.style.opacity = trail.opacity = opacity;
}

// A shared bitmap keeps its shape. Only direction and launch reveal change;
// there is no per-frame deformation, pixel redraw or phase calculation.
export function updateMagicTrail(trail, _x, _y, dx, dy, length) {
  orientTrail(trail, dx, dy, length);
}

export function updatePhysicalTrail(trail, curve, endX, endY, progress, span) {
  const dx = endX - curve.x;
  const dy = endY - curve.y - 4 * curve.height * (1 - 2 * progress);
  const speed = Math.hypot(dx, dy) || 1;
  orientTrail(trail, dx / speed, dy / speed, Math.min(112, speed * span));
}

export function flushProjectileTrails() {
  for (const trail of trails) if (!trail.node.isConnected) removeProjectileTrail(trail);
}

export function clearProjectileTrails() {
  for (const trail of trails) trail.visual.remove();
  trails.clear();
}

// Called after the owner invalidates/removes the old flight DOM. Settle those
// cancelled visual promises now, before StopGame clears the combat clock.
export function cancelProjectileFrames() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  const callbacks = pending; pending = new Set();
  for (const callback of callbacks) void callback(clockNow(), 0);
}

registerCombatState('projectile-trails', () => null, () => {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null; pending.clear(); clearProjectileTrails();
});
