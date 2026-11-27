import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/astralite-common-cooldown/browser');
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
        baseStats: { HP: 1000, strength: 0, intelligence: 0, agility: side === 'A' ? 150 : 0, physicalDamage: 40, magicalDamage: 40,
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

const checks=[];
try {
 const page=await fixture();
 await page.evaluate(async()=>{
  window.A=await Promise.all([import("/js/combat/effects.js"), import("/js/rendering/auras.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));window.D=await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
  window.Damage=await Promise.all([import("/js/combat/vitals.js"), import("/js/rendering/vitalFeedback.js"), import("/js/rendering/hud.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));window.Armor=await import('/js/items/armor.js');
  window.B=E.entites[0];window.enemy=E.entites[1];
  window.hit=(nature='magicalDamage',amount=50)=>({attackId:'audit-hit',functionName:'audit-hit',displayName:'Audit',combatFunction:'Attaquant',attacknature:[nature],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],preparationTime:100,executionTime:100,recoveryTime:100,cooldown:1000,physicalRatio:1,magicalRatio:1,piercingRatio:0,type:[],effets:[],selfEffects:[],forceDamageSources:{[nature==='magicalDamage'?'magical':'physical']:amount}});
  Math.random=()=>0;window.startedAt=Clock.clockNow();G.startGame();
 });
 await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>A.isAstralBodyActive(B)),false,'No immediate random roll at combat start');
 await page.waitForFunction(()=>A.isAstralBodyActive(B),null,{timeout:6000});
 const body=await page.evaluate(()=>structuredClone(A.getAstralityRuntime(B).body));
 assert.ok(body.startedAt-await page.evaluate(()=>startedAt)>=2900,'First roll after 3s');
 await page.evaluate(()=>P.pauseCombat());
 const outcomes=await page.evaluate(()=>{
  const ok=(v,msg)=>{if(!v)throw Error(msg)};
  Armor.grantEntityExternalArmor(B,20);const hp=B.stats.HP.current,armor=B.stats.armor.current;
  const magic=hit();magic.effets=['silence'];magic.effectOverrides={silence:{effectDuration:5}};
  const r=Damage.applyDamage(B,50,enemy,magic,{magical:50},[{stat:'HP',value:5}]);
  ok(r.hit===false&&r.astralBody,'Pure magic misses');ok(B.stats.HP.current===hp&&B.stats.armor.current===armor,'No damage or armor consumption');
  ok(!B.activeControls?.silence,'Miss does not apply silence');
  ok(getComputedStyle(document.getElementById(`spriteContainer_${B.id}`)).opacity==='0.5','Translucent sprite');
  ok(!A.blocksAstralSpell(B,{...magic,combatFunction:'Support'}),'Friendly healing unaffected');
  ok(!A.blocksAstralSpell(B,{...magic,type:['alteration']}),'Existing periodic damage is unaffected');
  const mixed={...magic,attacknature:['hybridalDamage'],forceDamageSources:{physical:25,magical:25}};
  ok(!A.blocksAstralSpell(B,mixed),'Hybrid magic unchanged');
  Damage.applyDamage(B,25,enemy,hit('physicalDamage',25),{physical:25});
  ok(B.stats.HP.current<hp||B.stats.armor.current<armor,'Physical attack still hits');
  Armor.destroyEntityArmor(B);B.stats.HP.current=10;
  Damage.applyDamage(B,100,enemy,hit('physicalDamage',100),{physical:100});
  ok(B.stats.HP.current===1&&A.isAstralReturnActive(B),'Fatal survival starts Return');
  ok(A.astralCooldownRemaining(B)<5,'Agility reduces the paused Umbra cooldown');
  ok(A.getAstralityRuntime(B).return.expiresAt===A.getAstralityRuntime(B).survivalReadyAt,'One shared heal/cooldown deadline');
  ok(D.attemptAstrality(enemy,B)===false,'Survival disabled during Return');
  enemy.baseStats.fatalSurvival=99;E.recomputeEntityStats(enemy,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
  enemy.stats.HP.current=10;Damage.applyDamage(enemy,100,B,hit('physicalDamage',100),{physical:100});
  ok(enemy.stats.HP.current===1&&A.astralCooldownRemaining(enemy)===5,'Autonomous survival starts exactly five seconds of cooldown');
  return ['Pure magical miss cancels damage/malus, preserves armor; mixed/physical unchanged','Fatal survival starts progressive healing and blocks retrigger'];
 });checks.push(...outcomes);
 // Saving a tactical order after manual fixture damage refreshes the existing pause snapshot.
 await page.evaluate(()=>Clock.notifyCombatAction());
 await page.waitForTimeout(250);
 const read=()=>page.evaluate(async()=>{
  const E = await import("/js/entities/runtime.js"),A = await import("/js/combat/effects.js"),C = await import("/js/combat/clock.js");
  const e=E.entites.find(e=>e.side==='A'),standalone=E.entites.find(e=>e.side==='B');return {hp:e.stats.HP.current,now:C.clockNow(),state:A.getAstralityRuntime(e),opacity:getComputedStyle(document.getElementById(`spriteContainer_${e.id}`)).opacity,
   autonomousState:A.getAstralityRuntime(standalone),autonomousRemaining:A.astralCooldownRemaining(standalone)};
 });
 const saved=await read();await page.waitForTimeout(400);assert.deepEqual(await read(),saved,'Pause freezes healing and both deadlines');
 await page.screenshot({path:resolve(output,'astral-body-paused.png')});
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'&&!document.querySelector('#combat-pause-control').disabled);
 assert.deepEqual(await read(),saved,'F5 restores body + healing and exact deadlines');
 assert.equal((await read()).autonomousRemaining,5,'F5 keeps the full paused autonomous cooldown');
 await page.keyboard.press('Space');
 await page.waitForTimeout(5300);
 const finished=await read();assert.equal(finished.hp,101,'Exactly 100 HP restored, no duplicate ticks');
 assert.ok(!finished.state.return&&!finished.state.body,'Both effects expire');
 assert.equal(finished.opacity,'1','Original sprite opacity restored');
 assert.ok(finished.state.nextCheckAt>finished.now,'Next roll waits 3s after body expiry');
 assert.equal(finished.autonomousRemaining,0,'Autonomous cooldown expires after combat resumes');
 assert.equal(finished.autonomousState,null,'Expired autonomous cooldown is cleaned up');
 checks.push('Pause/F5: healing, body and autonomous cooldown restored exactly, cooldown expires normally');
 await page.evaluate(async()=>{
  const E = await import("/js/entities/runtime.js"),A = await import("/js/combat/effects.js"),D = await import("/js/combat/statistics.js");
  const e=E.entites.find(e=>e.side==='B');e.baseStats.fatalSurvival=99;E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
  Math.random=()=>0;if(!D.attemptAstrality(null,e))throw Error('Standalone survival fails '+JSON.stringify({chance:D.calculateAstralityTotal(e),stats:e.stats,base:e.baseStats,locked:A.getAstralityRuntime(e)}));
  if(A.startAstralReturn(e)||A.isAstralBodyActive(e))throw Error('Autonomous survival wrongly grants Umbra effects');
  const own=E.entites.find(e=>e.side==='A');A.startAstralReturn(own);own.stats.HP.current=own.stats.HP.max;
  if(!A.isAstralReturnActive(own)||D.attemptAstrality(e,own))throw Error('Full HP wrongly removes lock');
  (await import("/js/app/state.js")).StopGame({preserveScene:true});
  if(A.getAstralityRuntime(own))throw Error('Combat stop leaves timers');
 });checks.push('Autonomous survival has no Return/Body; full HP keeps lock; combat stop clears timers');
 await page.close();
 const ui=await browser.newPage({viewport:{width:1440,height:1000}});ui.on('pageerror',e=>errors.push(e.message));
 await ui.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(ui);
 await ui.evaluate(async()=>{
  const E = await import("/js/entities/runtime.js"),G = await import("/js/storage/gameStorage.js"),UI=await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))),U = await import("/js/entities/progression.js");
  window.levelRunning='worldmap';G.setAdminMode(true);(await import("/js/app/state.js")).refreshStageAccess();
  const e={id:986743,name:'Astralité',type:'sbire',side:'A',awakening:3,level:{current:30,max:250},baseStats:{HP:1000,astrality:50,strength:50,intelligence:50,agility:0,speed:10000},attacks:['autoAttack'],stuff:{}};
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});E.entites.splice(0,E.entites.length,e);G.saveToLocalStorage('selectedArmyA',[e]);U.setPlayerExperience(1000000);
  const host=document.createElement('main');host.style.cssText='position:fixed;inset:0;overflow:auto;background:#160d24';document.getElementById('game-shell').append(host);UI.createCodexEntityScan(e,host,`codex-entity_${e.id}`);
  window.audit={UI,host,e,open(mode='stat'){UI.closeOpenHelpers();host.querySelector(`.codex-inner-menu:has(.codex-${mode})`).click();if(mode==='stat')host.querySelector('.section-content.stats [data-mode="umbra"]').click();[...host.querySelectorAll('.stat-container[data-stat="astrality"]')].find(n=>n.getClientRects().length).click();}};audit.open();
 });
 const root=ui.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');await root.waitFor({state:'visible'});
 assert.equal(await root.locator('[data-umbra-capacity="astralCooldown"]').count(),1);assert.equal(await root.locator('[data-umbra-capacity="astralReturn"]').count(),1);assert.equal(await root.locator('[data-umbra-passive="astralBody"]').count(),1);
 assert.match(await root.innerText(),/Survie fatale[\s\S]*Retour astral[\s\S]*Corps astral/);
 for(const width of [1440,390]){
  await ui.setViewportSize({width,height:1000});const w=await root.evaluate(e=>e.getBoundingClientRect().width);
  await root.locator('[data-umbra-info-toggle]').click();assert.ok(await root.evaluate(e=>e.getBoundingClientRect().width)>=w);assert.equal(await ui.locator('[data-umbra-detail]').count(),0);await root.locator('[data-umbra-info-toggle]').click();assert.ok(Math.abs(await root.evaluate(e=>e.getBoundingClientRect().width)-w)<1);
  assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+2),'No horizontal overflow');
  await ui.mouse.move(2,2);await root.screenshot({path:resolve(output,`astralite-card-${width}.png`)});
 }
 await ui.setViewportSize({width:1440,height:1000});
 await root.locator('[data-helper-picto-stat="astralReturn"]').first().click();
 await ui.locator('[data-umbra-detail][data-helper-picto-subject="astralReturn"]').waitFor({state:'visible'});
 assert.match(await ui.locator('[data-helper-picto-subject="astralReturn"]').innerText(),/Passive exclusive d’Astralité/);assert.equal(await ui.locator('[data-helper-picto-subject="astralReturn"] [data-helper-technical]').count(),0);
 await ui.keyboard.press('Escape');await root.locator('[data-helper-value="astralReturn"]').click();assert.equal(await ui.locator('[data-helper-picto-subject="astralReturn"] [data-helper-technical]').count(),1);await ui.keyboard.press('Escape');
 await root.locator('[data-helper-picto-stat="astralCooldown"]').first().click();
 await ui.locator('[data-umbra-detail][data-helper-picto-subject="astralCooldown"]').waitFor({state:'visible'});
 assert.equal(await ui.locator('[data-helper-picto-subject="astralCooldown"] [data-helper-technical]').count(),0);
 await ui.keyboard.press('Escape');await root.locator('[data-helper-value="astralCooldown"]').first().click();assert.equal(await ui.locator('[data-helper-picto-subject="astralCooldown"] [data-helper-technical]').count(),1);
 await ui.evaluate(()=>audit.open('soul'));assert.equal(await root.locator('[data-umbra-passive="astralBody"]').count(),1);
 checks.push('Codex and level-up cards, nested Return helper, compact desktop/mobile rendering');
 const lab=await browser.newPage();lab.on('pageerror',e=>errors.push(e.message));
 await lab.goto(`http://127.0.0.1:${server.address().port}/index-14.html`);
 await lab.locator('[data-catalog="umbras"]>summary').click();await lab.locator('[data-add="umbra-astrality"]').click();
 await lab.locator('input[data-group="umbras"][data-key="astrality"]').fill('50');
 await lab.locator('input[data-group="attributes"][data-key="strength"]').fill('50');await lab.locator('input[data-group="attributes"][data-key="intelligence"]').fill('50');
 await lab.locator('#mode-maj').click();assert.match(await lab.locator('[data-umbra-breakdown="astralReturn"]').innerText(),/Survie|Soin/);
 assert.match(await lab.locator('[data-umbra-breakdown="astralBody"]').innerText(),/3 s/);
 await lab.screenshot({path:resolve(output,'astralite-index14.png'),fullPage:true});
 for(const key of ['fatalSurvival','astralReturn','astralBody']){
  await lab.locator('#conversion-stat').selectOption(key);
  assert.equal(await lab.locator('#conversion-chart').getAttribute('data-stat'),key);
  assert.match(await lab.locator('#conversion-result').innerText(),key==='astralReturn'?/Force/:/Astralité/);
 }
 await lab.locator('#mode-current').click();await lab.locator('#mode-maj').click();assert.equal(await lab.locator('input[data-group="umbras"][data-key="astrality"]').inputValue(),'50');
 checks.push('Index 14: all three effects, shared live balance, preserved mode inputs');
 assert.deepEqual(errors,[]);await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}finally{await browser.close();await new Promise(done=>server.close(done));}
