// Index optional views instead of scanning the whole document on each combat
// event. Pending mutations are consumed synchronously for append + refresh,
// including helpers restored from HTML rather than factory closures.
const classKinds = new Map([
  ['dialogue-window', 'dialogue'], ['codex-profile-summary', 'codexSummary'],
  ['codex-information-battle', 'codexBattle'], ['attack-progression', 'attackProgression'],
  ['attack-effects-list', 'attackEffects'],
]);
const groups = new Map([...classKinds.values(), 'levelBattleStats'].map(kind => [kind, new Set()]));
let owner = null, observer = null, membership = new WeakMap();

function update(node) {
  const next = [];
  if (node.isConnected && node.ownerDocument === owner) {
    for (const name of node.classList) {
      const kind = classKinds.get(name);
      if (kind && (kind !== 'attackEffects' || node.hasAttribute('data-attack-key'))) next.push(kind);
    }
    if (node.hasAttribute('data-level-battle-stat')) next.push('levelBattleStats');
  }
  for (const kind of membership.get(node) || []) if (!next.includes(kind)) groups.get(kind).delete(node);
  for (const kind of next) groups.get(kind).add(node);
  if (next.length) membership.set(node, next);
  else membership.delete(node);
}

function scan(root) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (node?.nodeType !== 1) continue;
    update(node);
    for (let child = node.lastElementChild; child; child = child.previousElementSibling) pending.push(child);
  }
}

function consume(records) {
  let removed = false;
  for (const record of records) {
    if (record.type === 'attributes') update(record.target);
    else {
      removed ||= record.removedNodes.length > 0;
      for (const node of record.addedNodes) if (node.isConnected) scan(node);
    }
  }
  if (removed) for (const nodes of groups.values()) for (const node of nodes) {
    if (!node.isConnected || node.ownerDocument !== owner) update(node);
  }
}

export function getOpenViewRoots(kind) {
  const nodes = groups.get(kind);
  if (!nodes) throw new Error(`Unknown optional view: ${kind}`);
  if (typeof document === 'undefined') return [];
  if (owner !== document) {
    observer?.disconnect(); owner = document; membership = new WeakMap();
    for (const group of groups.values()) group.clear();
    scan(document.documentElement);
    observer = new MutationObserver(consume);
    observer.observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'data-attack-key', 'data-level-battle-stat'] });
  }
  consume(observer.takeRecords());
  // Static results and DOM order preserve querySelectorAll semantics while
  // callbacks replace their own views or move them between containers.
  return [...nodes].sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1);
}
