import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), baseline = resolve('outputs/performance-lots-3-5/before/docs');
const hasBaseline = await access(resolve(baseline, 'js/rendering/hud.js')).then(() => true, () => false);
const output = resolve('outputs/performance-lots-3-5/hud');
const compared = new Set(['rendering/hud.js', 'combat/attackResolution.js', 'rendering/animations.js', 'storage/entityStorage.js', 'debug/simulation.js']);
// A real, previously validated battle report supplies the journal fixture.
// Repetition below benchmarks report rendering only, never extra game trials.
const reportFixture = await readFile('outputs/combat-simulation/report.json', 'utf8').then(JSON.parse, () => ({
  status: 'complete', createdAt: '2026-11-18T00:00:00Z', options: { count: 1, durationSeconds: 1 }, method: 'Données de présentation',
  snapshot: { stats: [{ key: 'physicalDamage', name: 'Puissance physique' }], entities: [] },
  trials: [{ run: 1, seed: 1, durationMs: 1000, winner: 'A', end: 'victory', entities: [
    { id: '1', name: 'Entité test', side: 'A', hpStart: 10, hpEnd: 10, damage: 5, heal: 0, dead: false,
      initialStats: { physicalDamage: 5 }, finalStats: { physicalDamage: 5 }, details: {}, phases: {} },
  ], journal: [{ timeMs: 500, type: 'resources', entityId: '1', before: { hp: 10, armor: 0, damage: 0, heal: 0 }, after: { hp: 10, armor: 0, damage: 5, heal: 0 } }] }],
}));
reportFixture.trials = Array.from({ length: 100 }, (_, i) => ({ ...reportFixture.trials[i % reportFixture.trials.length], run: i + 1 }));
reportFixture.options.count = 100; delete reportFixture.summary;
let before = false;
const server = createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + relative);
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    const data = await readFile(before && compared.has(relative.slice(4)) && relative.startsWith('/js/') ? resolve(baseline, '.' + relative) : file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
try {
  for (before of (hasBaseline ? [true, false] : [false])) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await dismissStarterForFixture(page);
    results[before ? 'before' : 'after'] = await page.evaluate(async before => {
      await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
      const timerState = before ? null : await import("/js/combat/timerState.js");
      const D = await import("/js/rendering/hud.js"), A = await import("/js/combat/attackResolution.js");
      const V = await import("/js/rendering/animations.js"), T = await import("/js/storage/entityStorage.js");
      const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
      S.setAdminMode(true);
      const { attackDetails } = await import('/js/data/attackList.js');
      const attack = { ...structuredClone(attackDetails[0]), displayName: 'Test <b>vivant</b>', preparationTime: 1000, executionTime: 600, recoveryTime: 800, attackRange: ['range'] };
      const entity = { id: 99987777, stats: { speed: 3000 }, attackDetails: [attack], attacks: [attack.functionName], currentAttackId: attack.functionName, currentAttack: attack };
      const host = document.createElement('div'); document.body.append(host);
      const prefixes = ['atbFill_', 'HUATBfill_', 'scanATBFill_', 'SpeedInterface_', 'currentAttackBar_', 'currentAttackImage_', 'speedTimer_', 'battlePreparation_', 'preparationTimer_', 'executionTimer_', 'cooldownDisplay_', 'recoveryTimer_'];
      const rebuild = () => { host.innerHTML = prefixes.map(p => `<div id="${p}${entity.id}"></div>`).join(''); };
      rebuild();
      const views = [];
      const check = (name, patch) => {
        Object.assign(entity, { currentPhase: 'attack_1', orderPhase: '', speedTimer: 0, preparationTime: 0, executionTime: 0, recoveryTime: 0, cooldownTimer: 0, ...patch });
        D.updateTimerDisplay(entity, timerState?.advanceCombatTimerState(entity));
        views.push({ name, html: host.innerHTML, speedTimer: entity.speedTimer, rangeExecutedFlag: entity.rangeExecutedFlag, wasInExecution: entity.wasInExecution, isATBFull: entity.isATBFull });
      };
      check('preparation', { preparationTime: 600 });
      check('launch', { preparationTime: 25 });
      check('execution', { executionTime: 300 });
      check('recovery', { recoveryTime: 400, maxRecoveryTime: 800 });
      check('new-turn', {});
      check('search', { currentPhase: 'target-search' });
      check('search-recovery', { currentPhase: 'target-search-recovery', recoveryTime: 100 });
      check('flee-decision', { orderPhase: 'orderDecision', recoveryTime: 200, maxRecoveryTime: 800 });
      check('flee-preparation', { orderPhase: 'runawayPreparation', speedTimer: 500, maxPreparationTime: 1000 });
      attack.displayName = 'Nom modifié en direct';
      check('renamed', { preparationTime: 600 });
      entity.modifierAttacks = { temporary: { byId: { test: { attackKey: attack.functionName, patch: { displayName: 'Nom temporaire' }, expiresAt: Date.now() + 10000 } } } };
      check('temporary', { preparationTime: 500 });
      entity.modifierAttacks.temporary.byId.test.expiresAt = 0;
      check('expired', { preparationTime: 400 });
      rebuild();
      check('rebuilt', { preparationTime: 350 });
      host.querySelector(`[id="battlePreparation_${entity.id}"]`).innerHTML = '<span>Recréé</span>';
      check('nested-rebuilt', { executionTime: 300 });
      const fullName = A.resolveAttackDefinitionForEntity(entity, attack.functionName, attackDetails).displayName;
      if (A.resolveEntityAttackDisplayName && A.resolveEntityAttackDisplayName(entity, attack.functionName, attackDetails) !== fullName) throw Error('Name projection disagrees with engine');
      Object.assign(entity, { currentPhase: 'attack_1', orderPhase: '', preparationTime: 500, executionTime: 0, recoveryTime: 0 });
      D.updateTimerDisplay(entity);
      const originalGet = document.getElementById.bind(document);
      let lookups = 0, clones = 0;
      const originalClone = window.structuredClone;
      document.getElementById = (...args) => { lookups++; return originalGet(...args); };
      window.structuredClone = (...args) => { clones++; return originalClone(...args); };
      const observer = new MutationObserver(() => {}); observer.observe(host, { attributes: true, childList: true, characterData: true, subtree: true });
      const start = performance.now();
      for (let i = 0; i < 2000; i++) D.updateTimerDisplay(entity);
      const elapsedMs = performance.now() - start, mutations = observer.takeRecords().length;
      observer.disconnect(); document.getElementById = originalGet; window.structuredClone = originalClone;
      // A fresh pulse needs no layout flush; changing an existing pulse needs one.
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      let layoutReads = 0;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { ...descriptor, get() { layoutReads++; return descriptor.get.call(this); } });
      V.pulseTargetSearchAtb(entity); V.pulseTargetSearchAtb(entity, 'cooldown');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptor);
      const pulses = ['atbFill_', 'HUATBfill_', 'scanATBFill_'].map(prefix => originalGet(prefix + entity.id).className);
      // Same object can occur in multiple army pools. Copies must remain independent
      // and the synchronous event must see all copies already updated.
      entity.totalDamage = 12;
      const copy = { id: entity.id }, second = { id: entity.id };
      E.entites.splice(0, E.entites.length, entity, copy);
      window.entites = E.entites; window.selectedArmyA = [entity, copy, second]; window.selectedArmyB = [copy];
      let notifications = 0;
      const listener = () => { notifications++; if (copy.totalDamage !== 12 || second.totalDamage !== 12) throw Error('Late counter copy'); };
      window.addEventListener('entityCombatStatsChanged', listener);
      clones = 0; window.structuredClone = (...args) => { clones++; return originalClone(...args); };
      T.saveEntityCombatTotals(entity);
      window.structuredClone = originalClone; window.removeEventListener('entityCombatStatsChanged', listener);
      copy.combatDetails.procs.test = 1;
      return { views, micro: { elapsedMs, mutations, lookups }, layoutReads, pulses, copies: { clones, notifications, isolated: !second.combatDetails.procs.test && !entity.combatDetails?.procs?.test } };
    }, before);
    const render = await page.evaluate(async fixture => {
      const Sim = await import("/js/debug/simulation.js");
      const started = performance.now();
      const html = Sim.simulationReportHtml(fixture, { standalone: true });
      const generatedMs = performance.now() - started;
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const embedded = JSON.parse(dom.getElementById('simulation-data').textContent);
      return { generatedMs, characters: html.length, initialTableRows: dom.querySelectorAll('tr').length,
        events: embedded.trials.reduce((n, t) => n + t.journal.length, 0), trials: embedded.trials.length };
    }, reportFixture);
    results[before ? 'before' : 'after'].report = render;
    assert.deepEqual(errors, [], 'No errors during HUD mutations or synchronous counter notifications');
    await page.close();
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v, views: v.views.length }])), null, 2));
  assert.equal(results.after.layoutReads, 1);
  assert.equal(results.after.copies.notifications, 1); assert.equal(results.after.copies.isolated, true);
  assert.equal(results.after.report.trials, 100);
  assert.equal(results.after.report.events, reportFixture.trials.reduce((sum, trial) => sum + trial.journal.length, 0));
  assert.ok(results.after.micro.lookups < 2000);
  for (const name of ['renamed', 'expired', 'rebuilt', 'nested-rebuilt']) assert.ok(results.after.views.find(v => v.name === name).html.includes('Nom modifié en direct'));
  if (hasBaseline) {
    assert.deepEqual(results.after.views, results.before.views, 'Every phase, mutation, expiry and rebuilt HUD must remain identical');
    assert.deepEqual(results.after.pulses, results.before.pulses);
    assert.equal(results.before.layoutReads, 6);
    assert.ok(results.after.copies.clones < results.before.copies.clones);
    assert.ok(results.after.micro.lookups < results.before.micro.lookups / 5);
    assert.ok(results.after.micro.mutations <= results.before.micro.mutations, 'Unchanged HUD must not add observable mutations');
    assert.equal(results.after.report.events, results.before.report.events);
    assert.ok(results.after.report.initialTableRows < results.before.report.initialTableRows / 2);
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
