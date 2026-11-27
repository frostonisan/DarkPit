// Runs only inside a disposable, invisible simulation document. Game modules,
// damage, targeting, effects and timings are imported unchanged after isolation.
export async function runSimulationTrial(input) {
  const realNow = performance.now.bind(performance);
  const wallStart = realNow();
  const timings = {};
  const progress = (phase, details = {}) => window.__progress?.({ phase, ...details });
  progress('chargement');
  const storage = entries => {
    const data = new Map(entries);
    return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
      getItem: key => data.get(String(key)) ?? null,
      setItem: (key, value) => data.set(String(key), String(value)),
      removeItem: key => data.delete(String(key)), clear: () => data.clear() };
  };
  Object.defineProperty(window, 'localStorage', { value: storage(input.storage), configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: storage([]), configurable: true });
  window.localStorageEnabled = true;
  window.__combatSimulation = true;
  window.currentStageId = input.stageId;
  window.levelRunning = 'admin';
  const failures = [];
  window.addEventListener('error', e => failures.push(e.message));
  window.addEventListener('unhandledrejection', e => { failures.push(String(e.reason?.stack || e.reason)); e.preventDefault(); });
  for (const key of ['log', 'warn', 'debug', 'info', 'group', 'groupCollapsed', 'groupEnd']) console[key] = () => {};
  console.error = (...args) => failures.push(args.map(v => v?.stack || (v && typeof v === 'object' ? JSON.stringify(v, (_k, item) => item instanceof Error ? item.stack : item) : String(v))).join(' '));
  // The sandbox has its own globals: no interception of the visible game's clock.
  let time = 0, nextId = 0, randomState = input.seed >>> 0;
  const tasks = new Map();
  // Earliest event first, with the same insertion order for equal timestamps.
  // A heap avoids scanning every pending timer on every simulated tick.
  const queue = [];
  const before = (a, b) => a.at < b.at || a.at === b.at && a.id < b.id;
  const enqueue = task => {
    let index = queue.length;
    queue.push(task);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(task, queue[parent])) break;
      queue[index] = queue[parent]; index = parent;
    }
    queue[index] = task;
  };
  const dequeue = () => {
    while (queue.length) {
      const first = queue[0], last = queue.pop();
      if (queue.length) {
        let index = 0;
        while (index * 2 + 1 < queue.length) {
          let child = index * 2 + 1;
          if (child + 1 < queue.length && before(queue[child + 1], queue[child])) child++;
          if (!before(queue[child], last)) break;
          queue[index] = queue[child]; index = child;
        }
        queue[index] = last;
      }
      if (tasks.get(first.id) === first) return first;
    }
    return null;
  };
  const random = () => {
    randomState += 0x6D2B79F5;
    let t = randomState;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  Math.random = random;
  const NativeDate = Date;
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [input.epoch + time])); }
    static now() { return input.epoch + time; }
  };
  Object.defineProperty(performance, 'now', { value: () => time });
  const schedule = (callback, delay, args, interval = 0) => {
    const id = ++nextId;
    const task = { id, at: time + Math.max(1, Number(delay) || 0), callback, args, interval };
    tasks.set(id, task); enqueue(task);
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => schedule(fn, delay, args);
  window.setInterval = (fn, delay, ...args) => schedule(fn, delay, args, Math.max(1, Number(delay) || 0));
  window.clearTimeout = window.clearInterval = id => tasks.delete(id);
  window.requestAnimationFrame = fn => schedule(() => fn(time), 1000 / 60, []);
  window.cancelAnimationFrame = window.clearTimeout;
  // WAAPI completion participates in virtual time, just like timers and RAF.
  Element.prototype.animate = function (_frames, options = {}) {
    const timing = typeof options === 'number' ? { duration: options } : options;
    let finish, settled = false;
    const animation = { playState: 'running', currentTime: 0, onfinish: null, oncancel: null,
      finished: new Promise(resolve => { finish = resolve; }),
      cancel() { tasks.delete(id); animation.playState = 'idle'; finish(animation); animation.oncancel?.(); },
      finish() { if (settled) return; settled = true; tasks.delete(id); animation.playState = 'finished'; finish(animation); animation.onfinish?.(); },
      pause() {}, play() {}, commitStyles() {}, addEventListener(type, fn) { if (type === 'finish') animation.finished.then(fn); },
    };
    const duration = Number(timing.delay || 0) + Number(timing.duration || 0) * Number(timing.iterations ?? 1);
    const id = Number.isFinite(duration) ? schedule(() => animation.finish(), duration, []) : 0;
    return animation;
  };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  // Canvas pixels are display-only (combat uses entity/hex geometry). Keep
  // contexts, dimensions and all animation callbacks, without rasterizing.
  for (const method of ['drawImage', 'clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData']) {
    CanvasRenderingContext2D.prototype[method] = () => {};
  }
  const journal = [];
  let timeline;
  const eventTime = () => timeline ? timeline.combatNow() - input.epoch : time;
  let firstDeath = null, gameEntities = [], capture = () => {};
  const plain = (value, seen = new WeakSet()) => {
    if (typeof value === 'function' || value instanceof Node) return undefined;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return undefined;
    seen.add(value);
    return Array.isArray(value) ? value.map(v => plain(v, seen))
      : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v, seen)]));
  };
  window.addEventListener('combatLogEntry', event => {
    event.preventDefault();
    const { type, data } = event.detail;
    if (input.trace) {
      const entry = { timeMs: eventTime(), type };
      for (const [key, value] of Object.entries(data || {})) {
        entry[key] = ['attacker', 'target', 'entity'].includes(key) && value
          ? { id: value.id, name: value.name, side: value.side, hp: value.stats?.HP?.current, armor: value.stats?.armor?.current }
          : plain(value);
      }
      journal.push(entry);
    }
    if (type === 'entity_death' && !firstDeath) {
      firstDeath = { id: data.entity.id, side: data.entity.side, timeMs: eventTime() };
    }
    capture();
  });
  // Use the game's normal entry point. Starting with entities/runtime.js enters its
  // cyclic graph backwards: Application startup then reads the acquisition constant while
  // entities/runtime.js is still initializing whenever selectedArmyA is nonempty.
  await import("../app/startup.js");
  const U = await import("../ui/application.js");
  const E = await import("../entities/runtime.js");
  const G = await import("../app/state.js");
  const F = await import("../combat/loop.js");
  timeline = await import("../combat/timeline.js");
  const S = await import("../storage/gameStorage.js");
  const T = await import("../storage/entityStorage.js");
  const { fledEntities } = await import("../combat/orders.js");
  const R = await import("../entities/rules.js");
  const { balanceData } = await import("../data/balanceData.js");
  const resources = await import("../data/loaderList.js");
  timings.importMs = realNow() - wallStart;
  progress('ressources');
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value);
      else if (typeof target[key] !== 'function') target[key] = value;
    }
  };
  merge(balanceData, input.balance);
  const requiredResources = new Set();
  input.entities.forEach(entity => resources.collectEntityResources(entity, requiredResources));
  await resources.preloadResources(requiredResources, { allowFailures: true });
  timings.resourcesMs = realNow() - wallStart - timings.importMs;
  progress('préparation');
  // Import-time setup is not part of simulated combat.
  tasks.clear(); queue.length = 0; time = 0;
  document.body.innerHTML = input.boardHtml;
  document.body.className = input.bodyClass || '';
  U.createGameContainer();
  // Hidden calculation has no interactive battle buttons.
  const actionPlaceholder = container => container;
  G.configureBattleActionManager({ createStartButton: actionPlaceholder, createFleeButton: actionPlaceholder, createQuitButton: actionPlaceholder });
  S.setAdminMode(true);
  localStorage.setItem('DarkPitAdminInvincibleMode', 'false');
  E.entites.splice(0, E.entites.length, ...input.entities);
  const footprints = await import("../board/controller.js");
  const placement = footprints.planEntityPlacements(E.entites.map(entity => ({ entity,
    hex: document.getElementById(`Box_Entite_${entity.id}`)?.closest('.hex') })));
  if (!footprints.commitEntityPlacements(placement)) throw new Error(`Groupements invalides dans la simulation : ${placement.reason || 'placement impossible'}`);
  gameEntities = E.entites;
  for (const entity of gameEntities) {
    entity.totalDamage = 0; entity.totalHeal = 0; entity.kills = 0; entity.deaths = 0;
    entity.combatDetails = {}; entity.turnCount = 0;
    entity.battleStopped = false; entity.projectiles = [];
    delete entity.currentAttack; delete entity.lastAttackTime;
    entity.hasDeathBeenLogged = false; entity.hasAlreadyDeadBeenLogged = false;
    E.recomputeEntityStats(entity, { persistEquipment: false, skipReverseArchetype: true });
    // Restore timers/removal callbacks of bonuses captured on the board.
    const existingBoosts = entity.battleBoosts || {};
    entity.battleBoosts = {};
    for (const [stat, bonuses] of Object.entries(existingBoosts)) for (const bonus of bonuses) {
      const remaining = bonus.expiresAt == null ? null : bonus.expiresAt - input.epoch;
      if (remaining !== null && remaining <= 0) continue;
      R.entityBattleBooste(entity, { stat, value: bonus.value, source: bonus.source, mode: bonus.mode, durationMs: remaining });
      const restored = entity.battleBoosts[stat]?.at(-1);
      if (restored && bonus.attackNatureTemporary) restored.attackNatureTemporary = true;
    }
    // Restore actual starting reserves after recomputation (a full stock gains capacity).
    const initial = input.reserves[String(entity.id)];
    for (const key of ['HP', 'armor', 'extraLife', 'fadedLife', 'eternalLife', 'shift']) {
      const stock = entity.stats[key], old = initial[key];
      if (stock && typeof stock === 'object' && old) {
        stock.current = old.current >= old.max ? stock.totalMax ?? stock.max : Math.min(old.current, stock.totalMax ?? stock.max);
      }
    }
    entity.isDEAD = Number(entity.stats.HP.current) <= 0;
    entity.statut = [entity.isDEAD ? 'dead' : 'alive'];
  }
  localStorage.setItem('selectedArmyA', JSON.stringify(gameEntities.filter(e => e.side === 'A')));
  localStorage.setItem('ArmyB', JSON.stringify({ armies: { simulation: { entities: gameEntities.filter(e => e.side === 'B') } } }));
  window.selectedArmyA = gameEntities.filter(e => e.side === 'A');
  window.selectedArmyB = gameEntities.filter(e => e.side === 'B');
  const initialStats = {}, previous = new Map(), rows = new Map(), observedEntities = new Map();
  const statsOf = entity => Object.fromEntries(input.stats.map(stat => {
    const value = R.getSafe(entity, stat.key, 0);
    return [stat.key, Number(value?.totalMax ?? value?.max ?? value?.current ?? value) || 0];
  }));
  for (const entity of gameEntities) {
    initialStats[entity.id] = statsOf(entity);
    rows.set(String(entity.id), { id: String(entity.id), name: entity.nickname || entity.name, side: entity.side,
      hpStart: Number(entity.stats.HP.current), armorStart: Number(entity.stats.armor?.current) || 0,
      turns: 0, phases: {}, phase: null, phaseAt: 0, actions: 0, startedDead: entity.isDEAD,
      initialPosition: entity.position, initialSizeInCells: footprints.entitySizeInCells(entity) });
  }
  capture = () => {
    for (const entity of gameEntities) {
      const id = String(entity.id);
      observedEntities.set(id, entity);
      if (!rows.has(id)) rows.set(id, { id, name: entity.name, side: entity.side, summoned: true,
        hpStart: Number(entity.stats?.HP?.current) || 0, armorStart: 0, turns: 0, phases: {}, phase: null, phaseAt: time, actions: 0,
        initialPosition: entity.position, initialSizeInCells: footprints.entitySizeInCells(entity) });
      const row = rows.get(id), phase = entity.currentPhase || 'attente';
      row.turns = Math.max(row.turns, entity.turnCount || 0);
      if (row.phase !== phase) {
        if (row.phase) row.phases[row.phase] = (row.phases[row.phase] || 0) + time - row.phaseAt;
        row.phase = phase; row.phaseAt = time;
        if (phase === 'attack_1') row.actions++;
        if (input.trace) journal.push({ timeMs: time, type: 'phase', entityId: id, phase, attack: entity.currentAttack?.displayName || entity.currentAttack?.functionName });
      }
      const before = previous.get(id);
      const hp = Number(entity.stats?.HP?.current) || 0, armor = Number(entity.stats?.armor?.current) || 0;
      const damage = Number(entity.totalDamage) || 0, heal = Number(entity.totalHeal) || 0;
      const changed = !before || before.hp !== hp || before.armor !== armor || before.damage !== damage || before.heal !== heal;
      // A journal snapshot is immutable. Reuse it only while every value agrees;
      // capture still runs at every existing event/checkpoint, including impacts.
      const values = changed ? { hp, armor, damage, heal } : before;
      if (changed) {
        if (before && input.trace) journal.push({ timeMs: time, type: 'resources', entityId: id, before, after: values });
        previous.set(id, values);
      }
      row.hpEnd = values.hp; row.armorEnd = values.armor; row.damage = values.damage; row.heal = values.heal;
      row.position = entity.position; row.sizeInCells = footprints.entitySizeInCells(entity);
      const members = footprints.entityFootprint(entity);
      if (row.occupiedPositions?.length !== members.length || members.some((hex, index) => hex.dataset.position !== row.occupiedPositions[index])) {
        row.occupiedPositions = members.map(hex => hex.dataset.position);
      }
      row.dead = entity.isDEAD === true && !row.startedDead;
    }
  };
  // Construction does not consume combat randomness. Each trial starts its
  // own seeded sequence with the same captured entities and starting stats.
  randomState = input.seed >>> 0;
  F.initFightEntites();
  G.startGame();
  const combatStart = realNow();
  timings.setupMs = combatStart - wallStart - timings.importMs - timings.resourcesMs;
  let steps = 0, lastProgressAt = combatStart;
  progress('combat', { steps, simulatedMs: time });
  // A real task boundary drains all promise jobs and MutationObservers, rather
  // than guessing the number of awaits inside the combat pipeline.
  const checkpoint = new MessageChannel();
  const flush = () => new Promise(resolve => {
    checkpoint.port1.onmessage = resolve; checkpoint.port2.postMessage(null);
  });
  await flush(); capture();
  // Let the real game resolve the whole army battle, including remaining
  // allies, summons and additional lives. A first casualty is only recorded.
  while (time < input.durationMs && !G.isBattleFinished()) {
    if (failures.length) throw new Error(failures.slice(0, 3).join('\n'));
    const next = dequeue();
    if (!next || next.at > input.durationMs) { time = input.durationMs; break; }
    time = next.at;
    if (next.interval) { next.at += next.interval; enqueue(next); } else tasks.delete(next.id);
    if (typeof next.callback !== 'function') throw new Error('Timer non fonctionnel dans la simulation.');
    next.callback(...next.args);
    await flush();
    await timeline.settleCombatTimeline();
    capture();
    if (++steps > 2000000) throw new Error('Trop d’événements dans un essai : réduisez la durée.');
    if (journal.length > 200000) throw new Error('Journal trop volumineux : réduisez la durée.');
    // flush() already yields a real task after every virtual event. A second
    // setTimeout(0) yield is redundant and gets clamped in background tabs,
    // turning hundreds of otherwise instant checkpoints into minutes of wait.
    // Keep the exact event ordering and full microtask drain, with no real timer.
    if (steps % 1000 === 0 && realNow() - lastProgressAt >= 500) {
      progress('combat', { steps, simulatedMs: time });
      lastProgressAt = realNow();
    }
  }
  window.dispatchEvent(new Event('battleEnding'));
  capture();
  if (failures.length) throw new Error(failures.slice(0, 3).join('\n'));
  const entities = [...rows.values()].map(row => {
    const entity = gameEntities.find(e => String(e.id) === row.id) || fledEntities.find(e => String(e.id) === row.id) || observedEntities.get(row.id);
    if (row.phase) row.phases[row.phase] = (row.phases[row.phase] || 0) + time - row.phaseAt;
    return { ...row, ...(entity?.hasFled ? { hasFled: true } : {}), initialStats: initialStats[row.id] || {}, finalStats: entity ? statsOf(entity) : {},
      details: entity ? plain(T.getEntityCombatDetails(entity)) : {} };
  });
  tasks.clear(); queue.length = 0;
  checkpoint.port1.close(); checkpoint.port2.close();
  const winner = G.battleOutcome === 'victory' ? 'A' : G.battleOutcome === 'defeat' ? 'B' : null;
  timings.combatMs = realNow() - combatStart;
  timings.totalMs = realNow() - wallStart;
  progress('terminé', { steps, simulatedMs: time });
  return { seed: input.seed, durationMs: time,
    end: winner ? 'victory' : G.battleOutcome === 'draw' ? 'draw' : G.battleOutcome === 'escape' ? 'escape' : time >= input.durationMs ? 'timeout' : 'game-end',
    firstDeath, winner,
    entities, journal, steps, timings };
}
