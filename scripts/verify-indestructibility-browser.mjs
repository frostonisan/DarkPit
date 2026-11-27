import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.INDESTRUCTIBILITY_OUTPUT || 'outputs/indestructibility-2026-11-26/browser');
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
        type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 3, seuilUmbra: 1500, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 1000, strength: side === 'A' ? 150 : 0, intelligence: 0, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: config.speed ?? 60000, indestructibility: 150, armor: 0, physicalResistance: 0, magicalResistance: 0, resilience: 0, criticalChance: 0 },
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

const checks = [];
try {
  const page = await fixture();
  await page.evaluate(async () => {
    window.FX = await import('/js/combat/effects.js'); window.D = await import('/js/combat/statistics.js');
    window.V = await import('/js/combat/vitals.js'); window.B = E.entites[0]; window.other = E.entites[1];
    G.startGame();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => P.pauseCombat()), true);
  await page.evaluate(async () => {
    const ok = (v,m) => { if(!v) throw Error(m); };
    const rng = Math.random;
    try {
      ok(!D.attemptIndestructibility(other,B,()=>.999999),'Failed roll');
      ok(FX.indestructibilityCooldownRemaining(B)===0,'Failure cannot start cooldown');
      ok(D.attemptIndestructibility(other,B,()=>0),'Success');
      const cd=FX.indestructibilityCooldownRemaining(B);
      ok(Math.abs(cd-D.calculateIndestructibilityCooldown(B).seconds)<.0001,'Force sets duration (epoch clock precision)');
      let rolls=0;
      ok(!D.attemptIndestructibility(other,B,()=>{rolls++;return 0}),'Second simultaneous proc is blocked');
      ok(rolls===0 && FX.indestructibilityCooldownRemaining(B)===cd,'Blocked proc neither rolls nor extends deadline');
      B.stats.HP.current=100;
      const healed=(await import('/js/storage/entityStorage.js')).applyHpBattleRegenAtTurnStart(B);
      ok(healed===150 && B.stats.HP.current===250,'Cooldown does not block regeneration');
      B.stats.HP.current=990;
      ok((await import('/js/storage/entityStorage.js')).applyHpBattleRegenAtTurnStart(B)===10,'Healing respects missing HP');
      FX.clearIndestructibilityCooldown(B);
      B.stats.HP.current=1000;
      Math.random=()=>0;
      const attack={functionName:'indestructibility-test',attackId:'indestructibility-test',displayName:'Impact de contrôle',
        combatFunction:'Attaquant',attacknature:['physicalDamage'],attackRange:['melee'],attackTarget:['enemy'],
        deadTarget:['no'],physicalRatio:1,magicalRatio:0,piercingRatio:0,effets:[],selfEffects:[],type:[]};
      V.applyDamage(B,100,other,attack,{physical:100,magical:0,piercingDamage:0,hybridalDamage:0},[],[]);
      ok(B.stats.HP.current===1000 && FX.indestructibilityCooldownRemaining(B)>0,'Actual impact cancellation starts cooldown');
      V.applyDamage(B,100,other,attack,{physical:100,magical:0,piercingDamage:0,hybridalDamage:0},[],[]);
      ok(B.stats.HP.current<1000 && B.stats.HP.current>900,'Next identical impact is processed, with skin reduction');
      FX.clearIndestructibilityCooldown(B);
      const armor=await import('/js/items/armor.js');
      armor.destroyEntityArmor(B); armor.grantEntityExternalArmor(B,200);
      const hp=B.stats.HP.current;
      V.applyDamage(B,100,other,attack,{physical:100,magical:0,piercingDamage:0,hybridalDamage:0},[],[]);
      ok(B.stats.HP.current===hp && B.stats.armor.current===100,'Armor absorbs damage first: '+JSON.stringify({hpBefore:hp,hp:B.stats.HP,armor:B.stats.armor,base:B.baseStats.armor}));
      ok(FX.indestructibilityCooldownRemaining(B)===0,'Armor-protected hit cannot start cooldown');
      armor.destroyEntityArmor(B);
      B.stats.HP.current=1000;
      ok(D.attemptIndestructibility(other,B,()=>0),'Start saved lock');
      ok(D.attemptIndestructibility(B,other,()=>0),'Independent second entity lock');
      ok(FX.indestructibilityCooldownRemaining(other)===5,'Zero Force keeps five seconds');
      Clock.notifyCombatAction();
    } finally { Math.random=rng; }
  });
  checks.push('Actual impacts, armor, failed/successful rolls, simultaneous impacts, skin and regeneration during cooldown');
  await page.waitForFunction(()=>!document.querySelector('#combat-pause-control')?.disabled);
  const read=()=>page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),C=await import('/js/combat/clock.js'),A=await import('/js/combat/effects.js');
    return {now:C.clockNow(),states:C.captureCombatState().indestructibility,
      remaining:E.entites.map(e=>A.indestructibilityCooldownRemaining(e))};
  });
  const saved=await read(); assert.equal(saved.states.length,2);
  assert.equal(await page.locator('[data-entity-effect="indestructibilityCooldown"] .picto-stat.indestructibilityCooldown').count(),2,'Active cooldown uses its dedicated icon');
  await page.waitForTimeout(300); assert.deepEqual(await read(),saved,'Pause freezes both deadlines');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'&&!document.querySelector('#combat-pause-control').disabled);
  assert.deepEqual(await read(),saved,'F5 restores both deadlines without replaying cancellation');
  await page.screenshot({path:resolve(output,'cooldown-paused.png')});
  await page.keyboard.press('Space'); await page.waitForTimeout(5300);
  assert.deepEqual((await read()).remaining,[0,0]); assert.equal((await read()).states.length,0);
  const beforeSleep=await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),D=await import('/js/combat/statistics.js'),FX=await import('/js/combat/effects.js');
    const C=await import('/js/combat/control.js'),T=await import('/js/combat/timeline.js');
    const e=E.entites[0]; if(!D.attemptIndestructibility(E.entites[1],e,()=>0))throw Error('Proc after expiry');
    const now=T.combatNow(); C.addEntityControl(e,'sommeil',now,now+450);
    if(D.attemptIndestructibility(E.entites[1],e,()=>0))throw Error('Asleep cannot proc');
    return FX.indestructibilityCooldownRemaining(e);
  });
  await page.waitForTimeout(180);
  assert.ok(Math.abs((await read()).remaining[0]-beforeSleep)<.05,'Sleep freezes remaining cooldown');
  await page.waitForTimeout(450); assert.ok((await read()).remaining[0]<beforeSleep-.1);
  await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),FX=await import('/js/combat/effects.js');
    const e=E.entites[0]; (await import('/js/app/state.js')).StopGame({preserveScene:true});
    if(FX.indestructibilityCooldownRemaining(e)!==0)throw Error('Stop clears lock');
  });
  checks.push('Pause, F5, sleep, expiry, entity independence and combat stop');
  await page.close();

  const ui=await browser.newPage({viewport:{width:1440,height:1000}});
  ui.on('pageerror',error=>errors.push(error.message));
  const mount=async()=>{
    await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(ui);
    await ui.evaluate(async()=>{
      const E=await import('/js/entities/runtime.js'),Store=await import('/js/storage/gameStorage.js');
      const Cards=await import('/js/ui/codex/index.js'),Helpers=await import('/js/ui/statistics/helpers.js');
      window.levelRunning='worldmap'; Store.setAdminMode(true); (await import('/js/app/state.js')).refreshStageAccess();
      const e={id:998872,name:'Indestructibilité',type:'sbire',side:'A',awakening:3,seuilUmbra:150,
        level:30,baseStats:{HP:1000,indestructibility:150,strength:150,hpBattleRegen:50,vigueur:50,speed:10000},attacks:['autoAttack'],stuff:{}};
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      E.entites.splice(0,E.entites.length,e); Store.saveToLocalStorage('selectedArmyA',[e]);
      const host=document.createElement('main'); host.id='indestructibility-audit';
      host.style.cssText='position:fixed;inset:0;overflow:auto;background:#160d24'; document.getElementById('game-shell').append(host);
      Cards.createCodexEntityScan(e,host,'codex-entity_'+e.id);
      window.audit={e,host,open(key='indestructibility'){
        Helpers.closeOpenHelpers(); host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
        host.querySelector('.section-content.stats [data-mode="umbra"]').click();
        [...host.querySelectorAll('.stat-container[data-stat="'+key+'"]')].find(n=>n.getClientRects().length).click();
      }}; audit.open();
    });
  };
  await ui.goto('http://127.0.0.1:'+server.address().port+'/index.html'); await mount();
  const card=ui.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])'); await card.waitFor({state:'visible'});
  assert.equal(await card.locator('[data-umbra-passive]').count(),2);
  assert.equal(await card.locator('[data-umbra-passive="indestructibilityTotal"]').count(),1);
  assert.equal(await card.locator('[data-umbra-passive="indestructibleSkin"] .umbra-passive-icon').count(),1);
  await card.locator('[data-helper-entry="indestructibilityReductionTotal"]').first().click();
  const skinDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="indestructibleSkin"]');
  await skinDetail.waitFor({state:'visible'});
  assert.match(await skinDetail.locator('.stat-hover-header').innerText(),/Passive exclusive.*Indestructibilité/);
  await ui.keyboard.press('Escape');
  assert.match(await card.locator('[data-helper-value="indestructibilityBonus"]').innerText(),/73[,.]16/);
  assert.match(await card.locator('[data-helper-value="hpBattleRegenPercent"]').innerText(),/\+\s*15\s*%/,'Card shows only the Umbra regeneration despite the native 50%');
  assert.match(await card.locator('[data-helper-value="indestructibilityCooldown"]').innerText(),/3[,.]24/);
  assert.ok(await card.locator('.picto-stat.indestructibilityCooldown').first().evaluate(n=>getComputedStyle(n).backgroundImage.includes('picto-cd-indestructible.svg')));
  const toggle=key=>card.locator('[data-umbra-detail-toggle="'+key+'"]').first();
  await toggle('indestructibilityBonus').click();
  await ui.evaluate(()=>audit.open());
  assert.equal(await toggle('indestructibilityBonus').getAttribute('aria-expanded'),'true');
  assert.equal(await toggle('indestructibilityCooldown').getAttribute('aria-expanded'),'false');
  await ui.reload(); await mount();
  assert.equal(await toggle('indestructibilityBonus').getAttribute('aria-expanded'),'true');
  assert.equal(await toggle('indestructibilityCooldown').getAttribute('aria-expanded'),'false');
  await toggle('indestructibilityCooldown').click();
  const chance=card.locator('[data-umbra-calculation-details="indestructibilityBonus"]');
  assert.match(await chance.innerText(),/0,4877/,'Compact coefficient keeps the actual percentage readable');
  assert.equal(await chance.locator('.strength,.agility,.intelligence').count(),0,'Chance has only Umbra ratio');
  const cd=card.locator('[data-umbra-calculation-details="indestructibilityCooldown"]');
  assert.ok(await cd.locator('.strength').count()>0);
  assert.equal(await cd.locator('.agility,.intelligence').count(),0,'Cooldown uses Force only');
  await cd.locator('.picto-stat.strength').first().click();
  await ui.locator('[data-umbra-detail][data-helper-picto-subject="strength"]').waitFor({state:'visible'});
  assert.match(await ui.locator('[data-umbra-detail][data-helper-picto-subject="strength"] .stat-hover-header').innerText(),/Attribut : Force/);
  await ui.keyboard.press('Escape');
  await card.locator('[data-helper-value="indestructibilityCooldown"]').click();
  const cdDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="indestructibilityCooldown"]');
  await cdDetail.waitFor({state:'visible'}); assert.match(await cdDetail.innerText(),/Durée : 5/);
  await ui.keyboard.press('Escape');
  await toggle('hpBattleRegenPercent').click();
  const regenCalculation=card.locator('[data-umbra-calculation-details="hpBattleRegenPercent"]');
  assert.ok(await regenCalculation.locator('.indestructibility').count()>0);
  assert.ok(await regenCalculation.locator('.strength').count()>0);
  assert.equal(await regenCalculation.locator('.hpBattleRegen').count(),0,'Inline formula has no autonomous 50% source');
  await toggle('hpBattleRegenPercent').click();
  await card.locator('[data-helper-value="hpBattleRegenPercent"]').hover();
  const regenDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="hpBattleRegen"]');
  await regenDetail.waitFor({state:'visible'});
  assert.match(await regenDetail.locator('.helper-umbra-total').innerText(),/\+\s*15\s*%/);
  assert.match(await regenDetail.locator('.helper-score-total').innerText(),/65\s*%/);
  assert.match(await regenDetail.innerText(),/650\s*HP/);
  await regenDetail.screenshot({path:resolve(output,'regeneration-total-helper.png'),animations:'disabled'});
  await ui.keyboard.press('Escape');
  for(const width of [1440,390]){
    await ui.setViewportSize({width,height:1000}); await ui.mouse.move(1,1); await ui.waitForTimeout(1100);
    assert.ok(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+2),'No horizontal overflow');
    const positions=await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>{
      const row=n.closest('.umbra-effect-row'),heading=row.querySelector('.umbra-effect-heading,.umbra-passive-value');
      const b=n.getBoundingClientRect(),p=row.getBoundingClientRect();
      return b.top>=heading.getBoundingClientRect().bottom-1 && Math.abs(b.left+b.width/2-p.left-p.width/2)<2 && getComputedStyle(n).textAlign==='center';
    }));
    assert.ok(positions.length===2&&positions.every(Boolean),'Independent calculations centered below each line');
    assert.ok(await card.locator('.umbra-effect-name.hpBattleRegen > [data-stat-state="X"]').evaluate(n=>getComputedStyle(n).backgroundImage.includes('linear-gradient')));
    assert.ok(await card.locator('.umbra-effect-name:is(.indestructibilityTotal,.indestructibleSkin) > span:not(.picto-stat):not(.umbra-passive-icon), .helper-figure > span:not(.picto-stat)').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).backgroundImage==='none')));
    assert.doesNotMatch(await card.innerText(),/Détail (?:du|des) calcul/);
    await card.screenshot({path:resolve(output,'indestructibility-'+width+'.png'),animations:'disabled'});
  }
  await ui.setViewportSize({width:1440,height:1000});
  await ui.evaluate(()=>audit.open('vigueur'));
  assert.equal(await card.locator('[data-umbra-detail-toggle]').first().getAttribute('aria-expanded'),'false');
  await ui.evaluate(()=>audit.open()); await toggle('indestructibilityBonus').click();
  await ui.evaluate(()=>audit.open());
  assert.equal(await toggle('indestructibilityBonus').getAttribute('aria-expanded'),'false');
  assert.equal(await toggle('indestructibilityCooldown').getAttribute('aria-expanded'),'true');
  const version=JSON.parse(await readFile('package.json','utf8')).gameVersion;
  assert.ok((await ui.locator('#game-version').innerText()).includes(version));
  checks.push('Cards, icon, Force/Indestructibility separation, HP return, independent preferences, desktop/mobile and version');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,checks},null,2));
  console.log('Indestructibility browser checks passed: '+checks.join('; '));
} finally { await browser.close(); await new Promise(done=>server.close(done)); }

