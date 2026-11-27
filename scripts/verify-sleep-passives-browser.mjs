import assert from 'node:assert/strict';
import { createStatusAudit } from './status-audit-harness.mjs';
const before = process.argv.includes('--before');
const restoreOnly = process.argv.includes('--restore-only');
const bodyOnly = process.argv.includes('--body-only');
async function install(config) {
  const E = await import("/js/entities/runtime.js"), C = await import("/js/combat/clock.js"), A = await import("/js/combat/vitals.js");
  const Fx = await import("/js/combat/effects.js"), Control = await import("/js/combat/control.js");
  const R = await import("/js/combat/attackResolution.js"), T = await import("/js/storage/entityStorage.js");
  const Display = await import("/js/ui/statistics/components.js");
  const [target, source] = E.entites, epoch = C.clockNow();
  Math.random = () => 0;
  const apply = (name, params, key = name) => A.applyEffect(target, name, source, {
    functionName: key, attackId: key, effets: [name], effectOverrides: { [name]: params },
  });
  apply('insolence', { effectDuration: config.kind === 'expired' ? 4 : 40, effectMinInterval: 1, effectMaxInterval: 1,
    effectPriorityWeight: 1, effectActivationWeight: 0 });
  let insolence = Control.getControlState(target, 'insolence');
  const sleepAt = config.kind.startsWith('body') ? 3500 : 500;
  C.setTimeout(() => apply('sommeil', { effectDuration: config.kind === 'early' ? 20 : 8 }), sleepAt);
  if (config.kind === 'overlap') C.setTimeout(() => apply('sommeil', { effectDuration: 9 }, 'sleep-second'), 1500);
  if (config.kind === 'early') C.setTimeout(() => Fx.wakeFromMovement(target, () => 0), 4500);
  C.setTimeout(() => {
    R.startAttackCooldown(target, target.attackDetails[0], 5000);
    if (['return', 'restore'].includes(config.kind)) Fx.startAstralReturn(target);
    else Fx.startAstralCooldown(target);
  }, 100);
  if (['restore', 'body-restore'].includes(config.kind)) C.setTimeout(async () => {
    const snapshot = C.captureCombatState();
    await C.restoreCombatState({ alterations: snapshot.alterations, astrality: snapshot.astrality }, { entities: E.entites });
    insolence = Control.getControlState(target, 'insolence');
  }, config.kind === 'body-restore' ? 4050 : 2050);
  const monitor = () => {
    Display.refreshEntityEffectViews(target);
    const badgeRemaining = kind => {
      const row = document.querySelector(`[data-entity-effect="${kind}"][data-entity-id="${target.id}"]`);
      return row ? Number(row.dataset.expiresAt) - C.clockNow() : null;
    };
    const bodyBadgeRemaining = badgeRemaining('astralBody'), returnBadgeRemaining = badgeRemaining('astralReturn');
    const state = Fx.getAstralityRuntime(target), runtime = R.getAttackRuntime(target, target.attackDetails[0]);
    window.dispatchEvent(new CustomEvent('combatLogEntry', { detail: { type: 'audit', data: {
      asleep: Control.isEntityAsleep(target), changes: insolence.changes,
      insolenceActive: Boolean(Control.getControlState(target, 'insolence')),
      nextAction: insolence.nextActionAt - epoch, nextBody: state?.nextCheckAt == null ? null : state.nextCheckAt - epoch,
      body: Fx.isAstralBodyActive(target), bodyEnd: state?.body ? state.body.expiresAt - epoch : null,
      bodyProtection: Fx.blocksAstralSpell(target, { combatFunction: 'Attaquant', attacknature: ['magicalDamage'] }),
      bodySprite: Boolean(document.getElementById(`spriteContainer_${target.id}`)?.classList.contains('astral-body-active')),
      bodyBadgeRemaining, returnBadgeRemaining, returnEnd: state?.return ? state.return.expiresAt - epoch : null,
      procs: T.getEntityCombatDetails(target).procs, hp: target.stats.HP.current,
      astralCooldown: Fx.astralCooldownRemaining(target), attackCooldown: Math.max(0, runtime.readyAt - C.clockNow()),
      returnDelivered: state?.return?.delivered || 0,
    } } }));
    if (C.clockNow() - epoch < config.durationMs - 100) C.setTimeout(monitor, 100);
  };
  monitor();
}
const audit = await createStatusAudit({ output: `outputs/status-sleep-audit/${before ? 'baseline' : restoreOnly ? 'focused-restore' : bodyOnly ? 'body-expiry' : 'focused-current'}`, install, before });
const results = [];
function verify(trial, config, mode) {
  const rows = trial.journal.filter(e => e.type === 'audit'), violations = [];
  const check = (condition, rule) => { if (!condition && !violations.includes(rule)) violations.push(rule); };
  const at = time => rows.find(row => row.timeMs >= time);
  const bodyCase = config.kind.startsWith('body');
  const start = bodyCase ? 3500 : 500;
  const end = config.kind === 'early' ? 4500 : config.kind === 'overlap' ? 10500 : start + 8000;
  const sleeping = rows.filter(row => row.timeMs >= start + 100 && row.timeMs < end - 100);
  const bodyExpiry = bodyCase ? at(start).bodyEnd : null;
  check(sleeping.length > 20 && sleeping.every(r => r.asleep), 'real sleep interval');
  if (bodyCase) check(bodyExpiry > start && bodyExpiry < end, 'active Body deadline falls during sleep');
  for (const row of sleeping.slice(1)) {
    check(row.changes === sleeping[0].changes, 'Insolence must not act during sleep');
    check((row.procs.astralBody || 0) === (sleeping[0].procs.astralBody || 0), 'no Astral Body proc during sleep');
    check(Math.abs(row.attackCooldown - sleeping[0].attackCooldown) < 1, 'attack cooldown frozen');
    check(Math.abs(row.astralCooldown - sleeping[0].astralCooldown) < .001, 'astral cooldown frozen');
    if (['return', 'restore'].includes(config.kind)) {
      check(row.hp === sleeping[0].hp, 'Astral Return healing suspended');
      check(row.returnBadgeRemaining !== null && Math.abs(row.returnBadgeRemaining - (row.returnEnd - row.timeMs)) < 1, 'Return badge displays the paused remaining time');
    }
    if (bodyCase) {
      if (row.timeMs < bodyExpiry) {
        check(row.body && row.bodyProtection && row.bodySprite, 'Body remains protective before its original deadline');
        check(row.bodyEnd === bodyExpiry, 'sleep never extends Body duration');
        check(row.bodyBadgeRemaining !== null && Math.abs(row.bodyBadgeRemaining - (bodyExpiry - row.timeMs)) < 1, 'Body badge counts down normally during sleep');
      } else {
        check(!row.body && !row.bodyProtection && !row.bodySprite && row.bodyEnd === null && row.bodyBadgeRemaining === null,
          'Body expires during sleep: no immunity, runtime, badge or sprite remains');
      }
    }
  }
  check(!at(end + 100).asleep, 'wake after actual sleep duration');
  if (config.kind === 'expired') {
    check(!at(end + 100).insolenceActive && at(15000).changes === 0, 'expired Insolence has no queued action');
  } else {
    const changesAtSleep = sleeping[0].changes;
    check(at(end + 100).changes === changesAtSleep, 'no Insolence burst at wake');
    check(at(end + 1100).changes === changesAtSleep + 1, 'one normal Insolence action after wake');
  }
  if (!bodyCase) {
    const nextProc = end + 2500;
    check(!(at(end + 100).procs.astralBody > 0), 'no Astral Body catch-up at wake');
    check(!(at(nextProc - 100).procs.astralBody > 0), 'Astral Body waits for all remaining time');
    check(at(nextProc + 100).procs.astralBody === 1, 'Astral Body resumes its remaining cadence');
  } else {
    check(at(end + 100).procs.astralBody === 1 && !at(end + 100).body, 'expired Body does not reappear on wake');
    check(at(end + 2900).procs.astralBody === 1, 'Body waits for its next ordinary check after wake');
    check(at(end + 3100).procs.astralBody === 2, 'Body may proc again on the next ordinary check');
  }
  if (['return', 'restore'].includes(config.kind)) {
    check(at(end + 100).hp - sleeping[0].hp <= 4, 'Astral Return resumes gradually without bulk healing');
    check(at(14000).hp === 600, 'Astral Return preserves its total healing budget');
  }
  return { kind: config.kind, side: config.side, mode, samples: rows.length, sleepSamples: sleeping.length,
    violations, last: rows.at(-1) };
}
try {
  for (const side of before ? ['A'] : ['A', 'B']) for (const kind of restoreOnly ? ['restore'] : bodyOnly ? ['body', 'body-restore'] : ['idle', 'body', 'return', 'overlap', 'early', 'expired', 'restore', 'body-restore']) {
    const config = { kind, side, durationMs: 16000, actors: [
      { side, hp: ['return', 'restore'].includes(kind) ? 500 : 1000, stats: { astrality: 1, speed: 60000 }, attacks: [{}, {}] },
      { side: side === 'A' ? 'B' : 'A', stats: { speed: 60000 } },
    ] };
    const page = await audit.fixture(config), sim = await audit.simulate(page, config, 193);
    await audit.save(`sim-${side}-${kind}.json`, sim);
    results.push(verify(sim, config, 'simulator'));
    if (!before) {
      const live = await audit.game(page, config);
      await audit.save(`game-${side}-${kind}.json`, live); results.push(verify(live, config, 'game'));
    }
    console.log(`${before ? 'BASELINE' : 'CHECK'} ${side}/${kind}: ${results.at(-1).violations.join('; ') || 'PASS'}`);
    await page.close();
  }
  await audit.save('summary.json', { before, results, errors: audit.errors });
  assert.deepEqual(audit.errors, []);
  if (!before) assert.deepEqual(results.filter(r => r.violations.length).map(r => ({ kind: r.kind, side: r.side, mode: r.mode, violations: r.violations })), []);
  console.log(`Sleep passives: ${results.length} scenarios recorded.`);
} finally { await audit.close(); }
