import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.BOUNDARY_OUTPUT || 'outputs/display-batching');
const baseline = process.env.COMBAT_RENDER_BASELINE ? resolve(process.env.COMBAT_RENDER_BASELINE) : null;
let root = resolve('docs');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
try {
  for (const previous of baseline ? [true, false] : [false]) {
    root = previous ? baseline : resolve('docs');
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator('#game-container').waitFor({ state: 'attached' });
    const result = await page.evaluate(async previous => {
      const HUD = await import('/js/rendering/hud.js');
      const timers = await import('/js/combat/timerState.js');
      const batch = previous ? null : await import('/js/rendering/displayBatch.js');
      const game = await import('/js/app/state.js');
      const clock = await import('/js/combat/clock.js');
      game.restoreRunningBattle();
      const { attackDetails } = await import('/js/data/attackList.js');
      const attack = { ...structuredClone(attackDetails[0]), displayName: 'Référence <b>attaque</b>',
        preparationTime: 1000, executionTime: 600, recoveryTime: 800, attackRange: ['range'] };
      const entity = { id: 99987778, stats: { speed: 3000 }, attackDetails: [attack], attacks: [attack.functionName],
        currentAttackId: attack.functionName, currentAttack: attack };
      const host = document.createElement('div'); document.body.append(host);
      const prefixes = ['atbFill_', 'HUATBfill_', 'scanATBFill_', 'SpeedInterface_', 'currentAttackBar_', 'currentAttackImage_',
        'speedTimer_', 'battlePreparation_', 'preparationTimer_', 'executionTimer_', 'cooldownDisplay_', 'recoveryTimer_'];
      const rebuild = () => { host.innerHTML = prefixes.map(p => `<div id="${p}${entity.id}"></div>`).join(''); };
      rebuild();
      const sequence = [
        ['uninitialized', { speedTimer: undefined }], ['atb', { speedTimer: 1500, isATBFull: false }],
        ['preparation', { preparationTime: 600 }], ['range-launch', { preparationTime: 25 }],
        ['execution', { executionTime: 300 }], ['recovery-initialize', { recoveryTime: 400, maxRecoveryTime: undefined }],
        ['recovery', { recoveryTime: 200 }], ['new-turn', {}], ['cooldown', { currentPhase: 'cooldown-wait' }],
        ['search', { currentPhase: 'target-search' }], ['search-recovery', { currentPhase: 'target-search-recovery', recoveryTime: 100 }],
        ['order-decision', { orderPhase: 'orderDecision', recoveryTime: 200, maxRecoveryTime: 800, ATBfillBeforeOrder: 60 }],
        ['order-execution', { orderPhase: 'orderExecution', orderExecutionTime: 150, maxOrderExecutionTime: 300 }],
        ['runaway-recovery', { orderPhase: 'runawayRecovery', recoveryTime: 200, maxRecoveryTime: 800 }],
        ['runaway-preparation', { orderPhase: 'runawayPreparation', speedTimer: 500, maxPreparationTime: 1000 }],
        ['rebuilt', { preparationTime: 350 }], ['nested-rebuilt', { executionTime: 300 }],
        ['simulation-execution', { executionTime: 200 }], ['simulation-recovery', { recoveryTime: 200 }],
      ];
      const views = [], statesWithoutRender = [], frozenChecks = [];
      const tracked = e => Object.fromEntries(['speedTimer', 'isATBFull', 'maxRecoveryTime', 'rangeExecutedFlag', 'wasInExecution'].map(k => [k, e[k]]));
      const same = (a, b, message) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(message); };
      for (const [name, patch] of sequence) {
        Object.assign(entity, { currentPhase: 'attack_1', orderPhase: '', speedTimer: 0, preparationTime: 0,
          executionTime: 0, recoveryTime: 0, cooldownTimer: 0, ...patch });
        if (name === 'rebuilt') rebuild();
        if (name === 'nested-rebuilt') document.getElementById(`battlePreparation_${entity.id}`).innerHTML = '<span>Recréé</span>';
        window.__combatSimulation = name.startsWith('simulation-');
        if (timers) {
          const detached = structuredClone(entity);
          const saved = new Map();
          for (const method of ['getElementById', 'querySelector', 'querySelectorAll', 'createElement']) {
            saved.set(method, document[method]);
            document[method] = () => { throw Error(`Combat timer read the DOM: ${method}`); };
          }
          try { timers.advanceCombatTimerState(detached); }
          finally { for (const [method, original] of saved) document[method] = original; }
          statesWithoutRender.push({ name, state: tracked(detached) });
          HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity));
          batch?.flushCombatDisplay();
          same(tracked(entity), tracked(detached), `${name}: combat depends on drawing`);
        } else HUD.updateTimerDisplay(entity);
        views.push({ name, html: host.innerHTML, state: tracked(entity) });
        if (timers) {
          // A redraw may update DOM caches, but must never update entity state.
          const frozen = Object.freeze(structuredClone(entity)), before = JSON.stringify(frozen);
          const frame = timers.readTimerDisplayState(frozen);
          for (let i = 0; i < 5; i++) HUD.updateTimerDisplay(frozen, frame);
          batch?.flushCombatDisplay();
          same(JSON.stringify(frozen), before, `${name}: redraw mutated combat`);
          frozenChecks.push(name);
          // Restore the frame retained by the before/after comparison.
          host.innerHTML = views.at(-1).html;
        }
      }
      window.__combatSimulation = false;
      if (timers) {
        const score = await import('/js/combat/score.js');
        const before = score.readCombatScore();
        score.updateScore({ side: 'A' }, 15); score.deductScore({ side: 'A' }, 4);
        score.updateScore({ side: 'B' }, 9); score.deductScore({ side: 'B' }, 2);
        const after = score.readCombatScore();
        same(after, { sideA: before.sideA + 11, sideB: before.sideB + 7 }, 'Score accounting');
        for (let i = 0; i < 5; i++) HUD.updateScoreDisplay(after.sideA);
        same(score.readCombatScore(), after, 'Score redraw mutated accounting');
      }
      // A burst of logical ticks must become one presentation commit, without
      // dropping the one-shot execution flag when later ticks carry null.
      Object.assign(entity, { currentPhase: 'attack_1', orderPhase: '', preparationTime: 300,
        executionTime: 0, recoveryTime: 0, speedTimer: 0 });
      HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity)); batch?.flushCombatDisplay();
      let deliveredMutations = 0;
      const observe = new MutationObserver(records => { deliveredMutations += records.length; });
      observe.observe(host, { subtree: true, attributes: true, characterData: true, childList: true });
      const nativeFrame = window.requestAnimationFrame.bind(window);
      let scheduledFrames = 0;
      window.requestAnimationFrame = callback => { scheduledFrames++; return nativeFrame(callback); };
      const clockSequence = clock.combatClockSequence();
      for (let i = 0; i < 500; i++) {
        entity.preparationTime = 900 - i;
        HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity));
      }
      entity.preparationTime = 0; entity.executionTime = 300;
      HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity));
      entity.executionTime = 0; entity.recoveryTime = 200; entity.maxRecoveryTime = 800;
      HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity));
      entity.recoveryTime = 100;
      HUD.updateTimerDisplay(entity, timers.advanceCombatTimerState(entity));
      const sequenceAfterScheduling = clock.combatClockSequence();
      window.requestAnimationFrame = nativeFrame;
      const beforePaint = observe.takeRecords().length;
      await new Promise(nativeFrame);
      const afterPaint = deliveredMutations + observe.takeRecords().length; observe.disconnect();
      const burst = { html: host.innerHTML, state: tracked(entity), beforePaint, afterPaint,
        scheduledFrames, clockUntouched: clockSequence === sequenceAfterScheduling };
      const vitals = await import('/js/rendering/vitalFeedback.js');
      const life = document.createElement('div'); host.append(life);
      life.innerHTML = `<div class="life-bars-container" id="HeadsupLifeBars_${entity.id}">
        <div class="health-bar A" data-stat="hp-bar" data-entity-id="${entity.id}"><div class="health-fill"></div></div>
        <div class="armor-bar A" data-stat="armor-bar" data-entity-id="${entity.id}" data-prev-armor="50"><div class="armor-fill"></div><span class="armor-text" data-stat="armor-text" data-entity-id="${entity.id}"></span></div>
        </div><span class="HP-counter" data-stat="HP" data-entity-id="${entity.id}"></span><span class="entite-stat" data-stat="HP" data-entity-id="${entity.id}"></span><span class="armor-counter" data-entity-id="${entity.id}"></span>`;
      const animations = [], nativeAnimate = Element.prototype.animate;
      Element.prototype.animate = function(...args) { if (life.contains(this)) animations.push(args); return nativeAnimate.apply(this, args); };
      const healthReturns = [];
      try {
        for (const [hp, max, armor] of [[100,100,50],[90,100,40],[95,100,10],[20,100,20],[0,0,0]]) {
          healthReturns.push(vitals.updateHealthBar(hp,max,armor,50,entity.id));
        }
      } finally { Element.prototype.animate = nativeAnimate; }
      batch?.flushCombatDisplay();
      const health = { html: life.innerHTML, healthReturns, animations };
      life.remove();
      const lifecycle = [];
      if (batch) {
        const el = document.createElement('div'); host.append(el);
        batch.setDisplayStyle(el, 'width', '37%', 'important');
        batch.setDisplayStyle(el, 'width', 'NaN%', 'important');
        batch.flushCombatDisplay();
        if (el.style.width !== '37%' || el.style.getPropertyPriority('width') !== 'important') throw Error('Invalid CSS erased a valid pending value');
        lifecycle.push('invalid CSS and important priority');
        batch.toggleDisplayClass(el, 'preparation', true);
        el.classList.add('external'); batch.flushCombatDisplay();
        if (!el.classList.contains('external') || !el.classList.contains('preparation')) throw Error('Class toggle erased unrelated classes');
        lifecycle.push('unrelated classes retained');
        batch.setDisplayText(el, 'detached'); el.remove(); await new Promise(nativeFrame);
        if (el.textContent) throw Error('Detached node was updated');
        lifecycle.push('detached nodes released');
        host.append(el); batch.setDisplayText(el, 'stale');
        window.dispatchEvent(new Event('stageInterfaceClosing')); await new Promise(nativeFrame);
        if (el.textContent) throw Error('Old level queue leaked');
        lifecycle.push('level replacement discards queue');
        batch.setDisplayText(el, 'stopped'); window.dispatchEvent(new Event('battleStopped'));
        if (el.textContent !== 'stopped') throw Error('Stop missed pending state');
        lifecycle.push('stop flushes pending values');
        clock.freezeCombatClock(); batch.setDisplayText(el, 'paused');
        if (el.textContent !== 'paused') throw Error('Paused tactical change was delayed');
        clock.resumeCombatClock(); lifecycle.push('paused changes are synchronous');
        window.__combatSimulation = true; batch.setDisplayText(el, 'simulation');
        if (el.textContent !== 'simulation') throw Error('Simulation was delayed');
        window.__combatSimulation = false; lifecycle.push('simulation remains synchronous');
        el.remove();
      }
      host.remove();
      return { views, statesWithoutRender, frozenChecks, burst, lifecycle, health };
    }, previous);
    assert.deepEqual(errors, [], 'No browser errors');
    results[previous ? 'before' : 'after'] = result;
    await page.close();
  }
  assert.equal(results.after.frozenChecks.length, 19);
  assert.equal(results.after.burst.beforePaint, 0);
  assert.equal(results.after.burst.scheduledFrames, 1);
  assert.equal(results.after.burst.clockUntouched, true);
  assert.equal(results.after.lifecycle.length, 7);
  if (baseline) {
    assert.deepEqual(results.after.health, results.before.health, "Health/armor values and each impact flash are preserved");
    assert.deepEqual(results.after.burst.html, results.before.burst.html);
    assert.deepEqual(results.after.burst.state, results.before.burst.state);
    assert.ok(results.after.burst.afterPaint < results.before.burst.beforePaint / 10, 'At least 90% fewer mutations for the same-frame burst');
    assert.deepEqual(results.after.views, results.before.views, 'Identical phase HTML and combat state before/after extraction');
    assert.deepEqual(results.after.statesWithoutRender, results.before.views.map(({ name, state }) => ({ name, state })),
      'Omitting the renderer preserves every timer transition');
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({states:19,lifecycle:results.after.lifecycle,after:results.after.burst,beforeMutations:results.before?.burst.beforePaint},(key,value)=>key==='html'?undefined:value));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
