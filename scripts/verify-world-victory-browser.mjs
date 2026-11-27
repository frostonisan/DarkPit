import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/world-victory');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });

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
    const { loadResource } = await import('/js/data/loaderList.js');
    const gif = await loadResource('/media/assets/effects/ambidextry.gif');
    const bytes = new Uint8Array(await gif.blob.arrayBuffer());
    const marker = new TextDecoder('latin1').decode(bytes).indexOf('NETSCAPE2.0');
    if (marker < 0 || bytes[marker + 13] || bytes[marker + 14]) throw Error('GIF should loop while combat time is paused');

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
          speed: config.speed ?? 100, extraLife: own.extraLife || 0 },
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

async function normalWorld(page) {
  await page.evaluate(async()=>{
    const store = await import("/js/storage/sessionStorage.js");store.endAdminSession();
    const S = await import("/js/storage/gameStorage.js");S.setAdminMode(false);
    window.levelRunning='scripted';window.currentStageId='pause-test';
    const write=(key,value)=>store.gameStorage.setItem(key,JSON.stringify(value));
    store.gameStorage.setItem('currentLevel','pause-test');
    store.gameStorage.setItem('currentStageId','pause-test');
    write('GameStages',{stages:[{id:'pause-test',level_type:'scripted',statut:'started'},
      {id:'remaining',level_type:'scripted',statut:'unstarted'}]});
    E.entites[1].armyId='ArmyB_pause-test';
    write('ArmyB',{armies:{'ArmyB_pause-test':{entities:[E.entites[1]]}}});
    window.selectedArmyA=[E.entites[0]];write('selectedArmyA',window.selectedArmyA);
    document.querySelectorAll('.entitylootContainer').forEach(node=>node.remove());
    F.initFightEntites();G.startGame();
  });
}
const paused=page=>page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'&&!document.querySelector('#combat-pause-control').disabled);
const state=page=>page.evaluate(async()=>{
  const s=(await import("/js/storage/sessionStorage.js")).gameStorage;
  return {stages:s.getItem('GameStages'),army:s.getItem('ArmyB'),selected:s.getItem('selectedArmyA'),
    started:(await import("/js/app/state.js")).gameStarted,available:sessionStorage.getItem('DarkPitPausedCombat:available'),
    winner:!!document.querySelector('.overlay-victory')};
});
const cases=[];
async function check(name,fn){try{await fn();cases.push({name,pass:true});console.log('PASS',name);}catch(e){cases.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
try {
  await check('pause and F5 preserve the world, one kill is only a stage victory',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(()=>P.pauseCombat());await paused(page);const before=await state(page);
    await page.reload();await paused(page);const after=await state(page);
    assert.equal(await page.locator('.entitylootContainer').count(),0,'no starter selection during combat');
    for(const key of ['stages','army','selected'])assert.equal(after[key],before[key],key);
    await page.evaluate(async()=>{
      await (await import("/js/combat/pause.js")).resumeCombat();
      const E = await import("/js/entities/runtime.js");E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;
      (await import("/js/app/state.js")).checkGameOver();
    });
    const end=await state(page);assert.equal(end.winner,false);
    assert.deepEqual(JSON.parse(end.stages).stages.map(s=>s.statut),['finished','unstarted']);
    await page.close();
  });
  await check('empty stages do not mean world victory',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(async()=>{
      (await import("/js/storage/sessionStorage.js")).gameStorage.setItem('GameStages','{"stages":[]}');
      E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;G.checkGameOver();
    });
    assert.equal((await state(page)).winner,false);await page.close();
  });
  await check('missing stages do not mean world victory',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(async()=>{
      (await import("/js/storage/sessionStorage.js")).gameStorage.removeItem('GameStages');
      E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;G.checkGameOver();
    });
    assert.equal((await state(page)).winner,false);await page.close();
  });
  await check('a test outside the world cannot declare global victory',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(async()=>{
      (await import("/js/storage/sessionStorage.js")).gameStorage.setItem('GameStages',JSON.stringify({stages:[{id:'another-stage',statut:'finished'}]}));
      E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;G.checkGameOver();
    });
    assert.equal((await state(page)).winner,false);await page.close();
  });
  await check('admin battles do not declare global victory',async()=>{
    const page=await fixture({speed:10000});
    await page.evaluate(()=>{G.startGame();E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;G.checkGameOver();});
    assert.equal((await state(page)).winner,false);await page.close();
  });
  await check('finishing the real last stage still declares global victory',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(async()=>{
      const s=(await import("/js/storage/sessionStorage.js")).gameStorage;
      const world=JSON.parse(s.getItem('GameStages'));world.stages[1].statut='finished';
      s.setItem('GameStages',JSON.stringify(world));
      E.entites[1].stats.HP.current=0;E.entites[1].isDEAD=true;G.checkGameOver();
    });
    assert.equal((await state(page)).winner,true);await page.close();
  });
  await check('a real terminal defeat still resets on reload',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(()=>{
      E.entites[0].stats.HP.current=0;E.entites[0].isDEAD=true;G.checkGameOver();
    });
    assert.equal(await page.locator('.overlay-defeat[data-save-preserved="false"]').count(),1);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('globalGameOverScreen')),'true');
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));
    const after=await state(page);
    assert.equal(after.selected,null);assert.equal(after.stages,null);assert.equal(after.available,null);
    await page.close();
  });
  await check('resetting a paused game cannot restore the old combat',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(()=>P.pauseCombat());await paused(page);
    await page.evaluate(async()=>{window.selectedArmyA=[];(await import("/js/storage/gameStorage.js")).resetFullGame();});
    const reset=await state(page);
    assert.equal(reset.available,null,'reset must invalidate pause');
    assert.equal(reset.started,false,'reset must stop combat');
    await page.reload();await page.evaluate(async()=>await (await import("/js/combat/pause.js")).restorePausedCombat());
    assert.equal((await state(page)).started,false);
    assert.equal(await page.locator('#Box_Entite_999820').count(),0);
    await page.close();
  });
  await check('a stale game-over flag cannot erase a live paused fight on F5',async()=>{
    const page=await fixture({speed:10000});await normalWorld(page);
    await page.evaluate(()=>P.pauseCombat());await paused(page);const before=await state(page);
    await page.evaluate(()=>{sessionStorage.setItem('globalGameOverScreen','true');window.dispatchEvent(new Event('beforeunload'));});
    const after=await state(page);
    for(const key of ['stages','army','selected'])assert.equal(after[key],before[key],key);
    await page.reload();await paused(page);
    const restored=await state(page);
    for(const key of ['stages','army','selected'])assert.equal(restored[key],before[key],key);
    await page.close();
  });
}finally{
  await writeFile(resolve(output,'results.json'),JSON.stringify({cases,errors},null,2));
  await browser.close();server.close();
}
if(cases.some(c=>!c.pass)||errors.length)process.exitCode=1;
