import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.STAT_READ_OUTPUT || 'outputs/combat-stat-reads');
const baseline = process.env.STAT_READ_BASELINE && resolve(process.env.STAT_READ_BASELINE);
let root = resolve('docs');
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
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
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator('#game-container').waitFor({ state: 'attached' });
    const result = await page.evaluate(async () => {
      const S = await import('/js/entities/statSystem.js');
      const E = await import('/js/entities/runtime.js');
      const D = await import('/js/combat/statistics.js');
      const A = await import('/js/combat/attackExecution.js');
      const R = await import('/js/entities/rules.js');
      const Clock = await import('/js/combat/clock.js');
      const { stats } = await import('/js/data/statsData.js');
      const { balanceData: B } = await import('/js/data/balanceData.js');
      const P = globalThis.umbraProgression, states = [];
      const equal = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(label); };
      // Compare with the uncached definition, including live edits and caller ownership.
      const metadata = label => {
        const expected = [...new Set(Object.entries(P.sources).filter(([, cfg]) => cfg.progressive)
          .flatMap(([source, cfg]) => [source, cfg.attribute]))];
        equal(P.getProgressiveStatKeys(), expected, label + ': progressive keys');
        equal(S.getPointLimitedStatKeys(), [...new Set([...expected, ...stats.filter(s => s.nature === 'umbra').map(s => s.key)])], label + ': limited keys');
        P.getProgressiveStatKeys().splice(0); S.getPointLimitedStatKeys().reverse();
        equal(P.getProgressiveStatKeys(), expected, label + ': private cache');
        states.push({ label, keys: S.getPointLimitedStatKeys() });
      };
      const saved = structuredClone(P.sources.vigueur);
      try {
        metadata('initial');
        P.sources.vigueur.attribute = 'cacheProbe'; metadata('attribute edited');
        P.sources.vigueur.progressive = false; metadata('progression disabled');
        P.sources.cacheProbe = { progressive: true, attribute: 'strength' }; metadata('source added');
        P.sources.cacheProbe.attribute = 'intelligence'; metadata('source edited');
        delete P.sources.cacheProbe; metadata('source removed');
      } finally { Object.assign(P.sources.vigueur, saved); delete P.sources.cacheProbe; }
      metadata('configuration restored');

      const entity = { id: 981273, name: 'Read snapshot audit', type: 'sbire', side: 'A', awakening: 1,
        level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
        baseStats: { HP: 1000, strength: 180, intelligence: 90, agility: 160, haste: 200,
          vigueur: 170, esprit: 80, finesse: 25, charge: 4, vivacite: 50, speed: 10000 } };
      E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      const attacks = ['physicalDamage', 'magicalDamage', 'piercingDamage', 'transpiercingDamage'].flatMap(nature =>
        ['melee', 'range'].map(range => ({ functionName: 'read-audit', combatFunction: 'Attaquant',
          attacknature: [nature], attackRange: [range], attackTarget: ['enemy'], deadTarget: ['no'], effets: ['none'],
          preparationTime: 350, executionTime: 250, recoveryTime: 400, cooldown: 1400 })));
      const sample = label => {
        const before = JSON.stringify(entity), sequence = Clock.combatClockSequence();
        const values = attacks.map(attack => ({ timings: A.buildAttackTimingsWithHaste(entity, attack),
          displayedTimings: D.getEffectiveAttackTimings(attack, entity),
          velocity: S.getEntityVelocityTiming(entity), speed: R.getSafe(entity, 'speed'),
          access: D.getAttackUmbraAccess(entity, attack).map(({ key, owned, equipment, compatible, usable, value }) =>
            ({ key, owned, equipment, compatible, usable, value })) }));
        equal(JSON.stringify(entity), before, label + ': read mutated entity');
        equal(Clock.combatClockSequence(), sequence, label + ': read scheduled combat work');
        states.push({ label, values });
      };
      sample('initial calculations');
      entity.baseStats.haste = 40; entity.baseStats.vivacite = 90; sample('base changed');
      entity.seuilUmbra = 50; sample('threshold changed');
      entity.modifierStats.durable.statLeveled = { haste: 100, agility: 50 }; sample('progression changed');
      entity.battleBoosts = { haste: [{ mode: 'flat', value: 30 }], agility: [{ mode: 'percent', value: 40 }],
        vivacite: [{ mode: 'flat', value: 20 }], speed: [{ mode: 'percent', value: -15 }] };
      sample('buff applied');
      delete entity.battleBoosts; sample('buff removed');
      entity.modifierStats.durable.stuff = { byId: { eAudit: { haste: { flat: 25, percent: 15 }, vigueur: 30 } } };
      sample('equipment applied');
      entity.modifierStats.durable.stuff.orfevre = { effectiveById: { eAudit: { haste: { flat: 40, percent: 20 }, vigueur: 45 } } };
      sample('equipment improved');
      entity.modifierStats.durable.stuff = { byId: {} }; sample('equipment removed');
      const rate = P.progression.levelOverflowRate;
      try { P.progression.levelOverflowRate = 0.25; sample('balance changed'); }
      finally { P.progression.levelOverflowRate = rate; }
      sample('balance restored');

      // No await/frame boundary between edits: every new calculation must see them.
      const initialTiming = D.getEffectiveAttackTimings(attacks[1], entity);
      entity.baseStats.haste = 0;
      entity.modifierStats.durable.statLeveled = {};
      const unbuffed = D.getEffectiveAttackTimings(attacks[1], entity);
      entity.battleBoosts = { haste: [{ mode: 'flat', value: 300 }] };
      const buffed = D.getEffectiveAttackTimings(attacks[1], entity);
      if (!(buffed.effective.preparationTime < unbuffed.effective.preparationTime)) throw Error('Buff must affect the next timing read');
      delete entity.battleBoosts;
      equal(D.getEffectiveAttackTimings(attacks[1], entity), unbuffed, 'buff removal immediately visible');
      states.push({ label: 'same-task timing edits', initialTiming, unbuffed, buffed });

      const scope = S.withStatReadSnapshot || S.withStatDisplayReads;
      const read = () => R.getSafe(entity, 'haste');
      equal(scope(() => scope(read)), read(), 'nested snapshot');
      try { scope(() => { read(); throw Error('expected'); }); }
      catch (error) { if (error.message !== 'expected') throw error; }
      entity.baseStats.haste = 310;
      equal(scope(read), read(), 'snapshot released after exception');

      // Rule definitions are shared, never calculated results for different inputs.
      const inputsA = { HP: 500, haste: 100, strength: 30, intelligence: 60, agility: 90, vigueur: 20, bloodFury: 1 };
      const inputsB = { HP: 800, haste: 20, strength: 150, intelligence: 15, agility: 5, vigueur: 40, bloodFury: 1 };
      const all = inputs => [...S.calculateStatSources(inputs, null, { effective: true })];
      const ruleSample = label => {
        const expected = [all(inputsA), all(inputsB)];
        const actual = scope(() => [all(inputsA), scope(() => all(inputsB))]);
        equal(actual, expected, label + ': rule sharing changed results');
        states.push({ label, values: actual });
      };
      const cap = B.attackTime.reductionCapPercent;
      const threshold = B.blood.furyExecution.threshold.basePercent;
      const source = B.generatedUmbraStats.sources.vigueur;
      try {
        ruleSample('rules initial');
        B.attackTime.reductionCapPercent = 7;
        B.blood.furyExecution.threshold.basePercent = 17;
        ruleSample('rule constants edited');
        equal(scope(() => S.calculateStatSources(inputsA, 'bloodFuryTargetThreshold', { effective: true }).value), globalThis.umbraProgression.bloodFuryExecutionDetails(1, 30).threshold.percent,
          'fixed configuration value immediately visible');
        B.generatedUmbraStats.sources.vigueur = { ...source, ratios: { ...source.ratios, source: source.ratios.source + 1 } };
        ruleSample('rule source replaced');
        delete B.generatedUmbraStats.sources.vigueur;
        ruleSample('rule source removed');
        B.generatedUmbraStats.sources.vigueur = source;
        ruleSample('rule source restored');
        try { scope(() => { all(inputsA); throw Error('rule snapshot expected'); }); }
        catch (error) { if (error.message !== 'rule snapshot expected') throw error; }
        B.blood.furyExecution.threshold.basePercent = 23;
        equal(scope(() => S.calculateStatSources(inputsA, 'bloodFuryTargetThreshold', { effective: true }).value), globalThis.umbraProgression.bloodFuryExecutionDetails(1, 30).threshold.percent,
          'rule snapshot released after exception');
        ruleSample('rules after exception');
      } finally {
        B.attackTime.reductionCapPercent = cap;
        B.blood.furyExecution.threshold.basePercent = threshold;
        B.generatedUmbraStats.sources.vigueur = source;
      }
      ruleSample('rules restored');

      // Count source reads rather than assert a machine-dependent elapsed time.
      const baseStats = entity.baseStats;
      let reads = 0;
      Object.defineProperty(entity, 'baseStats', { configurable: true, get() { reads++; return baseStats; } });
      const cost = {};
      for (const [name, fn] of [['timings', () => A.buildAttackTimingsWithHaste(entity, attacks[1])],
        ['displayedTimings', () => D.getEffectiveAttackTimings(attacks[1], entity)],
        ['umbraAccess', () => D.getAttackUmbraAccess(entity, attacks[1])]]) {
        reads = 0; fn(); cost[name] = reads;
      }
      Object.defineProperty(entity, 'baseStats', { configurable: true, writable: true, value: baseStats });
      // Count a configuration constant read once by each construction of rules.
      const config = B.movement.charges;
      const descriptor = Object.getOwnPropertyDescriptor(config, 'marathonBasePercent');
      let builds = 0;
      try {
        Object.defineProperty(config, 'marathonBasePercent', { configurable: true, enumerable: descriptor.enumerable,
          get() { builds++; return descriptor.value; } });
        scope(() => {
          S.calculateStatSources(inputsA, 'attackCooldownReduc', { effective: true });
          scope(() => S.calculateStatSources(inputsB, 'attackPreparationReduc', { effective: true }));
          S.calculateStatSources(inputsA, 'physicalDamage', { effective: true });
        });
        cost.ruleBuilds = builds;
        builds = 0;
        all(inputsA); all(inputsB);
        equal(builds, 2, 'unscoped calculations must not retain rules');
      } finally { Object.defineProperty(config, 'marathonBasePercent', descriptor); }
      return { states, cost };
    });
    assert.deepEqual(errors, []);
    results[previous ? 'before' : 'after'] = result;
    await page.close();
  }
  if (baseline) {
    assert.deepEqual(results.after.states, results.before.states, 'Live edits and combat calculations must match the reference');
    for (const name of Object.keys(results.after.cost)) assert.ok(results.after.cost[name] <= results.before.cost[name], `${name}: source reads must not increase`);
    assert.ok(Object.keys(results.after.cost).some(name => results.after.cost[name] < results.before.cost[name]), 'Redundant reads or rule constructions reduced');
  }
  assert.equal(results.after.cost.ruleBuilds, 1, 'Nested read snapshots share one construction of rules');
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Combat stat reads passed:', JSON.stringify({ states: results.after.states.length, before: results.before?.cost, after: results.after.cost }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
