import { entites } from '../entities/runtime.js';
import { isAdminMode } from '../storage/gameStorage.js';
import { isCombatInteractionBlocked } from '../combat/clock.js';
import { endDragHelperCleanup } from '../ui/drag.js';

const HOLD_MS = 300;
const MOVE_TOLERANCE = 12;
let gesture = null;
let suppressClickUntil = 0;
let bound = false;

function sendDrag(type, target, current) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: current.transfer },
    clientX: { value: current.x }, clientY: { value: current.y },
  });
  return target.dispatchEvent(event);
}

function transferFor(box) {
  // Mobile browsers need the payload, not native HTML drag support.
  const values = new Map([['text', box.id]]);
  return { getData: type => values.get(type) || '', setData: (type, value) => values.set(type, value) };
}

function canDrag(box, sprite) {
  const entity = entites.find(e => String(e.id) === box.id.slice('Box_Entite_'.length));
  return entity && sprite.draggable && !entity.isDEAD && !entity.statut?.includes('dead')
    && !isCombatInteractionBlocked()
    && (entity.side === 'A' || isAdminMode() && window.levelRunning === 'admin');
}

function createPreview(current) {
  const source = current.sprite.querySelector('canvas');
  if (!source) return;
  const rect = source.getBoundingClientRect();
  const preview = document.createElement('canvas');
  preview.className = 'touch-entity-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.width = source.width; preview.height = source.height;
  preview.getContext('2d').drawImage(source, 0, 0);
  current.rotated = current.box.closest('#game-shell')?.dataset.rotated === 'true';
  preview.style.width = `${current.rotated ? rect.height : rect.width}px`;
  preview.style.height = `${current.rotated ? rect.width : rect.height}px`;
  current.offsetX = current.startX - rect.left;
  current.offsetY = current.startY - rect.top;
  current.previewWidth = rect.width;
  current.preview = preview;
  document.body.append(preview);
}

function paintDrag(current) {
  current.frame = null;
  if (gesture !== current || !current.active) return;
  if (!current.box.isConnected || !canDrag(current.box, current.sprite)) { cancelTouchEntityDrag(); return; }
  if (current.preview) {
    const x = current.x - current.offsetX + (current.rotated ? current.previewWidth : 0);
    const y = current.y - current.offsetY;
    current.preview.style.transform = `translate3d(${x}px, ${y}px, 0)${current.rotated ? ' rotate(90deg)' : ''}`;
  }
  // One hit test per rendered frame, not one per incoming touchmove.
  const hex = document.elementFromPoint(current.x, current.y)?.closest('.hex');
  if (hex !== current.hovered) {
    current.hovered = hex;
    sendDrag('dragover', hex || document.body, current);
  }
}

function finishGesture(drop = false) {
  const current = gesture;
  if (!current) return;
  window.clearTimeout(current.timer);
  if (current.frame !== null) window.cancelAnimationFrame(current.frame);
  try {
    if (current.active) {
      // Resolve the final finger position even if RAF has not painted it yet.
      if (drop && current.box.isConnected && canDrag(current.box, current.sprite)) {
        paintDrag(current);
        if (current.hovered && gesture === current) sendDrag('drop', current.hovered, current);
      }
      sendDrag('dragend', current.sprite.isConnected ? current.sprite : current.origin, current);
      suppressClickUntil = Date.now() + 600;
    }
  } finally {
    gesture = null;
    current.preview?.remove();
    if (current.active && !current.sprite.isConnected && !current.origin.isConnected) endDragHelperCleanup();
    if (current.sprite.hasPointerCapture?.(current.pointerId)) current.sprite.releasePointerCapture(current.pointerId);
  }
}

export function cancelTouchEntityDrag() { finishGesture(false); }

export function bindTouchEntityDrag() {
  if (bound) return;
  bound = true;
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    if (gesture) { cancelTouchEntityDrag(); return; }
    if (event.isPrimary === false || event.target.closest('button, input, select, textarea, a')) return;
    const box = event.target.closest('#hexGrid [id^="Box_Entite_"]');
    const sprite = box?.querySelector('.sprite');
    if (!box || !sprite || !canDrag(box, sprite)) return;
    // Own only eligible touch holds. A quick tap still reaches the click UI.
    event.stopPropagation();
    const current = { box, sprite, origin: box.closest('.hex'), pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      active: false, frame: null, hovered: null, transfer: transferFor(box) };
    gesture = current;
    try { sprite.setPointerCapture(event.pointerId); } catch { /* Detached/test pointer. */ }
    current.timer = window.setTimeout(() => {
      if (gesture !== current || !box.isConnected || !canDrag(box, sprite)) { cancelTouchEntityDrag(); return; }
      current.active = true;
      if (!sendDrag('dragstart', sprite, current)) { cancelTouchEntityDrag(); return; }
      createPreview(current);
      paintDrag(current);
    }, HOLD_MS);
  }, true);

  document.addEventListener('pointermove', event => {
    const current = gesture;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.active) {
      if (Math.hypot(current.x - current.startX, current.y - current.startY) > MOVE_TOLERANCE) cancelTouchEntityDrag();
      return;
    }
    event.preventDefault();
    if (current.frame === null) current.frame = window.requestAnimationFrame(() => paintDrag(current));
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    finishGesture(true);
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
      if (event.pointerId === gesture?.pointerId) cancelTouchEntityDrag();
    }, true);
  }
  for (const type of ['click', 'dblclick', 'contextmenu']) {
    document.addEventListener(type, event => {
      if (Date.now() < suppressClickUntil || type === 'contextmenu' && gesture) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
  }
  window.addEventListener('blur', cancelTouchEntityDrag);
  window.addEventListener('resize', cancelTouchEntityDrag);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelTouchEntityDrag(); });
}
