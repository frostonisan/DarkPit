import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.SPECTRAL_OUTPUT || 'outputs/spectral-timing-color-2026-11-27/spectral');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname), rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().startsWith('[Spectral]')) console.log(message.text()); });
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.__spectralNativeTimeout = timeout;
    window.setTimeout = (...args) => (window.__spectralTimers?.setTimeout || timeout)(...args);
    window.clearTimeout = (...args) => (window.__spectralTimers?.clearTimeout || clear)(...args);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const report = await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), A = await import('/js/combat/vitals.js');
    const F = await import('/js/combat/attacks.js'), Fx = await import('/js/combat/effects.js');
    const C = await import('/js/combat/clock.js'), T = await import('/js/combat/timeline.js');
    const Control = await import('/js/combat/control.js'), State = await import('/js/app/state.js');
    const R = await import('/js/combat/attackResolution.js'), DR = await import('/js/combat/damageRules.js');
    const Display = await import('/js/rendering/displayBatch.js');
    const Hud = await import('/js/rendering/hud.js');
    window.levelRunning = 'worldmap'; State.setGameOver(false);
    const checks = [], scenarios = [], ok = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    const eq = (actual, expected, label) => ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} / ${expected}`);
    const host = document.createElement('main'); document.body.append(host);
    let id = 986000;
    const actor = (side = 'B', baseStats = {}) => {
      const e = E.enrichEntityStats({ id: ++id, name: 'Spectral timing audit', side, type: 'sbire', role: 'gueux', level: 1,
        awakening: 3, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 10000, physicalDamage: 10, ...baseStats }, position: `spectral-${id}` });
      e.isDEAD = false; e.statut = ['alive']; e.stats.speed = 1000; e.baseSpeedTimer = 0;
      e.speedTimer = 0; e.preparationTime = 0; e.executionTime = 0; e.recoveryTime = 0;
      const hex = document.createElement('div'); hex.className = 'hex Neutral'; hex.dataset.position = e.position;
      hex.innerHTML = `<div id="Box_Entite_${id}" class="entite-box"><div id="sbire_${id}"><div id="effectsContainer_${id}"></div><div id="PopDow_${id}"></div></div><div id="atbFill_${id}" class="atb-fill"></div><div id="HUATBfill_${id}" class="headsup-atb-fill"></div><div id="scanATBFill_${id}" class="atb-scan-fill"></div><div id="currentAttackBar_${id}" class="attack-bar-fill"></div></div>`;
      host.append(hex); E.entites.push(e); return e;
    };
    const random = Math.random, date = Date.now;
    let now = date(), next = 0; const timers = new Map();
    const flush = () => new Promise(done => window.__spectralNativeTimeout(done, 0));
    window.__spectralTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++next; timers.set(id, { fn: () => fn(...args), at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) };
    Date.now = () => now; Math.random = () => .5;
    const advance = async ms => {
      const end = now + ms; let guard = 0;
      while (true) {
        await flush(); await T.settleCombatTimeline();
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break; if (++guard > 20000) throw Error('Spectral timer loop');
        const [id, timer] = due; now = Math.max(now, timer.at); timers.delete(id); timer.fn();
      }
      now = end; await flush(); await T.settleCombatTimeline(); Display.flushCombatDisplay();
    };
    const bar = (e, key = 'atbFill') => parseFloat(document.getElementById(`${key}_${e.id}`).style.width);
    const green = (e, key = 'atbFill') => document.getElementById(`${key}_${e.id}`).classList.contains('spectral-delay');
    const source = actor('A');
    const recoil = (e, percent) => Fx.applySpectralRecoil(e, source, e.stats.HP.max * percent / 100, e.stats.HP.max);
    const attack = (range = 'melee', preparationTime = 1000) => ({ functionName: 'spectral-timing', displayName: 'Spectral timing',
      combatFunction: 'Attaquant', attackRange: [range], attackTarget: ['enemy'], deadTarget: ['no'],
      attacknature: ['physicalDamage'], essenceSlots: [{ color: 'red', active: true }], effets: [], selfEffects: [],
      preparationTime, executionTime: 1000, recoveryTime: 100, cooldown: 8000, physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 });
    const hit = (e, amount = 100, bonus = 60) => {
      const def = { ...attack(), essenceSlots: ['blue', 'blue', 'blue', 'yellow'].map(color => ({ color, active: true })),
        criticalRoll: { isCritical: true, bonus, critDamageBonus: bonus, critTotalChance: 99, reduction: 0 } };
      const sources = DR.splitDamageByNature(R.getAttackNatureRules(def), amount);
      return A.applyDamage(e, amount, source, { ...def, forceDamageSources: sources }, sources);
    };
    try {
      // Real phase loops: once earned, the delay survives every later update.
      for (const phase of ['speedTimer', 'recoveryTime']) {
        const e = actor(); e.maxRecoveryTime = 1000;
        const start = C.clockNow(); let ended = null;
        const task = A.runPhaseTimer(e, phase, 1000).then(() => { ended = T.combatNow() - start; });
        await advance(400); eq(e[phase], 600, `${phase}: baseline remaining`);
        ok(recoil(e, 20), `${phase}: accepts spectral recoil`);
        await advance(50); eq(e[phase], 750, `${phase}: adds 200ms`);
        eq(bar(e), phase === 'speedTimer' ? 25 : 75, `${phase}: HUD reflects postponed progress`);
        await advance(150); eq(e[phase], 600, `${phase}: progresses at normal rate, no catch-up`);
        recoil(e, 10); await advance(400);
        ok(ended === null, `${phase}: does not finish at original deadline`);
        eq(e[phase], 300, `${phase}: both delays remain at original deadline`);
        await advance(299); ok(ended === null, `${phase}: no early finish`);
        await advance(1); await task; eq(ended, 1300, `${phase}: exact cumulative deadline`);
        scenarios.push({ phase, normalMs: 1000, actualMs: ended, delayedMs: 300 });
      }
      // Early recoil clamps at zero progress; late recoil is not lost between pulses.
      for (const [at, percent, expected] of [[10, 80, 1010], [990, 20, 1200]]) {
        const e = actor(), start = C.clockNow(); let ended;
        const task = A.runPhaseTimer(e, 'speedTimer', 1000).then(() => { ended = T.combatNow() - start; });
        await advance(at); recoil(e, percent); await advance(expected - at - 1);
        ok(ended === undefined, `Boundary ${at}: delay retained`);
        await advance(1); await task; eq(ended, expected, `Boundary ${at}: exact finish`);
      }
      for (const phase of ['speedTimer', 'recoveryTime']) {
        const e = actor(), start = C.clockNow(); let ended;
        const task = A.runPhaseTimer(e, phase, 1000).then(() => { ended = T.combatNow() - start; });
        await advance(400); recoil(e, 20); await advance(100);
        C.freezeCombatClock(); const before = e[phase]; await advance(5000);
        eq(e[phase], before, `${phase}: pause preserves delayed remaining`); C.resumeCombatClock();
        await advance(699); ok(ended === undefined, `${phase}: wall-clock pause cannot repay recoil`);
        await advance(1); await task; eq(ended, 1200, `${phase}: paused finish uses combat time`);
        // Serialize both processed delay and an unconsumed recoil, then take the production resume path.
        const restored = actor(), resumedStart = C.clockNow(); let resumedEnd;
        const old = A.runPhaseTimer(restored, phase, 1000);
        await advance(400); recoil(restored, 20); await advance(100); recoil(restored, 10);
        restored._resumePhaseTimer = C.combatData(restored._phaseTimer);
        const resumed = A.runPhaseTimer(restored, phase, 1000).then(() => { resumedEnd = T.combatNow() - resumedStart; });
        await advance(799); ok(resumedEnd === undefined, `${phase}: saved recoil cannot disappear or duplicate`);
        await advance(1); await resumed; await old;
        eq(resumedEnd, 1300, `${phase}: serialized resume keeps both delays`);
      }
      // Real preparation loop, including its actual bar and serialized action state.
      for (const restore of [false, true]) {
        const caster = actor('A'), target = actor('B'), def = attack(), start = C.clockNow();
        const pending = F.executeAttack(caster, target, def);
        await advance(400); eq(caster.preparationTime, 600, 'Preparation baseline'); recoil(caster, 20);
        await advance(50); eq(caster.preparationTime, 750, 'Preparation gains 200ms');
        eq(bar(caster, 'currentAttackBar'), 25, 'Preparation bar moves back to 25 percent');
        await advance(150); eq(caster.preparationTime, 600, 'Preparation never catches up'); recoil(caster, 10);
        let restoredTask;
        if (restore) {
          caster._combatAction = C.combatData(caster._combatAction);
          restoredTask = F.executeAttack(caster, target, def);
        }
        await advance(400); ok(caster._combatAction.stage === 'preparation', 'Preparation persists beyond original deadline');
        eq(bar(caster, 'currentAttackBar'), 70, 'Preparation HUD preserves cumulative 300ms delay');
        await advance(299); ok(caster._combatAction.stage === 'preparation', 'Preparation remains pending until postponed deadline');
        await advance(1); ok(caster._combatAction.stage === 'transport', 'Preparation launches at 1300ms');
        eq(C.clockNow() - start, 1300, 'Preparation exact launch');
        scenarios.push({ phase: 'preparation', restore, normalMs: 1000, actualMs: 1300 });
        caster.battleStopped = true; await advance(1100); await pending; await restoredTask;
      }
      // Actual melee impact queue, not only the recoil history or displayed timer.
      for (const restore of [false, true]) {
        const caster = actor('A'), target = actor('B'), def = attack('melee', 0), start = C.clockNow();
        caster._combatAction = { stage: 'transport', attack: def }; let ended;
        const flight = F.createAttackFlight(caster, target, def, { physical: 10 });
        const task = F.resolveAttackImpact(flight, { at: start + 1000, actionStartedAt: start, actionDuration: 1000 })
          .then(() => { ended = T.combatNow() - start; });
        await advance(400); recoil(caster, 20); await advance(200); recoil(caster, 10);
        if (restore) caster.executionRecoils = C.combatData(caster.executionRecoils);
        await advance(400); eq(target.stats.HP.current, 10000, 'Melee causes no damage at old deadline');
        eq(Control.getExecutionProgress(caster, start, C.clockNow(), 1000), 700, 'Melee progress keeps both delays');
        await advance(299); ok(ended === undefined, 'Melee cannot catch up before new deadline');
        await advance(1); await task; eq(ended, 1300, 'Melee applies exactly at postponed deadline');
        eq(target.stats.HP.current, 9990, 'Delayed melee applies damage once'); delete caster._combatAction;
        scenarios.push({ phase: 'melee', restore, normalMs: 1000, actualMs: ended });
      }
      // Only the actual added time is green, not the entire delayed phase.
      for (const phase of ['speedTimer', 'recoveryTime', 'preparation', 'melee']) {
        const e = actor('A'), target = actor('B'), start = C.clockNow();
        const key = ['preparation', 'melee'].includes(phase) ? 'currentAttackBar' : 'atbFill';
        const task = ['speedTimer', 'recoveryTime'].includes(phase)
          ? A.runPhaseTimer(e, phase, 1000) : F.executeAttack(e, target, attack('melee', phase === 'preparation' ? 1000 : 0));
        await advance(400); ok(!green(e, key), `${phase}: normal phase color before impact`);
        recoil(e, 20); await advance(50);
        ok(green(e, key), `${phase}: green during the added delay`);
        const until = Control.getSpectralTimingFeedback(e).until;
        eq(until - C.clockNow(), phase === 'melee' ? e.currentAttack.executionTime * .2 - 50 : 200, `${phase}: green duration equals actual recoil`);
        const node = document.getElementById(`${key}_${e.id}`);
        ok(getComputedStyle(node, '::after').backgroundColor === 'rgb(147, 219, 117)', `${phase}: shared spectral palette is visibly applied`);
        if (phase === 'speedTimer' || phase === 'recoveryTime') {
          ok(green(e, 'HUATBfill') && green(e, 'scanATBFill'), `${phase}: HUD and scan share the color`);
        }
        // A reconstructed view must receive the indication and expire normally.
        node.replaceWith(node.cloneNode()); Hud.updateTimerDisplay(e); Display.flushCombatDisplay();
        ok(green(e, key), `${phase}: indication survives view reconstruction`);
        C.freezeCombatClock(); await advance(5000);
        ok(green(e, key), `${phase}: pause freezes the color`); C.resumeCombatClock();
        await advance(until - C.clockNow() - 1); ok(green(e, key), `${phase}: green until its exact deadline`);
        await advance(1); ok(!green(e, key), `${phase}: original color restored at the end of added time`);
        ok(C.clockNow() - start < 1200, `${phase}: color ends before the delayed action`);
        await advance(1500); await task;
      }
      {
        const e = actor(), task = A.runPhaseTimer(e, 'speedTimer', 1000);
        await advance(400); recoil(e, 20); await advance(100);
        const firstEnd = Control.getSpectralTimingFeedback(e).until;
        recoil(e, 10); await advance(50);
        eq(Control.getSpectralTimingFeedback(e).until, firstEnd + 100, 'Repeated recoil extends green by its added delay');
        await advance(firstEnd - C.clockNow()); ok(green(e), 'New recoil keeps green past the first deadline');
        await advance(100); ok(!green(e), 'Cumulative green ends after both added durations');
        await advance(550); await task;
        const early = actor(), earlyTask = A.runPhaseTimer(early, 'speedTimer', 1000);
        await advance(10); recoil(early, 80); await advance(40);
        eq(Control.getSpectralTimingFeedback(early).until - C.clockNow(), 10, 'Clamped recoil colors only its earned 10ms');
        await advance(10); ok(!green(early), 'Clamped color does not last the requested 800ms');
        await advance(950); await earlyTask;
        const fractional = actor(), fractionalTask = A.runPhaseTimer(fractional, 'speedTimer', 1000);
        await advance(400); recoil(fractional, .25); await advance(50);
        ok(green(fractional), 'Fractional recoil starts its indication');
        await advance(3); ok(!green(fractional), 'Fractional millisecond expiry does not leave a stuck green gauge');
        await advance(600); await fractionalTask;
        const dying = actor(), dyingTask = A.runPhaseTimer(dying, 'speedTimer', 1000);
        await advance(400); recoil(dying, 20); await advance(50);
        dying.isDEAD = true; Fx.clearCombatEffects(dying); Display.flushCombatDisplay();
        ok(!green(dying), 'Death removes the green indication immediately');
        await advance(50); await dyingTask;
        const stopped = actor(), stoppedTask = A.runPhaseTimer(stopped, 'speedTimer', 1000);
        await advance(400); recoil(stopped, 20); await advance(50);
        stopped.battleStopped = true; window.dispatchEvent(new Event('battleStopped')); Display.flushCombatDisplay();
        ok(!green(stopped), 'Combat stop removes the green indication');
        await advance(50); await stoppedTask;
      }
      // A real spectral impact followed by every burn tick contributes only its own HP damage.
      for (const phase of ['speedTimer', 'recoveryTime']) {
        const e = actor(); e.stats.speed = 10000; e.maxRecoveryTime = 10000;
        const start = C.clockNow(); let ended;
        const task = A.runPhaseTimer(e, phase, 10000).then(() => { ended = T.combatNow() - start; });
        await advance(2000); hit(e, 100, 60); await advance(50);
        ok(green(e), `${phase}: real spectral impact colors the gauge`);
        await advance(150); ok(!green(e), `${phase}: impact indication expires while burn persists`);
        await advance(850); ok(green(e), `${phase}: spectral burn tick colors the gauge again`);
        await advance(3450);
        eq(e.stats.HP.current, 9840, `${phase}: spectral impact plus burn conserves 160 damage`);
        ok(!Fx.getActiveEffectStates(e).some(state => state.criticalBurn), `${phase}: finite burn completed`);
        await advance(50); // The tick queues recoil after the phase pulse at the same instant.
        eq(e[phase], 3610, `${phase}: impact and all ticks add 160ms`);
        await advance(3450); ok(ended === undefined, `${phase}: expired burn never refunds delay`);
        await advance(159); ok(ended === undefined, `${phase}: late damage is not caught up`);
        await advance(1); await task; eq(ended, 10160, `${phase}: exact burn-adjusted finish`);
        scenarios.push({ phase, source: 'real spectral hit + burn', normalMs: 10000, actualMs: ended });
      }
      for (const phase of ['preparation', 'melee']) {
        const caster = actor('A'), target = actor('B'), start = C.clockNow(); let ended;
        const def = attack('melee', phase === 'preparation' ? 10000 : 0);
        if (phase === 'melee') caster._combatAction = { stage: 'transport', attack: def };
        const pending = phase === 'preparation' ? F.executeAttack(caster, target, def)
          : F.resolveAttackImpact(F.createAttackFlight(caster, target, def, { physical: 10 }),
            { at: start + 10000, actionStartedAt: start, actionDuration: 10000 }).then(() => { ended = T.combatNow() - start; });
        await advance(2000); hit(caster, 100, 60); await advance(4500);
        eq(caster.stats.HP.current, 9840, `${phase}: real spectral hit and finite burn`);
        await advance(3500);
        if (phase === 'preparation') {
          eq(caster.preparationTime, 160, 'Preparation retains all impact and burn delays at old deadline');
          eq(bar(caster, 'currentAttackBar'), 98.4, 'Preparation bar remains below full after burn expiry');
        } else {
          ok(ended === undefined, 'Melee is still pending after the burn expired');
          eq(Control.getExecutionProgress(caster, start, C.clockNow(), 10000), 9840, 'Melee retains every burn recoil');
        }
        await advance(159);
        ok(phase === 'preparation' ? caster._combatAction.stage === 'preparation' : ended === undefined,
          `${phase}: no catch-up after spectral burn expiry`);
        await advance(1);
        if (phase === 'preparation') {
          ok(caster._combatAction.stage === 'transport', 'Burn-delayed preparation launches at 10160ms');
          caster.battleStopped = true; await advance(1100);
        } else eq(ended, 10160, 'Burn-delayed melee impacts at 10160ms');
        await pending; delete caster._combatAction;
        scenarios.push({ phase, source: 'real spectral hit + burn', normalMs: 10000, actualMs: 10160 });
      }
      // Debuff expiry cannot refund already lost progress; roots of unrelated timers remain untouched.
      const slowed = actor(), slowStart = C.clockNow(); let slowEnd;
      Control.addEntityControl(slowed, 'lenteur', slowStart, slowStart + 600, .5);
      const slowTask = A.runPhaseTimer(slowed, 'speedTimer', 1000).then(() => { slowEnd = T.combatNow() - slowStart; });
      await advance(400); recoil(slowed, 10); await advance(600);
      eq(slowed.speedTimer, 400, 'Expired Lenteur retains its 300ms plus spectral 100ms');
      await advance(400); await slowTask; eq(slowEnd, 1400, 'Lenteur expiry does not repay either delay');
      const resistant = actor('B', { alterationResistance: 50 }), rStart = C.clockNow(); let rEnd;
      const rTask = A.runPhaseTimer(resistant, 'speedTimer', 1000).then(() => { rEnd = T.combatNow() - rStart; });
      await advance(400); recoil(resistant, 20); await advance(700); await rTask;
      eq(rEnd, 1100, 'Alteration resistance reduces the delay once');
      const immune = actor('B', { resilienceTotal: 25 }); immune._combatAction = { stage: 'preparation', attack: {} };
      Math.random = () => .1; ok(!recoil(immune, 20) && !immune._combatAction.preparationRecoils, 'Total resilience cancels recoil'); Math.random = () => .5;
      delete immune._combatAction;
      const armored = actor('B', { armor: 1000 }), armorStart = C.clockNow(); let armorEnd;
      const armorTask = A.runPhaseTimer(armored, 'speedTimer', 1000).then(() => { armorEnd = T.combatNow() - armorStart; });
      await advance(400); hit(armored, 100, 60);
      eq(armored.stats.HP.current, 10000, 'Armored spectral impact causes no HP loss');
      eq(armored._phaseTimer.recoils.length, 0, 'Armor damage does not generate spectral recoil');
      await advance(600); await armorTask; eq(armorEnd, 1000, 'Armor-only impact leaves timing unchanged');
      Fx.clearCombatEffects(armored);
      for (const phase of ['speedTimer', 'recoveryTime', 'orderExecutionTime']) {
        const mover = actor(); mover.orderPhase = 'orderExecution';
        const task = A.runPhaseTimer(mover, phase, 1000); await advance(400);
        ok(!recoil(mover, 20), `${phase}: movement order is excluded`); await advance(600); await task;
      }
      const ranged = actor('A'), victim = actor('B'), rangedDef = attack('range', 0), start = C.clockNow();
      ranged._combatAction = { stage: 'transport', attack: rangedDef };
      ranged.attackSelection = { readyAt: { spell: start + 8000 } };
      let rangedEnd;
      const rangedTask = F.resolveAttackImpact(F.createAttackFlight(ranged, victim, rangedDef, { physical: 10 }), { at: start + 1000 })
        .then(() => { rangedEnd = T.combatNow() - start; });
      await advance(400); ok(!recoil(ranged, 20), 'Projectile already in flight is excluded');
      eq(ranged.attackSelection.readyAt.spell, start + 8000, 'Spectral recoil cannot alter cooldown');
      await advance(600); eq(rangedEnd, 1000, 'Projectile impacts at original deadline'); await rangedTask;
      ok(victim.stats.HP.current < 10000, 'Unchanged projectile deadline still applies its ranged damage');
      delete ranged._combatAction;
      console.log(`[Spectral] ${checks.length} checks completed`);
    } finally {
      C.resumeCombatClock();
      for (const e of E.entites) { e.battleStopped = true; Fx.clearCombatEffects(e); }
      T.clearCombatTimeline(); Math.random = random; Date.now = date; delete window.__spectralTimers; host.remove();
    }
    return { checks, scenarios };
  });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Spectral timing integration: ${report.checks.length} checks passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
