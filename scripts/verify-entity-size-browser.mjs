import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root=resolve('docs'), output=resolve(process.env.SIZE_OUTPUT || 'outputs/entity-size');
const baseline=process.env.SIZE_BASELINE && resolve(process.env.SIZE_BASELINE);
await mkdir(output,{recursive:true});

// Run the identical operations against the live engine and its isolated simulator.
// Instrument only the test HTTP response, never the production runtime.
async function spatialAudit() {
  const P=await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), E = await import("/js/entities/runtime.js");
  const M=P, T = await import("/js/combat/attacks.js");
  const O = await import("/js/rendering/boardElements.js");
  const [a,b,c,d]=E.entites, grid=document.getElementById('hexGrid'), checks=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const cell=(r,c)=>grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  const state=()=>JSON.stringify(E.entites.map(e=>[e.id,e.position,e.sizeInCells,document.getElementById(`Box_Entite_${e.id}`).dataset.occupiedPositions]));
  function invariant() {
    const occupied=new Set();
    for(const e of E.entites) {
      const members=P.entityFootprint(e);
      check(members.length===e.sizeInCells,`${e.name}: full group in bounds`);
      for(const h of members) {
        check(!occupied.has(h),`${e.name}: no overlap at ${h.dataset.position}`);occupied.add(h);
        check(T.getHexEntity(h,E.entites)===e&&O.isHexOccupied(h.dataset.position),`${e.name}: every member resolves to one entity`);
      }
    }
  }
  const reset=(sizes=[1,1,3,2],positions=[[2,1],[2,2],[4,6],[0,9]])=>{
    const plan=P.planEntityPlacements(E.entites.map((entity,i)=>({entity,size:sizes[i],hex:cell(...positions[i])})));
    check(plan.valid&&P.commitEntityPlacements(plan),'Atomic fixture placements');invariant();
  };
  reset();
  const FX = await import("/js/combat/effects.js"), A = await import("/js/combat/vitals.js");
  const Rules = await import("/js/entities/rules.js"), Clock = await import("/js/combat/clock.js");
  const applied=(target,size,key='size-effect')=>A.applyEffect(target,'gigantisme',d,{attackId:key,effets:['gigantisme'],
    effectOverrides:{gigantisme:{effectSize:size,effectDuration:10}}});
  const originalRandom=Math.random;Math.random=()=>.999999;
  try {
    const statsBefore=JSON.stringify([a.stats.HP,Rules.getSafe(a,'weight'),Rules.getSafe(a,'speed'),Rules.getSafe(a,'attackPreparationReduc')]);
    const oldNeighbor=b.position;
    check(applied(a,6)===true&&a.sizeInCells===6,'Gigantisme applies through the ordinary attack effect handler');
    check(b.position!==oldNeighbor,'Gigantisme pushes a neighbor using the shared placement engine');invariant();
    check(statsBefore===JSON.stringify([a.stats.HP,Rules.getSafe(a,'weight'),Rules.getSafe(a,'speed'),Rules.getSafe(a,'attackPreparationReduc')]),'Gigantisme adds no HP, weight or timing modifier');
    check(a._gigantismBaseSize===1,'Gigantisme retains the original size');
    check(applied(a,3)===true&&a.sizeInCells===3,'Same attack refreshes size without multiplying it');
    check(applied(a,6,'second-source')===true&&a.sizeInCells===6,'Multiple size sources use the largest occupied group');
    const saved=Clock.captureCombatState();
    await Clock.restoreCombatState({alterations:saved.alterations},{entities:E.entites});
    check(a.sizeInCells===6&&a._gigantismBaseSize===1,'Snapshot restore retains original and effective size');
    const expired=Clock.captureCombatState().alterations.map(entry=>entry.target===a.id
      ? {...entry,expiresAt:Clock.clockNow()-1}:entry);
    await Clock.restoreCombatState({alterations:expired},{entities:E.entites});
    check(a.sizeInCells===1&&a._gigantismBaseSize==null,'Expiration releases the full group and restores original size');invariant();
    check(applied(a,6)===true,'Gigantisme can be applied again');
    check(P.setEntitySizeInCells(a,2).valid&&a.sizeInCells===6&&a._gigantismBaseSize===2,'Admin size changes update the baseline during a temporary enlargement');
    FX.clearControlEffects(a);check(a.sizeInCells===2&&a._gigantismBaseSize==null,'Cleanup restores the manually updated base size');
    reset([1,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
    const before=state();check(applied(b,6)===false&&state()===before,'Out-of-bounds Gigantisme fails without partial movement');
    check(!Object.values(b.controlEffects||{}).some(entry=>entry.kind==='gigantisme'),'Failed growth does not install a temporary effect');
    reset();
    const old=b.baseStats.resilienceTotal;b.baseStats.resilienceTotal=100;E.recomputeEntityStats(b);Math.random=()=>0;
    check(applied(b,3)==='alteration_canceled'&&b.sizeInCells===1,'Total resilience blocks Gigantisme before enlargement');
    if(old===undefined)delete b.baseStats.resilienceTotal;else b.baseStats.resilienceTotal=old;E.recomputeEntityStats(b);
    Math.random=()=>.999999;
    A.applyEffect(a,'bonus-HP',d,{attackId:'separate-hp',effets:['bonus-HP'],effectOverrides:{'bonus-HP':{effectValue:50,effectModifierMode:'percent'}}});
    check(a.stats.HP.max>JSON.parse(statsBefore)[0].max&&a.sizeInCells===1,'A separate HP bonus can coexist without enlarging the entity');
    FX.clearControlEffects(a);check(a.stats.HP.max===JSON.parse(statsBefore)[0].max,'Cleanup removes the separate HP bonus');
  } finally {FX.clearControlEffects();Math.random=originalRandom;}
  reset();
  const neighborBefore=b.position, sprite=document.getElementById(`spriteContainer_${a.id}`);
  const growth=P.setEntitySizeInCells(a,6);
  check(growth.valid&&growth.pushed.includes(String(b.id))&&b.position!==neighborBefore,'Growth pushes the obstructing neighbor');
  check(document.getElementById(`spriteContainer_${a.id}`)===sprite,'Growth preserves sprite/canvas identity');
  check(sprite.parentElement.style.getPropertyValue('--entity-size-scale')==='2.5','Six cells grows the sprite through a separate scale wrapper');
  if(!globalThis.__combatSimulation) {
    check(document.getElementById(`Box_Entite_${b.id}`).getAnimations().length>0,'Pushed neighbor slides using WAAPI');
    check(Boolean(document.getElementById(`Box_Entite_${b.id}`).querySelector('.entity-footprint-smoke')),'Pushed neighbor emits foot smoke');
  }
  invariant();
  const pushedPosition=b.position;
  check(P.setEntitySizeInCells(a,1).valid&&b.position===pushedPosition,'Shrinking frees cells without pulling neighbors back');invariant();
  reset([1,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
  for(const size of [2,3,6]) {const before=state();check(!P.setEntitySizeInCells(b,size).valid&&before===state(),`Size ${size} rejected at bottom-right without mutation`);}
  for(const size of [2,3,6]) for(const [r,col] of [[0,0],[0,12],[6,0],[6,12]]) {
    const members=P.entityFootprint(a,cell(r,col),size);
    check(members.length===0||members.length===size,`Size ${size}: corner group never clipped (${r},${col})`);
  }
  reset([6,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
  const random=Math.random;Math.random=()=>.999999;
  try {
    const before=state();let rolls=0;Math.random=()=>{rolls++;return .999999;};
    check(!M.swapEntitiesFromEffect(d,a,b)&&before===state()&&rolls===0,'6 ↔ 1 swap at edge rejected atomically, before resistance rolls');
    const ap=a.position,cp=c.position;check(M.swapEntitiesFromEffect(d,a,c)&&a.position===cp&&c.position===ap,'6 ↔ 3 swap moves both complete groups');invariant();
    reset([2,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
    check(M.swapEntitiesFromEffect(d,a,c),'2 ↔ 3 swap succeeds');invariant();
    reset([6,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
    check(M.swapEntitiesFromEffect(d,a,d),'6 ↔ 2 swap succeeds');invariant();
    reset([3,1,2,2],[[2,1],[6,12],[4,6],[0,9]]);
    const obstacle=document.createElement('div');obstacle.className='battle-element';cell(5,6).append(obstacle);P.refreshHexOccupancy?.(cell(5,6));
    const blocked=state();check(!M.swapEntitiesFromEffect(d,a,c)&&blocked===state(),'Swap blocked by an object preserves both entities');obstacle.remove();P.refreshHexOccupancy?.(cell(5,6));
    reset([6,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
    const beforeDistance=P.groupedHexDistance(cell(2,1),cell(4,6));
    check(M.pullEntityToward(a,c,5),'Grab moves a six-cell entity');
    check(P.groupedHexDistance(document.getElementById(`Box_Entite_${a.id}`).closest('.hex'),cell(4,6))<beforeDistance,'Grab approaches attacker with the whole footprint');invariant();
    (await import("/js/board/deployment.js")).ensureMovementState(a,{reset:true});
    a.stats.shift.current=10;
    check(M.moveEntityRandomly(a,()=>0),'Random movement accepts a full six-cell destination');invariant();
    reset([6,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
    const oldBase={...a.baseStats};a.baseStats.resilience=150;a.baseStats.strength=50;E.recomputeEntityStats(a);Math.random=()=>0;
    const chance=(await import("/js/combat/statistics.js")).calculateResilienceTotalCancelBonus(a);
    const resisted=state();check(!M.swapEntitiesFromEffect(d,a,c)&&state()===resisted,'One resisted participant cancels the whole different-size swap: '+chance);
    a.baseStats=oldBase;E.recomputeEntityStats(a);
  } finally {Math.random=random;}
  reset();
  const proposed=new Set(P.entityFootprint(a,cell(2,1),6)), blockers=[];
  for(const h of grid.querySelectorAll('.hex')) if(!proposed.has(h)&&!O.isHexOccupied(h.dataset.position)) {
    const node=document.createElement('div');node.className='battle-element';h.append(node);P.refreshHexOccupancy?.(h);blockers.push(node);
  }
  const full=state(),start=performance.now();
  const crowded=P.setEntitySizeInCells(a,6);
  check(!crowded.valid&&full===state(),'Crowded board refuses growth without partial pushes: '+JSON.stringify({valid:crowded.valid,reason:crowded.reason,moves:crowded.valid?[...crowded.moves].map(([id,m])=>[id,m.hex.dataset.position]):[],blockers:blockers.length}));
  check(performance.now()-start<250,'Crowded-board refusal stays bounded');blockers.forEach(node=>{const hex=node.parentElement;node.remove();P.refreshHexOccupancy?.(hex);});
  reset([6,1,3,2],[[2,1],[6,12],[4,6],[0,9]]);
  const freed=P.entityFootprint(a)[1];
  check((await import("/js/entities/spawn.js")).makeRoomForSummon(freed),'Summoning on a non-anchor member displaces its entity');
  check(!P.entityFootprint(a).includes(freed)&&!O.isHexOccupied(freed.dataset.position),'Summon displacement actually frees the requested cell');invariant();
  const members=P.entityFootprint(a);P.releaseEntityFootprint(a);
  check(members.every(h=>!O.isHexOccupied(h.dataset.position)),'Release clears every occupied member, even while the sprite remains');
  delete document.getElementById(`Box_Entite_${a.id}`).dataset.footprintReleased;P.syncEntityFootprints(grid);invariant();
  const roles=P.entityFootprint(a);roles.forEach((h,i)=>h.dataset.role=i<4?'mage':'tank');
  P.syncEntityFootprints(grid);check(a.role==='mage','Role follows majority of occupied cells');
  roles.forEach((h,i)=>h.dataset.role=i<3?'mage':'tank');P.syncEntityFootprints(grid);check(a.role==='mage','Role tie keeps the current role');
  reset();P.clearFootprintAnimations();
  return {checks,simulation:Boolean(globalThis.__combatSimulation)};
}
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname)),rel=relative(root,file);
  if(rel==='..'||rel.startsWith('..'+sep))return res.writeHead(403).end();
  try {
    let content;
    try { content=baseline?await readFile(resolve(baseline,rel)):await readFile(file); }
    catch {content=await readFile(file);}
    if(rel.replaceAll('\\','/')==='js/debug/simulationRuntime.js') content=content.toString().replace('F.initFightEntites();',`F.initFightEntites();\nif(input.footprintAudit) journal.push({type:'footprint-audit',...await (${spatialAudit.toString()})()});`);
    res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(content);
  } catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try {
  const page=await browser.newPage({viewport:{width:1536,height:960}});page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async()=>{
    const E=await import("/js/entities/runtime.js"),C = await import("/js/rendering/entities.js"),S = await import("/js/storage/gameStorage.js"),G = await import("/js/app/state.js");
    S.setAdminMode(true);window.levelRunning='admin';window.currentStageId='size-audit';S.setCurrentLevel('size-audit');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    S.saveToLocalStorage('GameStages',{stages:[{id:'size-audit',level_type:'admin'}]});S.saveToLocalStorage('selectedArmyA',[]);S.saveToLocalStorage('ArmyB',{armies:{}});S.saveToLocalStorage('equippedItems',[]);
    document.body.innerHTML='<div id="game-windows"><div id="game-container"><div class="Game-UI"></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div></div>';
    (await import("/js/ui/application.js")).GameUi();
    document.getElementById('game-windows').style.cssText='opacity:1;display:block;visibility:visible';
    document.getElementById('game-container').style.cssText='opacity:1;display:block;visibility:visible;width:1536px;height:960px';
    const grid=document.getElementById('hexGrid');grid.style.cssText='position:absolute;left:120px;top:180px;width:1100px;height:560px;transform:none';
    for(let r=0;r<7;r++)for(let c=0;c<13;c++){
      const hex=document.createElement('div');hex.className=`hex ${c<6?'SideA':'SideB'}`;
      Object.assign(hex.dataset,{row:r,col:c,position:`hex_${r*13+c+1}`,role:'gueux'});
      hex.style.cssText=`position:absolute;left:${c*70+(r%2)*35}px;top:${r*60}px;width:70px;height:80px;`;
      hex.innerHTML='<div class="socle gueux" style="opacity:.5"></div>';grid.append(hex);
    }
    E.entites.length=0;
    const template=(await import("/js/data/entityTemplates.js")).entitesNest.find(e=>e.class==='mouche-asticoteuse');
    for(let i=0;i<4;i++) {
      const entity=E.enrichEntityStats({...structuredClone(template),reverseArchetype:null,id:998600+i,name:`Taille ${i+1}`,side:i<2?'A':'B',type:'sbire',role:'gueux',level:1,awakening:1,stats:{},modifierStats:{},stuff:{},sizeInCells:1,
        baseStats:{HP:10000,physicalDamage:1,speed:500,shift:10,weight:40},
        attacks:[{functionName:'size-audit',attackId:'size-audit',displayName:'Test taille',combatFunction:'Attaquant',attacknature:['physicalDamage'],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],type:[],effets:[],selfEffects:[],preparationTime:100,executionTime:200,recoveryTime:100,cooldown:100,physicalRatio:1,magicalRatio:0,piercingRatio:0}]});
      entity.statut=['alive'];entity.isDEAD=false;E.entites.push(entity);const created=C.createEntiteInDOM(entity);await created.spriteReady;
    }
    G.configureBattleActionManager({createStartButton:c=>c,createFleeButton:c=>c,createQuitButton:c=>c});
    window.E=E;window.P=await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));window.Sim=await import("/js/debug/simulation.js");
  });
  const live=await page.evaluate(spatialAudit);console.log(`Live spatial checks: ${live.checks.length}`);
  const performanceChecks=await page.evaluate(async()=>{
    const runs=[];
    for(const count of [40,80]) {
      const grid=document.createElement('div');grid.className='hex-grid';document.body.append(grid);
      const cells=[],actors=[],rows=Math.ceil(count/8)*3+2;
      for(let r=0;r<rows;r++)for(let c=0;c<24;c++){
        const hex=document.createElement('div');hex.className='hex';
        Object.assign(hex.dataset,{row:r,col:c,position:`hex_${10000+r*24+c}`,role:'gueux'});
        hex.style.cssText=`position:absolute;left:${c*70+(r%2)*35}px;top:${r*60}px;width:70px;height:80px`;
        grid.append(hex);cells.push(hex);
      }
      for(let i=0;i<count;i++){
        const entity={id:880000+i,sizeInCells:[1,2,3,6][i%4],role:'gueux',side:'A',stats:{HP:{current:1}}};
        const box=document.createElement('div');box.className='entite-box';box.id=`Box_Entite_${entity.id}`;
        const anchor=cells[Math.floor(i/8)*3*24+(i%8)*3];anchor.append(box);entity.position=anchor.dataset.position;
        E.entites.push(entity);actors.push(entity);
      }
      P.syncEntityFootprints(grid);
      const query=grid.querySelectorAll.bind(grid);let sceneReads=0;
      grid.querySelectorAll=(selector)=>{if(selector==='.entite-box')sceneReads++;return query(selector);};
      const started=performance.now();let valid=0,checksum=0;
      for(let i=0;i<1200;i++){
        const plan=P.planEntityPlacements([{entity:actors[i%count],hex:cells[(i*37)%cells.length]}]);
        valid+=Number(plan.valid);checksum=(checksum*31+Number(plan.valid))>>>0;
      }
      const searchMs=performance.now()-started,searchSceneReads=sceneReads;
      sceneReads=0;const moveStart=performance.now();
      for(let i=0;i<80;i++) {
        const plan=P.planEntityPlacements([{entity:actors[0],hex:cells[cells.length-24+(i%2)]}]);
        if(!P.commitEntityPlacements(plan))throw Error('Benchmark placement refused');
      }
      runs.push({count,searches:1200,moves:80,valid,checksum,searchMs,searchSceneReads,moveMs:performance.now()-moveStart,moveSceneReads:sceneReads});
      for(const entity of actors)E.entites.splice(E.entites.indexOf(entity),1);
      grid.remove();
    }
    return runs;
  });
  const registryChecks=baseline?[]:await page.evaluate(async()=>{
    const O = await import("/js/rendering/boardElements.js"),checks=[];
    const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
    const [a,b,c]=E.entites,grid=document.getElementById('hexGrid'),cell=(r,col)=>grid.querySelector(`[data-row="${r}"][data-col="${col}"]`);
    const before=P.entityFootprint(a),destination=cell(6,10);
    const pending=P.planEntityPlacements([{entity:a,hex:destination,size:1}]);
    const object=O.createBattleElementInDOM({id:'registry-blocker',position:destination.dataset.position,blocking:true});
    check(object&&O.isHexOccupied(destination.dataset.position),'Object insertion immediately reserves the cell');
    check(!P.commitEntityPlacements(pending)&&P.entityFootprint(a).every((h,i)=>h===before[i]),'A stale plan cannot overwrite a new object');
    O.removeBattleElementFromDOM(object);
    check(!O.isHexOccupied(destination.dataset.position)&&P.planEntityPlacements([{entity:a,hex:destination,size:1}]).valid,'Removing an object releases its reservation synchronously');
    const decoration=O.createBattleElementInDOM({id:'registry-decoration',position:destination.dataset.position,blocking:false});
    check(decoration&&!O.isHexOccupied(destination.dataset.position),'Nonblocking decorations do not reserve cells');O.removeBattleElementFromDOM(decoration);
    const ground=document.createElement('div');ground.id='registry-ground';destination.append(ground);
    const summons = await import("/js/combat/summons.js");
    summons.consommationSummon({summonDuration:60,summonEffet:[]},destination,ground.id,()=>{}, {adminSpawn:true,infinite:true});
    check(!P.planEntityPlacements([{entity:a,hex:destination,size:1}]).valid,'Ground consumable registration blocks placement immediately');
    summons.clearGroundItems();
    check(P.planEntityPlacements([{entity:a,hex:destination,size:1}]).valid,'Ground consumable cleanup immediately frees the registry');
    const untouched=document.getElementById(`Box_Entite_${c.id}`),path=grid.querySelector(`[data-footprint-entity="${c.id}"]`);
    const observer=new MutationObserver(()=>{});observer.observe(untouched,{attributes:true,childList:true,subtree:true});
    let notifications=0;const ap=cell(2,1),bp=cell(2,2);
    const onOccupied=()=>{
      notifications++;
      check(P.getFootprintOccupant(ap)?.id===`Box_Entite_${b.id}`&&P.getFootprintOccupant(bp)?.id===`Box_Entite_${a.id}`,'Every occupation notification observes the complete swap');
    };
    ap.addEventListener('hexOccupied',onOccupied);bp.addEventListener('hexOccupied',onOccupied);
    check(P.commitEntityPlacements(P.planEntityPlacements([{entity:a,hex:bp},{entity:b,hex:ap}])),'Atomic registry swap succeeds');
    ap.removeEventListener('hexOccupied',onOccupied);bp.removeEventListener('hexOccupied',onOccupied);
    check(notifications===2,'The commit retains one occupancy notification per moved entity');
    check(observer.takeRecords().length===0&&path===grid.querySelector(`[data-footprint-entity="${c.id}"]`),'Moving two entities leaves other sprites and footprint paths untouched');observer.disconnect();
    P.commitEntityPlacements(P.planEntityPlacements([{entity:a,hex:ap},{entity:b,hex:bp}]));
    const taken=P.entityFootprint(c);P.releaseEntityFootprint(c);
    check(taken.every(hex=>!P.getFootprintOccupant(hex)),'Released corpse leaves no ghost cells while its DOM remains');
    delete document.getElementById(`Box_Entite_${c.id}`).dataset.footprintReleased;P.syncEntityFootprints(grid);
    check(taken.every(hex=>P.getFootprintOccupant(hex)?.id===`Box_Entite_${c.id}`),'Reintroduced entity restores all its occupied cells');
    return checks;
  });
  if(!baseline)for(const run of performanceChecks){assert.equal(run.searchSceneReads,0);assert.equal(run.moveSceneReads,0);}
  const sim=await page.evaluate(async()=>{
    const snapshot=Sim.captureSimulationBoard();snapshot.footprintAudit=true;snapshot.balance.brokenSpell.chance.basePercent=0;
    return Sim.simulateTrial(snapshot,{seed:193,durationMs:3000,trace:true});
  });
  const simulated=sim.journal.find(row=>row.type==='footprint-audit');assert.ok(simulated?.simulation);assert.ok(sim.journal.some(row=>row.type==='damage_resolution'),'Combat continues after spatial operations');
  assert.ok(sim.entities.every(e=>e.occupiedPositions.length===e.sizeInCells),'Simulation report retains complete footprints');console.log(`Simulator spatial checks: ${simulated.checks.length}`);
  const integration=await page.evaluate(async()=>{
    const checks=[],check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
    const cell=(r,c)=>document.querySelector(`#hexGrid [data-row="${r}"][data-col="${c}"]`),[a,b,c,d]=E.entites;
    const relocate=spec=>check(P.commitEntityPlacements(P.planEntityPlacements(spec.map(([entity,r,col,size])=>({entity,hex:cell(r,col),size})))),'Test placement succeeds');
    relocate([[a,2,1,6],[b,4,3,1],[c,4,6,3],[d,0,9,2]]);
    const D = await import("/js/board/interaction.js");D.restoreEntityDragAndDrop();
    function drop(entity,hex){const dataTransfer=new DataTransfer();dataTransfer.setData('text',`Box_Entite_${entity.id}`);hex.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));}
    const ap=a.position,bp=b.position;drop(a,cell(4,3));check(a.position===bp&&b.position===ap,'Native drop swaps 6 ↔ 1 allied entities');
    drop(b,P.entityFootprint(a)[2]);check(a.position===ap&&b.position===bp,'Native drop on a non-anchor cell resolves the full occupant');
    const before=a.position;drop(a,cell(6,12));check(a.position===before,'Native drop cannot clip a large entity at the edge');
    const spawner = await import("/js/entities/spawn.js"),template=(await import("/js/data/entityTemplates.js")).entitesNest.find(e=>e.class==='mouche-asticoteuse');
    const count=E.entites.length,positions=E.entites.map(e=>e.position).join();let refused=false;
    try{await spawner.createEntityIngame({...structuredClone(template),sizeInCells:6},{side:'B',position:cell(6,12).dataset.position});}catch{refused=true;}
    check(refused&&E.entites.length===count&&positions===E.entites.map(e=>e.position).join(),'Invalid large spawn leaves all entities unchanged');
    const spawned=await spawner.createEntityIngame({...structuredClone(template),sizeInCells:3},{side:'B',position:cell(2,9).dataset.position});
    check(P.entityFootprint(spawned).length===3,'Spawn pipeline places the complete three-cell entity');
    E.RemoveEntite(spawned);
    const oldNodes=[...document.querySelectorAll('#hexGrid .hex')],oldPositions=E.entites.map(e=>e.position).join();
    const B = await import("/js/board/controller.js");
    const resized=B.createHexGrid({rows:1,cols:2,totalHexagons:2,hexWidth:70,hexHeight:80,staggeredRowHeight:60,scale:1});
    check(resized===false&&oldNodes.every(n=>n.isConnected)&&oldPositions===E.entites.map(e=>e.position).join(),'Terrain shrink rejected if complete groups cannot fit');
    relocate([[a,2,1,1],[b,2,2,1],[c,4,6,3],[d,0,9,2]]);
    return checks;
  });
  // Live admin change, using the real select and event handler.
  await page.evaluate(async()=>{(await import("/js/debug/admin.js")).initializeAdminLevel(E.entitesNestUp);});
  await page.locator('#Box_Entite_998600').dispatchEvent('click',{detail:1});
  const select=page.locator('[data-admin-entity-field="sizeInCells"]');await select.waitFor({state:'visible'});
  await select.selectOption('6');
  assert.equal(await page.evaluate(()=>E.entites[0].sizeInCells),6,'Admin updates live size');
  assert.equal(await page.evaluate(()=>P.entityFootprint(E.entites[0]).length),6,'Admin updates live group');
  await page.evaluate(()=>{document.getElementById('admin-combat-simulation').style.display='none';});
  await page.waitForTimeout(650);
  await page.screenshot({path:resolve(output,'admin-size.png')});
  const refused=await page.evaluate(async()=>{
    const actor=E.entites[0],edge=document.querySelector('[data-row="6"][data-col="12"]');
    P.commitEntityPlacements(P.planEntityPlacements([{entity:actor,hex:edge,size:1}]));
    const select=document.querySelector('[data-admin-entity-field="sizeInCells"]');select.value='6';select.dispatchEvent(new Event('change',{bubbles:true}));
    return {size:actor.sizeInCells,value:select.value,error:select.parentElement.textContent};
  });
  assert.equal(refused.size,1);assert.equal(refused.value,'1');assert.match(refused.error,/limites/);
  await page.evaluate(async()=>{
    const cells=[[2,1],[2,2],[4,6],[0,9]],sizes=[1,1,3,2];
    const plan=P.planEntityPlacements(E.entites.map((entity,i)=>({entity,size:sizes[i],hex:document.querySelector(`#hexGrid [data-row="${cells[i][0]}"][data-col="${cells[i][1]}"]`)})));
    if(!P.commitEntityPlacements(plan))throw Error('Live combat placement');
    window.__liveHits=[];window.addEventListener('combatLogEntry',ev=>{if(ev.detail.type==='damage_resolution')__liveHits.push(ev.detail);});
    (await import("/js/combat/loop.js")).initFightEntites();(await import("/js/app/state.js")).startGame();
    const grown=P.setEntitySizeInCells(E.entites[0],6);if(!grown.valid)throw Error('Live combat growth');
  });
  await page.waitForFunction(()=>window.__liveHits.length>=4,{},{timeout:12000});
  const combat=await page.evaluate(()=>({hits:__liveHits.length,groups:E.entites.map(entity=>({size:entity.sizeInCells,cells:P.entityFootprint(entity).map(h=>h.dataset.position)}))}));
  assert.ok(combat.groups.every(g=>g.size===g.cells.length));
  assert.equal(new Set(combat.groups.flatMap(g=>g.cells)).size,combat.groups.reduce((n,g)=>n+g.size,0));
  // Rebuild the in-memory index from the existing paused-scene snapshot, with
  // a multi-cell entity and a blocking object; no registry save format is added.
  await page.waitForTimeout(650);
  await page.evaluate(async()=>{
    const O = await import("/js/rendering/boardElements.js");
    O.createBattleElementInDOM({id:'registry-persist-object',position:document.querySelector('[data-row="6"][data-col="10"]').dataset.position,blocking:true});
    await (await import("/js/combat/pause.js")).pauseCombat();
  });
  await page.waitForFunction(()=>!document.querySelector('#combat-pause-control')?.disabled);
  const readPausedOccupancy=()=>page.evaluate(async()=>{
    const E = await import("/js/entities/runtime.js"),P = await import("/js/board/controller.js"),O = await import("/js/rendering/boardElements.js");
    return {paused:(await import("/js/combat/clock.js")).isCombatPaused(),entities:E.entites.map(entity=>({
      id:entity.id,position:entity.position,size:entity.sizeInCells,role:entity.role,
      members:P.entityFootprint(entity).map(hex=>[hex.dataset.position,P.getFootprintOccupant(hex)?.id])
    })),object:O.isHexOccupied(document.querySelector('[data-row="6"][data-col="10"]').dataset.position)};
  });
  const pausedOccupancy=await readPausedOccupancy();assert.equal(pausedOccupancy.paused,true);assert.equal(pausedOccupancy.object,true);
  await page.reload();
  await page.evaluate(async()=>await(await import("/js/combat/pause.js")).restorePausedCombat());
  assert.deepEqual(await readPausedOccupancy(),pausedOccupancy,'F5 rebuilds every occupied cell and object without changing the paused scene');
  await page.evaluate(async()=>{
    window.__resumedHits=0;window.addEventListener('combatLogEntry',event=>{if(event.detail.type==='damage_resolution')__resumedHits++;});
    await(await import("/js/combat/pause.js")).resumeCombat();
  });
  await page.waitForFunction(()=>window.__resumedHits>=2,{},{timeout:12000});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'report.json'),JSON.stringify({live,simulated,integration,combat,simulation:sim,performanceChecks,registryChecks,pausedOccupancy,admin:{valid:true,refused},errors},null,2));
  console.log(JSON.stringify({live:live.checks.length,simulator:simulated.checks.length,integration:integration.length,admin:true,errors}));
} finally {await browser.close();await new Promise(done=>server.close(done));}
