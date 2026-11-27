import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/combat-visibility');
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

// Headless Chromium keeps tabs visible. Dispatch the browser's visibility event
// with its read-only visibility properties controlled by the fixture.
async function visibilityFixture(page) {
  await page.evaluate(async () => {
    window.Clock = await import("/js/combat/clock.js");
    window.P = await import("/js/combat/pause.js");
    window.G = await import("/js/app/state.js");
    window.E = await import("/js/entities/runtime.js");
    window.testHidden = false; window.resumes = []; window.visibleAt = performance.now();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => testHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => testHidden ? 'hidden' : 'visible' });
    window.setTabHidden = hidden => {
      testHidden = hidden; if (!hidden) visibleAt = performance.now();
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.addEventListener('combatResumed', () => resumes.push({ afterReturn: performance.now() - visibleAt, hidden: document.hidden }));
  });
}
const ready = page => page.waitForFunction(() => Clock.isCombatPaused() && !P.isCombatCheckpointBusy()
  && sessionStorage.getItem('DarkPitPausedCombat:available') === '1');
const snapshot = page => page.evaluate(() => ({now:Clock.clockNow(),entities:E.entites.map(e=>({hp:e.stats.HP.current,
  turn:e.turnCount,phase:e._combatAction,prep:e.preparationTime,speed:e.speedTimer})),
  projectiles:[...document.querySelectorAll('.projectile-parent')].map(e=>e.style.transform)}));
try {
  const page=await fixture({A:{range:'range'},B:{range:'range'}});
  await visibilityFixture(page);
  const resumeButton=page.getByRole('button',{name:'Reprendre la partie',exact:true});
  await page.evaluate(()=>G.startGame());
  await page.waitForSelector('.projectile-parent');
  await page.evaluate(()=>setTabHidden(true));
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'hide freezes synchronously');
  await ready(page);const before=await snapshot(page);
  assert.equal(await resumeButton.isDisabled(),true,'Cannot resume while hidden');
  await page.waitForTimeout(1600);assert.deepEqual(await snapshot(page),before,'hidden combat and projectiles stay frozen');
  await page.evaluate(()=>setTabHidden(false));await page.waitForTimeout(3500);
  assert.deepEqual(await snapshot(page),before,'Returning never resumes automatically, even past the old countdown');
  await page.evaluate(()=>setTabHidden(true));await page.waitForTimeout(1200);
  assert.deepEqual(await snapshot(page),before,'Leaving again keeps the combat frozen');
  await page.evaluate(()=>setTabHidden(false));
  assert.equal(await page.locator('.pause-title').textContent(),'JEU EN PAUSE');
  assert.equal(await page.locator('.pause-countdown').count(),0,'No countdown remains');
  assert.equal(await page.locator('.pause-title').evaluate(node=>getComputedStyle(node).color),'rgb(229, 199, 118)','Absolute title stays yellow');
  assert.equal(await page.locator('.pause-banner').evaluate(node=>getComputedStyle(node).filter),'none','Yellow banner is not converted to grayscale');
  assert.match(await page.locator('#combat-pause-fx').evaluate(node=>getComputedStyle(node).backdropFilter),/grayscale\(1\).*blur\(2px\)/,'Scene keeps its grayscale and slight blur');
  assert.equal(await resumeButton.isVisible(),true);
  assert.equal(await resumeButton.isEnabled(),true);
  assert.equal(await page.locator('#combat-pause-control').isVisible(),false,'Only the central resume control is shown');
  await page.reload();
  await page.waitForSelector('#combat-pause-fx.is-absolute #combat-pause-resume:not(:disabled)');
  await visibilityFixture(page);
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:false,absolute:true},'F5 restores the absolute reason, not a tactical pause');
  assert.equal(await page.evaluate(()=>Clock.isCombatInteractionBlocked()),true,'Absolute pause still blocks tactical actions after F5');
  assert.deepEqual(await snapshot(page),before,'Absolute F5 restores the frozen combat values and projectiles');
  await page.waitForTimeout(1700);
  assert.deepEqual(await snapshot(page),before,'Absolute F5 never resumes automatically');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'Space on the page cannot bypass the restored absolute pause');
  await resumeButton.click();
  await page.waitForFunction(()=>!Clock.isCombatPaused());
  const resumes=await page.evaluate(()=>resumes);
  assert.equal(resumes.length,1);assert.equal(resumes[0].hidden,false);
  console.log('PASS frozen combat and projectiles, no countdown or automatic resume, central resume button');

  await page.evaluate(()=>{
    window.blockedClicks=0;
    for(const type of ['click','dblclick']) document.addEventListener(type,event=>{
      if(!event.target.closest('#combat-pause-resume')) blockedClicks++;
    },true);
    setTabHidden(true);
  });
  await ready(page);
  await page.evaluate(()=>document.body.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true})));
  await page.evaluate(()=>document.getElementById('combat-pause-resume').click());
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'Double-click cannot unpause a hidden tab');
  await page.evaluate(()=>setTabHidden(false));
  await page.mouse.dblclick(30,700);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'Double-click and Space on the board cannot bypass absolute pause');
  assert.equal(await page.evaluate(()=>blockedClicks),0,'Clicks do not reach the board underneath');
  await page.keyboard.press('Tab');
  assert.equal(await resumeButton.evaluate(node=>document.activeElement===node),true,'Resume is keyboard-accessible');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!Clock.isCombatPaused());
  console.log('PASS blocked background clicks, removed double-click shortcut, keyboard button activation');

  await page.evaluate(()=>P.pauseCombat());await ready(page);
  await page.evaluate(()=>setTabHidden(true));
  await page.evaluate(()=>setTabHidden(false));
  await ready(page);await page.reload();
  await page.waitForSelector('#combat-pause-fx.is-absolute #combat-pause-resume:not(:disabled)');
  await visibilityFixture(page);
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:true},'F5 preserves both stacked pause reasons');
  await resumeButton.click();
  await ready(page);
  assert.equal(await page.evaluate(()=>Clock.isCombatInteractionBlocked()),false);
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'Returning retains an existing tactical pause');
  assert.equal(await resumeButton.isVisible(),false,'Absolute control disappears in tactical pause');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'
    && !document.querySelector('#combat-pause-control').disabled);
  await visibilityFixture(page);
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:false},'F5 after dismissing the absolute layer restores only tactical pause');
  await page.keyboard.press('Space');await page.waitForFunction(()=>!Clock.isCombatPaused());
  console.log('PASS stacked pause reasons, absolute-to-tactical save, repeated F5 and Space resume');

  // A tab change during checkpoint deletion must not unfreeze a hidden fight
  // or lose its F5 checkpoint.
  await page.evaluate(()=>setTabHidden(true));await ready(page);
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.delete;
    window.hideDuringDelete=true;
    IDBObjectStore.prototype.delete=function(...args){
      const request=original.apply(this,args);
      if(this.name==='pause' && hideDuringDelete){
        hideDuringDelete=false;request.addEventListener('success',()=>setTabHidden(true),{once:true});
      }
      return request;
    };
    setTabHidden(false);
  });
  await resumeButton.click();
  await page.waitForFunction(()=>testHidden && !P.isCombatCheckpointBusy());
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true);
  await page.reload();
  await page.waitForSelector('#combat-pause-fx.is-absolute #combat-pause-resume:not(:disabled)');
  await visibilityFixture(page);await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'F5 restores in pause, including interrupted button resume');
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:false,absolute:true},'Interrupted resume keeps the absolute reason');
  console.log('PASS interrupted checkpoint deletion and paused F5 restoration');

  await resumeButton.click();await page.waitForFunction(()=>!Clock.isCombatPaused());
  await page.evaluate(()=>{
    Clock.trackCombatOperation(new Promise(resolve=>setTimeout(resolve,1800)));
    setTabHidden(true);setTabHidden(false);
  });
  assert.equal(await resumeButton.isDisabled(),true,'Resume waits for the checkpoint');
  await ready(page);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'Finishing the save never resumes automatically');
  await resumeButton.click();
  await page.waitForFunction(()=>!Clock.isCombatPaused());
  console.log('PASS returning during checkpoint saving waits for an explicit click');

  await page.evaluate(()=>{
    window.beforeConsole=Clock.clockNow();
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),false,'Visible page keeps running when DevTools takes focus');
  assert.ok(await page.evaluate(()=>Clock.clockNow()>beforeConsole),'Combat time continues while the console has focus');
  await page.evaluate(()=>P.pauseCombat());await ready(page);
  assert.deepEqual(await page.evaluate(()=>P.getCombatPauseReasons()),{tactical:true,absolute:false},'Console focus does not convert tactical pause into absolute pause');
  assert.equal(await page.evaluate(()=>P.resumeCombat()),true,'Tactical pause can resume while the page is visible without focus');
  await page.evaluate(()=>setTabHidden(true));await ready(page);
  await page.evaluate(()=>setTabHidden(false));
  assert.equal(await resumeButton.isEnabled(),true,'Returning to a visible page enables the button even with DevTools focused');
  await resumeButton.focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>!Clock.isCombatPaused());
  await page.evaluate(()=>{delete document.hasFocus;window.dispatchEvent(new Event('focus'));});
  console.log('PASS console focus keeps visible combat running, tactical pause works, hidden tab still pauses');

  await page.evaluate(()=>{window.__combatSimulation=true;setTabHidden(true);});
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),false,'offline simulations do not auto-pause');
  await page.evaluate(()=>{window.__combatSimulation=false;setTabHidden(false);});

  await page.evaluate(()=>setTabHidden(true));await ready(page);
  await page.evaluate(()=>setTabHidden(false));await page.waitForTimeout(150);
  await page.evaluate(()=>G.StopGame({preserveScene:true}));
  assert.equal(await page.evaluate(()=>G.gameStarted),false);
  assert.equal(await page.locator('#combat-pause-control').count(),0);
  assert.equal(await page.locator('#combat-pause-resume').count(),0);
  await page.evaluate(()=>setTabHidden(true));
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),false,'no pause outside combat');
  await page.evaluate(()=>{G.startGame();});await ready(page);
  assert.equal(await page.evaluate(()=>Clock.isCombatPaused()),true,'combat started in hidden tab is paused');
  await page.evaluate(()=>setTabHidden(false));
  await resumeButton.click();await page.waitForFunction(()=>!Clock.isCombatPaused());
  await page.evaluate(()=>G.StopGame({preserveScene:true}));
  await page.close();
  assert.deepEqual(errors,[]);
  console.log('PASS stop/end cleanup, no pause outside combat, hidden start, simulation isolation');
} finally {await browser.close();await new Promise(done=>server.close(done));}
