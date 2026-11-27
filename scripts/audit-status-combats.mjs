import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStatusAudit } from './status-audit-harness.mjs';
async function install(config) {
  const E = await import("/js/entities/runtime.js"), C = await import("/js/combat/clock.js"), Ctrl = await import("/js/combat/control.js");
  const Fx = await import("/js/combat/effects.js"), T = await import("/js/storage/entityStorage.js"), R = await import("/js/combat/attackResolution.js");
  const A = await import("/js/combat/vitals.js"), G = await import("/js/app/state.js");
  const epoch = C.clockNow(), actors = [...E.entites], last = new Map(), seen = new Map();
  const data = window.__statusAudit = { samples: 0, asleepSamples: 0, asleepMs: 0, sleepEntries: 0,
    insolenceActions: 0, damageEvents: 0, periodicDamage: 0, totalDamage: 0,
    statusSamples: {}, violations: [], lastDamageAt: 0, cleanup: null };
  const fail = (rule, entity) => {
    if (data.violations.length < 30) data.violations.push({ rule, entity: entity.id, at: C.clockNow() - epoch });
  };
  if (config.dotDraw) {
    for (const [i, target] of actors.entries()) A.applyEffect(target, 'poison', actors[1 - i], {
      functionName: 'draw-poison', effets: ['poison'], effectOverrides: { poison: {
        effectDot: 30, effectDuration: 3, effectTickInterval: 1, effectPhysicalRatio: 0, effectMagicalRatio: 0,
      } },
    });
  }
  window.addEventListener('combatLogEntry', ({ detail: { type, data: entry } }) => {
    if (type !== 'damage_resolution') return;
    data.damageEvents++; data.totalDamage += Number(entry.damage) || 0; data.lastDamageAt = C.clockNow() - epoch;
    if (entry.attack?.types?.includes('alteration')) data.periodicDamage += Number(entry.damage) || 0;
  });
  const sample = () => {
    const now = C.clockNow(); data.samples++;
    for (const entity of actors) {
      const previous = last.get(entity), asleep = Ctrl.isEntityAsleep(entity), details = T.getEntityCombatDetails(entity);
      const fullSleep = previous && Ctrl.getSleepElapsed(entity, previous.at, now) >= now - previous.at - .001;
      if (asleep) { data.asleepSamples++; if (!previous?.asleep) data.sleepEntries++; }
      if (previous) data.asleepMs += Ctrl.getSleepElapsed(entity, previous.at, now);
      for (const state of Ctrl.getControlStates(entity, 'insolence')) {
        const changes = state.changes || 0, old = seen.get(state);
        if (old != null && changes > old) {
          data.insolenceActions += changes - old;
          if (fullSleep) fail('Insolence action while asleep', entity);
        }
        seen.set(state, changes);
      }
      for (const state of Fx.getActiveEffectStates(entity)) data.statusSamples[state.kind] = (data.statusSamples[state.kind] || 0) + 1;
      const runtime = Fx.getAstralityRuntime(entity);
      if (fullSleep && previous) {
        for (const key of ['astralBody', 'astrality', 'astralReturn', 'dodge', 'marathon', 'trailer']) {
          if ((details.procs[key] || 0) > (previous.procs[key] || 0)) fail(`${key} proc while asleep`, entity);
        }
        if (runtime?.return && previous.returning === runtime.return && runtime.return.delivered > previous.delivered) fail('Astral Return healing while asleep', entity);
      }
      last.set(entity, { at: now, asleep, procs: { ...details.procs }, returning: runtime?.return, delivered: runtime?.return?.delivered });
    }
    if (now - epoch < config.durationMs && !G.isBattleFinished()) C.setTimeout(sample, config.sampleMs || 100);
  };
  sample();
  window.addEventListener('battleEnding', () => {
    data.cleanup = { effects: Fx.getActiveEffectStates().length,
      campsRestored: actors.every((entity, i) => entity.side === config.actors[i].side),
      astralityCleared: actors.every(entity => !Fx.getAstralityRuntime(entity)) };
  });
}
const pilot = process.argv.includes('--pilot');
const retry = process.argv.includes('--retry');
const audit = await createStatusAudit({ output: `outputs/status-sleep-audit/${pilot ? 'pilot' : retry ? 'battles-retry' : 'battles'}`, install });
const themes = [
  { id: 'sommeil-insolence-astralite', effects: ['sommeil', 'insolence'], stats: { astrality: 80, intelligence: 50, strength: 50 } },
  { id: 'sommeil-poison-armure', effects: ['sommeil', 'poison'], stats: { armor: 300 } },
  { id: 'sommeil-grab', effects: ['sommeil', 'grab'] },
  { id: 'stun-silence', effects: ['stun', 'silence'] },
  { id: 'effroi-immobilisation', effects: ['immobilisation', 'effroi'] },
  { id: 'effroi-stun', effects: ['stun', 'effroi'] },
  { id: 'charme-folie-insolence', effects: ['charme', 'folie', 'insolence'] },
  { id: 'ralentissements-confusion', effects: ['bafouillage', 'lenteur', 'confusion'] },
  { id: 'poison-brulure-resistances', effects: ['poison', 'brulure'], stats: { alterationResistance: 40, resilienceTotal: 15 } },
  { id: 'insolence-fuite', effects: ['insolence'], single: true },
];
const scales = [
  { id: 'court', team: 1, hp: 300, power: 45, durationMs: 20000, speed: 900, sampleMs: 100 },
  { id: 'moyen', team: 2, hp: 1800, power: 40, durationMs: 90000, speed: 1100, sampleMs: 200 },
  { id: 'long', team: 3, hp: 12000, power: 55, durationMs: 180000, speed: 1200, sampleMs: 250 },
];
const effectOverrides = {
  sommeil: { effectDuration: 3, effectWakeBase: 10, effectWakeMovement: 10, effectWakeRatio: 1 },
  insolence: { effectDuration: 8, effectMinInterval: 1, effectMaxInterval: 2, effectPriorityWeight: 1, effectActivationWeight: 1 },
  poison: { effectDuration: 6, effectTickInterval: 1, effectDot: 36, effectPhysicalRatio: 0, effectMagicalRatio: 0 },
  brulure: { effectDot: 6, effectStack: 3 }, grab: { effectDistance: 5, effectMovementRecoilPercent: 20 },
  stun: { effectDuration: 3 }, silence: { effectDuration: 3 }, immobilisation: { effectDuration: 4 }, effroi: { effectDuration: 4 },
  charme: { effectDuration: 3 }, folie: { effectDuration: 5 },
  bafouillage: { effectDuration: 6, effectSlowPercent: 40 }, lenteur: { effectDuration: 6, effectSlowPercent: 40 },
  confusion: { effectDuration: 4, effectMoveInterval: 1, effectMovementRecoilPercent: 20 },
};
const jobs = [];
for (const theme of pilot ? themes.slice(0, 1) : themes) for (const scale of scales) for (let index = 0; index < (pilot ? 1 : 2); index++) {
  const config = { id: `${theme.id}-${scale.id}`, durationMs: scale.durationMs, sampleMs: scale.sampleMs, actors: [] };
  for (let pair = 0; pair < scale.team; pair++) for (const originalSide of ['A', 'B']) {
    const side = index ? originalSide === 'A' ? 'B' : 'A' : originalSide;
    const effects = originalSide === 'A' ? theme.effects : [...theme.effects].reverse();
    const attacks = [{ effets: effects, effectOverrides, cooldown: 8000, preparationTime: 700, executionTime: 400,
      attackRange: [pair % 2 ? 'melee' : 'range'] }];
    if (!theme.single) attacks.push({ cooldown: 2000, preparationTime: 450, executionTime: 300 });
    config.actors.push({ side, stats: { HP: scale.hp, physicalDamage: scale.power, magicalDamage: scale.power,
      speed: scale.speed + pair * 50, ...theme.stats }, attacks });
  }
  jobs.push({ config, seed: 193 + index * 7919, index, theme: theme.id, scale: scale.id });
}
if (!pilot) for (const side of ['A', 'B']) jobs.push({
  config: { id: `double-ko-poison-${side}`, dotDraw: true, durationMs: 5000, actors: [
    { side, stats: { HP: 20, physicalDamage: 0, speed: 60000 } },
    { side: side === 'A' ? 'B' : 'A', stats: { HP: 20, physicalDamage: 0, speed: 60000 } },
  ] }, seed: 193, index: 0, theme: 'double-ko-poison', scale: 'court',
});
if (retry) {
  const previous = JSON.parse(await readFile(resolve('outputs/status-sleep-audit/battles/summary.json'), 'utf8'));
  const failed = new Set(previous.failures.filter(f => f.error).map(f => `${f.id}:${f.index}`));
  jobs.splice(0, jobs.length, ...jobs.filter(job => failed.has(`${job.config.id}:${job.index}`)));
}
const rows = [], failures = []; let cursor = 0;
try {
  await audit.save('cases.json', jobs);
  console.log(`Status audit: ${jobs.length} combats.`);
  await Promise.all(Array.from({ length: retry ? 1 : 2 }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++], { config, seed } = job; let page;
      try {
        page = await audit.fixture(config);
        const trial = await audit.simulate(page, config, seed, job.index === 0);
        const row = { id: config.id, index: job.index, seed, theme: job.theme, scale: job.scale,
          mode: 'simulator', entities: trial.entities.length, durationMs: trial.durationMs, end: trial.end, winner: trial.winner,
          damage: trial.entities.reduce((sum, e) => sum + e.damage, 0), turns: trial.entities.reduce((sum, e) => sum + e.turns, 0),
          actions: trial.entities.reduce((sum, e) => sum + e.actions, 0), steps: trial.steps, computeMs: trial.timings.totalMs,
          escaped: trial.entities.filter(e => e.hasFled).length, audit: trial.audit,
          counters: trial.entities.map(e => ({ id: e.id, side: e.side, damage: e.damage, hp: e.hpEnd, details: e.details })) };
        rows.push(row);
        await audit.save(`${config.id}-${job.index}.json`, job.index === 0 ? trial : row);
        if (trial.audit?.violations.length) failures.push({ id: config.id, index: job.index, violations: trial.audit.violations });
        if (!trial.audit?.cleanup || trial.audit.cleanup.effects !== 0 || !trial.audit.cleanup.campsRestored || !trial.audit.cleanup.astralityCleared) failures.push({ id: config.id, cleanup: trial.audit?.cleanup });
        if (config.dotDraw && trial.end !== 'draw') failures.push({ id: config.id, end: trial.end, expected: 'draw' });
        console.log(`${rows.length}/${jobs.length} ${config.id} #${job.index + 1}: ${trial.end} ${(trial.durationMs / 1000).toFixed(1)}s · ${row.audit?.asleepSamples || 0} relevés endormis · ${row.audit?.violations.length || 0} anomalies`);
        // Same board, same scenario in the normal game loop for each complexity.
        if (!retry && job.theme === 'sommeil-insolence-astralite' && job.index === 0) {
          const live = await audit.game(page, config, seed);
          await audit.save(`game-${config.id}.json`, live);
          if (live.audit?.violations.length) failures.push({ id: config.id, mode: 'game', violations: live.audit.violations });
        }
      } catch (error) {
        failures.push({ id: config.id, index: job.index, error: error.stack });
        console.log(`FAIL ${config.id}: ${error.message}`);
      } finally { await page?.close(); }
      await audit.save('progress.json', { expected: jobs.length, completed: rows.length, failures, errors: audit.errors });
    }
  }));
  const summary = { requested: jobs.length, completed: rows.length, failures, errors: audit.errors, rows };
  await audit.save('summary.json', summary);
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const groups = [...new Set(rows.map(r => r.theme))].map(theme => {
    const group = rows.filter(r => r.theme === theme);
    return { theme, count: group.length, duration: group.reduce((s,r) => s + r.durationMs,0) / 1000,
      damage: group.reduce((s,r) => s + r.damage,0), sleeps: group.reduce((s,r) => s + (r.audit?.sleepEntries || 0),0),
      asleepSamples: group.reduce((s,r) => s + (r.audit?.asleepSamples || 0),0),
      timeouts: group.filter(r => r.end === 'timeout').length, escapes: group.reduce((s,r) => s + r.escaped,0),
      anomalies: group.reduce((s,r) => s + (r.audit?.violations.length || 0),0) };
  });
  await audit.save('aggregates.json', groups);
  await writeFile(resolve(audit.output, 'rapport.html'), `<!doctype html><meta charset="utf-8"><title>Audit des statuts</title><style>body{font:16px system-ui;background:#111820;color:#eee;margin:40px;line-height:1.5}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #394754;text-align:left}th{color:#dfc07b}h1{color:#dfc07b}</style><h1>Audit Sommeil et combinaisons de statuts</h1><p>${rows.length} combats enregistrés sur ${jobs.length}. ${failures.length} échecs de contrôle. ${audit.errors.length} erreurs navigateur.</p><p>Duels : 20 s maximum ; 2 contre 2 : 90 s ; 3 contre 3 : 180 s. Deux graines par cas, camps inversés au second essai. Les limites de durée sont des fins d'observation, pas des blocages démontrés. Ces échantillons servent à vérifier les mécanismes, pas à estimer précisément l'équilibrage.</p><table><tr>${['Combinaison','Combats','Temps simulé (s)','Dégâts','Entrées en sommeil','Relevés endormis','Limites de durée','Fuyards','Anomalies sommeil'].map(x=>`<th>${x}</th>`).join('')}</tr>${groups.map(g=>`<tr>${[g.theme,g.count,g.duration.toFixed(1),g.damage.toFixed(1),g.sleeps,g.asleepSamples,g.timeouts,g.escapes,g.anomalies].map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table><h2>Échecs à examiner</h2><pre>${esc(JSON.stringify(failures,null,2))}</pre><p>Les fichiers JSON voisins contiennent les scénarios, graines, compteurs, traces et empreintes des sources utilisées.</p>`);
  assert.equal(rows.length, jobs.length); assert.deepEqual(audit.errors, []); assert.deepEqual(failures, []);
  console.log('Status audit complete.');
} finally { await audit.close(); }
