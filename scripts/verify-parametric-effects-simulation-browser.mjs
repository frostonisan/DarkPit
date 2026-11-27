import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/parametric-effects/simulator');
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
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;top:100px;left:180px;width:850px;height:500px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    for (const [i, side] of ['A', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1); hex.dataset.row='1'; hex.dataset.col=String(i*5);
      hex.style.cssText = `position:absolute;left:${i * 400}px;top:50px;width:180px;height:200px`; grid.append(hex);
      const own = config[side] || {};
      const magic = own.magic || false;
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999820 + i, name: `Simultané ${side}`, side,
        type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 1000, strength: 0, intelligence: 0, agility: 0, physicalDamage: 1, magicalDamage: 1,
          speed: own.speed ?? 1000, extraLife: own.extraLife || 0, ...(own.stats || {}) },
        attacks: [{ functionName: 'simultaneous-test', attackId: 'simultaneous-test', displayName: 'Impact simultané',
          combatFunction: 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [own.range || 'melee'], attackTarget: ['enemy'], deadTarget: ['no'], type: [], effets: own.effects || [], selfEffects: [], effectOverrides: own.effectOverrides || {},
          preparationTime: own.preparation ?? 100, executionTime: own.execution ?? 400, recoveryTime: 100, cooldown: own.cooldown ?? 60000,
          physicalRatio: magic ? 0 : 1, magicalRatio: magic ? 1 : 0, piercingRatio: 0 }] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    for(let n=0;n<3;n++) {
      const cell=document.createElement('div');cell.className='hex Neutral';cell.dataset.position='free-'+n;cell.dataset.row='0';cell.dataset.col=String(n+4);
      cell.style.cssText=`position:absolute;left:${n*50+300}px;top:0;width:45px;height:45px`;grid.append(cell);
    }
    window.E = E; window.G = await import("/js/app/state.js"); window.F = await import("/js/combat/loop.js");
    G.configureBattleActionManager({ createStartButton: container=>container, createFleeButton: container=>container, createQuitButton: container=>container });
    window.Timeline = await import("/js/combat/timeline.js"); window.Attacks = await import("/js/combat/attacks.js");
    window.Sim = await import("/js/debug/simulation.js"); window.snapshot = Sim.captureSimulationBoard(); snapshot.balance.brokenSpell.chance.basePercent = 0;
    window.entries = [];
    window.addEventListener('combatLogEntry', event => {
      const { type, data } = event.detail;
      entries.push({ type, at: Timeline.combatNow(), side: data.attacker?.side || data.entity?.side, damage: data.damage });
    });
  }, config);
  return page;
}
const hits = trial => trial.journal.filter(e => e.type === 'damage_resolution');
const reports=[];
try {
  for(const [effect,expected,patch,b] of [
    ['bafouillage',7600,{effectSlowPercent:50},{}],
    ['interruption',6400,{}, {cooldown:60000}],
    ['sommeil',9100,{},{}],
    ['lenteur',6700,{effectSlowPercent:50},{speed:5000,preparation:100}],
  ]) {
    const page=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,effects:[effect],effectOverrides:{[effect]:{effectDuration:3,...patch}}},
      B:{magic:true,range:'range',preparation:5000,execution:100,cooldown:1000,...b}});
    const trial=await page.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:11000,trace:true}));
    await writeFile(resolve(output,effect+'.json'),JSON.stringify(trial,null,2));
    const hitA=hits(trial).find(e=>e.attacker.side==='A'),hitB=hits(trial).find(e=>e.attacker.side==='B');
    assert.ok(hitA&&hitB,effect+': both eventually hit');
    assert.equal(hitA.timeMs,1300,effect+': application time');
    assert.equal(hitB.timeMs,expected,effect+': exact altered timing');
    reports.push({effect,impact:hitB.timeMs});await page.close();
  }
  for(const [label,effects,overrides,stats,expected] of [
    ['sleep ratio',['sommeil'],{sommeil:{effectDuration:{flat:1,ratios:[{stat:'intelligence',coefficient:.2}]}}},{},9100],
    ['sleep duration resistance',['sommeil'],{sommeil:{effectDuration:3}},{alterationResistance:50},7600],
    ['sleep hindrance resistance',['sommeil'],{sommeil:{effectDuration:3}},{hindranceResistance:100},6100],
    ['sleep total resilience',['sommeil'],{sommeil:{effectDuration:3}},{resilienceTotal:100},6100],
    ['Stun effect',['stun'],{stun:{effectDuration:3}},{},9100],
  ]) {
    const page=await fixture({A:{stats:{intelligence:10},magic:true,range:'range',preparation:200,execution:100,effects,effectOverrides:overrides},
      B:{stats,magic:true,range:'range',preparation:5000,execution:100,cooldown:1000}});
    const trial=await page.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:11000,trace:true}));
    const hit=hits(trial).find(e=>e.attacker.side==='B');assert.equal(hit?.timeMs,expected,label);
    reports.push({effect:label,impact:hit.timeMs});await page.close();
  }
  for(const effect of ['folie','insolence','confusion','charme','effroi']) {
    const page=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,effects:[effect],effectOverrides:{[effect]:{effectDuration:5}}},
      B:{stats:{velocity:100},magic:true,range:'range',preparation:500,execution:100,cooldown:0}});
    const trial=await page.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:11000,trace:true}));
    await writeFile(resolve(output,effect+'.json'),JSON.stringify(trial,null,2));
    assert.ok(trial.durationMs>0,effect+': simulation completes');
    if(effect==='effroi') assert.equal(trial.end,'victory','Fear can end combat through enemy flight');
    reports.push({effect,end:trial.end});await page.close();
  }
  const fearA=await fixture({B:{magic:true,range:'range',preparation:200,execution:100,effects:['effroi'],effectOverrides:{effroi:{effectDuration:5}}},
    A:{stats:{velocity:100},magic:true,range:'range',preparation:5000,execution:100,cooldown:1000}});
  const escape=await fearA.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:11000,trace:true}));
  assert.equal(escape.end,'escape','Fear also ends the battle when the last player entity flees');
  reports.push({effect:'effroi on A',end:escape.end});await fearA.close();
  const charging=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,effects:['silence'],effectOverrides:{silence:{effectDuration:3}}},
    B:{magic:true,range:'range',speed:5000,preparation:100,execution:100,cooldown:1000}});
  const chargeTrial=await charging.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:7000,trace:true}));
  assert.equal(hits(chargeTrial).find(e=>e.attacker.side==='B').timeMs,5200,'Simulator: Silence during turn charge does not delay the turn');
  reports.push({effect:'silence during turn',impact:5200});await charging.close();
  const priority=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,effects:['silence'],effectOverrides:{silence:{effectDuration:3}}},
    B:{magic:true,range:'range',preparation:5000,execution:100,cooldown:60000}});
  const priorityTrial=await priority.evaluate(async()=>{
    const R = await import("/js/combat/attackResolution.js"),catalog=(await import('/js/data/attackList.js')).attackDetails;
    const b=E.entites.find(e=>e.side==='B'),original=b.attackDetails[0];
    const alternate=(id,preparation,cooldown)=>({attackId:id,functionName:id,displayName:id,combatFunction:'Attaquant',attacknature:['magicalDamage'],attackRange:['range'],attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],preparationTime:preparation,executionTime:100,recoveryTime:100,cooldown,magicalRatio:1,physicalRatio:0});
    R.setEntityAttackDefinitions(b,[original,alternate('priority-alternative',600,2000),alternate('low-priority',100,1000)],catalog);
    const s=Sim.captureSimulationBoard();s.balance.brokenSpell.chance.basePercent=0;
    return Sim.simulateTrial(s,{seed:193,durationMs:7000,trace:true});
  });
  await writeFile(resolve(output,'silence-priority.json'),JSON.stringify(priorityTrial,null,2));
  const first=hits(priorityTrial).find(e=>e.attacker.side==='B');
  assert.equal(first.timeMs,5000,'Simulator: available alternative starts a full 600 ms preparation after Silence');
  assert.equal(first.attack.functionName,'priority-alternative','Simulator: priority selects between multiple available alternatives');
  assert.ok(!priorityTrial.journal.some(e=>e.type==='phase'&&e.phase==='target-search'),'Simulator: no forced search after interrupted cast');
  reports.push({effect:'silence selects priority alternative',impact:first.timeMs});await priority.close();
  assert.deepEqual(errors,[]);
  console.log('Parametric effects simulation:',JSON.stringify(reports));
  await writeFile(resolve(output,'summary.json'),JSON.stringify(reports,null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
