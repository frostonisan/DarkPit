import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/parametric-effects');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const rel=relative(root,file);if(rel==='..'||rel.startsWith('..'+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
    const saved=process.env.EFFECT_BASELINE && resolve(process.env.EFFECT_BASELINE,'docs',rel);
    res.end(await (saved?readFile(saved).catch(()=>readFile(file)):readFile(file)));}
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
    const E = await import("/js/entities/runtime.js"),D=await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))),A = await import("/js/combat/vitals.js");
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
      hex.append(box);E.entites.push(e);Move.invalidateFootprintGeometry(host);Move.rebuildBoardOccupancy(host);return e;
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
    const spell=(key,extra={})=>Data.resolveAttackEffects({...catalog[0],attackId:key,functionName:key,displayName:key,attackRange:['range'],attacknature:['physicalDamage'],
      attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],preparationTime:5000,executionTime:100,recoveryTime:100,cooldown:0,...extra});
    const configure=(e,defs)=>{R.setEntityAttackDefinitions(e,defs,catalog);e.stats.speed=1000;return R.readAttackDefinitionsForEntity(e,catalog);};
    const stop=async(e,task)=>{e.battleStopped=true;await advance(100);await task;Fx.clearControlEffects(e);};
    try{
      Math.random=()=>.999999;
      const Params = await import("/js/combat/effectParameters.js");
      const source=actor('A',{intelligence:100}),target=actor('B');
      const names=['interruption','stun','bafouillage','lenteur','folie','insolence','confusion','charme','effroi','sommeil'];
      for(const name of names) ok(A.getAttackEffectHandler(name)&&Data.attackEffects.some(e=>e.effectName===name),name+': catalog and handler');
      ok(!catalog.some(a=>a.functionName==='stun'),'Old standalone Stun attack is removed');
      ok(!Data.attackEffects.some(e=>['sideration','destabilisation'].includes(e.effectName)),'Removed effect names are absent from the catalog');
      ok(!A.getAttackEffectHandler('destabilisation'),'Direct destabilisation has no combat handler');
      const configured={effets:['silence','folie'],selfEffects:['silence'],effectOverrides:{silence:{effectDuration:{flat:3,ratios:[{stat:'intelligence',coefficient:.02}]}},folie:{effectDuration:9,effectMaxChanges:4}},selfEffectOverrides:{silence:{effectDuration:1}}};
      const preview=Params.previewAttackEffects(configured,source);
      eq(preview[0].effectDuration,3+Rules.getSafe(source,'intelligence',0)*.02,'Duration includes the source stat ratio');
      eq(preview[1].effectDuration,9,'Independent effect duration');
      eq(Params.previewAttackEffects(configured,source,true)[0].effectDuration,1,'Self effects have independent settings');
      eq(Params.previewAttackEffects({effets:['silence'],effectOverrides:{silence:{effectDuration:0}}},source)[0].effectDuration,0,'Explicit zero remains zero');
      eq(Params.previewAttackEffects({effets:['silence'],effectOverrides:{silence:{effectDuration:null}}},source)[0].effectDuration,3,'Null resets to catalog default');
      eq(Data.attackEffects.find(e=>e.effectName==='silence').effectDuration,3,'Preview never mutates defaults');
      if (Data.getAttackEffectDefinition) {
        const modified=actor('B',{agility:20,vision:10,vitality:0,speed:1000});
        const initial=structuredClone(modified.baseStats), hp=modified.stats.HP.max;
        modified.stats.HP.current=hp/2;
        const modifier=(name,value,mode='flat',seconds=2)=>{return {attackId:'audit-'+name,effets:[name],effectOverrides:{[name]:{
          effectValue:value,effectModifierMode:mode,effectDuration:seconds}}};};
        const cast=(name,value,mode,seconds)=>A.applyEffect(modified,name,source,modifier(name,value,mode,seconds));
        ok(['bonus-HP','bonus-vision','malus-agility'].every(name=>Data.listAttackEffects().some(e=>e.effectName===name)),'Catalogue exposes independently configurable stat modifiers');
        ok(Data.getAttackEffectDefinition('malus-agility').statKey==='agility'&&Data.getAttackEffectDefinition('bonus-vision').statKey==='vision','Modifier identities select either an attribute or an Umbra');
        const ratioEffect=modifier('bonus-HP',{flat:10,ratios:[{stat:'intelligence',coefficient:.1}]},'percent');
        eq(Params.previewAttackEffects(ratioEffect,source)[0].effectValue,10+Rules.getSafe(source,'intelligence')*.1,'Stat effect evaluates its own ratios');
        cast('bonus-HP',50,'percent');eq(modified.stats.HP.max,hp*1.5,'HP bonus changes live capacity');
        eq(modified.stats.HP.current,hp*.75,'HP bonus preserves health proportion');
        eq(Rules.getSafe(modified,'HP.max'),modified.stats.HP.max,'HP maximum is not boosted twice');
        eq(Move.entitySizeInCells(modified),1,'HP bonus does not change occupied size');
        cast('bonus-HP',25,'percent');eq(modified.stats.HP.max,hp*1.25,'Same provenance refreshes HP bonus without stacking');
        cast('malus-agility',5);eq(Rules.getSafe(modified,'agility'),15,'Flat attribute penalty uses ordinary stat calculation');
        const vision=Rules.getSafe(modified,'vision'),precision=Rules.getSafe(modified,'precision');
        cast('bonus-vision',10);eq(Rules.getSafe(modified,'vision'),vision+10,'Umbra points are granted independently');
        ok(Rules.getSafe(modified,'precision')>precision,'Umbra bonus regenerates its derived statistic');
        cast('malus-speed',50,'percent');eq(Rules.getSafe(modified,'speed'),1500,'Turn duration penalty is applied once');
        ok(JSON.stringify(modified.baseStats)===JSON.stringify(initial),'Temporary effects never change base stats');
        const pausedStats=C.captureCombatState();await C.restoreCombatState({boosts:pausedStats.boosts,alterations:pausedStats.alterations},{entities:E.entites});
        eq(modified.stats.HP.max,hp*1.25,'Snapshot restore does not apply HP twice');
        await advance(2100);
        eq(modified.stats.HP.max,hp,'Expiration restores HP capacity');eq(modified.stats.HP.current,hp/2,'Expiration preserves health proportion');
        eq(Rules.getSafe(modified,'vision'),10,'Expiration removes Umbra bonus');eq(Rules.getSafe(modified,'agility'),20,'Expiration removes attribute penalty');
        eq(Rules.getSafe(modified,'speed'),1000,'Expiration removes timing penalty');
        const resistant=actor('B',{resilienceTotal:100,alterationResistance:50,agility:20});
        Math.random=()=>0;
        ok(A.applyEffect(resistant,'malus-agility',source,modifier('malus-agility',5))==='alteration_canceled','Total resilience blocks a stat penalty');
        ok(A.applyEffect(resistant,'bonus-agility',source,modifier('bonus-agility',5))===true,'A beneficial modifier bypasses harmful resistance');
        eq(Rules.getSafe(resistant,'agility'),25,'Beneficial modifier still works on a resistant target');
        Fx.clearControlEffects(resistant);Math.random=()=>.999999;
        A.applyEffect(resistant,'malus-agility',source,modifier('malus-agility',5));
        const state=Control.getControlState(resistant,'malus-agility');
        eq(state.effect.effectDuration,2*(1-D.calculateResilienceAlterationTotalBonus(resistant)/100),'Alteration resistance reduces stat penalty duration');
        Fx.clearControlEffects(resistant);eq(Rules.getSafe(resistant,'agility'),20,'Cleanup removes the remaining temporary modifier');
        const multiple={attackId:'several-bonuses',effets:['bonus-HP','bonus-vision','malus-agility'],effectOverrides:{
          'bonus-HP':{effectValue:20,effectModifierMode:'percent'},
          'bonus-vision':{effectValue:5},'malus-agility':{effectValue:4}}};
        for(const name of multiple.effets)A.applyEffect(modified,name,source,multiple);
        eq(modified.stats.HP.max,hp*1.2,'One attack applies an HP percentage bonus');
        eq(Rules.getSafe(modified,'vision'),15,'The same attack independently applies a flat Umbra bonus');
        eq(Rules.getSafe(modified,'agility'),16,'The same attack also applies its independent stat penalty');
        window.dispatchEvent(new Event('battleEnding'));
        eq(modified.stats.HP.max,hp,'Pre-verdict cleanup removes the HP bonus');
        eq(Rules.getSafe(modified,'vision'),10,'Pre-verdict cleanup removes the Umbra bonus');
        const armored=actor('B',{armor:100});
        A.applyEffect(armored,'malus-armor',source,modifier('malus-armor',100,'percent'));
        eq(armored.stats.armor?.max||0,0,'A complete armor penalty does not fall back to the unmodified capacity');
        Fx.clearControlEffects(armored);
      }
      A.applyEffect(target,'silence',source,configured);
      const frozen=Control.getControlState(target,'silence').effect.effectDuration;
      configured.effectOverrides.silence.effectDuration.flat=100;
      eq(Control.getControlState(target,'silence').effect.effectDuration,frozen,'Applied values are frozen');Fx.clearControlEffects(target);
      const schema=Data.EFFECT_PARAMETER_SCHEMAS.silence.effectDuration;
      const Stat = await import("/js/entities/statSystem.js");
      eq(Params.calculateEffectParameter({flat:1,ratios:[{stat:'intelligence',coefficient:.02,curve:'progressive'}]},schema,source),1+Rules.getSafe(source,'intelligence',0)*.02*Stat.getProgressiveRatio(Rules.getSafe(source,'intelligence',0),'intelligence'),'Progressive term uses the existing curve');
      for(const name of names){
        const resistant=actor('B',{resilienceTotal:100});let calls=0;Math.random=()=>{calls++;return 0;};
        const result=A.applyEffect(resistant,name,source);
        ok(result==='alteration_canceled',name+': total resilience cancels');eq(calls,1,name+': no later resistance roll after cancellation');
        ok(!Control.getControlState(resistant,name),name+': no effect state on cancellation');
      }
      Math.random=()=>.5;
      for(const name of ['confusion','effroi','sommeil']){
        const resistant=actor('B',{hindranceResistance:100});
        ok(A.applyEffect(resistant,name,source)==='alteration_canceled',name+': hindrance cancellation after total resilience failure');
      }
      Math.random=()=>.999999;
      for(const name of ['folie','insolence','sommeil','bafouillage','lenteur','charme']){
        const resistant=actor('B',{alterationResistance:50});apply(resistant,name,source,4);
        eq(Control.getControlState(resistant,name).effect.effectDuration,2,name+': alteration resistance halves duration');Fx.clearControlEffects(resistant);
      }
      const recoil=actor('B',{alterationResistance:50});recoil._combatAction={stage:'preparation',attack:spell('recoil'),timings:{preparationTime:5000}};
      Fx.applyMovementDestabilisation(recoil);
      eq(recoil._combatAction.preparationRecoils[0].percent,20,'Movement recoil is not an alteration');delete recoil._combatAction;
      const grabbed=actor('B',{alterationResistance:50,vivacite:50,agility:50},cell(1,11));const grabber=actor('A',{},cell(1,0));
      grabbed._combatAction={stage:'preparation',attack:spell('grab-recoil')};
      A.applyEffect(grabbed,'grab',grabber,{effets:['grab'],effectOverrides:{grab:{effectDistance:5,effectMovementRecoilPercent:30}}});
      eq(grabbed._combatAction.preparationRecoils.length,1,'One displacement applies exactly one recoil');
      eq(grabbed._combatAction.preparationRecoils[0].percent,30,'Forced movement keeps its explicit recoil, regardless of alteration resistance');delete grabbed._combatAction;
      const sleeper=actor('B');const attack=configure(sleeper,[spell('sleep-cooldown')])[0];
      const deadline=R.startAttackCooldown(sleeper,attack,2000);apply(sleeper,'sommeil',source,3);
      let completed=false;A.runPhaseTimer(sleeper,'speedTimer',1000).then(()=>completed=true);
      await advance(1000);ok(!completed&&Control.isEntityMovementBlocked(sleeper),'Sleep pauses turn and voluntary movement');
      eq(R.getAttackRuntime(sleeper,attack).readyAt,deadline+1000,'Sleep pauses cooldown');
      sleeper.stats.HP.current=70;
      ok(!Fx.wakeFromDamage(sleeper,100,0,()=>0),'No HP loss means no wake roll');
      ok(!Fx.wakeFromDamage(sleeper,100,30,()=>.4),'30 percent HP loss has exactly 40 percent wake chance');
      ok(Fx.wakeFromDamage(sleeper,100,30,()=>.399),'30 percent loss wakes below the 40 percent threshold');
      ok(!Control.isEntityAsleep(sleeper),'Wake removes sleep immediately');
      await advance(1001);ok(completed,'Turn resumes its remaining progress after wake');
      eq(R.getAttackRuntime(sleeper,attack).readyAt,deadline+1000,'Cooldown only pauses for actual sleep time');
      const armored=actor('B',{armor:1000});apply(armored,'sommeil',source,5);const hp=armored.stats.HP.current;
      A.applyDamage(armored,10,source,{...spell('armor'),forceDamageSources:{physical:10}},{physical:10},[]);
      eq(armored.stats.HP.current,hp,'Armor absorbs physical damage');ok(Control.isEntityAsleep(armored),'Armor absorption does not wake sleeper');Fx.clearControlEffects(armored);
      const slow=actor('B');A.applyEffect(slow,'lenteur',source,{effets:['lenteur'],effectOverrides:{lenteur:{effectDuration:5,effectSlowPercent:50}}});
      completed=false;A.runPhaseTimer(slow,'speedTimer',1000).then(()=>completed=true);
      await advance(1000);ok(!completed,'Half turn speed has not finished after ordinary duration');
      eq(slow.speedTimer,500,'Turn advances at exactly half speed');await advance(1001);ok(completed,'Turn completes at twice the duration');Fx.clearControlEffects(slow);
      const mad=actor('A'),friend=actor('A'),enemy=actor('B');const choices=configure(mad,[spell('mad-one'),spell('mad-two')]);mad.turnCount=1;
      A.applyEffect(mad,'insolence',source,{effets:['insolence'],effectOverrides:{insolence:{effectDuration:30,effectMinInterval:1,effectMaxInterval:1,effectPriorityWeight:0,effectActivationWeight:1}}});
      Control.advanceInsolence(mad,choices.map(R.attackSelectionKey),()=>0);
      ok(R.describeAttackChoices(mad,choices,a=>a.cooldown)[0].disabled,'Insolence disables an attack');
      Control.advanceInsolence(mad,choices.map(R.attackSelectionKey),()=>.99);
      ok(R.describeAttackChoices(mad,choices,a=>a.cooldown).every(c=>c.disabled),'Insolence may disable every attack');
      Control.advanceInsolence(mad,choices.map(R.attackSelectionKey),()=>0);
      ok(!R.describeAttackChoices(mad,choices,a=>a.cooldown)[0].disabled,'Insolence can reactivate an attack even after all were disabled');
      eq(Control.getControlState(mad,'insolence').changes,3,'Each action makes one change');
      apply(mad,'folie',source,2);
      ok(F.acceptsSelectedTarget(mad,choices[0],friend)&&F.acceptsSelectedTarget(mad,choices[0],enemy)&&F.acceptsSelectedTarget(mad,choices[0],mad),'Folie ignores camps including self');
      Fx.clearControlEffects(mad);ok(R.describeAttackChoices(mad,choices,a=>a.cooldown).every(c=>!c.disabled),'Player settings restored after Folie');
      apply(mad,'charme',enemy,2);ok(mad.side==='B'&&Control.getCombatSide(mad)==='B','Charme really changes the combat side');
      ok(F.acceptsSelectedTarget(mad,choices[0],friend)&&!F.acceptsSelectedTarget(mad,choices[0],enemy),'Trahison reverses valid enemy targets');
      const grab=Data.attackEffects.find(e=>e.effectName==='grab');
      ok(D.isHindranceEffect(grab,mad,friend),'Trahison retains entrave resistance against the former camp');
      const allegianceFlight=F.createAttackFlight(mad,friend,choices[0],{physical:1});Fx.clearControlEffects(mad);
      ok(D.isHindranceEffect(grab,allegianceFlight.source,friend),'In-flight allegiance remains stable after Trahison expires');
      apply(mad,'folie',source,2);ok(D.isHindranceEffect(grab,mad,friend),'A chaotic allied Grab is still resistible');Fx.clearControlEffects(mad);
      const confused=actor('B',{},cell(1,6));const oldPosition=confused.position;apply(confused,'confusion',source,2);
      await advance(1001);ok(confused.position!==oldPosition,'Confusion moves to an adjacent available cell');Fx.clearControlEffects(confused);
      const escaping=actor('B',{speed:200});apply(escaping,'effroi',source,2);await advance(501);ok(escaping.hasFled,'Effroi uses the flee mechanic and removes the entity');Fx.clearControlEffects(escaping);

      const interrupted=actor('A'),victim=actor('B');const interruptionSpell=configure(interrupted,[spell('instant-interruption',{cooldown:60000})])[0];
      let casting=F.executeAttack(interrupted,victim,interruptionSpell);await advance(4000);
      const originalDeadline=R.getAttackRuntime(interrupted,interruptionSpell).readyAt;
      A.applyEffect(interrupted,'interruption',source);await advance(0);
      ok(await casting==='silenced','Instant interruption ends the ongoing preparation without another timer');
      eq(R.describeAttackChoices(interrupted,[interruptionSpell],a=>a.cooldown)[0].remaining,0,'Interrupted spell can restart immediately');
      casting=F.executeAttack(interrupted,victim,interruptionSpell);await advance(50);
      eq(R.getAttackRuntime(interrupted,interruptionSpell).readyAt,originalDeadline,'Interruption does not restart the cooldown');
      ok(interrupted.preparationTime>=4900,'Interrupted preparation restarts from zero');await stop(interrupted,casting);
      const recaster=actor('A',{alterationResistance:50});const recoilSpell=configure(recaster,[spell('precise-recoil')])[0];
      casting=F.executeAttack(recaster,victim,recoilSpell);await advance(2000);
      Fx.applyMovementDestabilisation(recaster);await advance(50);
      eq(recaster.preparationProgressRatio,.21,'Movement loses twenty percentage points then advances normally');await stop(recaster,casting);
      const melee=actor('A'),meleeTarget=actor('B');const meleeSpell=spell('melee-recoil',{attackRange:['melee']});
      melee._combatAction={stage:'transport',attack:meleeSpell};const started=C.clockNow();
      const meleeHp=meleeTarget.stats.HP.current;
      const flight=F.createAttackFlight(melee,meleeTarget,meleeSpell,{physical:20});
      const impact=F.resolveAttackImpact(flight,{at:started+1000,actionStartedAt:started,actionDuration:1000});
      await advance(400);Fx.applyMovementDestabilisation(melee);
      await advance(601);eq(meleeTarget.stats.HP.current,meleeHp,'Execution recoil delays the original melee impact');
      await advance(201);await impact;ok(meleeTarget.stats.HP.current<meleeHp,'Melee impact occurs after the lost execution progress');delete melee._combatAction;
      const ranged=actor('A');ranged._combatAction={stage:'transport',attack:spell('already-launched')};
      let movementRolls=0;Math.random=()=>{movementRolls++;return .99;};Fx.applyMovementDestabilisation(ranged);
      eq(movementRolls,0,'A launched projectile does not trigger movement recoil or a useless resistance roll');Math.random=()=>.999999;delete ranged._combatAction;
      const stunTarget=actor('B'),stunSpell=spell('stun-effect',{effets:['stun']});
      const stunFlight=F.createAttackFlight(source,stunTarget,stunSpell,{});const stunImpact=F.resolveAttackImpact(stunFlight);await advance(1);await stunImpact;
      ok(!Control.isEntityMovementBlocked(stunTarget)&&Control.isEntityActionPaused(stunTarget),'Zero damage attack with Stun pauses actions and allows movement');Fx.clearControlEffects(stunTarget);
      // Sleep wake contributions are additive within one impact, never accumulated between hits.
      const sleeping=actor('B');sleeping.stats.HP.current=100;
      const putToSleep=()=>{Math.random=()=>.999999;apply(sleeping,'sommeil',source,20);};
      let wakeRolls=0, randomStacks=[];
      const wakeRoll=value=>{wakeRolls=0;randomStacks=[];Math.random=()=>{wakeRolls++;randomStacks.push(new Error().stack);return value;};};
      putToSleep();wakeRoll(.499);
      Fx.withSleepImpact(sleeping,()=>{
        Fx.wakeFromDamage(sleeping,100,30);Fx.wakeFromMovement(sleeping);
        ok(Control.isEntityAsleep(sleeping),'Wake is deferred until all impact effects complete');
      });
      eq(wakeRolls,1,'Damage plus movement rolls only once');
      ok(!Control.isEntityAsleep(sleeping),'30 percent HP plus one movement wakes below 50 percent');
      putToSleep();wakeRoll(.5);
      Fx.withSleepImpact(sleeping,()=>{Fx.wakeFromMovement(sleeping);Fx.wakeFromDamage(sleeping,100,30);});
      eq(wakeRolls,1,'Movement before damage also rolls only once');
      ok(Control.isEntityAsleep(sleeping),'Combined wake chance is exactly 50 percent');
      wakeRoll(.2);Fx.wakeFromMovement(sleeping);
      ok(Control.isEntityAsleep(sleeping),'A separate movement is exactly 20 percent, no previous-hit accumulation');
      wakeRoll(.199);ok(Fx.wakeFromMovement(sleeping),'Movement wakes below 20 percent');eq(wakeRolls,1,'Single displacement has one wake roll');
      putToSleep();wakeRoll(0);Fx.withSleepImpact(sleeping,()=>Fx.wakeFromDamage(sleeping,100,0));
      eq(wakeRolls,0,'Fully absorbed damage without movement does not roll wake');
      ok(Control.isEntityAsleep(sleeping),'No HP loss leaves sleep intact');
      Fx.clearControlEffects(sleeping);
      wakeRoll(.999999);
      Fx.withSleepImpact(sleeping,()=>{Fx.wakeFromDamage(sleeping,100,30);apply(sleeping,'sommeil',source,20);});
      ok(Control.isEntityAsleep(sleeping),'Damage preceding a newly applied sleep does not wake it');
      Fx.clearControlEffects(sleeping);
      putToSleep();wakeRoll(0);
      for(const [name,args] of [['attemptDodge',[source,sleeping]],['attemptIndestructibility',[source,sleeping]],
        ['attemptEsoterism',[source,sleeping]],['attemptAstrality',[source,sleeping]],
        ['attemptResilienceCancel',[source,sleeping,Data.attackEffects.find(e=>e.effectName==='stun')]],
        ['attemptTranscendenceConsoProtection',[sleeping]]]) ok(D[name](...args)===false,name+': asleep passive cannot trigger');
      ok(!D.rollAlterationResistance(sleeping,{type:['entrave']}).canceled,'Sleep suppresses random resistance, not permanent mitigation');
      eq(wakeRolls,0,'Suppressed passives do not even draw random numbers');
      ok(!D.attemptCriticalHit(sleeping,source,10).isCritical,'Sleeping attacker cannot proc critical');
      eq(wakeRolls,0,'Sleeping critical does not roll');
      ok(!D.consumeEntityMovement(sleeping).allowed,'Sleeper cannot initiate movement');
      Fx.clearControlEffects(sleeping);

      const puller=actor('A',{},cell(2,0)),pulled=actor('B',{HP:100},cell(2,13));
      const sleepPulled=()=>{Math.random=()=>.999999;apply(pulled,'sommeil',puller,20);};
      sleepPulled();const previousPosition=pulled.position;wakeRoll(.2);
      ok(Move.pullEntityToward(pulled,puller,5),'Another entity can pull a sleeping target');
      ok(pulled.position!==previousPosition&&Control.isEntityAsleep(pulled),'Failed wake leaves sleeper in its new cell');
      eq(wakeRolls,1,'Five-cell pull is one movement, not five wake rolls');
      const partner=actor('A',{},cell(2,12));wakeRoll(.199);
      ok(Move.swapEntitiesFromEffect(puller,pulled,partner),'A sleeping participant does not cancel a swap');
      ok(!Control.isEntityAsleep(pulled),'Swap can wake the sleeping participant');
      sleepPulled();pulled.stats.HP.current=100;wakeRoll(.499);
      const combinedHit=Data.resolveAttackEffects({...spell('sleep-damage-grab'),attackRange:['melee'],type:['alteration'],effets:['grab'],forceDamageSources:{physical:30},
        effectOverrides:{grab:{effectDistance:5,effectMovementRecoilPercent:20}}});
      A.applyDamage(pulled,30,puller,combinedHit,{physical:30},[]);
      eq(pulled.stats.HP.current,70,'Combined attack inflicts the expected HP loss');
      eq(randomStacks.filter(stack=>stack.includes('resolveSleepWake')).length,1,'Real damage plus Grab combines into one wake roll, independently of attacker critical rolls');
      ok(!Control.isEntityAsleep(pulled),'Real damage plus Grab reaches 50 percent wake chance');
      sleepPulled();pulled.stats.HP.current=100;wakeRoll(.5);
      const impactTask=Timeline.scheduleCombatImpact(Timeline.combatNow()+1,()=>()=>A.applyDamage(pulled,30,puller,combinedHit,{physical:30},[]));
      await advance(1);await impactTask;
      eq(randomStacks.filter(stack=>stack.includes('resolveSleepWake')).length,1,'Deferred simultaneous-combat effects keep one wake roll');
      ok(Control.isEntityAsleep(pulled),'Deferred combined impact retains the exact 50 percent threshold');
      Fx.clearControlEffects(pulled);Math.random=()=>.999999;

      sleepPulled();wakeRoll(0);
      ok(!Move.pullEntityToward(pulled,puller,0),'A zero-distance pull does not move the target');
      eq(wakeRolls,0,'An unsuccessful displacement has no wake roll');Fx.clearControlEffects(pulled);
      putToSleep();wakeRoll(.299);
      Fx.withSleepImpact(sleeping,()=>{Fx.wakeFromMovement(sleeping);Fx.wakeFromMovement(sleeping);});
      eq(wakeRolls,1,'Two displacements in one impact have one wake roll');
      ok(!Control.isEntityAsleep(sleeping),'Two actual displacements add twenty points to the ten-point base');
      putToSleep();wakeRoll(.999999);
      Fx.withSleepImpact(sleeping,()=>{Fx.wakeFromDamage(sleeping,100,95);Fx.wakeFromMovement(sleeping);});
      ok(!Control.isEntityAsleep(sleeping),'Wake chance is capped at one hundred percent');

      const astral=actor('B',{astrality:100,intelligence:100});Math.random=()=>.999999;apply(astral,'sommeil',source,20);
      await C.restoreCombatState({astrality:[{entity:astral.id,state:{nextCheckAt:C.clockNow()+100}}]},{entities:E.entites});
      wakeRoll(0);await advance(100);
      eq(wakeRolls,0,'Scheduled astral body check does not roll during sleep');
      ok(!Fx.isAstralBodyActive(astral),'Corps astral cannot proc during sleep');
      const nextAstralCheck=Fx.getAstralityRuntime(astral).nextCheckAt;
      Fx.wakeFromMovement(astral);wakeRoll(0);await advance(1);
      eq(wakeRolls,0,'Waking does not replay a skipped passive check');
      ok(!Fx.isAstralBodyActive(astral),'No retroactive Corps astral on wake');
      await advance(nextAstralCheck-C.clockNow());
      ok(Fx.isAstralBodyActive(astral),'Corps astral can proc again on its next ordinary check');
      eq(wakeRolls,1,'Only the next scheduled passive draws randomness');Fx.clearAstralityEffects(astral);

      const paused=actor('B');apply(paused,'sommeil',source,2);apply(paused,'folie',source,3);
      const snapshot=C.captureCombatState();await C.restoreCombatState({alterations:snapshot.alterations},{entities:E.entites});
      ok(Control.isEntityAsleep(paused)&&Control.getControlState(paused,'folie'),'Sleep and Folie survive save/restore');
      Fx.clearControlEffects();host.remove();return checks;
    }finally{Fx.clearControlEffects();Math.random=random;Date.now=date;delete window.__resilienceTimerBackend;}
  });
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,errors},null,2));
  console.log(`Parametric effects: ${checks.length} checks passed.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
