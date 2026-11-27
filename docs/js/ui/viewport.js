// One responsive frame. Camera transforms belong to its children, never to this host.
let frameGeometry = { scale: 1, left: 0, top: 0, rotated: false, width: 1536, height: 676 };
export const effectViewport = () => frameGeometry;
export function ensureGameShell() {
  let shell = document.getElementById('game-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'game-shell';
    document.body.append(shell);
  }
  const version = document.getElementById('game-version');
  if (version && version.parentElement !== shell) shell.append(version);
  return shell;
}

export function layoutGameShell() {
  const shell = document.getElementById('game-shell');
  if (!shell) return;
  const root = document.documentElement, css = getComputedStyle(root);
  const pixels = name => parseFloat(css.getPropertyValue(name)) || 0;
  const logicalWidth = pixels('--game-width'), logicalHeight = pixels('--game-height');
  if (!logicalWidth || !logicalHeight) return;
  const view = window.visualViewport;
  const zoomed = view && Math.abs(view.scale - 1) > .01;
  const width = zoomed ? root.clientWidth : Math.min(root.clientWidth, view?.width ?? root.clientWidth);
  const height = zoomed ? root.clientHeight : Math.min(root.clientHeight, view?.height ?? root.clientHeight);
  // A keyboard must not change the orientation of the logical frame.
  const rotated = matchMedia('(pointer: coarse)').matches && root.clientHeight > root.clientWidth;
  const left = pixels('--game-safe-left'), top = pixels('--game-safe-top');
  const availableWidth = Math.max(1, width - left - pixels('--game-safe-right'));
  const availableHeight = Math.max(1, height - top - pixels('--game-safe-bottom'));
  const fittedWidth = rotated ? logicalHeight : logicalWidth;
  const fittedHeight = rotated ? logicalWidth : logicalHeight;
  const scale = Math.min(availableWidth / fittedWidth, availableHeight / fittedHeight);
  const x = (zoomed ? 0 : view?.offsetLeft || 0) + left + (availableWidth - fittedWidth * scale) / 2;
  const y = (zoomed ? 0 : view?.offsetTop || 0) + top + (availableHeight - fittedHeight * scale) / 2;
  const previous = frameGeometry;
  frameGeometry = { scale, left: x + (rotated ? logicalHeight * scale : 0), top: y, rotated, width: logicalWidth, height: logicalHeight };
  const values = {
    '--game-scale': String(scale), '--game-rotation': rotated ? '90deg' : '0deg',
    '--game-left': `${x + (rotated ? logicalHeight * scale : 0)}px`, '--game-top': `${y}px`,
  };
  for (const [name, value] of Object.entries(values)) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
  if (shell.dataset.rotated !== String(rotated)) shell.dataset.rotated = String(rotated);
  if (previous.scale !== scale || previous.width !== logicalWidth || previous.height !== logicalHeight || previous.rotated !== rotated) {
    window.dispatchEvent(new Event('gameViewportChanged'));
  }
}

// Effects use the same logical units as the board, regardless of the viewport
// at creation. The shell alone scales/rotates both existing and future effects.
export function screenEffectHost() {
  const shell = document.getElementById('game-shell');
  if (!shell) return document.body;
  let layer = document.getElementById('game-screen-effects');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'game-screen-effects';
  }
  if (layer.parentElement !== shell) shell.append(layer);
  return layer;
}

export function screenEffectRect(rect) {
  const host = screenEffectHost();
  if (host === document.body) return rect;
  const { scale, left, top, rotated } = frameGeometry;
  const factor = 1 / scale;
  const x = (rotated ? rect.top - top : rect.left - left) * factor;
  const y = (rotated ? left - rect.right : rect.top - top) * factor;
  const width = (rotated ? rect.height : rect.width) * factor;
  const height = (rotated ? rect.width : rect.height) * factor;
  return { left: x, top: y, right: x + width, bottom: y + height, width, height };
}

let frame = null;
export function scheduleGameLayout() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => { frame = null; layoutGameShell(); });
}

// Screen measurements must be converted once before positioning a child overlay.
// Use the actual rendered matrix, including rotation, rather than width ratios.
export function overlayPoint(host, x, y) {
  const shell = host?.closest?.('#game-shell');
  if (!shell) return { x, y };
  const style = getComputedStyle(shell), rect = shell.getBoundingClientRect();
  const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
  const corners = [[0, 0], [shell.offsetWidth, 0], [0, shell.offsetHeight], [shell.offsetWidth, shell.offsetHeight]]
    .map(([cx, cy]) => new DOMPoint(cx, cy).matrixTransform(matrix));
  const originX = rect.left - Math.min(...corners.map(p => p.x));
  const originY = rect.top - Math.min(...corners.map(p => p.y));
  return new DOMPoint(x - originX, y - originY).matrixTransform(matrix.inverse());
}

export function overlayRect(host, target) {
  const rect = target.getBoundingClientRect();
  if (!host?.closest?.('#game-shell')) return rect;
  const a = overlayPoint(host, rect.left, rect.top), b = overlayPoint(host, rect.right, rect.bottom);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function overlayBounds(host) {
  const shell = host?.closest?.('#game-shell');
  if (shell) return { left: 0, top: 0, right: shell.clientWidth, bottom: shell.clientHeight };
  const view = window.visualViewport, left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
  return { left, top, right: left + Math.min(innerWidth, view?.width ?? innerWidth),
    bottom: top + Math.min(innerHeight, view?.height ?? innerHeight) };
}
