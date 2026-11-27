import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/simultaneous-combat');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });

const errors = [];
async function fixture(config = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async config => {
    const U = await import("/js/ui/application.js");
    const E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid';
    grid.style.cssText = 'position:absolute;top:100px;left:180px;width:850px;height:500px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    for (const [i, side] of ['A', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1);
      hex.style.cssText = `position:absolute;left:${i * 400}px;top:50px;width:180px;height:200px`; grid.append(hex);
      const own = config[side] || {};
      const magic = own.magic || false;
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999820 + i, name: `Simultané ${side}`, side,
        type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10, strength: 0, intelligence: 0, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: 100, extraLife: own.extraLife || 0 },
        attacks: [{ functionName: 'simultaneous-test', attackId: 'simultaneous-test', displayName: 'Impact simultané',
          combatFunction: 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [own.range || 'melee'], attackTarget: ['enemy'], deadTarget: ['no'], type: [], effets: [], selfEffects: [],
          preparationTime: own.preparation ?? 100, executionTime: own.execution ?? 400, recoveryTime: 100, cooldown: 1000,
          physicalRatio: magic ? 0 : 1, magicalRatio: magic ? 1 : 0, piercingRatio: 0 }] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    window.E = E; window.G = await import("/js/app/state.js"); window.F = await import("/js/combat/loop.js");
    G.configureBattleActionManager({ createStartButton: container=>container, createFleeButton: container=>container, createQuitButton: container=>container });
    window.Timeline = await import("/js/combat/timeline.js"); window.Attacks = await import("/js/combat/attacks.js");
    window.Sim = await import("/js/debug/simulation.js"); window.snapshot = Sim.captureSimulationBoard();
    window.entries = [];
    window.addEventListener('combatLogEntry', event => {
      const { type, data } = event.detail;
      entries.push({ type, at: Timeline.combatNow(), side: data.attacker?.side || data.entity?.side, damage: data.damage });
    });
  }, config);
  return page;
}
const hits = trial => trial.journal.filter(e => e.type === 'damage_resolution');
const reports = [];
try {
  const page = await fixture();
  const cases = [
    { name: 'melee equal', draw: true },
    { name: 'equal, reversed entity array', reverse: true, draw: true },
    { name: 'B arrives 1 ms earlier', A: { execution: 401 }, winner: 'B' },
    { name: 'A arrives 1 ms earlier', B: { execution: 401 }, winner: 'A' },
    { name: 'B prepares 1 ms earlier', A: { preparation: 101 }, winner: 'B' },
    { name: 'equal physical projectiles', range: 'range', draw: true },
    { name: 'equal magical projectiles', range: 'range', magic: true, draw: true },
    { name: 'melee and projectile equal', B: { range: 'range', execution: 320 }, draw: true },
    { name: 'ranged B arrives 1 ms earlier', range: 'range', A: { execution: 401 }, winner: 'B' },
    { name: 'extra life A prevents double KO', A: { extraLife: 1 }, winner: 'A', pair: true },
    { name: 'extra life B prevents double KO', B: { extraLife: 1 }, winner: 'B', pair: true },
    { name: 'both extra lives, then double KO', A: { extraLife: 1 }, B: { extraLife: 1 }, draw: true, lives: true },
  ];
  for (const config of cases) {
    const result = await page.evaluate(async config => {
      const s = structuredClone(snapshot);
      for (const e of s.entities) {
        const own = config[e.side] || {}; const a = e.attackDetails[0];
        a.executionTime = own.execution ?? 400; a.preparationTime = own.preparation ?? 100;
        a.attackRange = [own.range || config.range || 'melee'];
        if (config.magic) { a.attacknature = ['magicalDamage']; a.physicalRatio=0; a.magicalRatio=1; }
        e.baseStats.extraLife = own.extraLife || 0;
        s.reserves[e.id].extraLife = { current: own.extraLife || 0, max: own.extraLife || 0 };
      }
      if (config.reverse) s.entities.reverse();
      return Sim.simulateTrial(s, { seed: 193, durationMs: 6000, trace: true });
    }, config);
    await writeFile(resolve(output, config.name.replace(/[^a-z0-9]/gi,'-')+'.json'), JSON.stringify(result,null,2));
    if (config.draw) {
      assert.equal(result.end, 'draw', config.name); assert.equal(result.winner, null, config.name);
      assert.equal(result.entities.filter(e=>e.dead).length, 2, config.name);
      assert.ok(result.journal.some(e=>e.type==='battle_draw'), config.name);
      assert.ok(!result.journal.some(e=>/battle_(victory|defeat)/.test(e.type)), config.name);
      const damage = hits(result);
      assert.equal(damage.length, config.lives ? 4 : 2, config.name);
      for(let i=0;i<damage.length;i+=2) assert.equal(damage[i].timeMs, damage[i+1].timeMs, config.name);
    } else {
      assert.equal(result.winner, config.winner, config.name);
      assert.equal(result.end, 'victory', config.name);
      assert.equal(hits(result).length, config.pair ? 2 : 1, config.name);
      if(!config.pair) assert.equal(hits(result)[0].attacker.side, config.winner, config.name);
    }
    reports.push({ test: config.name, result: result.end, winner: result.winner, impacts: hits(result).length });
    console.log('PASS simulation:', config.name);
  }
  const exportCheck = await page.evaluate(async () => {
    const report = await Sim.runCombatSimulation(snapshot,{ count: 3, durationSeconds: 3, seed: 21 });
    return { report, html: Sim.simulationReportHtml(report,{ standalone: true }) };
  });
  assert.equal(exportCheck.report.summary.draws,3);
  assert.equal(exportCheck.report.summary.winsA,0); assert.equal(exportCheck.report.summary.winsB,0);
  assert.equal(exportCheck.report.summary.timeouts,0);
  assert.ok(exportCheck.report.summary.armies.every(a=>a.draws===3 && a.unresolved===0));
  assert.match(exportCheck.html,/Doubles KO/); assert.match(exportCheck.html,/Double KO — Match nul/);
  await writeFile(resolve(output,'rapport-double-ko.html'), exportCheck.html);
  await page.close();
  // Run the actual game clock, without the simulator or virtual timers.
  for (const config of [
    { name:'live melee', draw:true },
    { name:'live range', A:{range:'range'}, B:{range:'range'}, draw:true },
    { name:'live mixed transports', B:{range:'range',execution:320}, draw:true },
    { name:'live faster B', A:{execution:401}, winner:'B' },
    { name:'live faster A', B:{execution:401}, winner:'A' },
    { name:'live both extra lives', A:{extraLife:1}, B:{extraLife:1}, draw:true },
  ]) {
    const live = await fixture(config);
    await live.evaluate(() => { F.initFightEntites(); G.startGame(); });
    try { await live.waitForFunction(() => G.isBattleFinished(), null, { timeout: 12000 }); }
    catch(error) { console.log('FAILED LIVE', config.name, await live.evaluate(()=>({ logs:entries, gameStarted:G.gameStarted, entities:E.entites.map(e=>({side:e.side,hp:e.stats.HP,phase:e.currentPhase,isDEAD:e.isDEAD,stopped:e.battleStopped,attack:e.currentAttack,projectiles:e.projectiles})) }))); throw error; }
    const result = await live.evaluate(async () => {
      await Timeline.settleCombatTimeline();
      return { outcome:G.battleOutcome, hits:entries.filter(e=>e.type==='damage_resolution'),
        hp:E.entites.map(e=>e.stats.HP.current), logs:entries.map(e=>e.type),
        message:document.querySelector('.GameOverMessage')?.textContent || '', storage:localStorage.getItem('GameStages') };
    });
    assert.equal(result.outcome, config.draw ? 'draw' : config.winner==='A' ? 'victory' : 'defeat', config.name);
    if (config.draw) {
      assert.deepEqual(result.hp,[0,0],config.name);
      for(let i=0;i<result.hits.length;i+=2) assert.equal(result.hits[i].at,result.hits[i+1].at,config.name);
      assert.ok(result.logs.includes('battle_draw'),config.name);
      assert.ok(!result.logs.includes('battle_victory'),config.name);
    } else { assert.equal(result.hits.length,1,config.name); assert.equal(result.hits[0].side,config.winner,config.name); }
    reports.push({ test:config.name,...result }); console.log('PASS game:',config.name);
    if(config.name==='live melee') await live.screenshot({path:resolve(output,'double-ko.png')});
    await live.close();
  }
  // Even if both timers are late, distinct planned deadlines stay distinct.
  const stalled = await fixture();
  const delayed = await stalled.evaluate(async () => {
    const at = Timeline.combatNow() + 50;
    const [a,b] = E.entites;
    const fb = Attacks.createAttackFlight(b,a,b.attackDetails[0],{physical:100});
    const fa = Attacks.createAttackFlight(a,b,a.attackDetails[0],{physical:100});
    const pb=Attacks.resolveAttackImpact(fb,{at});
    const pa=Attacks.resolveAttackImpact(fa,{at:at+1});
    const until = performance.now()+90; while(performance.now()<until) {}
    await Promise.all([pa,pb]); await Timeline.settleCombatTimeline();
    return { outcome:G.battleOutcome, hits:entries.filter(e=>e.type==='damage_resolution') };
  });
  assert.equal(delayed.outcome,'defeat');assert.equal(delayed.hits.length,1);assert.equal(delayed.hits[0].side,'B');
  console.log('PASS game: delayed callbacks preserve the earlier deadline');
  await stalled.close();

  for (const reverse of [false,true]) {
    const healed = await fixture();
    const result = await healed.evaluate(async reverse => {
      const [a,b] = E.entites; const at=Timeline.combatNow()+50;
      const healing={...b.attackDetails[0],combatFunction:'Support',attackTarget:['ally']};
      const damage=Attacks.createAttackFlight(a,b,a.attackDetails[0],{physical:100});
      const heal=Attacks.createAttackFlight(b,b,healing,{physical:10});
      const flights=reverse?[heal,damage]:[damage,heal];
      await Promise.all(flights.map(f=>Attacks.resolveAttackImpact(f,{at})));
      await Timeline.settleCombatTimeline();
      return {hp:b.stats.HP.current,dead:b.isDEAD,heal:b.totalHeal,outcome:G.battleOutcome};
    },reverse);
    assert.equal(result.hp,10);assert.equal(result.dead,false);assert.equal(result.heal,10);assert.equal(result.outcome,null);
    console.log('PASS game: simultaneous healing, reverse='+reverse);await healed.close();
  }
  const leech = await fixture();
  const healedBoth = await leech.evaluate(async()=>{
    const [a,b]=E.entites; const at=Timeline.combatNow()+50;
    for(const e of [a,b]) { e.stats.HP.current=100;e.stats.HP.max=100;e.stats.bloodThirsty=100; }
    await Promise.all([[a,b],[b,a]].map(([source,target])=>Attacks.resolveAttackImpact(
      Attacks.createAttackFlight(source,target,source.attackDetails[0],{physical:10}),{at})));
    await Timeline.settleCombatTimeline();
    return E.entites.map(e=>({hp:e.stats.HP.current,healing:e.totalHeal}));
  });
  assert.deepEqual(healedBoth[0],healedBoth[1]);assert.ok(healedBoth[0].healing>0);
  console.log('PASS game: simultaneous lifesteal treats both camps equally');await leech.close();

  const survivingCaster = await fixture({B:{extraLife:1}});
  const flightSurvival = await survivingCaster.evaluate(async()=>{
    const [a,b]=E.entites;const at=Timeline.combatNow()+50;
    const magic={...b.attackDetails[0],attackRange:['range'],attacknature:['magicalDamage'],physicalRatio:0,magicalRatio:1};
    const flight=Attacks.createAttackFlight(b,a,magic,{magical:100});
    let lostDuringPendingDeath=null;
    const sampleDuringBatch=event=>{
      if(event.detail.type==='damage_resolution' && event.detail.data.attacker.side==='A') {
        flight.sample();lostDuringPendingDeath=flight.casterLost;
      }
    };
    window.addEventListener('combatLogEntry',sampleDuringBatch);
    await Promise.all([
      Attacks.resolveAttackImpact(Attacks.createAttackFlight(a,b,a.attackDetails[0],{physical:100}),{at}),
      Attacks.resolveAttackImpact(flight,{at:at+50}),
    ]);
    await Timeline.settleCombatTimeline();window.removeEventListener('combatLogEntry',sampleDuringBatch);
    return {lostDuringPendingDeath,casterLost:flight.casterLost,outcome:G.battleOutcome,hp:b.stats.HP.current};
  });
  assert.equal(flightSurvival.lostDuringPendingDeath,false);assert.equal(flightSurvival.casterLost,false);
  assert.equal(flightSurvival.outcome,'defeat');assert.ok(flightSurvival.hp>0);
  console.log('PASS game: an additional life preserves in-flight magic through provisional zero HP');
  await survivingCaster.close();
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'checks.json'),JSON.stringify(reports,null,2));
  console.log(`PASS: ${reports.length+6} simultaneous combat scenarios, double KO reports and strict chronological priority.`);
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
