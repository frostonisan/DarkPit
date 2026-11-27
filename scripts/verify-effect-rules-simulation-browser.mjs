import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/effect-rules/simulator');
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
const reports=[];
const dots=trial=>trial.journal.filter(e=>e.type==='damage_resolution'&&e.attack?.types?.includes('alteration'));
try {
  for(const [label,resistance,total] of [['burn normal',0,35],['burn mitigated',50,17.5],['burn immune',0,0]]) {
    const page=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,effects:['brulure'],effectOverrides:{brulure:{effectDot:5,effectStack:2}}},
      B:{magic:true,range:'range',preparation:20000,stats:{magicalResistance:0,alterationResistance:resistance,...(label==='burn immune'?{resilienceTotal:100}:{})}}});
    const trial=await page.evaluate(()=>Sim.simulateTrial(snapshot,{seed:193,durationMs:13000,trace:true}));
    const ticks=dots(trial),sum=ticks.reduce((s,e)=>s+e.damage,0);
    await writeFile(resolve(output,label+'.json'),JSON.stringify(trial,null,2));
    assert.ok(Math.abs(sum-total)<=.5,`${label}: ${sum} / ${total}`);
    if(label==='burn normal') {
      assert.deepEqual(ticks.map(e=>e.timeMs),[2300,3300,4300,5300,6300,7300,8300,9300,10300,11300]);
      assert.deepEqual(ticks.map(e=>e.damage),[5,5,5,5,5,2,2,2,2,2]);
    }
    reports.push({label,sum,ticks:ticks.length});await page.close();
  }
  for(const mode of ['refresh','replace']) {
    const page=await fixture({A:{magic:true,range:'range',preparation:200,execution:100,cooldown:0},B:{magic:true,range:'range',preparation:20000,stats:{magicalResistance:0}}});
    const trial=await page.evaluate(async mode=>{
      const R = await import("/js/combat/attackResolution.js"),catalog=(await import('/js/data/attackList.js')).attackDetails;
      const a=E.entites.find(e=>e.side==='A'),base=a.attackDetails[0];
      R.setEntityAttackDefinitions(a,[1,2].map(i=>({...base,entityAttackId:undefined,attackId:'poison-'+i,functionName:'poison-'+i,displayName:'Poison '+i,
        effets:['poison'],effectOverrides:{poison:{effectDot:30*i,effectDuration:3,effectPhysicalRatio:0,effectMagicalRatio:0,applicationMode:mode}}})),catalog);
      const s=Sim.captureSimulationBoard();s.balance.brokenSpell.chance.basePercent=0;
      return Sim.simulateTrial(s,{seed:193,durationMs:10000,trace:true});
    },mode);
    const sum=dots(trial).reduce((s,e)=>s+e.damage,0);reports.push({label:mode,sum});
    await writeFile(resolve(output,mode+'.json'),JSON.stringify(trial,null,2));await page.close();
  }
  assert.ok(reports.find(r=>r.label==='refresh').sum>reports.find(r=>r.label==='replace').sum,'Independent poison origins accumulate damage; replacement removes old origins');
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'summary.json'),JSON.stringify(reports,null,2));
  console.log('Effect rules simulation:',JSON.stringify(reports));
} finally { await browser.close();await new Promise(done=>server.close(done)); }
