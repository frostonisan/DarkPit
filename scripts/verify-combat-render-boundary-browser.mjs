import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.BOUNDARY_OUTPUT || 'outputs/combat-render-boundary');
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
      const timers = previous ? null : await import('/js/combat/timerState.js');
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
          same(tracked(entity), tracked(detached), `${name}: combat depends on drawing`);
        } else HUD.updateTimerDisplay(entity);
        views.push({ name, html: host.innerHTML, state: tracked(entity) });
        if (timers) {
          // A redraw may update DOM caches, but must never update entity state.
          const frozen = Object.freeze(structuredClone(entity)), before = JSON.stringify(frozen);
          const frame = timers.readTimerDisplayState(frozen);
          for (let i = 0; i < 5; i++) HUD.updateTimerDisplay(frozen, frame);
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
      host.remove();
      return { views, statesWithoutRender, frozenChecks };
    }, previous);
    assert.deepEqual(errors, [], 'No browser errors');
    results[previous ? 'before' : 'after'] = result;
    await page.close();
  }
  assert.equal(results.after.frozenChecks.length, 19);
  if (baseline) {
    assert.deepEqual(results.after.views, results.before.views, 'Identical phase HTML and combat state before/after extraction');
    assert.deepEqual(results.after.statesWithoutRender, results.before.views.map(({ name, state }) => ({ name, state })),
      'Omitting the renderer preserves every timer transition');
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`PASS: 19 timer states, read-only redraws, combat without DOM, scores${baseline ? ', identical archived HUD/state' : ''}.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
