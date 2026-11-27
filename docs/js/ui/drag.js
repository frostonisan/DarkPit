// Transient helper cleanup during drag and drop.
export const DRAG_HELPER_CLEANUP_EVENT = "codex:drag-helper-cleanup";

let dragDropActive = false;
let documentGuardsBound = false;

function setBodyDragState(active) {
  if (typeof document === "undefined") return;
  document.body?.classList?.toggle("drag-drop-active", active);
}

export function isDragDropActive() {
  return dragDropActive;
}

export function clearDragTransientHelpers({ includePersistent = false, emitEvent = true } = {}) {
  if (typeof document === "undefined") return;

  document.querySelectorAll(".stat-hover").forEach(helper => helper.remove());
  document.querySelectorAll(".Game-helper .destroyed-loot-helper").forEach(helper => helper.remove());

  const itemDescriptionSelector = includePersistent
    ? ".shop-item-card.item-description-card"
    : ".shop-item-card.item-description-card:not(.persistent)";

  document
    .querySelectorAll(itemDescriptionSelector)
    .forEach(helper => helper.remove());

  if (emitEvent) {
    document.dispatchEvent(new CustomEvent(DRAG_HELPER_CLEANUP_EVENT, {
      detail: { includePersistent }
    }));
  }
}

export function beginDragHelperCleanup() {
  dragDropActive = true;
  setBodyDragState(true);
  clearDragTransientHelpers();
}

export function endDragHelperCleanup() {
  clearDragTransientHelpers();
  dragDropActive = false;
  setBodyDragState(false);
}

export function bindDragHelperCleanupGuards(root = null) {
  if (documentGuardsBound || typeof document === "undefined") return;

  const target = root || document;
  documentGuardsBound = true;

  target.addEventListener("dragstart", beginDragHelperCleanup, true);
  target.addEventListener("drop", endDragHelperCleanup, true);
  target.addEventListener("dragend", endDragHelperCleanup, true);
  target.addEventListener("dragcancel", endDragHelperCleanup, true);
}

// Bind only once this module's own state exists, not from a cyclic importer.
bindDragHelperCleanupGuards();

