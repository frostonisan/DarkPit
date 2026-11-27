import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/charm-targeting');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], reports = [];
async function fixture(side, withOthers = true, expiry = false, group = false) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async ({ side, withOthers, expiry, group }) => {
    const UI = await import("/js/ui/application.js");
    const E = await import("/js/entities/runtime.js"), Create = await import("/js/rendering/entities.js");
    const Storage = await import("/js/storage/gameStorage.js");
    const G = await import("/js/app/state.js"), F = await import("/js/combat/loop.js");
    const A = await Promise.all([import("/js/combat/vitals.js"), import("/js/rendering/vitalFeedback.js"), import("/js/rendering/hud.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), Fx = await Promise.all([import("/js/combat/effects.js"), import("/js/rendering/auras.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const Control = await import("/js/combat/control.js"), Attacks = await import("/js/combat/attacks.js");
    const D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), Sim = await import("/js/debug/simulation.js");
    const { balanceData } = await import('/js/data/balanceData.js');
    balanceData.brokenSpell.chance.basePercent = 0;
    UI.createGameContainer(); UI.GameUi(); Storage.setAdminMode(true); window.levelRunning = 'admin';
    G.configureBattleActionManager({ createStartButton: x => x, createFleeButton: x => x, createQuitButton: x => x });
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;top:100px;left:50px;width:1100px;height:300px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    const opposite = side === 'A' ? 'B' : 'A';
    const sides = group ? [side, opposite, opposite] : withOthers ? [side, opposite, opposite, side] : [side, opposite];
    for (const [i, camp] of sides.entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${camp} occupied`;
      Object.assign(hex.dataset, { position: String(i + 1), row: '1', col: String(i * 3) });
      hex.style.cssText = `position:absolute;left:${i * 250}px;top:40px;width:180px;height:200px`; grid.append(hex);
      const attack = { functionName: `charm-test-${i}`, attackId: `charm-test-${i}`, displayName: `Attaque ${i}`,
        combatFunction: 'Attaquant', attacknature: ['magicalDamage'], attackRange: ['range'], attackTarget: ['enemy'], deadTarget: ['no'],
        effets: i === 0 ? ['charme'] : [], selfEffects: [], effectOverrides: { charme: { effectDuration: expiry ? 2 : 60 } },
        preparationTime: i === 0 || expiry ? 100 : 10000, executionTime: 100, recoveryTime: 100, cooldown: expiry && i === 0 ? 60000 : 0,
        magicalRatio: 1, physicalRatio: 0, piercingRatio: 0 };
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999970 + i, name: ['Charmeur', 'Charmé', 'Ennemi libre', 'Allié'][i],
        side: camp, type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: i === 1 || group && i === 2 ? 250 : 1000, armor: 0, strength: 0, intelligence: 0, agility: 0,
          magicalDamage: 50, physicalDamage: 0, magicalResistance: 0, alterationResistance: 0, resilienceTotal: 0,
          speed: i === 0 ? 1000 : 3000 }, attacks: [attack] });
      entity.isDEAD = false; entity.statut = ['alive']; E.entites.push(entity);
      const created = Create.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    const boardController = await import('/js/board/controller.js');
    boardController.invalidateFootprintGeometry(grid); boardController.rebuildBoardOccupancy(grid);
    window.test = { E, G, F, A, Fx, Control, Attacks, D, Sim };
  }, { side, withOthers, expiry, group });
  return page;
}
try {
  for (const side of ['A', 'B']) {
    const page = await fixture(side);
    const checks = await page.evaluate(async () => {
      const { E, G, F, A, Fx, Control, Attacks, D } = test;
      const [caster, victim, free, ally] = E.entites;
      const original = victim.side, checks = [];
      const ok = (value, label) => { if (!value) throw Error(label); checks.push(label); };
      const attack = caster.attackDetails[0], hit = { ...attack, effets: [], attackRange: ['melee'] }, support = { ...hit, attackTarget: ['ally'], combatFunction: 'Support' };
      const nativeRandom = Math.random; Math.random = () => .999999;
      try {
        A.applyEffect(victim, 'charme', caster, attack);
        ok(victim.side === caster.side, 'Charme changes the actual side');
        ok(F.collectAttackTargetCandidates(caster, hit).includes(victim), 'Converted opponent remains a valid offensive target');
        ok(!Attacks.acceptsSelectedTarget(caster, hit, ally), 'A native ally is not an offensive target');
        ok(Attacks.acceptsSelectedTarget(caster, support, victim), 'Support still accepts the temporary ally');
        ok(!Attacks.acceptsSelectedTarget(victim, hit, caster), 'Charmed opponent cannot retaliate against the charmer');
        ok(!Attacks.acceptsSelectedTarget(victim, hit, victim), 'Charmed opponent cannot use the fallback to attack itself');
        ok(Attacks.acceptsSelectedTarget(victim, hit, free), 'Charmed opponent can attack its former camp');
        ok(D.isHindranceEffect({ forcedMovement: true }, caster, victim), 'Hostile forced movement against a charmed opponent still checks resistance');
        ok(!D.isHindranceEffect({ forcedMovement: true }, caster, ally), 'Native allied movement retains its existing rules');
        A.applyEffect(free, 'charme', caster, attack);
        ok(!Attacks.acceptsSelectedTarget(victim, hit, free) && !Attacks.acceptsSelectedTarget(free, hit, victim), 'Two converted opponents cannot attack one another within their temporary camp');
        ok(!F.collectAttackTargetCandidates(victim, hit).length && !F.collectAttackTargetCandidates(free, hit).length, 'All-charmed opponents have no offensive target among their new allies');
        ok(await F.selectTargetForAttack(victim, hit) === null && await F.selectTargetForAttack(free, hit) === null, 'Neither charmed opponent falls back to attacking the other');
        ok(Attacks.acceptsSelectedTarget(victim, support, free) && Attacks.acceptsSelectedTarget(free, support, victim), 'Charmed allies can still support one another');
        ok([victim, free].includes(await F.selectTargetForAttack(caster, hit)), 'Native camp can finish converted opponents when no uncharmed opponent survives');
        ok(!G.resolveBattleOutcome(E.entites) && !G.battleOutcome, 'Several surviving charmed opponents still prevent victory');
        const beforeAllyAttack = free.stats.HP.current;
        await Attacks.executeAttack(victim, free, hit);
        ok(free.stats.HP.current === beforeAllyAttack && !victim._combatAction, 'A forbidden attack between charmed allies cannot begin preparation or deal damage');
        A.applyEffect(victim, 'folie', caster, { effets: ['folie'], effectOverrides: { folie: { effectDuration: 60 } } });
        ok(Attacks.acceptsSelectedTarget(victim, hit, free), 'Folie retains its explicit exception to normal camp targeting');
        Fx.clearControlEffects(victim); A.applyEffect(victim, 'charme', caster, attack);
        Fx.clearControlEffects(free);
        ok(Attacks.acceptsSelectedTarget(victim, hit, free), 'A converted entity can attack an opponent whose Charme has expired');
        ok(await F.selectTargetForAttack(caster, hit) === free, 'The newly uncharmed opponent immediately takes priority over converted survivors');
        victim.stats.HP.current = 1; victim.totalAggroDamage = 100000;
        for (const roll of [0, .5, .999999]) {
          Math.random = () => roll;
          ok(await F.selectTargetForAttack(caster, hit) === free, `Uncharmed enemy has priority regardless of RNG (${roll})`);
        }
        caster.type = 'lord';
        ok(await F.selectTargetForAttack(caster, hit) === free, 'Lord aggro cannot override the charm fallback priority');
        caster.type = 'sbire'; victim.stats.HP.current = 250;
        Math.random = () => .999999;
        free.isDEAD = true; free.stats.HP.current = 0;
        ok(!G.resolveBattleOutcome(E.entites) && !G.battleOutcome, 'Last enemy being charmed does not resolve the battle');
        ok(Control.getControlState(victim, 'charme') && victim.side === caster.side, 'Nonterminal verdict does not purge Charme');
        ok(await F.selectTargetForAttack(caster, hit) === victim, 'Last charmed enemy is selected instead of waiting');
        const decision = await F.selectAttackDecision(caster);
        ok(decision.status === 'ready' && decision.target === victim, 'The real attack decision remains ready when only a charmed enemy survives');
        const before = victim.stats.HP.current;
        Math.random = () => .5;
        await Attacks.executeAttack(caster, victim, hit);
        ok(victim.stats.HP.current < before && victim.stats.HP.current > 0, `A complete attack actually damages the charmed survivor (${before} → ${victim.stats.HP.current})`);
        ok(Control.getControlState(victim, 'charme'), 'Taking an attack does not purge Charme');
        Fx.clearControlEffects(victim);
        ok(victim.side === original && !Control.isCharmedEnemyTarget(caster, victim), 'Expired or cleared Charme restores normal enemy status');
        ok(Attacks.acceptsSelectedTarget(victim, hit, caster), 'Former charmed opponent can retaliate again after expiry');
        A.applyEffect(victim, 'charme', caster, attack);
        victim.isDEAD = true; victim.stats.HP.current = 0;
        let atVerdict;
        window.addEventListener('battleResolved', () => { atVerdict = { side: victim.side, effects: Fx.getActiveEffectStates().length }; }, { once: true });
        ok(G.resolveBattleOutcome(E.entites), 'Death of the last original enemy permits resolution');
        ok(G.battleOutcome === (caster.side === 'A' ? 'victory' : 'defeat'), 'Verdict uses original armies symmetrically');
        ok(atVerdict?.side === original && atVerdict.effects === 0, 'Temporary effects and sides are restored before the verdict event');
      } finally { Math.random = nativeRandom; Fx.clearCombatEffects(); }
      return checks;
    });
    reports.push({ side, mode: 'game', checks }); await page.close();

    const simulation = await fixture(side, false);
    for (const durationMs of [2000, 18000]) {
      const trial = await simulation.evaluate(durationMs => {
        const snapshot = test.Sim.captureSimulationBoard();
        return test.Sim.simulateTrial(snapshot, { seed: 193, durationMs, trace: true });
      }, durationMs);
      await writeFile(resolve(output, `simulation-${side}-${durationMs}.json`), JSON.stringify(trial, null, 2));
      const hits = trial.journal.filter(entry => entry.type === 'damage_resolution');
      const friendlyHits = hits.filter(entry => entry.attacker?.id === 999970 && entry.target?.id === 999971 && entry.target.side === side);
      if (durationMs === 2000) {
        assert.equal(trial.winner, null, 'Charme alone cannot win in the simulator');
        assert.equal(trial.end, 'timeout', 'Simulation continues while the original opponent survives');
        assert.ok(trial.entities.every(entity => entity.hpEnd > 0), 'Both original armies still have a survivor');
      } else {
        assert.equal(trial.winner, side, 'Only killing the original opponent awards victory');
        assert.ok(friendlyHits.length >= 2, 'Multiple attacks hit the temporary ally while Charme remains active');
        assert.ok(!hits.some(entry => entry.attacker?.id === 999971 && entry.target?.id === 999970), 'Charmed opponent does not retaliate against its new camp');
        const death = trial.journal.find(entry => entry.type === 'entity_death' && entry.entity?.id === 999971);
        assert.ok(death && death.timeMs === trial.durationMs, 'Simulation ends at the actual death, not the charm application');
      }
      reports.push({ side, mode: 'simulation', durationMs, end: trial.end, winner: trial.winner, friendlyHits: friendlyHits.length });
    }
    await simulation.close();
    const expiry = await fixture(side, false, true);
    const resumed = await expiry.evaluate(() => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), { seed: 193, durationMs: 10000, trace: true }));
    await writeFile(resolve(output, `simulation-expiry-${side}.json`), JSON.stringify(resumed, null, 2));
    const firstImpact = resumed.journal.find(entry => entry.type === 'damage_resolution' && entry.attacker?.id === 999970);
    const replies = resumed.journal.filter(entry => entry.type === 'damage_resolution' && entry.attacker?.id === 999971);
    assert.ok(firstImpact && firstImpact.target.side === side, 'Short Charme takes effect in the simulator');
    assert.ok(replies.length > 0 && replies.every(entry => entry.timeMs >= firstImpact.timeMs + 2000), 'Former charmed enemy resumes attacks after natural expiry');
    assert.ok(replies.every(entry => entry.attacker.side !== side && entry.target.id === 999970), 'Expired Charme restores the opponent camp and normal targeting');
    reports.push({ side, mode: 'expiry', firstReply: replies[0].timeMs }); await expiry.close();

    const group = await fixture(side, false, false, true);
    for (const durationMs of [3000, 24000]) {
      const trial = await group.evaluate(durationMs => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), { seed: 193, durationMs, trace: true }), durationMs);
      await writeFile(resolve(output, `simulation-group-${side}-${durationMs}.json`), JSON.stringify(trial, null, 2));
      const hits = trial.journal.filter(entry => entry.type === 'damage_resolution');
      const conversions = hits.filter(entry => entry.attacker?.id === 999970 && entry.target?.side === side);
      assert.equal(new Set(conversions.map(entry => entry.target.id)).size, 2, 'Both opponents become charmed in the same battle');
      assert.ok(!hits.some(entry => [999971, 999972].includes(entry.attacker?.id)), 'Converted opponents never attack one another or their new camp');
      if (durationMs === 3000) {
        assert.equal(trial.winner, null, 'Converting the entire opposing camp does not award victory');
        assert.ok(trial.entities.every(entity => entity.hpEnd > 0), 'Both charmed opponents remain alive together');
      } else {
        assert.equal(trial.winner, side, 'Native camp continues attacking until both original opponents die');
        const deaths = trial.journal.filter(entry => entry.type === 'entity_death');
        assert.equal(deaths.length, 2, 'Both converted opponents must die before victory');
        assert.equal(deaths.at(-1).timeMs, trial.durationMs, 'Verdict waits for the last original opponent');
      }
      reports.push({ side, mode: 'group', durationMs, winner: trial.winner });
    }
    await group.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
  console.log(`Charme: ${reports.filter(row => row.mode === 'game').reduce((sum, row) => sum + row.checks.length, 0)} game checks and ${reports.filter(row => row.mode !== 'game').length} simulator scenarios passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
