import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.TRANSCENDENCE_OUTPUT || 'outputs/transcendence-2026-11-26/browser');
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
        baseStats: { HP: 1000, strength: 0, intelligence: side === 'A' ? 150 : 1500, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: config.speed ?? 60000, extraLife: 5, fadedLife: 2, eternalLife: 2, transcendence: side === 'A' ? 150 : 0, transcendenceTotal: side === 'B' ? 99 : 0 },
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
    window.FX=await import('/js/combat/effects.js'); window.D=await import('/js/combat/statistics.js');
    window.V=await import('/js/combat/vitals.js'); window.B=E.entites[0]; window.other=E.entites[1];
    G.startGame();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>P.pauseCombat()),true,'Pause before deterministic life probes');
  await page.evaluate(async()=>{
    const ok=(v,m)=>{if(!v)throw Error(m)};
    const current=(e,k)=>Number(e.stats[k]?.current??e.stats[k]??0);
    for(const pool of ['fadedLife','extraLife','eternalLife']) {
      FX.clearTranscendentalCooldown(B);
      B.baseStats[pool]=2; E.recomputeEntityStats(B,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      const before=current(B,pool); ok(before>0,'Available '+pool);
      const preview=(await import('/js/ui/statistics/details.js')).calculateStatsDisplay('transcendence',B)
        .resurrectionHealing.find(row=>row.pool===pool).restoredHP;
      Math.random=()=>0; B.stats.HP.current=0;
      ok(V.attemptExtraLife(B,{pool}),'Resurrection '+pool);
      ok(current(B,pool)===before,'Successful protection preserves '+pool);
      ok(B.stats.HP.current>0,'Protection still heals through ordinary resurrection');
      ok(B.stats.HP.current===preview,'Displayed HP match the actual resurrection for '+pool);
      const duration=FX.transcendentalCooldownRemaining(B);
      ok(Math.abs(duration-D.calculateTranscendentalCooldown(B).seconds)<.0001,'Actual deadline uses Intelligence');
      B.stats.HP.current=0;
      ok(V.attemptExtraLife(B,{pool}),'Resurrection during cooldown '+pool);
      ok(current(B,pool)===before-1,'Cooldown forces normal consumption '+pool);
      ok(FX.transcendentalCooldownRemaining(B)===duration,'Blocked proc never extends cooldown');
    }
    FX.clearTranscendentalCooldown(B); Math.random=()=>.999999;
    const before=current(B,'extraLife'); B.stats.HP.current=0;
    ok(V.attemptExtraLife(B,{pool:'extraLife'}),'Failed protection still resurrects');
    ok(current(B,'extraLife')===before-1,'Failed roll consumes life');
    ok(FX.transcendentalCooldownRemaining(B)===0,'Failed roll has no cooldown');
    const stocks=await import('/js/items/resourceStocks.js');
    while(stocks.consumeFadedLife(B)) {}
    Math.random=()=>0; ok(!V.attemptExtraLife(B,{pool:'fadedLife'}),'No resource cannot resurrect');
    ok(FX.transcendentalCooldownRemaining(B)===0,'No resource cannot start cooldown');
    for (const [umbra, intelligence, healing] of [[0,1500,200],[1,20,400],[0,20,200]]) {
      other.baseStats.transcendence=umbra; other.baseStats.intelligence=intelligence;
      E.recomputeEntityStats(other,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      FX.clearTranscendentalCooldown(other); other.stats.HP.current=0;
      ok(V.attemptExtraLife(other,{pool:'extraLife'}),'Extra-life resurrection with Umbra '+umbra);
      ok(other.stats.HP.current===healing,'Actual healing follows the current Umbra requirement');
    }
    FX.clearTranscendentalCooldown(other);
    ok(D.attemptTranscendenceConsoProtection(B,()=>0),'Start final Umbra lock');
    ok(D.attemptTranscendenceConsoProtection(other,()=>0),'Autonomous protection');
    ok(FX.transcendentalCooldownRemaining(other)===5,'Autonomous Intelligence cannot shorten cooldown');
    Clock.notifyCombatAction();
  });
  await page.waitForFunction(()=>!document.querySelector('#combat-pause-control')?.disabled);
  checks.push('All three life pools; improved healing requires Transcendence and disappears when the Umbra is removed');
  const read=()=>page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),C=await import('/js/combat/clock.js'),A=await import('/js/combat/effects.js');
    return {now:C.clockNow(), states:C.captureCombatState().transcendence,
      remaining:E.entites.map(e=>A.transcendentalCooldownRemaining(e))};
  });
  const saved=await read(); assert.equal(saved.states.length,2);
  await page.waitForTimeout(300); assert.deepEqual(await read(),saved,'Pause freezes deadlines');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'&&!document.querySelector('#combat-pause-control').disabled);
  assert.deepEqual(await read(),saved,'Reload restores both cooldowns without replaying protection');
  await page.screenshot({path:resolve(output,'cooldown-paused.png')});
  await page.keyboard.press('Space'); await page.waitForTimeout(5300);
  const expired=await read(); assert.deepEqual(expired.remaining,[0,0]); assert.equal(expired.states.length,0,'Expiry releases states');
  const beforeSleep=await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),D=await import('/js/combat/statistics.js'),A=await import('/js/combat/effects.js');
    const C=await import('/js/combat/control.js'),T=await import('/js/combat/timeline.js');
    const e=E.entites[0]; if(!D.attemptTranscendenceConsoProtection(e,()=>0))throw Error('New proc after expiry');
    const now=T.combatNow(); C.addEntityControl(e,'sommeil',now,now+450);
    return A.transcendentalCooldownRemaining(e);
  });
  await page.waitForTimeout(200);
  const asleep=await read(); assert.ok(Math.abs(asleep.remaining[0]-beforeSleep)<.04,'Sleep freezes remaining cooldown');
  await page.waitForTimeout(450);
  assert.ok((await read()).remaining[0]<beforeSleep-.10,'Cooldown resumes after sleep');
  await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),A=await import('/js/combat/effects.js');
    const e=E.entites[0];
    (await import('/js/app/state.js')).StopGame({preserveScene:true});
    if(A.transcendentalCooldownRemaining(e)!==0)throw Error('Stop must clear cooldown');
  });
  checks.push('Pause, F5, sleep, expiry and combat stop preserve/clean the single shared cooldown');
  await page.close();

  const ui=await browser.newPage({viewport:{width:1440,height:1000}});
  ui.on('pageerror',error=>errors.push(error.message));
  const mount=async()=>{
    await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(ui);
    await ui.evaluate(async()=>{
      const E=await import('/js/entities/runtime.js'),Store=await import('/js/storage/gameStorage.js');
      const Cards=await import('/js/ui/codex/index.js'),Helpers=await import('/js/ui/statistics/helpers.js');
      const Ui=await import('/js/ui/statistics/components.js');
      window.levelRunning='worldmap'; Store.setAdminMode(true); (await import('/js/app/state.js')).refreshStageAccess();
      const e={id:998812,name:'Transcendance',type:'sbire',side:'A',awakening:3,seuilUmbra:1500,
        level:{current:30,max:250},baseStats:{HP:1000,transcendence:150,intelligence:150,vigueur:50,astrality:1,resilience:50,criticalPower:50,strength:50,agility:50,speed:10000},attacks:['autoAttack'],stuff:{}};
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      E.entites.splice(0,E.entites.length,e); Store.saveToLocalStorage('selectedArmyA',[e]);
      const host=document.createElement('main'); host.id='transcendence-audit';
      host.style.cssText='position:fixed;inset:0;overflow:auto;background:#160d24'; document.getElementById('game-shell').append(host);
      Cards.createCodexEntityScan(e,host,`codex-entity_${e.id}`);
      window.audit={e,host,Helpers,Ui,open(key='transcendence'){
        Helpers.closeOpenHelpers();
        host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
        host.querySelector('.section-content.stats [data-mode="umbra"]').click();
        [...host.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(n=>n.getClientRects().length).click();
      }}; audit.open();
    });
  };
  await ui.goto(`http://127.0.0.1:${server.address().port}/index.html`); await mount();
  const card=ui.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])'); await card.waitFor({state:'visible'});
  assert.equal(await card.locator('[data-umbra-passive]').count(),2);
  assert.equal(await card.locator('[data-umbra-passive="transcendenceTotal"]').count(),1);
  const improvedRow=card.locator('[data-umbra-capacity="improvedResurrection"]');
  assert.equal(await improvedRow.count(),1);
  assert.equal(await improvedRow.evaluate(n=>Boolean(n.closest('[data-umbra-passives]'))),true,'Improved resurrection belongs to the exclusive passives');
  assert.equal(await improvedRow.locator('.umbra-passive-icon').count(),1);
  const toggle=key=>card.locator(`[data-umbra-detail-toggle="${key}"]`).first();
  assert.equal(await toggle('transcendenceExBonus').getAttribute('aria-expanded'),'false');
  await toggle('transcendenceExBonus').click();
  assert.equal(await toggle('transcendenceExBonus').getAttribute('aria-expanded'),'true');
  assert.match(await card.locator('[data-umbra-calculation-details="transcendenceExBonus"]').innerText(), /0,0467/,
    'The compact life ratio keeps enough precision to remain nonzero');
  assert.equal(await toggle('transcendentalCooldown').getAttribute('aria-expanded'),'false');
  await ui.evaluate(()=>audit.open());
  assert.equal(await toggle('transcendenceExBonus').getAttribute('aria-expanded'),'true','Individual choice survives reopening');
  await ui.reload(); await mount();
  assert.equal(await toggle('transcendenceExBonus').getAttribute('aria-expanded'),'true','Individual choice survives reload');
  assert.equal(await toggle('transcendentalCooldown').getAttribute('aria-expanded'),'false','Other calculation stays closed');
  await toggle('transcendentalCooldown').click();
  const cd=card.locator('[data-umbra-calculation-details="transcendentalCooldown"]');
  assert.ok(await cd.locator('.intelligence').count()>0,'Cooldown calculation displays Intelligence');
  assert.equal(await cd.locator('.agility, .strength').count(),0);
  await cd.locator('.picto-stat.intelligence').first().click();
  const attributeDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="intelligence"]');
  await attributeDetail.waitFor({state:'visible'});
  assert.match(await attributeDetail.locator('.stat-hover-header').innerText(),/Attribut : Intelligence/);
  await ui.keyboard.press('Escape');
  await card.locator('[data-helper-value="transcendentalCooldown"]').first().click();
  const cdDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="transcendentalCooldown"]');
  await cdDetail.waitFor({state:'visible'});
  assert.match(await cdDetail.innerText(),/Durée : 5/,'Cooldown helper explains the duration conversion');
  await ui.keyboard.press('Escape');
  await card.locator('[data-helper-value="transcendenceConsoProtectionPercent"]').first().click();
  const passiveDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="transcendenceTotal"]');
  await passiveDetail.waitFor({state:'visible'});
  assert.match(await passiveDetail.innerText(),/ratio progressif ×1\.85/,'Passive helper explains the native Intelligence ratio');
  await ui.keyboard.press('Escape');
  await ui.evaluate(()=>audit.open('astrality'));
  assert.equal(await toggle('astralCooldown').getAttribute('aria-expanded'),'false','Other Umbra stays independent');
  await ui.evaluate(()=>audit.open('transcendence'));
  assert.equal(await toggle('transcendentalCooldown').getAttribute('aria-expanded'),'true');
  for(const width of [1440,390]) {
    await ui.setViewportSize({width,height:1000}); await ui.mouse.move(1,1);
    await ui.waitForTimeout(1100);
    assert.ok(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+2),'No horizontal overflow');
    const placement=await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>{
      const row=n.closest('.umbra-effect-row'),heading=row.querySelector('.umbra-effect-heading,.umbra-passive-value');
      const formula=n.getBoundingClientRect(),line=heading.getBoundingClientRect(),owner=row.getBoundingClientRect();
      return {below:formula.top>=line.bottom-1,centered:Math.abs(formula.left+formula.width/2-owner.left-owner.width/2)<2,align:getComputedStyle(n).textAlign};
    }));
    assert.ok(placement.length>0&&placement.every(p=>p.below&&p.centered&&p.align==='center'),'Open formulas sit below the value row and are centered');
    assert.doesNotMatch(await card.innerText(),/Détail (?:du|des) calcul/,'No calculation heading is added');
    const gradients=await card.locator('.umbra-effect-name > span:not(.picto-stat):not(.umbra-passive-icon)').evaluateAll(nodes=>nodes.map(n=>({state:n.dataset.statState,image:getComputedStyle(n).backgroundImage})));
    assert.ok(gradients.every(n=>n.state==='X'||n.image==='none'),'Only X names may have a gradient');
    await card.screenshot({path:resolve(output,`transcendence-${width}.png`),animations:'disabled'});
  }
  await ui.setViewportSize({width:1440,height:1000}); await ui.evaluate(()=>audit.open('vigueur'));
  const xNames=card.locator('.umbra-effect-name > [data-stat-state="X"]');
  assert.ok(await xNames.count()>0,'Real X statistic still has an X name');
  assert.ok(await xNames.first().evaluate(n=>getComputedStyle(n).backgroundImage.includes('linear-gradient')),'X gradient retained');
  await ui.evaluate(()=>audit.open('transcendence'));
  await toggle('transcendenceExBonus').click(); await ui.evaluate(()=>audit.open());
  assert.equal(await toggle('transcendenceExBonus').getAttribute('aria-expanded'),'false','Closing is remembered independently too');
  assert.equal(await toggle('transcendentalCooldown').getAttribute('aria-expanded'),'true');
  await card.locator('.umbra-effect-name[data-helper-entry="improvedResurrection"]').click();
  const resurrectionDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="improvedResurrection"]');
  await resurrectionDetail.waitFor({state:'visible'});
  assert.match(await resurrectionDetail.locator('.stat-hover-header').innerText(),/Passive exclusive de Transcendance/);
  assert.equal(await resurrectionDetail.locator('[data-resurrection-pool]').count(),1,'Only the owned life type is listed');
  assert.match(await resurrectionDetail.innerText(),/990 HP/);
  await ui.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),R=await import('/js/items/resourceStocks.js');
    audit.e.baseStats.HP=1001; audit.e.baseStats.intelligence=20; audit.e.baseStats.eternalLife=1;
    E.recomputeEntityStats(audit.e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    R.addFadedLife(audit.e,2);
    (await import('/js/storage/gameStorage.js')).saveToLocalStorage('selectedArmyA',[audit.e]);
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged',{detail:{entity:audit.e}}));
  });
  await ui.waitForFunction(()=>document.querySelector('[data-umbra-detail][data-helper-picto-subject="improvedResurrection"]')?.textContent.includes('401 HP'));
  assert.equal(await resurrectionDetail.locator('[data-resurrection-pool]').count(),3);
  assert.match(await resurrectionDetail.locator('[data-resurrection-pool="fadedLife"]').innerText(),/501 HP/);
  assert.match(await resurrectionDetail.locator('[data-resurrection-pool="eternalLife"]').innerText(),/1001 HP/);
  await resurrectionDetail.screenshot({path:resolve(output,'resurrection-owned.png'),animations:'disabled'});
  await ui.evaluate(async()=>{
    const R=await import('/js/items/resourceStocks.js');
    while(R.consumeFadedLife(audit.e)){} while(R.consumeRechargeableLife(audit.e,'extraLife')){}
    while(R.consumeRechargeableLife(audit.e,'eternalLife')){}
    (await import('/js/storage/gameStorage.js')).saveToLocalStorage('selectedArmyA',[audit.e]);
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged',{detail:{entity:audit.e}}));
  });
  await ui.waitForFunction(()=>!document.querySelector('[data-umbra-detail][data-helper-picto-subject="improvedResurrection"] [data-resurrection-pool="fadedLife"]'));
  assert.equal(await resurrectionDetail.locator('[data-resurrection-pool]').count(),2,'Owned rechargeable lives remain listed while empty');
  assert.match(await resurrectionDetail.innerText(),/Réserve en recharge/);
  await ui.evaluate(()=>audit.open('resilience'));
  await card.locator('.umbra-effect-name.criticalResistance').click();
  const criticalDetail=ui.locator('[data-umbra-detail][data-helper-picto-subject="criticalResistance"]');
  await criticalDetail.waitFor({state:'visible'});
  assert.match(await criticalDetail.innerText(),/Réduit énormément le bonus de dégâts des coups critiques/);
  assert.equal(await criticalDetail.locator('.picto-stat.criticalChance').count(),1,'Critical-hit pictogram included in the description');
  await criticalDetail.screenshot({path:resolve(output,'critical-resistance.png'),animations:'disabled'});
  for(const key of ['vigueur','astrality','criticalPower']) {
    await ui.evaluate(key=>audit.open(key),key);
    if(await card.locator('[data-umbra-info-toggle]').getAttribute('aria-expanded')!=='true') await card.locator('[data-umbra-info-toggle]').click();
    for(const width of [1440,390]) {
      await ui.setViewportSize({width,height:1000}); await ui.mouse.move(1,1); await ui.waitForTimeout(1100);
      assert.ok(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+2),key+': expanded card fits');
      assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>{
        const r=n.getBoundingClientRect(),row=n.closest('.umbra-effect-row').getBoundingClientRect(),above=n.previousElementSibling.getBoundingClientRect();
        return !n.hidden&&r.top>=above.bottom-1&&getComputedStyle(n).textAlign==='center'&&Math.abs(r.left+r.width/2-row.left-row.width/2)<2;
      })),key+': all formulas are centered below their value or sentence');
      await card.screenshot({path:resolve(output,`${key}-centered-${width}.png`),animations:'disabled'});
    }
  }
  await ui.setViewportSize({width:1440,height:1000});
  checks.push('Improved resurrection is an exclusive passive; owned life HP amounts refresh on stats/stock changes; centered formulas and critical-hit description verified');
  // Reload before comparing with disk: another authorized UI task may have
  // bumped the release while this browser kept its earlier imported module.
  await ui.reload();
  await ui.waitForFunction(()=>document.querySelector('#game-version')?.textContent.includes('The Dark Pit v'));
  const version=JSON.parse(await readFile('package.json','utf8')).gameVersion;
  assert.ok((await ui.locator('#game-version').innerText()).includes(version));
  checks.push('Independent calculation preferences survive close/reload; only X names retain gradients; desktop and portrait verified');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'report.json'),JSON.stringify({checks,errors},null,2));
  console.log(checks.join('\n'));
} finally { await browser.close(); await new Promise(done=>server.close(done)); }

