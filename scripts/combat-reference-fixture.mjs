// Browser-side fixtures only. No production module or persistent player session is changed.
export async function makeReferenceArmies({ seed = 231126 } = {}) {
  const E = await import('/js/entities/runtime.js');
  const S = await import('/js/storage/gameStorage.js');
  const MapUI = await import('/js/app/worldMap.js');
  const { entitesNest } = await import('/js/data/entityTemplates.js');
  const { cloneCombatSnapshot } = await import('/js/combat/snapshot.js');
  let random = seed >>> 0;
  Math.random = () => ((random = (Math.imul(1664525, random) + 1013904223) >>> 0) / 4294967296);
  S.setAdminMode(false);
  MapUI.rebuildWorldMapLevelButtons();
  const button = document.querySelector('.level-button[data-biome="desert"]');
  if (!button) throw Error('The production Desert stage is missing');
  const stage = S.loadFromLocalStorage('GameStages', { stages: [] }).stages
    .find(entry => String(entry.id) === button.dataset.storageid);
  if (!stage || stage.level_type !== 'randomized') throw Error('Invalid Desert stage');
  const candidates = entitesNest.filter(e => e.type === 'sbire' && e.power >= 4 && e.power <= 8);
  if (candidates.length < 3) throw Error('Not enough distinct test army templates');
  const roster = candidates.slice(0, 10);
  const armyA = Array.from({ length: 80 }, (_, index) => {
    const template = structuredClone(roster[index % roster.length]);
    const entity = E.enrichEntityStats({ ...template, id: 920000 + index,
      side: 'A', position: '', nickname: `Référence A ${index + 1}`, level: 1,
      stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    return cloneCombatSnapshot(entity);
  });
  S.saveToLocalStorage('selectedArmyA', armyA.slice(0, 2));
  window.selectedArmyA = armyA.slice(0, 2);
  S.saveToLocalStorage('ArmyB', { armies: {} });
  S.saveToLocalStorage('equippedItems', []);
  document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
  window.__referenceDraft = { schema: 1, seed, stage: structuredClone(stage), armyA };
  return { stage, roster: roster.map(e => ({ serial: e.serial, name: e.name, attacks: e.attacks })) };
}

export async function finishReferenceArmies() {
  const E = await import('/js/entities/runtime.js');
  const { cloneCombatSnapshot } = await import('/js/combat/snapshot.js');
  const draft = window.__referenceDraft;
  const armyB = E.entites.filter(e => e.side === 'B').map(e => cloneCombatSnapshot(e));
  if (!armyB.length || armyB.length >= 10) throw Error(`Desert army has ${armyB.length} entities; cannot create a 10-total scenario`);
  for (const e of armyB) e.position = '';
  return { ...draft, armyB, totals: [10, 40, 80], source: 'Production world-map Desert button and level loader',
    cases: [10, 40, 80].map(total => ({ total, armyACount: total - armyB.length, armyBCount: armyB.length })) };
}

export async function installDesertArmy({ reference, total }) {
  const S = await import('/js/storage/gameStorage.js');
  const MapUI = await import('/js/app/worldMap.js');
  S.setAdminMode(false);
  MapUI.rebuildWorldMapLevelButtons();
  const button = document.querySelector('.level-button[data-biome="desert"]');
  const stageId = button?.dataset.storageid;
  if (!stageId) throw Error('Desert stage button is missing');
  const armyA = structuredClone(reference.armyA.slice(0, total - reference.armyB.length));
  const armyB = structuredClone(reference.armyB);
  if (armyA.length + armyB.length !== total || !armyA.length) throw Error('Invalid requested population');
  S.saveToLocalStorage('selectedArmyA', armyA); window.selectedArmyA = armyA;
  S.saveToLocalStorage('equippedItems', []);
  S.saveToLocalStorage('ArmyB', { armies: { [`ArmyB_${stageId}`]: { ArmyB_id: `ArmyB_${stageId}`, entities: armyB } } });
  const data = S.loadFromLocalStorage('GameStages', { stages: [] });
  const stage = data.stages.find(s => String(s.id) === stageId);
  if (JSON.stringify(stage.difficulty) !== JSON.stringify(reference.stage.difficulty)) throw Error('Desert difficulty changed: record a new reference explicitly');
  // Preserve the production surprise-attack setting; use the same random stream per case.
  let random = reference.seed >>> 0;
  Math.random = () => ((random = (Math.imul(1664525, random) + 1013904223) >>> 0) / 4294967296);
  document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
  return { total, armyACount: armyA.length, armyBCount: armyB.length, armyA, armyB };
}

export async function readReferenceScene() {
  const E = await import('/js/entities/runtime.js');
  const G = await import('/js/app/state.js');
  const { cloneCombatSnapshot } = await import('/js/combat/snapshot.js');
  return { started: G.gameStarted, outcome: G.battleOutcome,
    entities: E.entites.map(e => ({ id: e.id, serial: e.serial, side: e.side, position: e.position,
      hp: e.stats.HP?.current, dead: Boolean(e.isDEAD), attacks: cloneCombatSnapshot(e.attackDetails),
      baseStats: cloneCombatSnapshot(e.baseStats), stats: cloneCombatSnapshot(e.stats),
      box: Boolean(document.getElementById(`Box_Entite_${e.id}`)?.closest('#hexGrid .hex')) })) };
}

export async function createReplayBoard({ reference, total }) {
  const E = await import('/js/entities/runtime.js'), G = await import('/js/app/state.js');
  const U = await import('/js/ui/application.js'), S = await import('/js/storage/gameStorage.js');
  const C = await import('/js/rendering/entities.js'), B = await import('/js/board/controller.js');
  const L = await import('/js/data/loaderList.js');
  const { attackDetails } = await import('/js/data/attackList.js');
  const { levelBiome } = await import('/js/biome/level.js');
  S.setAdminMode(true); window.levelRunning = 'admin'; window.currentStageId = 'visual-reference';
  (await import('/js/storage/sessionStorage.js')).beginAdminSession();
  S.setCurrentLevel('visual-reference');
  S.saveToLocalStorage('GameStages', { stages: [{ id: 'visual-reference', level_type: 'admin' }] });
  S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
  S.saveToLocalStorage('equippedItems', []);
  document.body.replaceChildren(); U.createGameContainer(); U.GameUi();
  document.getElementById('game-windows').style.opacity = '1';
  E.entites.length = 0;
  document.dispatchEvent(new CustomEvent('biomeUpdated', { detail: 'desert' }));
  B.StageLoading(); B.setupBoard(total);
  const grid = document.getElementById('hexGrid');
  const slots = Object.fromEntries(['A', 'B'].map(side => [side,
    [...grid.querySelectorAll(`.hex.Side${side}`)].sort((a, b) => {
      const middle = total > 50 ? 7 : total > 25 ? 3 : 2;
      return Math.abs(Number(a.dataset.row) - middle) - Math.abs(Number(b.dataset.row) - middle)
        || (side === 'A' ? Number(b.dataset.col) - Number(a.dataset.col) : Number(a.dataset.col) - Number(b.dataset.col));
    })]));
  const names = ['shot-p-c', 'shot-h-r', 'shot-m-r', 'soin', 'shot-p-c'];
  for (let i = 0; i < total; i++) {
    const side = i < total / 2 ? 'A' : 'B', local = i % (total / 2);
    const attack = structuredClone(attackDetails.find(a => a.functionName === names[local % names.length]));
    if (!attack) throw Error('Replay attack missing from catalogue');
    Object.assign(attack, { preparationTime: 600, executionTime: 500, recoveryTime: 600, cooldown: 2400 });
    const entity = structuredClone(reference.armyA[i]);
    Object.assign(entity, { id: 950000 + i, side, position: slots[side][local].dataset.position,
      attacks: [attack.functionName], attackDetails: [attack], currentAttack: attack,
      currentAttackId: attack.functionName, isDEAD: false, statut: ['alive'], projectiles: [],
      preparationTime: 0, executionTime: 0, recoveryTime: 0, speedTimer: 0 });
    entity.stats.HP.current = entity.stats.HP.max;
    E.entites.push(entity);
  }
  await L.preloadResources(L.collectLevelResources({ entities: E.entites, biome: levelBiome.find(b => b.classe === 'desert') }), { concurrency: 8 });
  await Promise.all(E.entites.map(entity => {
    const view = C.createEntiteInDOM(entity);
    grid.querySelector(`[data-position="${entity.position}"]`).append(view.element);
    return view.spriteReady;
  }));
  B.syncEntityFootprints(grid);
  document.querySelectorAll('.hud-ingame').forEach(node => { node.style.opacity = '1'; node.style.transition = ''; });
  await document.fonts.ready;
  // This flag enables the real display batcher, without starting AI or applying damage.
  G.restoreRunningBattle();
  window.__referenceActors = E.entites;
  return E.entites.map(e => ({ id: e.id, side: e.side, position: e.position,
    attack: structuredClone(e.currentAttack), hp: e.stats.HP.current, armor: e.stats.armor?.current || 0 }));
}

export async function frameReferenceBoard() {
  const E = await import('/js/entities/runtime.js');
  const state = () => JSON.stringify(E.entites.map(e => [e.id, e.side, e.position, e.stats.HP.current]));
  const before = state();
  await (await import('/js/ui/display.js')).resetParallaxView({ force: true });
  // The production camera reset has two-second transitions. Sampling midway
  // makes framing depend on load speed instead of the identical input scene.
  await new Promise(done => setTimeout(done, 2200));
  const world = document.querySelector('.board-global');
  const normal = world.style.transform;
  const rects = [...document.querySelectorAll('.animation-sprite,.hud-ingame')]
    .map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
  if (!rects.length) throw Error('No visible-size sprites to frame');
  const screen = document.getElementById('game-windows').getBoundingClientRect();
  const bounds = { left: Math.min(...rects.map(r => r.left)) - 100, right: Math.max(...rects.map(r => r.right)) + 100,
    top: Math.min(...rects.map(r => r.top)) - 100, bottom: Math.max(...rects.map(r => r.bottom)) + 100 };
  const area = { left: screen.left + 60, right: screen.right - 60, top: screen.top + 95, bottom: screen.bottom - 120 };
  const scale = Math.min(1, (area.right - area.left) / (bounds.right - bounds.left), (area.bottom - area.top) / (bounds.bottom - bounds.top));
  const origin = world.getBoundingClientRect(), style = getComputedStyle(world), matrix = new DOMMatrix(style.transform);
  const transformOrigin = style.transformOrigin.split(' ').map(parseFloat);
  const anchor = { x: origin.left + transformOrigin[0] * matrix.a, y: origin.top + transformOrigin[1] * matrix.d };
  const dx = (area.left + area.right) / 2 - anchor.x - scale * ((bounds.left + bounds.right) / 2 - anchor.x);
  const dy = (area.top + area.bottom) / 2 - anchor.y - scale * ((bounds.top + bounds.bottom) / 2 - anchor.y);
  const container = document.getElementById('game-container'), factor = container.getBoundingClientRect().width / container.offsetWidth;
  world.style.transform = `translate(${dx / factor}px,${dy / factor}px) scale(${scale}) ${normal}`;
  await new Promise(done => setTimeout(done, 300));
  if (state() !== before) throw Error('Framing changed combat state');
  return { normal, scale, transform: world.style.transform };
}

export function referenceVisibility() {
  const root = document.getElementById('game-windows').getBoundingClientRect();
  const area = { left: Math.max(0, root.left), right: Math.min(innerWidth, root.right), top: Math.max(0, root.top), bottom: Math.min(innerHeight, root.bottom) };
  for (let node = document.getElementById('game-windows').parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    if (/hidden|clip|scroll|auto/.test(style.overflowX)) { area.left = Math.max(area.left, rect.left); area.right = Math.min(area.right, rect.right); }
    if (/hidden|clip|scroll|auto/.test(style.overflowY)) { area.top = Math.max(area.top, rect.top); area.bottom = Math.min(area.bottom, rect.bottom); }
  }
  const fits = rect => rect.width > 0 && rect.height > 0 && rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom;
  const rows = [...document.querySelectorAll('#hexGrid .entite-box')].map(box => {
    const sprite = box.querySelector('.animation-sprite') || box, style = getComputedStyle(sprite);
    return { id: box.id, inside: fits(sprite.getBoundingClientRect()) && style.display !== 'none' && style.visibility !== 'hidden',
      hudInside: [...box.querySelectorAll('.hud-ingame')].every(n => fits(n.getBoundingClientRect())) };
  });
  return { total: rows.length, inside: rows.filter(r => r.inside).length, hudOutside: rows.filter(r => !r.hudInside).length, rows };
}

export function installReferenceProbe() {
  const gaps = [], longTasks = [], counts = { impacts: 0, deaths: 0 };
  let last, frame, start, end, observer, active = false;
  const tick = time => { if (!active) return; if (last !== undefined) gaps.push(time - last); last = time; frame = requestAnimationFrame(tick); };
  window.addEventListener('combatLogEntry', ({ detail }) => {
    if (!active) return;
    if (detail?.type === 'damage_resolution') counts.impacts++;
    if (detail?.type === 'entity_death') counts.deaths++;
  });
  const stop = () => { if (!active) return; end = performance.now(); active = false; cancelAnimationFrame(frame); observer?.disconnect(); };
  window.addEventListener('battleResolved', stop);
  window.__referenceProbe = {
    start() {
      start = performance.now(); active = true;
      observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
      observer.observe({ type: 'longtask', buffered: false }); frame = requestAnimationFrame(tick);
    },
    stop() { stop(); return { gaps, longTasks, counts, elapsedMs: end - start }; }
  };
}
