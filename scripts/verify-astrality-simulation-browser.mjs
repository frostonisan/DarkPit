import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/astralite-common-cooldown/tests');
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
  page.testLog=[];page.on('console',message=>page.testLog.push(message.text()));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async config => {
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js");
    const U = await import("/js/ui/application.js");
    const E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const store = await import("/js/storage/sessionStorage.js");
    store.beginAdminSession(); window.currentStageId = 'pause-test';
    store.gameStorage.setItem('GameStages', JSON.stringify({stages:[{id:'pause-test',level_type:'admin'}]}));
    store.gameStorage.setItem('currentLevel','pause-test');
    window.baseStorage = JSON.stringify(Object.entries(window.localStorage).sort());
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
        baseStats: { HP: 1000, strength: 0, intelligence: 0, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: config.speed ?? 60000, extraLife: own.extraLife || 0, astrality: side === 'A' ? 1 : 0 },
        attacks: [{ functionName: 'simultaneous-test', attackId: 'simultaneous-test', displayName: 'Impact simultané',
          combatFunction: own.support ? 'Support' : 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [own.range || 'melee'], attackTarget: [own.support ? 'ally' : 'enemy'], deadTarget: ['no'], type: [], effets: own.support ? ['heal'] : [], selfEffects: [],
          preparationTime: own.preparation ?? 500, executionTime: own.execution ?? 1800, recoveryTime: own.recovery ?? 300, cooldown: 20000,
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

try {
 const page=await fixture({speed:1200,A:{preparation:100,execution:300},B:{preparation:100,execution:300}});
 const trials=await page.evaluate(async()=>{
  for(const e of E.entites){
   Object.assign(e.baseStats,{HP:60,physicalDamage:15,speed:1200,astrality:150,intelligence:150,strength:50,fatalSurvival:99});
   E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
   e.stats.HP.current=e.stats.HP.max;e.attackDetails[0].cooldown=1000;
  }
  const snapshot=Sim.captureSimulationBoard();snapshot.balance.brokenSpell.chance.basePercent=0;
  const trials=[];for(const seed of [193,194,195]){
   if(seed===195)Object.assign(snapshot.balance.astrality.astralBody,{maxPercent:100,firstPointPercent:99});
   trials.push(await Sim.simulateTrial(snapshot,{seed,durationMs:30000,trace:true}));
  }
  const autonomous=[];
  for(const kind of ['fixed','plus','both'])for(const speed of [500,5500]){
   for(const e of E.entites){
    e.baseStats={HP:1,physicalDamage:2,speed,astrality:0,strength:0,intelligence:0,agility:0,
     fatalSurvival:kind==='fixed'?99:kind==='both'?50:0,fatalSurvivalPlus:kind==='plus'?99:kind==='both'?49:0};
    e.modifierStats={durable:{levelUpMeta:{source:'manualLevelUp',confirmedLevel:1,reverseBaseLevel:1}}};delete e.Archetype;
    E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    e.stats.HP.current=1;e.attackDetails[0].cooldown=0;e.attacks[0].cooldown=0;
   }
   const board=Sim.captureSimulationBoard();
   const result=await Sim.simulateTrial(board,{seed:193,durationMs:30000,trace:true});
   autonomous.push({kind,speed,...result});
  }
  return {trials,autonomous};
 });
 await writeFile(resolve(output,'astrality-simulations.json'),JSON.stringify(trials,null,2));
 assert.equal(trials.trials.length,3);assert.ok(trials.trials.every(t=>!t.error),'Real engine simulation succeeds');
 assert.ok(trials.trials.every(t=>t.entities.some(e=>e.details.procs.astralReturn>0&&e.heal>0)),'Survival and healing execute in virtual time');
 assert.ok(trials.trials[2].entities.some(e=>e.details.procs.astralBody>0),'Body timer executes with modified balance');
 assert.equal(trials.autonomous.length,6);
 for(const trial of trials.autonomous){
  assert.ok(!trial.error);
  assert.ok(trial.entities.every(e=>!e.heal&&!e.details.procs.astralReturn&&!e.details.procs.astralBody),'Autonomous stats grant no Umbra effects');
  const procs=trial.journal.filter(e=>e.type==='damage_resolution'&&e.modifiers?.astrality),previous=new Map();
  assert.ok(procs.length>0,'At least one actual autonomous survival');
  for(const proc of procs){
   const id=proc.target.id;if(previous.has(id))assert.ok(proc.timeMs-previous.get(id)>=5000,'At least five seconds between autonomous survival procs');
   previous.set(id,proc.timeMs);
  }
  if(trial.speed===500)assert.ok(trial.entities.every(e=>(e.details.procs.astrality||0)<=1),'Rapid second blow kills during cooldown');
  else assert.ok(procs.length>2,'Slow attacks allow the cooldown to expire and survival to retrigger');
 }
 assert.deepEqual(errors,[]);console.log('Astralité: 3 Umbra combats + 6 autonomous fixed/plus/mixed combats passed with the real five-second cooldown.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
