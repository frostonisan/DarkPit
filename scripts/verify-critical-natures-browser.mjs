import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/critical-natures-2026-11-27/tests');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const rel=relative(root,file);if(rel==='..'||rel.startsWith('..'+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('console',msg=>{if(msg.text().startsWith('[Audit]'))console.log(msg.text());});
  page.on('pageerror',err=>errors.push(err.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.addInitScript(()=>{
    const timeout=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
    window.__nativeTimeout=timeout;
    window.setTimeout=(...args)=>(window.__resilienceTimerBackend?.setTimeout||timeout)(...args);
    window.clearTimeout=(...args)=>(window.__resilienceTimerBackend?.clearTimeout||clear)(...args);
  });
  await page.goto(origin+'/index.html');
  const checks=await page.evaluate(async()=>{
    const E = await import("/js/entities/runtime.js"),D = await import("/js/board/deployment.js"), _D = await import("/js/combat/statistics.js"),A = await import("/js/combat/vitals.js");
    const UI = await import("/js/ui/application.js"),F = await import("/js/combat/attacks.js"),State = await import("/js/app/state.js");
    const Fx = await import("/js/combat/effects.js"),R = await import("/js/combat/attackResolution.js"),C = await import("/js/combat/clock.js");
    const Timeline = await import("/js/combat/timeline.js");
    const Control = await import("/js/combat/control.js"),Move = await import("/js/board/controller.js"),Rules = await import("/js/entities/rules.js");
    const Data=await import('/js/data/attackEffects.js'),catalog=(await import('/js/data/attackList.js')).attackDetails;
    const T=await import('/js/procedural/proc-bareme.js');
    const Loader=await import('/js/data/loaderList.js');
    await Promise.all(['./media/assets/effects/stun.gif','./media/assets/ui/picto-grab.svg'].map(Loader.loadResource));
    const checks=[],ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
    const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-6,`${label}: ${a} / ${b}`);
    window.levelRunning='worldmap';State.setGameOver(false);
    let id=987000;
    const host=document.createElement('main');host.className='hex-grid';document.body.append(host);
    for(let row=0;row<3;row++)for(let col=0;col<14;col++){
      const hex=document.createElement('div');hex.className='hex Neutral';
      Object.assign(hex.dataset,{position:`hex_${++id}`,row,col});
      hex.innerHTML='<div class="socle"></div>';host.append(hex);
      hex.style.cssText=`position:absolute;left:${col*50+(row%2)*25}px;top:${row*40+20}px;width:45px;height:40px`;
    }
    const cell=(row,col)=>host.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    const actor=(side,baseStats={},hex=null)=>{
      if(!hex){hex=document.createElement('div');hex.className='hex Neutral';hex.dataset.position=`hex_${++id}`;host.append(hex);}
      const e=E.enrichEntityStats({id:++id,name:'Audit entraves',type:'sbire',side,awakening:3,level:1,role:'gueux',
        attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,weight:40,...baseStats},position:hex.dataset.position});
      e.isDEAD=false;e.statut=['alive'];e.stats.shift={current:10,max:10};
      const box=document.createElement('div');box.id=`Box_Entite_${e.id}`;box.className='entite-box';box.dataset.position=e.position;
      box.innerHTML=`<div id="sbire_${e.id}"><div id="effectsContainer_${e.id}"></div><div id="PopDow_${e.id}"></div></div>`;
      hex.append(box);E.entites.push(e);return e;
    };
    const random=Math.random,date=Date.now;
    let now=date(),next=0;const timers=new Map();
    const flush=()=>new Promise(done=>window.__nativeTimeout(done,0));
    window.__resilienceTimerBackend={setTimeout:(fn,ms=0,...args)=>{const id=++next;timers.set(id,{fn:()=>fn(...args),at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
    Date.now=()=>now;
    const advance=async ms=>{
      const end=now+ms;let guard=0;
      while(true){
        await flush();await Timeline.settleCombatTimeline();await flush();
        const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;if(++guard>20000)throw Error('Timer loop');
        const [id,t]=due;now=Math.max(now,t.at);timers.delete(id);t.fn();
      }now=end;await flush();await Timeline.settleCombatTimeline();await flush();
    };
    const Battle = await import("/js/combat/loop.js");
    const effectAttack=(name,seconds)=>({effets:[name],effectOverrides:{[name]:{effectDuration:seconds}}});
    const apply=(target,name,source,seconds)=>A.applyEffect(target,name,source,seconds==null?null:effectAttack(name,seconds));
    const spell=(key,extra={})=>({...catalog[0],attackId:key,functionName:key,displayName:key,attackRange:['range'],attacknature:['physicalDamage'],
      attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],preparationTime:5000,executionTime:100,recoveryTime:100,cooldown:0,...extra});
    const configure=(e,defs)=>{R.setEntityAttackDefinitions(e,defs,catalog);e.stats.speed=1000;return R.readAttackDefinitionsForEntity(e,catalog);};
    const stop=async(e,task)=>{e.battleStopped=true;await advance(100);await task;Fx.clearControlEffects(e);};

    try {
      Math.random=()=>.5;
      const hit=(source,victim,colors,amount=100,bonus=50)=>{
        const attack={functionName:'nature-audit',launchContextId:'nature-audit',combatFunction:'Attaquant',
          attackRange:['melee'],attackTarget:['enemy'],effets:[],selfEffects:[],natureSignatureSuppressed:false,
          essenceSlots:colors.map((color,i)=>({slotId:`s${i}`,color,active:true})),
          criticalRoll:{isCritical:true,bonus,critDamageBonus:bonus,critTotalChance:99,reduction:0}};
        const DR=window.__damageRules;
        const sources=DR.splitDamageByNature(R.getAttackNatureRules(attack),amount);
        return A.applyDamage(victim,amount,source,{...attack,forceDamageSources:sources},sources);
      };
      window.__damageRules=await import('/js/combat/damageRules.js');
      const DR=window.__damageRules;
      // Exercise the real critical roll and impact pipeline for every nature,
      // both with and without critical resistance. Expected shares are explicit.
      const natureCases=[
        {name:'physical',colors:['red'],immediate:1,burn:0,red:1},
        {name:'magic',colors:['blue'],immediate:0,burn:1,red:0},
        {name:'piercing',colors:['yellow'],immediate:1,burn:0,red:0},
        {name:'hybrid',colors:['red','red','red','blue'],immediate:.5,burn:.5,red:.5},
        {name:'kinetic',colors:['red','red','red','yellow'],immediate:1,burn:0,red:.75,signature:'rupture'},
        {name:'spectral',colors:['blue','blue','blue','yellow'],immediate:.25,burn:.75,red:0,signature:'dissolution'},
        {name:'prismatic',colors:['red','blue','yellow'],immediate:0,burn:0,red:0,prism:true},
        {name:'inert',colors:[],immediate:1,burn:0,red:0},
      ];
      for(const row of natureCases)for(const resistance of [0,50]){
        const attacker=actor('A',{criticalChance:99,criticalDamage:10}),victim=actor('B',{criticalResistance:resistance});
        attacker.stats.HP.current=100;
        const def={functionName:`matrix-${row.name}`,displayName:row.name,combatFunction:'Attaquant',attackRange:['melee'],
          attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],executionTime:0,
          essenceSlots:row.colors.map(color=>({color,active:true}))};
        // Prism's ordinary three-way hit rounds to 399, then its existing
        // 1.5% convergence signature deals 15. Neither is a critical supplement.
        const bonus=resistance?30:60,extra=400*bonus/100,instant=(row.prism?414:400)+extra*row.immediate;
        const sources=DR.splitDamageByNature(R.getAttackNatureRules(def),400);
        Math.random=()=>0;
        const flight=F.resolveAttackImpact(F.createAttackFlight(attacker,victim,def,sources));
        await advance(0);eq(await flight==='hit',true,`${row.name}/${resistance}: real critical impact`);
        Math.random=()=>.5;
        eq(victim.stats.HP.current,1000-instant,`${row.name}/${resistance}: immediate damage`);
        eq(victim.stats.HP.max,row.prism?1000-extra:1000,`${row.name}/${resistance}: max HP loss only for prism`);
        const burning=Fx.getActiveEffectStates(victim).find(state=>state.criticalBurn);
        eq(Boolean(burning),row.burn>0,`${row.name}/${resistance}: correct burn eligibility`);
        if(burning){
          eq(Object.values(burning.sources).reduce((sum,s)=>sum+s.remaining,0),extra*row.burn,`${row.name}/${resistance}: raw burn share`);
          eq(burning.expiresAt-C.clockNow(),bonus/10*row.burn*1000,`${row.name}/${resistance}: burn duration after resistance`);
        }
        eq(attacker.stats.HP.current,100+Math.round(instant*bonus/1000*row.red),`${row.name}/${resistance}: actual impact life steal`);
        if(row.signature){
          const state=C.captureCombatState()['nature-effects'].find(entry=>entry.entity===victim.id).effects.find(effect=>effect.key===row.signature);
          eq(state.amounts.length,Math.round(bonus/10),`${row.name}/${resistance}: charges use reduced bonus`);
        }
        if(burning){
          await advance(bonus/10*row.burn*1000);
          eq(victim.stats.HP.current,1000-instant-extra*row.burn,`${row.name}/${resistance}: full damage including final partial tick`);
          ok(!Fx.getActiveEffectStates(victim).some(state=>state.criticalBurn),`${row.name}/${resistance}: burn cleans up`);
        }
        Fx.clearCombatEffects(victim);
      }
      // Piercing exploits physical resistance and suffers magical resistance;
      // inert critical damage is reduced by both defenses, including its bonus.
      for(const [physicalResistance,magicalResistance,multiplier]of [[200,0,1.8],[0,200,.4],[100,100,1]]){
        const attacker=actor('A'),victim=actor('B',{physicalResistance,magicalResistance});
        hit(attacker,victim,['yellow'],100,50);
        eq(victim.stats.HP.current,1000-Math.round(150*multiplier),'Pure piercing critical uses the resistance differential');
      }
      const inertSource=actor('A'),inertTarget=actor('B',{physicalResistance:50,magicalResistance:50});
      const inertReduction=E.calculateResistances(inertTarget,{physical:150},inertSource,{inert:true}).reducedPhysicalDamage;
      hit(inertSource,inertTarget,[],100,50);
      eq(inertTarget.stats.HP.current,1000-inertReduction,'Inert critical supplement passes through both resistances');
      const source=actor('A',{criticalChance:99});source.stats.HP.current=500;
      const plain=actor('B',{armor:120});
      hit(source,plain,['red']);
      eq((plain.stats.armor?.current || 0),0,'Critical supplement is absorbed by armor');
      eq(plain.stats.HP.current,970,'Critical damage spills through armor normally');
      eq(source.stats.HP.current,502,'Physical critical steals life only on actual HP damage');
      const indestructible=actor('B',{armor:120,indestructibility:99});
      const criticalArmorBefore=source.combatDetails?.criticalBonusDamage || 0;
      Math.random=()=>0;hit(source,indestructible,['red']);Math.random=()=>.5;
      eq(indestructible.stats.HP.current,1000,'Indestructibility cancels HP after critical armor damage');
      eq(source.combatDetails.criticalBonusDamage-criticalArmorBefore,20,'Critical armor bonus remains counted before Indestructibility');
      const blue=actor('B');
      hit(source,blue,['blue']);
      eq(blue.stats.HP.current,900,'Pure magic bonus is deferred, no double immediate supplement');
      let burn=Fx.getActiveEffectStates(blue).find(s=>s.criticalBurn);
      eq(Object.values(burn.sources)[0].remaining,50,'Pure magic burn stores the full raw bonus');
      const flame=document.getElementById(`brulureVFX_${blue.id}`);
      ok(flame?.matches('.burn.magical-burn.magicalDamage'),'Magic critical uses the filtered flame');
      ok(document.querySelector(`#PopDow_${blue.id} [data-effect-key="magicalBurn"]`)?.textContent==='Brûlure magique 5 scd !','Magic critical announces its burn and duration');
      await advance(2000);eq(blue.stats.HP.current,880,'Burn ticks do not crit even with critical chance');
      hit(source,blue,['blue'],100,60);
      burn=Fx.getActiveEffectStates(blue).find(s=>s.criticalBurn);
      eq(Object.values(burn.sources)[0].remaining,90,'Remaining thirty plus new sixty is conserved');
      eq(burn.expiresAt-C.clockNow(),6000,'New burn duration replaces previous duration');
      ok(document.getElementById(`brulureVFX_${blue.id}`)===flame && document.querySelectorAll(`#effectsContainer_${blue.id} .burn`).length===1,'Stacking critical burns reuses one GIF');
      const saved=C.captureCombatState();
      await C.restoreCombatState(saved,{entities:E.entites,removed:[]});
      await advance(6000);eq(blue.stats.HP.current,690,'Merged burn survives state restoration and deals its exact remainder');
      ok(!Fx.getActiveEffectStates(blue).some(s=>s.criticalBurn),'Completed finite burn releases its state');
      ok(!document.getElementById(`brulureVFX_${blue.id}`),'Expired magical burn removes its GIF');
      const mixedBurn=actor('B');
      Fx.brulure(mixedBurn,{effectDot:1},source);
      const sharedFlame=document.getElementById(`brulureVFX_${mixedBurn.id}`);
      Fx.brulure(mixedBurn,{criticalBurn:true,effectDot:5,effectDuration:1},source);
      (await import('/js/rendering/displayBatch.js')).flushCombatDisplay();
      ok(sharedFlame.classList.contains('magical-burn') && document.querySelectorAll(`#effectsContainer_${mixedBurn.id} .burn`).length===1,'Ordinary and magical burns share one GIF');
      await advance(1000);
      (await import('/js/rendering/displayBatch.js')).flushCombatDisplay();
      ok(sharedFlame.isConnected && !sharedFlame.classList.contains('magical-burn'),'The remaining ordinary burn regains its original flame');
      Fx.clearCombatEffects(mixedBurn);
      ok(!sharedFlame.isConnected,'Removing all burns cleans up the shared GIF');
      const hybrid=actor('B');const hp=source.stats.HP.current;
      hit(source,hybrid,['red','red','red','blue'],100,55);
      burn=Fx.getActiveEffectStates(hybrid).find(s=>s.criticalBurn);
      eq(Object.values(burn.sources)[0].remaining,27.5,'Hybrid always divides the supplement equally');
      eq(burn.expiresAt-C.clockNow(),2750,'Hybrid fractional duration is retained');
      eq(Object.values(burn.sources)[0].lifesteal,2.75,'Hybrid critical life steal is 2.75 percent');
      await advance(2750);eq(hybrid.stats.HP.current,845,'Fractional final tick preserves the total hybrid supplement');
      ok(source.stats.HP.current>hp,'Life steal applies at impact and burn ticks');
      const kinetic=actor('B',{physicalResistance:100,alterationResistance:50});
      kinetic.stats.shift={current:2,max:5};
      hit(source,kinetic,['red','red','red','yellow'],100,55);
      eq(kinetic.stats.shift.current,1,'Exaust withdraws one current movement');
      const ns=C.captureCombatState()['nature-effects'].find(e=>e.entity===kinetic.id).effects.find(e=>e.key==='rupture');
      eq(ns.amounts.length,6,'Critical charges round to nearest');
      eq(ns.amounts[0],2.5,'Resilience reduces resistance loss, not charges');
      hit(source,kinetic,['red','red','red','yellow'],100,55);
      eq(C.captureCombatState()['nature-effects'].find(e=>e.entity===kinetic.id).effects[0].amounts.length,10,'Rupture caps at ten charges');
      hit(source,kinetic,['red','yellow'],10,50);eq(kinetic.stats.shift.current,0,'Exaust at zero cannot create movement debt');
      kinetic.stats.shift.current=-2;Fx.exaust(kinetic);
      eq(kinetic.stats.shift.current,-2,'Ignored Exaust cannot repay existing movement debt');
      const guarded=actor('B',{hindranceResistance:99});
      guarded.stats.shift={current:2,max:5};Math.random=()=>.49;hit(source,guarded,['red','yellow'],10,50);Math.random=()=>.5;
      eq(guarded.stats.shift.current,2,'Hindrance protection cancels Exaust');
      hit(source,guarded,['red','yellow'],10,50);
      eq(guarded.stats.shift.current,1,'Exaust passes at the 50 percent resistance boundary');
      const spectral=actor('B');
      spectral._combatAction={stage:'preparation',attack:{},preparation:{progress:500,lastTick:C.clockNow()}};
      hit(source,spectral,['blue','blue','blue','yellow'],100,60);
      eq(spectral._combatAction.preparationRecoils.length,1,'Spectral impact recoils preparation');
      burn=Fx.getActiveEffectStates(spectral).find(s=>s.criticalBurn);
      eq(Object.values(burn.sources)[0].remaining,45,'Spectral burn follows magic purity');
      eq(burn.expiresAt-C.clockNow(),4500,'Spectral duration follows magic purity');
      await advance(1000);eq(spectral._combatAction.preparationRecoils.length,2,'Spectral burn tick also applies recoil');
      eq(spectral._combatAction.preparationRecoils[1].percent,1,'Each recoil uses its own HP damage');
      delete spectral._combatAction;
      const spectralResilient=actor('B',{magicalResistance:100,alterationResistance:50});
      hit(source,spectralResilient,['blue','yellow'],10,55);
      hit(source,spectralResilient,['blue','yellow'],10,55);
      const dissolved=C.captureCombatState()['nature-effects'].find(entry=>entry.entity===spectralResilient.id).effects.find(effect=>effect.key==='dissolution');
      eq(dissolved.amounts.length,10,'Dissolution critical charges cap at ten');
      ok(dissolved.amounts.every(amount=>amount===2.5),'Resilience attenuates every Dissolution charge without removing charges');
      Fx.clearCombatEffects(spectralResilient);
      const turning=actor('B');const turnTask=A.runPhaseTimer(turning,'speedTimer',1000);
      await advance(500);Fx.applySpectralRecoil(turning,source,200,1000);await advance(50);
      ok(turning.speedTimer>=640&&turning.speedTimer<=660,'Recoil adds twenty percentage points to remaining turn time');
      await advance(650);await turnTask;
      const recovery=actor('B');const recoveryTask=A.runPhaseTimer(recovery,'recoveryTime',1000);
      await advance(500);Fx.applySpectralRecoil(recovery,source,200,1000);await advance(700);await recoveryTask;
      const projectile=actor('B');projectile._combatAction={stage:'transport',attack:{attackRange:['range']}};
      Fx.applySpectralRecoil(projectile,source,200,1000);ok(!projectile.executionRecoils,'Spectral recoil leaves projectiles untouched');
      const prism=actor('B');
      hit(source,prism,['red','blue','yellow'],100,50);
      eq(prism.stats.HP.max,950,'Prismatic supplement becomes fifty max HP points');
      Fx.corruptionPrismatique(prism,{effectAmount:60},source);eq(prism.stats.HP.max,890,'Prismatic losses add');
      const before=prism.stats.HP.current;E.recomputeEntityStats(prism,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      eq(prism.stats.HP.max,890,'Stat recomputation keeps corruption');eq(prism.stats.HP.current,before,'Stat recomputation cannot heal corruption');
      await advance(19000);Fx.corruptionPrismatique(prism,{effectAmount:2000},source);
      eq(prism.stats.HP.max,1,'Corruption cannot reduce maximum below one');eq(prism.stats.HP.current,1,'Corruption cannot kill');
      await advance(19999);eq(prism.stats.HP.max,1,'Stack refresh grants twenty full seconds');
      await advance(251);eq(prism.stats.HP.max,1000,'Expiration restores uncorrupted capacity');eq(prism.stats.HP.current,1,'Expiration does not heal');
      const resilient=actor('B',{alterationResistance:50});
      Fx.corruptionPrismatique(resilient,{effectAmount:80},source);eq(resilient.stats.HP.max,960,'Resilience reduces corruption amount');
      const corrupt=C.captureCombatState()['nature-effects'].find(e=>e.entity===resilient.id).effects[0];
      eq(corrupt.expiresAt-C.clockNow(),20000,'Resilience does not shorten corruption duration');
      const resistance=actor('B',{criticalResistance:50});
      const physical={combatFunction:'Attaquant',essenceSlots:[{color:'red',active:true}]};
      Math.random=()=>0;
      const roll=_D.rollAttackCritical(source,resistance,physical);
      eq(roll.bonus,25,'Critical resistance reduces the bonus before properties');eq(roll.precision,2.5,'Precision is derived from the reduced critical bonus');
      Math.random=()=>.5;

      // Three neighbouring victims: simulate the same finite amount divisions to
      // check true recursive explosions, provenance and victim-side targeting.
      const center=actor('B',{},cell(1,5)),left=actor('B',{},cell(1,4)),upper=actor('B',{},cell(0,5));
      const friendly=actor('A',{},cell(1,6));
      Move.invalidateFootprintGeometry(host);Move.rebuildBoardOccupancy(host);
      const victims=[center,left,upper],expected=new Map(victims.map(v=>[v.id,{damage:0,burn:0}]));
      const queue=[{v:center,damage:100}];
      for(let i=0;i<queue.length;i++){
        const {v,damage}=queue[i],tot=expected.get(v.id);tot.damage+=damage;tot.burn+=damage*.5;
        const neighbours=Move.getAdjacentEntities(v).filter(e=>expected.has(e.id));
        const share=Math.floor(damage*.5/(neighbours.length||1));
        if(share>0)for(const neighbour of neighbours)queue.push({v:neighbour,damage:share});
      }
      Math.random=()=>0;hit(source,center,['blue']);Math.random=()=>.5;
      for(const victim of victims){
        eq(1000-victim.stats.HP.current,expected.get(victim.id).damage,'Explosion chains deal each secondary own incoming share');
        const burn=Fx.getActiveEffectStates(victim).find(s=>s.criticalBurn);
        eq(Object.values(burn.sources).reduce((sum,s)=>sum+s.remaining,0),expected.get(victim.id).burn,'Each secondary critical burns for its own bonus');
      }
      eq(friendly.stats.HP.current,1000,'Explosion hits allies of the victim, not allies of the caster');
      ok(queue.length>3,'The integration scenario really exercised recursive explosions');
      for(const victim of victims)Fx.clearCombatEffects(victim);
      // Real explosion distribution over all six neighbours, then every outer
      // neighbour of a six-cell entity. Secondary hits have no critical chance here.
      const Board=await import('/js/board/model.js');
      for(const size of [1,6]){
        const grid=document.createElement('section');grid.className='hex-grid';document.body.append(grid);
        const cells=[];
        for(let row=0;row<6;row++)for(let col=0;col<10;col++){
          const hex=document.createElement('div');hex.className='hex Neutral';
          Object.assign(hex.dataset,{position:`aoe-${size}-${row}-${col}`,row,col});grid.append(hex);
          cells.push({id:hex.dataset.position,row,col});
        }
        const geometry=Board.createBoardGeometry(cells),anchor=`aoe-${size}-2-3`;
        const members=Board.footprintCells(geometry,anchor,size);
        const outer=[...new Set(members.flatMap(cell=>geometry.neighbours.get(cell)).filter(cell=>!members.includes(cell)))];
        const at=id=>grid.querySelector(`[data-position="${id}"]`);
        const giant=actor('B',{},at(anchor));giant.sizeInCells=size;
        const neighbours=outer.map(id=>actor('B',{},at(id))),caster=actor('A');
        Move.invalidateFootprintGeometry(grid);Move.rebuildBoardOccupancy(grid);
        eq(Move.getAdjacentEntities(giant).length,outer.length,'All footprint neighbours are resolved in combat');
        ok(size===1?outer.length===6:outer.length>6,'Explosion fixture covers the complete perimeter');
        hit(caster,giant,['blue'],120,50);
        for(const neighbour of neighbours){
          eq(neighbour.stats.HP.current,1000-Math.floor(60/outer.length),`Size ${size}: equal inward-rounded explosion share`);
          ok(!Fx.getActiveEffectStates(neighbour).some(state=>state.criticalBurn),'A noncritical explosion cannot generate a burn');
        }
        Fx.clearCombatEffects(giant);grid.remove();
      }
      const simultaneous=[actor('A'),actor('B')];
      for(const entity of simultaneous) entity.stats.HP={current:100,max:100};
      const simultaneousAt=Timeline.combatNow()+50;
      const impacts=simultaneous.map((entity,i)=>Timeline.scheduleCombatImpactTask(simultaneousAt,()=>()=>hit(entity,simultaneous[1-i],['red'],10,50)));
      await advance(50);await Promise.all(impacts.map(impact=>impact.promise));
      eq(simultaneous[0].stats.HP.current,86,'Simultaneous critical life steal applies after damage');
      eq(simultaneous[1].stats.HP.current,86,'Simultaneous critical life steal treats both camps equally');
      // Full pause-state restore retains corruption capacity and expiration.
      Fx.corruptionPrismatique(resilient,{effectAmount:20},source);
      const corruptSave=C.captureCombatState();const maxBefore=resilient.stats.HP.max;
      C.freezeCombatClock();await advance(1000);eq(resilient.stats.HP.max,maxBefore,'Pause freezes corruption');C.resumeCombatClock();
      await C.restoreCombatState(corruptSave,{entities:E.entites,removed:[]});
      eq(resilient.stats.HP.max,maxBefore,'Restore does not apply corruption a second time');
      Fx.clearCombatEffects(resilient);eq(resilient.stats.HP.max,1000,'Cleanup restores maximum capacity');
      Fx.clearCombatEffects();
      for (const colors of [['red','yellow'],['blue','yellow']]) {
        const target=actor('B',{physicalResistance:100,magicalResistance:100});
        const attack={combatFunction:'Attaquant',essenceSlots:colors.map(color=>({color,active:true}))};
        const signature=R.getAttackNatureRules(attack).signature;
        Fx.applyAttackNatureEffect(target,source,attack);
        const snapshot=C.captureCombatState();
        await C.restoreCombatState(snapshot,{entities:E.entites,removed:[]});
        await advance(signature.durationMs/2);
        eq(Fx.applyAttackNatureEffect(target,source,attack).stacks,2,'A restored nature effect accepts a refreshed stack');
        await advance(signature.durationMs/2+1);
        eq(Fx.applyAttackNatureEffect(target,source,attack).stacks,3,'The old restored deadline cannot remove a refreshed nature boost');
        eq(target.battleBoosts[signature.resistance].length,1,'Refreshed nature uses one live resistance boost');
        target.battleBoosts[signature.resistance][0].remove();
        eq(Fx.applyAttackNatureEffect(target,source,attack).stacks,4,'A missing boost is rebound without losing active charges');
        await advance(signature.durationMs+1);
        eq(Fx.applyAttackNatureEffect(target,source,attack).stacks,1,'Expired nature charges restart at one');
        Fx.clearCombatEffects(target);
        ok(!target.battleBoosts[signature.resistance],'Nature cleanup removes the rebound boost');
      }
      const caster=actor('A'),victim=actor('B');
      const cast=spell('silence-cooldown',{preparationTime:5000,cooldown:8000});
      const casting=F.executeAttack(caster,victim,cast);await advance(2000);
      const at=C.clockNow();apply(caster,'silence',source,3);
      eq(R.getAttackRuntime(caster,cast).readyAt,at+8000,'Silence restarts full cooldown at interruption');
      apply(caster,'silence',source,3);
      eq(R.getAttackRuntime(caster,cast).readyAt,at+8000,'Repeated silence does not restart an already interrupted action');
      await advance(60);ok(await casting==='silenced','Silence cancels the preparation');
      console.log('[Audit] Critical natures completed');
    } finally {
      for(const e of E.entites) {e.battleStopped=true;Fx.clearCombatEffects(e);}
      Timeline.clearCombatTimeline();Math.random=random;Date.now=date;delete window.__resilienceTimerBackend;host.remove();
    }
    return checks;
  });

  await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js'),Fx=await import('/js/combat/effects.js');
    const Views=await import('/js/rendering/entities.js'),V=await import('/js/rendering/vitalFeedback.js');
    const Display=await import('/js/rendering/displayBatch.js');
    const e=E.enrichEntityStats({id:988888,name:'Corruption prismatique',type:'sbire',side:'A',level:1,awakening:3,attacks:['autoAttack'],baseStats:{HP:1000},stuff:{}});
    e.stats.HP.current=350;E.entites.push(e);
    const box=document.createElement('section');box.id='corruption-preview';
    box.style.cssText='position:fixed;z-index:2147483647;inset:20px auto auto 20px;width:min(500px,calc(100vw - 40px));padding:24px;box-sizing:border-box;color:white;background:#231a28;font:16px sans-serif;';
    const label=document.createElement('p');label.textContent='Corruption prismatique — 350 / 600 PV';box.append(label);
    const wrap=document.createElement('div');wrap.className='health-bar-container';wrap.style.cssText='height:20px;width:100%;margin:25px 0;';wrap.append(Views.createLifeBars(e));box.append(wrap);document.body.append(box);
    Fx.corruptionPrismatique(e,{effectAmount:400},e);Display.flushCombatDisplay();
    const check=()=>{const black=wrap.querySelector('.corruption-capacity');if(!black||Math.abs(parseFloat(black.style.width)-40)>1e-7)throw Error('Corruption bar must show forty percent of original maximum');};
    check();V.updateHealthBar(350,600,0,0,e.id);Display.flushCombatDisplay();check();
    wrap.replaceChildren(Views.createLifeBars(e));await Promise.resolve();Display.flushCombatDisplay();check();
    window.__corruptionPreview={e,Fx,V,Display,check};
  });
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:800});
    await page.locator('#corruption-preview').screenshot({path:resolve(output,`corruption-${width}.png`)});
    const rect=await page.locator('#corruption-preview').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width);
  }
  await page.evaluate(()=>{const {e,Fx,Display}=window.__corruptionPreview;Fx.clearCombatEffects(e);Display.flushCombatDisplay();if(e.stats.HP.current!==350||e.stats.HP.max!==1000)throw Error('Clearing visible corruption must not heal');});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'checks.json'),JSON.stringify(checks,null,2));
  console.log(`Critical nature integration: ${checks.length} checks passed.`);
} finally {await browser.close();await new Promise(done=>server.close(done));}
