import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/entraves-helper');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const rel=relative(root,file);if(rel==='..'||rel.startsWith('..'+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.addInitScript(()=>{
    const timeout=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
    window.setTimeout=(...args)=>(window.__resilienceTimerBackend?.setTimeout||timeout)(...args);
    window.clearTimeout=(...args)=>(window.__resilienceTimerBackend?.clearTimeout||clear)(...args);
  });
  await page.goto(origin+'/index.html');
  const checks=await page.evaluate(async()=>{
    const E=await import("/js/entities/runtime.js"),D = await import("/js/board/deployment.js"), _D = await import("/js/combat/statistics.js"),A = await import("/js/combat/vitals.js");
    const UI=await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))),F = await import("/js/combat/attacks.js"),State = await import("/js/app/state.js");
    const Fx=await Promise.all([import("/js/combat/effects.js"), import("/js/rendering/auras.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))),G = await import("/js/storage/gameStorage.js"),U = await import("/js/ui/statistics/components.js");
    const Summon = await import("/js/combat/summons.js"),SummonData=await import('/js/data/summons.js');
    const Storage = await import("/js/storage/entityStorage.js");
    const checks=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);},eq=(a,b,label)=>ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
    const Clock=await import('/js/combat/clock.js'),Timeline=await import('/js/combat/timeline.js');
    const hasDot=(kind,target)=>Clock.captureCombatState().alterations.some(effect=>effect.kind===kind&&effect.target===target.id);
    window.levelRunning='worldmap';State.setGameOver(false);
    let id=989950;
    const host=document.createElement('main');host.className='hex-grid';document.body.append(host);
    const Board=await import('/js/board/controller.js');
    const actor=(side,baseStats={})=>{
      const e=E.enrichEntityStats({id:++id,name:'Résilience audit',type:'sbire',side,awakening:3,level:1,role:'gueux',
        attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,...baseStats},position:`hex_${id}`});
      e.isDEAD=false;e.statut=['alive'];
      const hex=document.createElement('div');hex.className='hex Neutral occupied';hex.dataset.position=e.position;
      hex.innerHTML=`<div id="Box_Entite_${id}" class="entite-box" data-position="${e.position}"><div id="sbire_${id}"><div id="effectsContainer_${id}"></div><div id="PopDow_${id}"></div></div></div>`;
      host.append(hex);E.entites.push(e);
      Board.invalidateFootprintGeometry(host);Board.rebuildBoardOccupancy(host);return e;
    };
    const random=Math.random;
    try{
      Math.random=()=>0;
      const strike={functionName:'resilienceImpact',displayName:'Impact Résilience',combatFunction:'Attaquant',attackRange:['melee'],
        attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],executionTime:0,attacknature:[],
        essenceSlots:[{slotId:'impact-yellow',kind:'open',color:'yellow',essenceSource:'test'}]};
      for(const [criticalChance,resistance,expected]of [[99,60,120],[99,0,150],[0,60,100],[99,99,101]]){
        const attacker=actor('A',{criticalChance}),victim=actor('B',{criticalResistance:resistance});
        ok(await F.resolveAttackImpact(F.createAttackFlight(attacker,victim,strike,{piercingDamage:100}))==='hit','Actual impact resolves');
        eq(1000-victim.stats.HP.current,expected,'Real critical mitigation preserves normal damage');
        eq(A.calculateDefensiveHpOutcome(attacker,victim,{piercingDamage:100},{critical:criticalChance>0,criticalBonus:50,resilienceCrit:resistance}),expected,'Combat replay agrees');
      }
      // Cancellation is rolled once at application, not on each tick.
      const attacker=actor('A'),cancelled=actor('B',{resilience:50,strength:150});
      ok(A.applyEffect(cancelled,'poison',attacker)==='alteration_canceled','Exclusive passive cancels actual poison application');
      ok(!hasDot('poison',cancelled),'Cancelled poison schedules no tick');
      for(const [resilienceTotal,hindranceResistance,expected] of [[99,99,'resilienceCancel'],[0,99,'hindranceResistance'],[0,0,null]]){
        const target=actor('A',{resilienceTotal,hindranceResistance,weight:90});
        target.stats.shift={current:10,max:10};
        const result=D.consumeEntityMovement(target,1);
        ok(result.weight.shiftCostModifier>0,'Heavy target has a weight surcharge');
        ok(result.weightResistance.kind===expected,'Weight uses priority resistance then Agility');
        eq(result.cost,expected?1:1+result.weight.shiftCostModifier,'Resisted weight keeps normal movement cost');
        eq(target.stats.shift.current,10-result.cost,'Movement charges reflect actual cost');
      }
      const Drag = await import("/js/board/interaction.js");
      State.restoreRunningBattle();
      try{
        for(const [resilienceTotal,hindranceResistance,expected] of [[99,99,'resilienceCancel'],[0,99,'hindranceResistance'],[0,0,null]]){
          const mover=actor('A'),displaced=actor('A',{resilienceTotal,hindranceResistance});
          mover.stats.shift={current:10,max:10};displaced.stats.shift={current:10,max:10};
          const box=document.getElementById(`Box_Entite_${mover.id}`),other=document.getElementById(`Box_Entite_${displaced.id}`);
          const source=box.closest('.hex'),destination=other.closest('.hex');
          const before=[mover.position,displaced.position,mover.role,displaced.role];
          for(const hex of [source,destination])hex.insertAdjacentHTML('afterbegin','<div class="socle"></div>');
          Drag.restoreEntityDragAndDrop();
          const payload=new DataTransfer();payload.setData('text',box.id);
          destination.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:payload}));
          ok(box.parentElement===destination&&other.parentElement===source,'Friendly swap is not a harmful displacement');
          ok(mover.position===before[1]&&displaced.position===before[0],'Friendly swap updates both entity positions');
          eq(mover.stats.shift.current,10-1-E.getMovementWeightMalus(mover).shiftCostModifier,'Friendly swap consumes normal movement');
          eq(displaced.stats.shift.current,10,'Forced entity does not pay for the other entity movement');
        }
      }finally{State.StopGame({preserveScene:true});}
      Math.random=()=>.999999;
      // Drive real DoT handlers with local deterministic timers. No waiting or game saves.
      const si=window.setInterval,ci=window.clearInterval,st=window.setTimeout,ct=window.clearTimeout,date=Date.now;
      let now=Date.now(),next=0;const timers=new Map();
      window.setInterval=(fn,ms)=>{const id=++next;timers.set(id,{fn,ms,at:now+ms,repeat:true});return id;};
      window.setTimeout=(fn,ms=0)=>{const id=++next;timers.set(id,{fn,ms,at:now+ms,repeat:false});return id;};
      window.clearInterval=window.clearTimeout=id=>timers.delete(id);Date.now=()=>now;window.__resilienceTimerBackend={setTimeout:window.setTimeout,clearTimeout:window.clearTimeout};
      const advance=async ms=>{const end=now+ms;let guard=0;while(true){
        const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;
        if(++guard>10000)throw Error('Timer loop');const [id,t]=due;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn();await Timeline.settleCombatTimeline();
      }now=end;};
      try{
        const catalog=(await import('/js/data/attackEffects.js')).attackEffects;
        const effect=catalog.find(effect=>effect.effectName==='brulure'),originalType=effect.type;
        effect.type=['alteration','entrave'];
        try{
          for(const [resilienceTotal,hindranceResistance,expected] of [[99,99,'resilienceCancel'],[0,99,'hindranceResistance'],[0,0,null]]){
            Math.random=()=>0;
            const target=actor('B',{resilienceTotal,hindranceResistance});
            const result=A.applyEffect(target,'brulure',attacker);
            if(expected){
              ok(result==='alteration_canceled'&&!hasDot('brulure',target),'Entrave protection prevents the real effect handler');
              eq(Storage.getEntityCombatDetails(target).procs[expected],1,'Entrave application records the successful protection');
            }else{
              ok(hasDot('brulure',target),'Unresisted entrave reaches the real effect handler');
              // Current fire: five ticks at 5, then five at 2 after 60% decay.
              await advance(10001);eq(1000-target.stats.HP.current,35,'Unresisted fire follows both maintenance cycles');
            }
          }
        }finally{effect.type=originalType;Math.random=()=>.999999;}
        for(const name of ['poison','brulure']){
          const protectedTarget=actor('B',{alterationResistance:50}),normalTarget=actor('B');
          const effect={effectName:name,type:['alteration'],effectDuration:5,effectDot:100,stacks:1,maxStacks:5};
          const duration=name==='brulure'?10000:5000, tick=name==='brulure'?100:20, total=name==='brulure'?700:100;
          let ended=0;
          Fx[name](protectedTarget,effect,attacker,()=>ended++);Fx[name](normalTarget,effect,attacker,()=>ended++);
          await advance(999);eq(protectedTarget.stats.HP.current,1000,`${name}: first tick after one second`);
          await advance(1);eq(protectedTarget.stats.HP.current,1000-tick/2,`${name}: half-strength first tick`);eq(normalTarget.stats.HP.current,1000-tick,`${name}: full-strength first tick`);
          await advance(duration-1000);
          eq(protectedTarget.stats.HP.current,1000-total/2,`${name}: half total damage`);eq(normalTarget.stats.HP.current,1000-total,`${name}: full total damage`);
          await advance(1000);eq(ended,2,`${name}: both terminate on same schedule`);
          eq(protectedTarget.stats.HP.current,1000-total/2,`${name}: no extra tick`);
          for(const [durationResistance,intensityResistance,expected] of [[50,0,100],[50,50,50],[90,0,100]]){
            const target=actor('B',{hindranceResistance:durationResistance,alterationResistance:intensityResistance});
            const prepared=_D.prepareResilienceEffect(target,effect);
            const duration=name==='brulure'?10000:5000;let ends=0;
            Fx[name](target,prepared,attacker,()=>ends++);
            await advance(duration-1);eq(ends,0,`${name}: duration resistance leaves DoT active until its normal deadline`);
            await advance(1.001);eq(ends,1,`${name}: DoT ends at its normal deadline`);
            eq(1000-target.stats.HP.current,expected*(name==='brulure'?7:1),`${name}: duration ${duration}ms, intensity ${intensityResistance}%`);
            ok(!document.getElementById(`effectsContainer_${target.id}`).querySelector('.effect-vfx'),`${name}: VFX removed at normal deadline`);
            await advance(6000);eq(1000-target.stats.HP.current,expected*(name==='brulure'?7:1),`${name}: no redistributed or late damage`);
          }
        }
        for(const [intensity,duration,expected] of [[0,0,35],[20,0,28],[50,0,18],[75,0,9],[0,50,35]]){
          const target=actor('B',{alterationResistance:intensity,hindranceResistance:duration});
          A.applyEffect(target,'brulure',attacker);
          await advance(15001);
          eq(1000-target.stats.HP.current,expected,`Actual catalog burn: intensity ${intensity}%, duration ${duration}%`);
          ok(!hasDot('brulure',target),'Actual application expires and clears timer');
          eq(target.brulureStacks,0,'Actual application clears stacks');
        }
        // A residual fraction belongs to one alteration, never to another target or refresh.
        const small=actor('B',{alterationResistance:50});
        for(let repeat=0;repeat<2;repeat++){
          const before=small.stats.HP.current;
          A.applyEffect(small,'brulure',attacker);await advance(15001);
          eq(before-small.stats.HP.current,18,'Each fire rounds its own decaying total to nearest');
          eq(Storage.getEntityCombatDetails(small).defenseHp.resilience,17*(repeat+1),'Defense record credits damage actually prevented');
        }
        const poisonItem=SummonData.summons.find(item=>item.summonEffet.includes('poisonConsommable'));
        const placePoison=target=>{
          const hex=document.getElementById(`Box_Entite_${target.id}`).closest('.hex');
          const node=document.createElement('div');node.id=`audit-item-${++id}`;node.dataset.groundSummon='true';hex.append(node);
          return Summon.consommationSummon(poisonItem,hex,node.id,()=>{},{attacker});
        };
        for(const [duration,intensity,expected] of [[0,0,5],[60,0,5],[0,50,3],[60,50,3]]){
          const target=actor('B',{hindranceResistance:duration,alterationResistance:intensity});
          placePoison(target);
          ok(!!document.getElementById(`jarretPoisonVFX_${target.id}`),'Consumed rotten Jarret starts poison');
          await advance(10001);
          eq(1000-target.stats.HP.current,expected,`Jarret duration ${duration}%, intensity ${intensity}%`);
          ok(!document.getElementById(`jarretPoisonVFX_${target.id}`),'Jarret poison removed at deadline');
          await advance(11000);eq(1000-target.stats.HP.current,expected,'No late Jarret damage');
        }
        Math.random=()=>0;
        const immune=actor('B',{resilience:50,strength:150});
        placePoison(immune);await advance(11000);
        eq(immune.stats.HP.current,1000,'Exclusive passive cancels rotten Jarret poison');
        ok(!document.getElementById(`jarretPoisonVFX_${immune.id}`),'Cancelled Jarret has no poison VFX');
        ok(Storage.getEntityCombatDetails(immune).procs.resilienceCancel>0,'Jarret cancellation counted');
      }finally{delete window.__resilienceTimerBackend;window.setInterval=si;window.clearInterval=ci;window.setTimeout=st;window.clearTimeout=ct;Date.now=date;}
    }finally{Math.random=random;host.remove();}
    const e=actor('A',{resilience:50,strength:25,intelligence:6,agility:30});
    G.saveToLocalStorage('selectedArmyA',[e]);G.saveToLocalStorage('equippedItems',[]);window.selectedArmyA=[e];E.entites.splice(0,E.entites.length,e);
    document.body.innerHTML='<div class="Game-helper"></div><main class="Game-UI" style="position:fixed;inset:0;background:#180606"><div class="menu-map-container"></div></main>';
    let codex=UI.createCodexEntityScan(e,document.querySelector('.menu-map-container'),`codex-entity_${e.id}`);
    codex.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    codex.querySelector('.section-content.stats [data-mode="stat"]').click();
    const rows=Array.from(codex.querySelectorAll('[data-stat="criticalResistance"].stat-container'));
    ok(rows.length>0,'Resistance appears in Codex');
    ok(rows.every(row=>row.querySelector('.stat-name').textContent.includes('X')),'Resistance shows X when Umbra active');
    const recoveryRow=codex.querySelector('[data-stat="hindranceResistance"].stat-container');
    ok(!!recoveryRow,'Recovery appears in Codex');
    ok(getComputedStyle(recoveryRow.querySelector('.picto-stat')).backgroundImage.includes('picto-resilience-agi.svg'),'Recovery uses Agility resilience picto');
    const passive=codex.querySelector('[data-stat="resilienceTotal"].stat-container');
    ok(passive&&!/[+X]\s*:/.test(passive.querySelector('.stat-name').textContent),'Passive has no +/X');
    e.baseStats.resilience=0;E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false});
    G.saveToLocalStorage('selectedArmyA',[e]);codex.remove();
    codex=UI.createCodexEntityScan(e,document.querySelector('.menu-map-container'),`codex-entity_${e.id}`);
    codex.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    codex.querySelector('.section-content.stats [data-mode="stat"]').click();
    for(const [points,normal,plus] of [[0,0,0],[0,5,0],[0,0,5],[50,0,0]]){
      const before=structuredClone(e.stats);
      Object.assign(e.baseStats,{resilience:points,criticalResistance:normal,criticalResistancePlus:plus});
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      G.saveToLocalStorage('selectedArmyA',[e]);U.syncDOMWithStats(before,e.stats,e.id,e);
      const panel=codex.querySelector('.section-content.stats');
      const row=panel.querySelector('[data-stat="criticalResistance"].stat-container');
      if(points||normal||plus){
        ok(!!row,'Live edit creates resistance row');
        ok(!!row.closest('.stat-section-codex.defence'),'Live resistance added to defence section');
        const value=row.querySelector('.entite-stat').textContent;
        ok(value.includes('%'),'Live resistance keeps percentage unit');
        eq(parseFloat(value.replace(',','.')),Math.round(e.stats.criticalResistance*100)/100,'Live percentage matches engine');
        const state=points?' X :':plus?' + :':'critiques :';
        ok(row.querySelector('.stat-name').textContent.endsWith(state),'Live state normal/+/X is correct');
      }
    }
    window.resilienceAudit={e,UI,E};return checks;
  });
  const layouts=[];
  for(const [width,height] of [[1280,800],[1280,676],[1280,520],[390,800],[320,520]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{
      const {e,UI}=resilienceAudit;UI.closeOpenHelpers();
      document.body.innerHTML='<style>#game-windows { transform:none!important; }</style><div class="Game-helper"></div><main id="game-windows" style="position:fixed;inset:10px;width:auto;height:auto;margin:0;padding:0;background:#190707"><div id="audit" class="codex-entity-scan" style="padding:30px"></div></main>';
      UI.createUmbraBlock(document.getElementById('audit'),'Résilience',()=>e.stats.resilience,e,'resilience');
      const row=document.querySelector('#audit .stat-container');UI.bindHelperEntity(row,e);row.click();
    });
    const card=page.locator('[data-umbra-pinned="true"]');await card.waitFor({state:'visible'});
    assert.equal(await card.locator('.umbra-header-name').innerText(),'Résilience');
    assert.match(await card.locator('.umbra-description').innerText(),/utilitaire de Force niveau 2/);
    assert.equal(await card.locator('.umbra-card-total').count(),3);
    const passive=card.locator('[data-umbra-passive="resilienceTotal"]');assert.equal(await passive.count(),1);
    assert.doesNotMatch(await card.innerText(),/NaN|undefined|seuil|maximum|plafond|Résilience totale [X+]/i);
    const toggle=card.locator('[data-umbra-detail-toggle]').first();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity)>.99);
    await page.evaluate(()=>document.fonts.ready);
    const layout=await card.evaluate(helper=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
      const body=helper.querySelector('.stat-hover-body');
      const tiles=[...helper.querySelectorAll('.umbra-stat-tile')].map(rect);
      return {frame:rect(helper),body:rect(body),tiles,
        bodyOverflow:getComputedStyle(body).overflowY,outerOverflow:getComputedStyle(helper).overflowY,
        scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,scrollWidth:body.scrollWidth,clientWidth:body.clientWidth};
    });
    assert.ok(layout.frame.x>=17&&layout.frame.right<=width-17);
    assert.ok(layout.frame.y>=17&&layout.frame.bottom<=height-17,'Helper stays inside the game window');
    assert.equal(layout.outerOverflow,'visible');assert.equal(layout.bodyOverflow,'auto');
    assert.ok(layout.clientHeight>0,'The compact card keeps a usable scrollable body');
    assert.ok(layout.body.bottom<=layout.frame.bottom+1,`Scrollable body remains inside frame: ${JSON.stringify({width,height,...layout})}`);
    await card.screenshot({path:resolve(output,`helper-${width}x${height}.png`)});
    assert.ok(layout.scrollWidth<=layout.clientWidth+1,`Two columns never cause horizontal overflow: ${JSON.stringify({width,height,...layout})}`);
    const [force,intel,agi,exclusive]=layout.tiles;
    assert.ok(Math.abs(intel.y-agi.y)<1&&intel.right<=agi.x+1,'Intelligence and Agility share a row');
    assert.ok(force.width>intel.width*1.8&&exclusive.width>intel.width*1.8,'Force and exclusive passive span both columns');
    assert.ok(exclusive.y>=Math.max(intel.bottom,agi.bottom),'Exclusive passive stays after the secondary effects');
    await card.screenshot({path:resolve(output,`helper-${width}x${height}.png`)});
    await card.locator('.stat-hover-body').evaluate(body=>{body.scrollTop=body.scrollHeight;});
    assert.ok(Math.abs(await card.locator('.stat-hover-body').evaluate(body=>body.scrollTop) - Math.max(0,layout.scrollHeight-layout.clientHeight))<=1,'All vertical content remains reachable');
    const scrollState=await card.evaluate(helper=>({outer:helper.scrollTop,headerTop:helper.querySelector('.stat-hover-header').getBoundingClientRect().top,bodyTop:helper.querySelector('.stat-hover-body').getBoundingClientRect().top}));
    const after=await card.boundingBox();assert.ok(Math.abs(after.y-layout.frame.y)<1&&Math.abs(after.height-layout.frame.height)<1,'Scrolling cannot move the frame');
    await card.screenshot({path:resolve(output,`helper-${width}x${height}-bottom.png`)});
    const passiveBounds=await passive.boundingBox();assert.ok(passiveBounds.y>=layout.body.y-1&&passiveBounds.y+passiveBounds.height<=layout.body.bottom+1,'Entire passive visible at end of internal scroll');
    layouts.push({width,height,...layout,scrollState});
    await passive.locator('.helper-calculation-result').focus();
    const detail=page.locator('[data-umbra-detail]');await detail.waitFor({state:'visible'});
    assert.equal(await detail.evaluate(el=>el.classList.contains('umbra-helper-card')),false,'Nested helper keeps its plain style');
    assert.match(await detail.innerText(),/Total de l’entité/);assert.doesNotMatch(await detail.innerText(),/malus à distance|Vision/);
    await page.keyboard.press('Escape');
  }
  await page.goto(origin+'/index-14.html');
  await page.locator('[data-mode="maj"]').first().click();
  await page.locator('[data-catalog="umbras"] > summary').first().click();
  await page.locator('[data-add="umbra-resilience"]').first().click();
  await page.locator('input[data-group="umbras"][data-key="resilience"]').first().fill('50');
  for(const key of ['criticalResistance','alterationResistance','hindranceResistance','resilienceTotal']){
    await page.locator('[data-ui="curve-effect"]').first().selectOption(key);
    assert.doesNotMatch(await page.locator('[data-ratio="umbra-resilience"]').first().innerText(),/NaN|undefined|Vision|Puissance critique/);
    await page.selectOption('#conversion-stat',key);await page.fill('#conversion-points','150');await page.fill('#conversion-percent','50');
    assert.equal(await page.locator('#conversion-percent').inputValue(),'50');
    assert.match(await page.locator('#conversion-result').innerText(),/Résilience/);
    if(key==='resilienceTotal')assert.match(await page.locator('#conversion-agility-field').innerText(),/Force/);
    if(key==='hindranceResistance')assert.match(await page.locator('#conversion-agility-field').innerText(),/Agilité/);
  }
  assert.equal(await page.locator('[data-add="x-resilienceTotal"]').count(),0);
  assert.equal(await page.locator('[data-add="plus-resilienceTotal"]').count(),0);
  await page.locator('[data-catalog="umbras"] > summary').first().click();
  await page.locator('[data-add="umbra-vision"]').first().click();
  await page.locator('input[data-group="umbras"][data-key="vision"]').first().fill('50');
  await page.locator('[data-ui="curve-effect"]').first().selectOption('bullsEye');
  const vision=await page.locator('[data-ratio="umbra-vision"]').first().innerText();
  assert.doesNotMatch(vision,/NaN|undefined/);assert.match(vision,/Agilité/);
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,layouts,errors},null,2));
  console.log(`PASS: ${checks.length} real combat/DoT/UI checks, desktop/mobile helpers and Index 14.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
