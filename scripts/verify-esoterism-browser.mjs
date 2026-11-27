import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
const root=resolve('docs'),output=resolve('outputs/esoterism-progressive-20261127/browser');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const errors=[],checks=[];
let page;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
try{
  const source=await readFile('scripts/verify-indestructibility-browser.mjs','utf8');
  const start=source.indexOf('async function fixture('),end=source.indexOf('const checks =',start);
  assert.ok(start>=0&&end>start);
  const fixture=await new AsyncFunction('browser','server','errors',source.slice(start,end)+'\nreturn fixture;')(browser,server,errors);
  page=await fixture();
  await page.evaluate(async()=>{
    window.FX=await import('/js/combat/effects.js');window.D=await import('/js/combat/statistics.js');window.V=await import('/js/combat/vitals.js');
    for(const [i,e] of E.entites.entries()){
      e.baseStats={HP:10000,esoterism:150,agility:150,strength:150,intelligence:i?0:150,speed:60000};e.stats={};e.modifierStats={};
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    }
    window.B=E.entites[0];window.other=E.entites[1];window.esoLog=[];window.addEventListener('combatLogEntry',event=>{if(event.detail.type==='damage_resolution')esoLog.push(event.detail.data);});G.startGame();
  });
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>P.pauseCombat()),true);
  const combat=await page.evaluate(async()=>{
    const ok=(v,m)=>{if(!v)throw Error(m);}, rng=Math.random,records=[];
    const trial=(magical,piercing,rolls)=>{let count=0;const value=D.resolveEsoterismProtection(other,B,{magical,piercing,rng:()=>{count++;return rolls.shift()??0;}});return{...value,rolls:count};};
    const hit=(sources,roll=0)=>{
      FX.clearEsoterismCooldown(B);B.stats.HP.current=B.stats.HP.max;Math.random=()=>roll;
      const attack={functionName:'eso-test',attackId:'eso-test',displayName:'Ésotérisme test',combatFunction:'Attaquant',natureEffectSecondary:true,
        attacknature:['magicalDamage','piercingDamage','physicalDamage'],attackRange:['range'],attackTarget:['enemy'],deadTarget:['no'],
        physicalRatio:1,magicalRatio:1,piercingRatio:1,effets:[],selfEffects:[],type:[]};
      window.esoAttack=attack;const sum=Object.values(sources).reduce((a,b)=>a+b,0),before=B.stats.HP.current,defenseBefore=B.combatDetails?.defenseHp?.esoterism||0;
      V.applyDamage(B,sum,other,attack,sources,[],[]);
      const result={sources,loss:before-B.stats.HP.current,cooldown:FX.esoterismCooldownRemaining(B),prevented:(B.combatDetails?.defenseHp?.esoterism||0)-defenseBefore};records.push(result);window.esoLastImpact=result;return result;
    };
    try{
      ok(!trial(true,false,[.999]).success,'Failed main roll');ok(FX.esoterismCooldownRemaining(B)===0,'Failure leaves cooldown ready');
      ok(!trial(false,true,[0,.999]).success,'Failed Force roll on pure piercing');ok(FX.esoterismCooldownRemaining(B)===0,'Failed extension consumes no cooldown');
      let r=trial(true,true,[0,.999]);ok(r.success&&r.magicalReduction===95&&r.piercingReduction===0&&r.rolls===2,'Magic survives failed extension');
      r=trial(true,true,[0,0]);ok(!r.attempted&&r.rolls===0,'Shared cooldown blocks simultaneous hit without rolling');
      FX.clearEsoterismCooldown(B);r=trial(true,true,[0,0]);ok(r.magicalReduction===95&&r.piercingReduction===47.5,'Mixed hit gets two distinct reductions');
      FX.clearEsoterismCooldown(B);r=trial(false,true,[0,0]);ok(r.success&&r.magicalReduction===0&&r.piercingReduction===47.5,'Pure piercing protected');
      ok(hit({magical:1000,physical:0,piercingDamage:0,hybridalDamage:0}).loss===50,'Magic impact reduced by 95%: '+window.esoLastImpact.loss);
      const hp=B.stats.HP.current;
      V.applyDamage(B,1000,other,{...window.esoAttack,attacknature:['magicalDamage']},
        {magical:1000,physical:0,piercingDamage:0,hybridalDamage:0},[],[]);
      ok(hp-B.stats.HP.current===1000,'Second identical impact is processed during cooldown');
      const piercingHit=hit({magical:0,physical:0,piercingDamage:1000,hybridalDamage:0});ok(piercingHit.loss===525&&piercingHit.prevented===475,'Piercing impact and defense counters use 47.5%');
      ok(hit({magical:1000,physical:100,piercingDamage:1000,hybridalDamage:1000}).loss===1200,'Mixed and hybrid damage preserve physical portion');
      const pure=hit({magical:0,physical:1000,piercingDamage:0,hybridalDamage:0});ok(pure.loss===1000&&pure.cooldown===0,'Physical does not trigger protection');
      B.baseStats.strength=0;E.recomputeEntityStats(B,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      const noForce=hit({magical:0,physical:0,piercingDamage:1000,hybridalDamage:0});ok(noForce.loss===1000&&noForce.cooldown===0,'No Force means no piercing protection');
      B.baseStats.strength=150;E.recomputeEntityStats(B,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      FX.clearEsoterismCooldown();const armor=await import('/js/items/armor.js');armor.destroyEntityArmor(B);armor.grantEntityExternalArmor(B,1500);const armored=hit({magical:1000,physical:0,piercingDamage:0,hybridalDamage:0});ok(armored.loss===0&&armored.cooldown===0,'Armor-absorbed hit does not consume cooldown');armor.destroyEntityArmor(B);ok(D.attemptEsoterism(other,B,()=>0),'Start first entity cooldown');ok(D.attemptEsoterism(B,other,()=>0),'Start independent entity cooldown');Clock.notifyCombatAction();
    }finally{Math.random=rng;}
    return records;
  });
  await writeFile(resolve(output,'combat.json'),JSON.stringify(combat,null,2));
  checks.push('Actual magical, pure piercing, hybrid and mixed impacts; half reduction; failed rolls; simultaneous impacts and shared cooldown');
  await page.waitForFunction(()=>!document.querySelector('#combat-pause-control')?.disabled);
  const read=()=>page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),C=await import('/js/combat/clock.js'),FX=await import('/js/combat/effects.js');
    return{now:C.clockNow(),states:C.captureCombatState().esoterism,remaining:E.entites.map(e=>FX.esoterismCooldownRemaining(e))};
  });
  const saved=await read();assert.equal(saved.states.length,2);
  await page.waitForTimeout(250);assert.deepEqual(await read(),saved,'Pause freezes deadlines');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#combat-pause-control')?.textContent==='Pause tactique · Espace pour reprendre'&&!document.querySelector('#combat-pause-control').disabled);
  assert.deepEqual(await read(),saved,'F5 restores deadlines without replaying protection');
  await page.keyboard.press('Space');await page.waitForTimeout(5300);assert.deepEqual((await read()).remaining,[0,0]);assert.equal((await read()).states.length,0);
  const sleeping=await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),D=await import('/js/combat/statistics.js'),FX=await import('/js/combat/effects.js');
    const C=await import('/js/combat/control.js'),T=await import('/js/combat/timeline.js');const e=E.entites[0];
    if(!D.attemptEsoterism(E.entites[1],e,()=>0))throw Error('Proc after expiry');
    const now=T.combatNow();C.addEntityControl(e,'sommeil',now,now+450);return FX.esoterismCooldownRemaining(e);
  });
  await page.waitForTimeout(180);assert.ok(Math.abs((await read()).remaining[0]-sleeping)<.05,'Sleep freezes cooldown');
  await page.waitForTimeout(450);assert.ok((await read()).remaining[0]<sleeping-.1,'Waking resumes cooldown');
  await page.evaluate(async()=>{const E=await import('/js/entities/runtime.js'),FX=await import('/js/combat/effects.js'),V=await import('/js/combat/vitals.js');FX.startEsoterismCooldown(E.entites[1]);const target=E.entites[0];V.applyDamage(target,1e6,E.entites[1],{functionName:'eso-death',combatFunction:'Attaquant',attacknature:['physicalDamage'],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],natureEffectSecondary:true,effets:[],selfEffects:[],type:[]},{physical:1e6,magical:0,piercingDamage:0,hybridalDamage:0},[],[]);if(FX.esoterismCooldownRemaining(target)!==0)throw Error('Death must clear cooldown');(await import('/js/app/state.js')).StopGame({preserveScene:true});});assert.equal((await read()).states.length,0,'Stop releases states and tasks');
  checks.push('Pause, reload, expiry, sleep, independent entities, death and combat cleanup');await page.close();

  page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await dismissStarterForFixture(page);
  const release=JSON.parse(await readFile('package.json','utf8'));await page.waitForFunction(v=>document.querySelector('#game-version')?.textContent.includes(v),release.gameVersion);
  const setup=await readFile('scripts/verify-umbra-helper-structure-browser.mjs','utf8');
  const a=setup.indexOf('const keys = await page.evaluate(async () => {'),b=setup.indexOf('  const card = page.locator',a);
  await new AsyncFunction('page',setup.slice(a,b))(page);
  const card=page.locator('.stat-hover[data-umbra-pinned="true"]:not([data-umbra-detail])'),detail=page.locator('[data-umbra-detail]').last();
  const ids=['esoterismBonus','esoterismTotalReduction','esoterismCooldown','esoterismPiercingChance','esoterismPiercingReduction'];
  for(const width of [1440,1024,390])for(const admin of [false,true]){
    const height=width===1024?550:width===390?844:1000;await page.setViewportSize({width,height});
    await page.evaluate(admin=>{audit.G.setAdminMode(admin);audit.e.baseStats={HP:10000,esoterism:150,agility:150,strength:150,intelligence:150};audit.e.modifierStats={};audit.e.seuilUmbra=150;
      audit.E.recomputeEntityStats(audit.e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});audit.show('esoterism');},admin);
    await card.waitFor({state:'visible'});assert.equal(await page.locator('#game-version').isVisible(),true);assert.equal(await card.locator('.umbra-passive-icon').count(),2);assert.equal(await card.locator('[data-stat-state="X"]').count(),0);
    assert.equal(await card.locator('[data-umbra-detail-toggle]').count(),admin?5:0);
    const fits=async locator=>{
      const m=await locator.evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('.stat-hover-body')||n;return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,scroll:b.scrollHeight>b.clientHeight+2||b.scrollWidth>b.clientWidth+2,overflow:getComputedStyle(b).overflowY};});
      assert.ok(!m.scroll&&m.overflow!=='auto'&&m.top>=-1&&m.left>=-1&&m.right<=width+1&&m.bottom<=height+1,JSON.stringify(m));
    };
    for(const id of ids){
      await card.locator(`[data-helper-entry="${id}"]`).first().click();await detail.waitFor({state:'visible'});await fits(detail);
      await card.locator('.umbra-card-ambiance').click();await card.locator(`[data-helper-value="${id}"]`).first().click();await detail.waitFor({state:'visible'});
      assert.equal(await detail.locator('[data-helper-technical]').count(),admin?1:0);await fits(detail);await card.locator('.umbra-card-ambiance').click();
    }
    if(admin){const toggle=card.locator('[data-umbra-info-toggle]');if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();await toggle.click();
      assert.equal(await card.locator('[data-umbra-inline-detail]:visible').count(),5);await card.locator('[data-umbra-detail-toggle]').first().click();assert.equal(await card.locator('[data-umbra-inline-detail]:visible').count(),4);
      await toggle.click();await fits(card);await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);await card.screenshot({path:resolve(output,`${width}-calculations.png`)});await toggle.click();}
    await fits(card);await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);await card.screenshot({path:resolve(output,`${width}-${admin?'admin':'player'}.png`)});
    checks.push(`${width} ${admin?'admin':'player'}: exclusive frames, five helpers, controls and no overflow`);
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{for(const key of ['esoterism','strength','agility','intelligence'])audit.e.baseStats[key]=1500;audit.e.seuilUmbra=1500;audit.E.recomputeEntityStats(audit.e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});audit.show('esoterism');});
  assert.match(await card.locator('[data-helper-value="esoterismPiercingReduction"]').first().innerText(),/49[,.]46/);await card.screenshot({path:resolve(output,'1500.png')});checks.push('1500-point card shows the half-strength piercing reduction');
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'coverage.json'),JSON.stringify(checks,null,2));console.log(`Esoterism browser: ${checks.length} scenarios passed.`);
}catch(error){if(page?.testLog)await writeFile(resolve(output,'console.log'),page.testLog.join('\n'));if(page&&!page.isClosed())await page.screenshot({path:resolve(output,'failure.png')});await writeFile(resolve(output,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,errors},null,2));throw error;}
finally{await browser.close();await new Promise(done=>server.close(done));}
