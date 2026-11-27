// Read sharing only: projectile callbacks, clock samples and impacts keep their order.
// RAFs share their native timestamp; a movement notification shares one native
// performance timestamp among its followers. Never use rounded gameplay time.
let frameStamp = null, rectangles = new Map(), observer = null;
const overlays = new Map();
// Observe the positioning tree, not the document's animated HUD/effects.
// Unknown targets (editor/standalone previews) retain conservative observation.
let broadObservation = false, observationDirty = false;
let observedOptions = new WeakMap(), positioningNodes = new WeakSet();
const targetScopes = new Map();
const shallowObservation = { attributes: true, childList: true };

function watchNode(node, options) {
  const previous = observedOptions.get(node);
  // A cell and its occupant may share parents. A narrower subscription must
  // never disable the child-list observation required by another target.
  const merged = { ...previous, ...options };
  if (previous && Object.keys(merged).every(key => previous[key] === merged[key])) return;
  observer.observe(node, merged); observedOptions.set(node, merged);
}

function observeTarget(node) {
  if (!observer || broadObservation) return;
  if (!isBoardAnchor(node)) {
    broadObservation = true;
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    return;
  }
  if (targetScopes.has(node)) return;
  const scope = new Map();
  // Parent attributes and reparenting can move the anchor. Sibling HUD text
  // and descendants of out-of-flow effects cannot change its rectangle.
  for (let parent = node; parent; parent = parent.parentElement) {
    scope.set(parent, shallowObservation); positioningNodes.add(parent);
  }
  function visit(element) {
    const isolated = ['absolute', 'fixed'].includes(getComputedStyle(element).position);
    boundaries.set(element, isolated);
    scope.set(element, isolated ? { attributes: true } : { ...shallowObservation, characterData: true });
    if (!isolated) for (const child of element.childNodes) {
      if (child.nodeType === 1) visit(child);
      else if (child.nodeType === 3) scope.set(child, { characterData: true });
    }
  }
  // In-flow descendants can size the target. Observe their structure, stopping
  // at isolation boundaries; still observe the boundary itself if it changes.
  const box = node.closest('.entite-box');
  const root = box || node;
  for (const child of root.children) if (!child.contains(node) && child !== node) visit(child);
  for (let parent = node; parent && parent !== root; parent = parent.parentElement) {
    for (const child of parent.children) if (!child.contains(node)) visit(child);
  }
  targetScopes.set(node, scope);
  for (const [element, options] of scope) watchNode(element, options);
}

function reconnectObservation() {
  if (!observer || broadObservation) return;
  observationDirty = false;
  observer.disconnect();
  observedOptions = new WeakMap(); positioningNodes = new WeakSet();
  watchNode(document.head, { subtree: true, childList: true, characterData: true, attributes: true });
  for (const [target, scope] of targetScopes) {
    for (let parent = target; parent; parent = parent.parentElement) positioningNodes.add(parent);
    for (const [element, options] of scope) watchNode(element, options);
  }
}

// Visual invalidation only: never wake an entity or apply movement penalties.
export function notifyTargetGeometryChanged(node) {
  if (!node) return;
  for (const target of new Set([...anchors.keys(), ...targetScopes.keys()])) if (node.contains(target)) {
    anchors.delete(target); rectangles.delete(target); targetScopes.delete(target);
    observationDirty = true;
  }
  animationReads = new WeakMap();
}
// Only the board's own anchors have the fixed, out-of-flow HUD contract.
// Unknown/editor targets retain the per-frame behaviour below.
let anchors = new Map(), animationReads = new WeakMap(), boundaries = new WeakMap(), boxes = new WeakMap();
const presentationSelector = '.hud-ingame, .animation-sprite, .effects-container, '
  + '.cast-animation-container, .aura-container, .combat-popup-damages, .combat-popup-status';

function rememberBoundaries(node) {
  const screen = document.getElementById('game-screen-effects');
  if (screen?.parentElement?.id === 'game-shell' && !boundaries.has(screen)) {
    boundaries.set(screen, ['absolute', 'fixed'].includes(getComputedStyle(screen).position));
  }
  const cell = node.closest('#hexGrid .hex');
  if (cell && !boundaries.has(cell)) boundaries.set(cell, ['absolute', 'fixed'].includes(getComputedStyle(cell).position));
  const enclosing = node.closest('#hexGrid .entite-box');
  const owners = enclosing ? [enclosing] : node.matches('.hex')
    ? [...node.children].filter(child => child.matches('.entite-box')) : [];
  for (const box of owners) if (!boxes.has(box)) {
    const roots = [box, ...box.querySelectorAll(presentationSelector)];
    // Called only after the required rectangle read, while style is clean.
    // Mutation processing must never query computed style or layout.
    for (const root of roots) boundaries.set(root, ['absolute', 'fixed'].includes(getComputedStyle(root).position));
    boxes.set(box, roots);
  }
}

function forgetBox(box) {
  for (const root of boxes.get(box) || []) boundaries.delete(root);
  boxes.delete(box);
}

function containsTarget(node) {
  for (const target of rectangles.keys()) if (node.contains(target)) return true;
  for (const target of anchors.keys()) if (node.contains(target)) return true;
  return false;
}

function affectsStylesheet(record, element) {
  if (element?.closest('style, link')) return true;
  return [...(record.addedNodes || []), ...(record.removedNodes || [])].some(node =>
    node.nodeType === 1 && (node.matches('style, link') || node.querySelector('style, link')));
}

function isBoardAnchor(node) {
  return node.matches('.entitesContainer, .hex') && !!node.closest('#hexGrid');
}

function isHudMutation(record) {
  const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
  const hud = element?.closest('.hud-ingame');
  // Replacing/reparenting the HUD itself is still an ordinary invalidation.
  // Its descendants cannot size or position the sibling .drag-box or .hex.
  if (!hud || element === hud && record.type === 'attributes'
    || !hud.parentElement?.matches('#hexGrid .entite-box')) return false;
  return boundaries.get(hud) === true && !containsTarget(hud);
}

function consume(records) {
  for (const record of records) {
    const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (!element || affectsStylesheet(record, element)) { invalidateProjectileGeometry(); return; }
    // Check the style contract again after edits to an isolation boundary.
    const boundaryChanged = record.type === 'attributes' && boundaries.get(element) === true;
    if (record.type === 'attributes') boundaries.delete(element);
    const screen = element.closest('#game-screen-effects');
    if (screen && (screen !== element || record.type === 'childList')
      && boundaries.get(screen) === true && !containsTarget(screen)) continue;
    if (isHudMutation(record)) continue;
    const decoration = element.closest('.entity-visual-calibrated .animation-sprite, '
      + '.entity-visual-calibrated .effects-container, .entity-visual-calibrated .cast-animation-container, '
      + '.entity-visual-calibrated .aura-container, .entity-visual-calibrated .combat-popup-damages, '
      + '.entity-visual-calibrated .combat-popup-status');
    if (decoration && (decoration !== element || record.type === 'childList')
      && boundaries.get(decoration) === true && !containsTarget(decoration)) continue;
    const cell = element.closest('#hexGrid .hex');
    if (cell && boundaries.get(cell) === true) {
      if (record.type === 'childList' || boundaryChanged || element.matches(presentationSelector)) {
        for (const target of targetScopes.keys()) if (cell.contains(target) || target.contains(cell)) {
          targetScopes.delete(target); observationDirty = true;
        }
      }
      // An absolute cell cannot relayout its neighbours, even when a changed
      // entity in it is not among the currently cached projectile targets.
      for (const map of [rectangles, anchors]) for (const target of map.keys()) {
        if (cell.contains(target) || target.contains(cell)) {
          map.delete(target);
        }
      }
      animationReads = new WeakMap();
      for (const box of cell.children) if (box.matches('.entite-box')) forgetBox(box);
      continue;
    }
    invalidateProjectileGeometry();
    return;
  }
}

function contentLoaded(event) {
  // Loading an image inside an isolated effect cannot move a board target.
  // Stylesheets and ordinary in-flow resources retain normal invalidation.
  if (!broadObservation && !observedOptions.has(event.target)
    && !event.target.matches?.('style, link')) return;
  consume([{ type: 'load', target: event.target }]);
}

function anchorAnimations(node) {
  const animations = [];
  for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
    let current = animationReads.get(ancestor);
    if (!current) {
      // Filled, finished animations keep their final transform but no longer move.
      current = ancestor.getAnimations().filter(animation => animation.playState !== 'finished' && animation.playState !== 'idle');
      animationReads.set(ancestor, current);
    }
    animations.push(...current);
  }
  return animations;
}

function readTarget(node) {
  if (!isBoardAnchor(node)) { observeTarget(node); return node.getBoundingClientRect(); }
  let cached = anchors.get(node);
  // An animated anchor is sampled once per frame, including its final state.
  if (!cached || cached.animations.length) {
    cached = { rect: node.getBoundingClientRect(), animations: anchorAnimations(node) };
    rememberBoundaries(node);
    observeTarget(node);
    anchors.set(node, cached);
  }
  return cached.rect;
}

function animationChanged(event) {
  for (const target of anchors.keys()) if (event.target.contains?.(target)) {
    invalidateProjectileGeometry();
    break;
  }
}

export function invalidateProjectileGeometry() {
  frameStamp = null;
  rectangles = new Map();
  anchors = new Map();
  animationReads = new WeakMap();
  boundaries = new WeakMap();
  boxes = new WeakMap();
  targetScopes.clear();
  observationDirty = true;
}

// For the renderer's out-of-flow sprites/cast effects only. Transform, filter
// and opacity do not resize their surrounding layout boxes. A transformed
// target or ancestor still needs a fresh rectangle. Unknown/pending writes
// retain the ordinary conservative invalidation, including editor changes.
export function setDecorativeStyle(node, property, value) {
  if (!observer || !broadObservation && !observedOptions.has(node) || !['transform', 'filter', 'opacity', 'scale'].includes(property)) {
    node.style[property] = value;
    return;
  }
  consume(observer.takeRecords());
  const movesTarget = broadObservation
    ? [...rectangles.keys(), ...anchors.keys()].some(target => node.contains(target)) : positioningNodes.has(node);
  node.style[property] = value;
  const records = observer.takeRecords();
  if (movesTarget || records.some(record => record.type !== 'attributes'
    || record.attributeName !== 'style' || record.target !== node)) invalidateProjectileGeometry();
}

// Drain unrelated writes before making this known, geometry-neutral transform
// write. Only its own mutation record can be discarded. All other changes,
// including external edits to a projectile, still invalidate target rectangles.
export function setProjectileTransform(overlay, transform) {
  const parent = overlay.parentElement;
  // The responsive shell owns the same out-of-flow effects that formerly lived
  // directly under body. Moving a projectile there cannot move its target.
  const isolatedHost = parent === document.body
    || parent?.id === 'game-screen-effects' && parent.parentElement?.id === 'game-shell';
  if (!observer || !overlays.has(overlay) || !isolatedHost) {
    overlay.style.transform = transform;
    return;
  }
  if (!broadObservation && !observedOptions.has(overlay)) {
    overlay.style.transform = transform;
    return;
  }
  consume(observer.takeRecords());
  overlay.style.transform = transform;
  const records = observer.takeRecords();
  if (records.some(record => record.type !== 'attributes'
    || record.attributeName !== 'style' || record.target !== overlay)) {
    invalidateProjectileGeometry();
  }
}

// Board anchors also share the fresh launch read with the first flight frame.
// Keep observing for a lone flight; release everything when the last one ends.
export function trackProjectileGeometry(overlay, readTarget = null) {
  const registration = { readTarget };
  overlays.set(overlay, registration);
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(consume);
    reconnectObservation();
    window.addEventListener('resize', invalidateProjectileGeometry);
    window.addEventListener('scroll', invalidateProjectileGeometry, true);
    document.fonts?.addEventListener('loadingdone', invalidateProjectileGeometry);
    for (const name of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) {
      document.addEventListener(name, animationChanged, true);
    }
    document.addEventListener('load', contentLoaded, true);
    for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
      document.addEventListener(name, invalidateProjectileGeometry, true);
    }
  }
  return () => {
    if (overlays.get(overlay) !== registration) return;
    overlays.delete(overlay);
    if (!overlays.size) stopObserving();
  };
}

function stopObserving() {
  observer?.disconnect(); observer = null;
  broadObservation = false;
  invalidateProjectileGeometry();
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', invalidateProjectileGeometry);
    window.removeEventListener('scroll', invalidateProjectileGeometry, true);
    document.fonts?.removeEventListener('loadingdone', invalidateProjectileGeometry);
    for (const name of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) {
      document.removeEventListener(name, animationChanged, true);
    }
    document.removeEventListener('load', contentLoaded, true);
    for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
      document.removeEventListener(name, invalidateProjectileGeometry, true);
    }
  }
}

export function clearProjectileGeometry() {
  overlays.clear();
  stopObserving();
}

export function readProjectileTargetRect(node, stamp) {
  // Unobserved targets stay fresh. Observed anchors only change after a
  // positioning notification/mutation, or while their animation is active.
  if (!observer || !node.isConnected || overlays.size < 2 && !isBoardAnchor(node)) {
    invalidateProjectileGeometry();
    return node.getBoundingClientRect();
  }
  if (!isBoardAnchor(node)) observeTarget(node);
  consume(observer.takeRecords());
  if (observationDirty) reconnectObservation();
  if (!Number.isFinite(stamp)) {
    // A new flight can reuse an observed stationary target, including several
    // launches in one task. Moving anchors still take a fresh native sample.
    rectangles.delete(node);
    animationReads = new WeakMap();
    return readTarget(node);
  }
  if (frameStamp !== stamp) {
    frameStamp = stamp;
    rectangles = new Map();
    animationReads = new WeakMap();
    // A completed flight must not retain an otherwise unused target tree.
    const active = new Set([node]);
    for (const registration of overlays.values()) active.add(registration.readTarget?.());
    let pruned = false;
    for (const target of targetScopes.keys()) if (!active.has(target) || !target.isConnected) {
      targetScopes.delete(target); anchors.delete(target); pruned = true;
    }
    if (pruned) reconnectObservation();
  }
  // Read the known flight targets together before the first projectile writes
  // its transform. Different targets otherwise force another style update on
  // every interleaved read/write. Providers only expose the last known node:
  // flight sampling, callbacks and impacts keep their original order.
  if (!rectangles.size) {
    const targets = new Set([node]);
    for (const [overlay, registration] of overlays) {
      if (!overlay.isConnected) continue;
      const target = registration.readTarget?.();
      if (target?.isConnected) targets.add(target);
    }
    for (const target of targets) rectangles.set(target, readTarget(target));
  }
  let rect = rectangles.get(node);
  if (!rect) {
    rect = readTarget(node);
    rectangles.set(node, rect);
  }
  return rect;
}
