import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/tactical-pause');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });

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
    const boardController = await import('/js/board/controller.js');
    boardController.invalidateFootprintGeometry(grid); boardController.rebuildBoardOccupancy(grid);
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


const ready = page => page.waitForFunction(async () => {
  window.P = await import("/js/combat/pause.js"); window.Clock = await import("/js/combat/clock.js");
  await P.restorePausedCombat(); // F5 also rebinds ground effects asynchronously.
  return Clock.isCombatPaused() && !P.isCombatCheckpointBusy() && sessionStorage.getItem('DarkPitPausedCombat:available') === '1';
});
async function attach(page) {
  await page.evaluate(async () => {
    window.E = await import("/js/entities/runtime.js"); window.G = await import("/js/app/state.js");
    window.M = await import('/js/items/itemManager.js'); window.R = await import("/js/combat/attackResolution.js");
    window.dropEntity = position => {
      const transfer = new DataTransfer(); transfer.setData('text', 'Box_Entite_999820');
      document.querySelector(`.hex[data-position="${position}"]`).dispatchEvent(new DragEvent('drop', {dataTransfer:transfer,bubbles:true,cancelable:true}));
    };
    window.readTactical = () => ({ now:Clock.clockNow(), entities:E.entites.map(e=>({id:e.id,position:e.position,hp:e.stats.HP.current,
      shift:e.stats.shift.current,selection:e.attackSelection,action:e._combatAction,poison:e.stats.poison})),
      inventory:M.getBattleInventoryState(), ground:Clock.captureCombatState().ground, orders:Clock.captureCombatState().orders });
  });
}
try {
  const page=await fixture({speed:50000}); await attach(page);
  await page.evaluate(async()=>{
    const S = await import("/js/storage/gameStorage.js");
    const actor=E.entites[0]; actor.baseStats.shift=10;actor.baseStats.charge=3;
    E.recomputeEntityStats(actor,{skipReverseArchetype:true}); actor.stats.HP.current=400;
    actor.attacks.push({...structuredClone(actor.attacks[0]),functionName:'second-test',attackId:'second-test',attackKey:'second-test',displayName:'Seconde attaque'});
    S.saveToLocalStorage('selectedArmyA',[actor]);window.selectedArmyA=[actor];
    S.saveToLocalStorage('PlayerSave',{Playerinventory:[],equippedItems:[]}); S.saveToLocalStorage('IngameItems',[]);
    M.setBattleSlotCount(2,{admin:true});
    const {ItemDetails}=await import('/js/data/itemList.js');
    window.movementItem=M.acquireItem(ItemDetails.find(i=>i.functionName==='MovementChargeSeven'),'pause-test');
    window.healItem=M.acquireItem(ItemDetails.find(i=>i.effets?.length===1 && i.effets[0]==='itemHeal'),'pause-test');
    if(!M.moveBattleItem(movementItem.itemId,0)||!M.moveBattleItem(healItem.itemId,1))throw Error('Pouch setup failed');
    for(const position of ['3','4']){
      const hex=document.createElement('div');hex.className='hex SideA';hex.dataset.position=position;
      hex.style.cssText=`position:absolute;left:${position==='3'?180:360}px;top:280px;width:160px;height:180px`;
      hex.innerHTML='<div class="socle gueux"><div class="image-role-hex-info"></div></div>';document.querySelector('#hexGrid').append(hex);
    }
    (await import('/js/board/controller.js')).invalidateFootprintGeometry(document.getElementById('hexGrid'));
    const drag = await import("/js/board/interaction.js");drag.restoreEntityDragAndDrop();
    document.querySelector('.entitylootContainer')?.remove();
    S.setAdminMode(false);window.levelRunning='scripted';
    S.saveToLocalStorage('GameStages',{stages:[{id:'pause-test',level_type:'scripted'}]});
    const {summons}=await import('/js/data/summons.js');const ground = await import("/js/combat/summons.js");
    G.startGame();
    (await import('/js/items/resourceStocks.js')).addMovementCharges(actor,20);
    window.moveCost=1+E.getMovementWeightMalus(actor).shiftCostModifier;
    ground.spawnConsumableSummon(document.querySelector('[data-position="3"].hex'),{...summons.find(s=>s.summonEffet?.includes('healConsommable')),summonDuration:20},{attacker:actor});
    ground.spawnConsumableSummon(document.querySelector('[data-position="4"].hex'),{...summons.find(s=>s.summonEffet?.includes('poisonConsommable')),summonDuration:20},{attacker:E.entites[1]});
  });
  await page.keyboard.press('Space');await ready(page);
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:false});
  const rolePulse = await page.evaluate(() => {
    const hex = document.querySelector('.hex[data-position="3"]');
    hex.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true }));
    return hex.querySelector('.image-role-hex-info').getAnimations().find(a => a.animationName === 'Pulsation').currentTime;
  });
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hex[data-position="3"] .image-role-hex-info')).opacity) === 1);
  assert.equal(await page.evaluate(() => document.querySelector('.hex[data-position="3"] .image-role-hex-info').getAnimations().find(a => a.animationName === 'Pulsation').currentTime), rolePulse, 'Tactical hover must not resume the frozen pulse');
  await page.evaluate(() => document.querySelector('.hex[data-position="4"]').dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true })));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.hex[data-position="3"] .image-role-hex-info')).visibility === 'hidden');
  assert.equal(await page.evaluate(() => Clock.isCombatPaused()), true, 'Hidden marker cleanup must finish during tactical pause');
  const start=await page.evaluate(()=>readTactical()), moveCost=await page.evaluate(()=>moveCost);
  assert.equal(await page.evaluate(()=>G.getStageAccess().menusAllowed),false,'pause does not unlock safe menus');
  await page.evaluate(()=>{
    const sprite=document.querySelector('#Box_Entite_999820 .sprite');
    sprite.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
    dropEntity('3');sprite.dispatchEvent(new DragEvent('dragend',{bubbles:true}));
  });await ready(page);
  await page.waitForFunction(()=>[...document.querySelectorAll('.sprite')].every(e=>e.style.pointerEvents!=='none'));
  const moved=await page.evaluate(()=>readTactical());
  assert.equal(moved.entities[0].position,'3');assert.equal(moved.entities[0].shift,start.entities[0].shift-moveCost,'normal movement cost paid');
  assert.ok(moved.entities[0].hp>start.entities[0].hp,'ground healing resolves while time is frozen');
  assert.equal(moved.now,start.now);
  await page.evaluate(()=>dropEntity('4'));await ready(page);
  const poisoned=await page.evaluate(()=>readTactical());
  assert.equal(poisoned.entities[0].position,'4');assert.equal(poisoned.entities[0].shift,start.entities[0].shift-2*moveCost);
  await page.waitForTimeout(1200);
  assert.equal((await page.evaluate(()=>readTactical())).entities[0].hp,poisoned.entities[0].hp,'new poison waits for combat time');
  // Visible console/field focus stays tactical; only a hidden tab blocks actions.
  await page.evaluate(()=>{
    window.inspected=0;const btn=document.createElement('button');btn.id='inspect-test';btn.onclick=()=>inspected++;document.body.append(btn);
    const input=document.createElement('input');input.id='focus-test';document.body.append(input);input.focus();input.blur();btn.click();
  });
  assert.equal(await page.evaluate(()=>inspected),1);
  assert.equal(await page.evaluate(()=>P.getCombatPauseReasons().absolute),false);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('blur'));
    if(P.getCombatPauseReasons().absolute)throw Error('Console focus must not pause a visible page');
    window.testHidden=true;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>testHidden});
    document.dispatchEvent(new Event('visibilitychange'));
  });await ready(page);
  assert.equal(await page.evaluate(()=>Clock.isCombatInteractionBlocked()),true);
  assert.equal(await page.evaluate(()=>{document.querySelector('#inspect-test').click();return inspected;}),1);
  assert.equal(await page.evaluate(async()=>(await M.useConsumableItem(movementItem.itemId,E.entites[0],{silent:true})).ok),false);
  await page.evaluate(()=>dropEntity('3'));
  assert.equal(await page.evaluate(()=>E.entites[0].position),'4');
  await page.evaluate(()=>{testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(450);
  assert.equal(await page.evaluate(()=>Clock.isCombatInteractionBlocked()),true);
  await page.getByRole('button',{name:'Reprendre la partie',exact:true}).click();
  await ready(page);
  await page.waitForFunction(()=>!Clock.isCombatInteractionBlocked());
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:false});
  await page.evaluate(async()=>{
    const panel = await import("/js/ui/attacks.js");panel.showCombatAttackControlPanel(E.entites[0].id);
  });
  assert.ok(await page.locator('.combat-attack-control-card').count()>0,'real attack cards open during pause');
  const toggle=page.locator('.combat-attack-control-toggle').first();
  await toggle.click({force:true});await ready(page);
  assert.equal(await toggle.getAttribute('aria-pressed'),'false','attack toggle refreshes during pause');
  await toggle.click({force:true});await ready(page);
  console.log('PASS movement costs, immediate ground heal, frozen poison, inspection, hidden tab and stacked pauses');
  const result=await page.evaluate(async()=>{
    const move=await M.useConsumableItem(movementItem.itemId,E.entites[0],{silent:true});
    const heal=await M.useConsumableItem(healItem.itemId,E.entites[0],{silent:true});
    const definitions=R.readAttackDefinitionsForEntity(E.entites[0],(await import('/js/data/attackList.js')).attackDetails);
    const key=R.attackSelectionKey(definitions[1]);R.setAttackPriority(E.entites[0],definitions,key,1);
    R.setAttackEnabled(E.entites[0],definitions,key,false);
    (await import("/js/storage/entityStorage.js")).saveEntityAttackSelection(E.entites[0]);
    return {move,heal};
  });
  assert.equal(result.move.ok,true);assert.equal(result.heal.ok,true);await ready(page);
  const before=await page.evaluate(()=>readTactical());
  assert.equal(before.entities[0].shift,poisoned.entities[0].shift+7);
  assert.ok(before.entities[0].hp>poisoned.entities[0].hp);
  assert.deepEqual(before.inventory.battleSlots,[null,null]);
  assert.equal(before.now,start.now);
  await page.screenshot({path:resolve(output,'tactical-paused.png')});
  await page.reload();await ready(page);await attach(page);
  const after=await page.evaluate(()=>readTactical());
  assert.deepEqual(after,before,'F5 restores committed moves, charges, healing, poison, attack settings and spent items');
  await page.waitForTimeout(1200);assert.deepEqual(await page.evaluate(()=>readTactical()),after);
  console.log('PASS consumables, attack settings and F5 persist with no free charge or duplicate item');
  // Queue a flee order without touching current phase/projectiles until resume; persist it too.
  // The preceding absolute pause was dismissed and saved before F5.
  await page.waitForFunction(()=>!Clock.isCombatInteractionBlocked());
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:false});
  const queued=await page.evaluate(async()=>{
    const order = await import("/js/combat/orders.js");const phase=JSON.stringify(E.entites[0]._phaseTimer);
    await order.launchOrderCycleForSide('A','runaway');
    return {same:phase===JSON.stringify(E.entites[0]._phaseTimer),order:Clock.captureCombatState().orders.pendingPlayerOrder};
  });
  assert.equal(queued.same,true);assert.deepEqual(queued.order,{side:'A',orderType:'runaway'});await ready(page);
  await page.reload();await ready(page);await attach(page);
  assert.deepEqual(await page.evaluate(()=>Clock.captureCombatState().orders.pendingPlayerOrder),queued.order);
  await page.waitForFunction(()=>!Clock.isCombatInteractionBlocked());
  await page.keyboard.press('Space');await page.waitForFunction(()=>!Clock.isCombatPaused());
  await page.waitForFunction(()=>E.entites[0].orderPhase==='orderDecision');
  assert.equal(await page.evaluate(()=>Clock.captureCombatState().orders.pendingPlayerOrder),null);
  await page.evaluate(()=>G.StopGame({preserveScene:true}));
  console.log('PASS queued flee starts only after resume and survives F5');
  await page.close();assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(done=>server.close(done));}
