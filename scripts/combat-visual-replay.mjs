// Record a scripted visual workload once; all replays consume this plain-data stream.
// This is a rendering benchmark, not a substitute for a real combat simulation.
export function recordVisualScript(actors) {
  const events = [], durationMs = 12000, half = actors.length / 2;
  const add = (at, type, data) => events.push({ at, type, ...data });
  for (let wave = 0; wave < 3; wave++) for (let i = 0; i < actors.length; i++) {
    const actor = actors[i], local = i % half, base = 300 + wave * 3300 + local % 5 * 50;
    const support = actor.attack.combatFunction === 'Support';
    const target = actors[support ? (i < half ? 0 : half) + (local + 1) % half : (i < half ? half : 0) + local % half];
    const flight = `reference-${wave}-${actor.id}`;
    add(base, 'prepare', { actor: actor.id, target: target.id });
    if (wave === 2 && local % 5 === 4) {
      add(base + 250, 'interrupt', { actor: actor.id });
      continue;
    }
    for (let ms = 50; ms <= 550; ms += 50) add(base + ms, 'timer', { actor: actor.id, phase: 'preparationTime', remaining: 600 - ms, progress: ms / 600 });
    add(base + 600, 'launch', { actor: actor.id, target: target.id, flight, ambidextry: false });
    for (let ms = 50; ms < 500; ms += 50) add(base + 600 + ms, 'timer', { actor: actor.id, phase: 'executionTime', remaining: 500 - ms });
    add(base + 1100, 'impact', { actor: actor.id, target: target.id, flight, status: local % 7 === 6 ? 'miss' : 'hit', amount: 1, support });
    add(base + 1100, 'recover', { actor: actor.id });
    for (let ms = 50; ms <= 600; ms += 50) add(base + 1100 + ms, 'timer', { actor: actor.id, phase: 'recoveryTime', remaining: 600 - ms });
    if (local % 5 === 4) {
      add(base + 780, 'launch', { actor: actor.id, target: target.id, flight: flight + '-ambi', ambidextry: true });
      add(base + 1280, 'impact', { actor: actor.id, target: target.id, flight: flight + '-ambi', status: 'hit', amount: 1, support: false });
    }
  }
  const moving = [actors[half], actors[half + 1]];
  add(1000, 'move', { moves: moving.map((e, i) => ({ id: e.id, position: moving[1 - i].position })) });
  add(1900, 'move', { moves: moving.map(e => ({ id: e.id, position: e.position })) });
  events.sort((a, b) => a.at - b.at);
  events.forEach((event, index) => { event.sequence = index; });
  return { schema: 1, kind: 'scripted-render-inputs', total: actors.length, durationMs,
    actors, events, coverage: ['preparation', 'HUD timers', 'melee', 'projectiles', 'impacts', 'healing', 'Ambidextry GIF', 'moving targets', 'interrupted preparations'] };
}

export function validateVisualScript(trace) {
  if (trace.schema !== 1 || trace.kind !== 'scripted-render-inputs') throw Error('Unsupported visual trace');
  if (![10, 40, 80].includes(trace.total) || trace.actors.length !== trace.total) throw Error('Invalid trace population');
  const ids = new Set(trace.actors.map(e => e.id));
  if (ids.size !== trace.total) throw Error('Duplicate actor');
  const flights = new Set(), settled = new Set();
  const types = new Set(['prepare', 'interrupt', 'timer', 'launch', 'impact', 'recover', 'move']);
  let at = -1;
  for (const [index, event] of trace.events.entries()) {
    if (event.sequence !== index || !Number.isFinite(event.at) || event.at < at || event.at >= trace.durationMs) throw Error('Invalid event order or deadline');
    at = event.at;
    if (!types.has(event.type)) throw Error('Unknown visual event');
    if (event.actor != null && !ids.has(event.actor) || event.target != null && !ids.has(event.target)) throw Error('Unknown actor or target');
    if (event.type !== 'move' && !ids.has(event.actor)) throw Error('Missing actor');
    if (['prepare', 'launch', 'impact'].includes(event.type) && !ids.has(event.target)) throw Error('Missing target');
    if (event.type === 'timer' && (!['preparationTime', 'executionTime', 'recoveryTime'].includes(event.phase)
      || !Number.isFinite(event.remaining) || event.remaining < 0)) throw Error('Invalid timer state');
    if (event.type === 'impact' && (!['hit', 'miss', 'dodged'].includes(event.status)
      || !Number.isFinite(event.amount) || event.amount < 0)) throw Error('Invalid impact');
    if (event.type === 'move' && (!event.moves?.length || event.moves.some(e => !ids.has(e.id)
      || !trace.actors.some(a => a.position === e.position)))) throw Error('Invalid movement');
    if (event.type === 'launch') {
      if (flights.has(event.flight)) throw Error('Duplicate launch'); flights.add(event.flight);
    }
    if (event.type === 'impact') {
      if (!flights.has(event.flight) || settled.has(event.flight)) throw Error('Unmatched or duplicate impact'); settled.add(event.flight);
    }
  }
  if (flights.size !== settled.size) throw Error('Unresolved trace flights');
  return { events: trace.events.length, flights: flights.size };
}

export async function runVisualReplay(trace) {
  const A = await import('/js/rendering/animations.js');
  const HUD = await import('/js/rendering/hud.js');
  const Timers = await import('/js/rendering/timers.js');
  const Vital = await import('/js/rendering/vitalFeedback.js');
  const B = await import('/js/board/controller.js');
  const { flushCombatDisplay } = await import('/js/rendering/displayBatch.js');
  const actors = new Map(window.__referenceActors.map(e => [e.id, e]));
  const flights = new Map(), promises = [], failures = [], dispatched = [], lateness = [], kinds = {};
  const track = promise => promises.push(Promise.resolve(promise).catch(error => failures.push(String(error?.stack || error))));
  const apply = event => {
    const actor = actors.get(event.actor), target = actors.get(event.target);
    kinds[event.type] = (kinds[event.type] || 0) + 1;
    switch (event.type) {
      case 'prepare':
        Object.assign(actor, { currentPhase: 'attack_1', preparationTime: 600, executionTime: 0,
          recoveryTime: 0, preparationProgressRatio: 0, speedTimer: 0 });
        HUD.updateEntityAttackTargetDisplay(actor, actor.currentAttack, target);
        Timers.beginPreparationBar(actor); A.animatePreparation(actor, actor.currentAttack, 600);
        HUD.updateTimerDisplay(actor); break;
      case 'interrupt':
        actor.stopPreparationAnimation?.(); actor.preparationTime = 0;
        Timers.resetInterruptedPreparationBar(actor); HUD.updateTimerDisplay(actor); break;
      case 'timer':
        actor[event.phase] = event.remaining;
        if (event.progress != null) {
          actor.preparationProgressRatio = event.progress;
          Timers.updatePreparationBar(actor, event.progress, false, false);
        }
        HUD.updateTimerDisplay(actor); break;
      case 'launch': {
        if (!event.ambidextry) {
          actor.stopPreparationAnimation?.(); actor.preparationTime = 0; actor.executionTime = 500;
          Timers.finishPreparationBar(actor); HUD.updateTimerDisplay(actor);
        }
        let resolve;
        const impact = new Promise(done => { resolve = done; });
        const entry = { resolve, impact, controller: null }; flights.set(event.flight, entry);
        if (actor.currentAttack.attackRange.includes('range')) {
          track(A.animationProjectile(actor, target, () => impact, { id: event.flight,
            executionTime: 500, attacknature: actor.currentAttack.attacknature,
            aura: event.ambidextry ? 'ambidextry' : undefined, impactPromise: impact }));
        } else entry.controller = A.animationMelee(actor, target, event.ambidextry, { duration: 500, flightId: event.flight });
        if (event.ambidextry) A.animateAmbidextry(target.id);
        break;
      }
      case 'impact': {
        const entry = flights.get(event.flight);
        if (!entry) throw Error(`Missing replay flight ${event.flight}`);
        entry.resolve(event.status); track(entry.controller?.resolveImpact?.(event.status === 'hit'));
        if (event.status === 'hit') {
          // Scripted display state only: no damage resolver, AI, experience or save call.
          target.stats.HP.current = event.support ? Math.min(target.stats.HP.max, target.stats.HP.current + event.amount)
            : Math.max(1, target.stats.HP.current - event.amount);
          Vital.presentEntityVitals(target);
          if (event.support) Vital.presentSupportHealing(actor, target, event.amount);
          else {
            Vital.presentDamageOutcome(target, { hpDamage: event.amount, armorDamage: 0, effects: [], sources: { physical: event.amount }, nature: 'physicalDamage' });
            Vital.presentVitalImpact(target, { broken: false, armored: false });
          }
        }
        flights.delete(event.flight); break;
      }
      case 'recover':
        actor.executionTime = 0; actor.recoveryTime = 600; actor.maxRecoveryTime = 600;
        Timers.beginRecoveryBar(actor, false); A.animateRecuperation(actor, actor.currentAttack); HUD.updateTimerDisplay(actor); break;
      case 'move': {
        const positions = new Map(event.moves.map(e => [e.id, e.position]));
        const plan = B.planEntityPlacements([...actors.values()].map(entity => ({ entity,
          hex: document.querySelector(`#hexGrid [data-position="${positions.get(entity.id) || entity.position}"]`) })));
        if (!B.commitEntityPlacements(plan, { animate: false, persist: false, notify: false })) throw Error('Replay movement failed');
        // The entity-specific notification also wakes combat AI. Only refresh
        // visual followers here; real movement/gameplay is covered by Desert.
        A.notifyAllProjectileTargetsMoved();
        break;
      }
      default: throw Error(`Unknown visual event: ${event.type}`);
    }
  };
  let random = 231126;
  Math.random = () => ((random = (Math.imul(1664525, random) + 1013904223) >>> 0) / 4294967296);
  const started = performance.now();
  let index = 0;
  await new Promise((done, reject) => {
    const pump = () => {
      try {
        const now = performance.now() - started;
        while (index < trace.events.length && trace.events[index].at <= now) {
          const event = trace.events[index++];
          lateness.push(Math.max(0, performance.now() - started - event.at));
          apply(event); dispatched.push(event.sequence);
        }
        if (index === trace.events.length) return setTimeout(done, Math.max(0, trace.durationMs - (performance.now() - started)));
        setTimeout(pump, Math.max(0, trace.events[index].at - (performance.now() - started)));
      } catch (error) { reject(error); }
    }; pump();
  });
  const measuredDurationMs = performance.now() - started;
  const measurement = window.__referenceProbe.stop();
  await Promise.race([Promise.all(promises), new Promise((_, reject) => setTimeout(() => reject(Error('Replay visual cleanup timed out')), 10000))]);
  flushCombatDisplay();
  if (flights.size || failures.length) throw Error(`Incomplete visual replay: ${JSON.stringify(failures)}`);
  return { dispatched, lateness, kinds, measuredDurationMs, measurement,
    finalState: [...actors.values()].map(e => ({ id: e.id, hp: e.stats.HP.current, position: e.position, dead: Boolean(e.isDEAD), turns: e.turnCount || 0,
      preparationTime: e.preparationTime, executionTime: e.executionTime, recoveryTime: e.recoveryTime })),
    remainingProjectiles: document.querySelectorAll('.projectile-parent[id^="reference-"]').length };
}
