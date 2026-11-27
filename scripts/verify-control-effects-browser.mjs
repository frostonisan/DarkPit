import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/control-effects');await mkdir(output,{recursive:true});
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
    try{
      Math.random=()=>.999999;
      const source=actor('A');
      ok(!Data.attackEffects.some(effect=>effect.effectName==='sideration')&&!A.getAttackEffectHandler('sideration'),'Old Sideration name removed from catalog and handlers');
      for(const name of ['immobilisation','stun','silence']){
        const definition=Data.attackEffects.find(e=>e.effectName===name);
        ok(definition && A.getAttackEffectHandler(name),name+': catalog and real handler');
        ok(!T.collectTacticalConsequences({effets:[name]},{effects:Data.attackEffects,mechanicFor:A.getAttackEffectHandler}).incomplete,name+': tactical metadata');
      }
      const rooted=actor('B',{alterationResistance:50});
      apply(rooted,'immobilisation',source);
      ok(!D.consumeEntityMovement(rooted).allowed,'Immobilisation blocks voluntary movement');
      ok(!Control.isEntityActionPaused(rooted),'Immobilisation does not suspend actions');
      ok(!_D.isAlterationEffect(Data.attackEffects.find(e=>e.effectName==='immobilisation')),'Entrave does not automatically become alteration');
      let done=false;A.runPhaseTimer(rooted,'speedTimer',100).then(()=>done=true);
      await advance(101);ok(done,'Turn timer advances while immobilised');
      await advance(2500);ok(Control.isEntityMovementBlocked(rooted),'Alteration resistance does not shorten pure immobilisation');
      await advance(2400);ok(!Control.isEntityMovementBlocked(rooted),'Immobilisation expires');
      const dazed=actor('B');apply(dazed,'stun',source,1);
      ok(D.consumeEntityMovement(dazed).allowed,'Stun allows voluntary movement');
      done=false;A.runPhaseTimer(dazed,'speedTimer',100).then(()=>done=true);
      await advance(999);ok(!done,'Stun suspends the action clock');
      await advance(110);ok(done,'Stun resumes remaining time');
      const moving=actor('B');moving.orderPhase='orderExecution';
      apply(moving,'stun',source,1);
      done=false;A.runPhaseTimer(moving,'orderExecutionTime',100).then(()=>done=true);
      await advance(101);ok(done,'Stun does not suspend a voluntary movement order');
      apply(moving,'immobilisation',source,1);
      done=false;A.runPhaseTimer(moving,'orderExecutionTime',100).then(()=>done=true);
      await advance(999);ok(!done,'Immobilisation suspends a voluntary movement order');
      await advance(110);ok(done,'Movement order resumes after Immobilisation');
      const overlap=actor('B'),start=now;
      Control.addEntityControl(overlap,'stun',start,start+1000);
      Control.addEntityControl(overlap,'stun',start+500,start+1500);
      eq(Control.getActionElapsed(overlap,start,start+2000),500,'Overlapping controls are not counted twice');
      for(const name of ['immobilisation','stun','silence']){
        const guarded=actor('B',{resilienceTotal:99});Math.random=()=>0;
        ok(apply(guarded,name,source)==='alteration_canceled',name+': total resilience cancels before application');
        ok(!Control.isEntityActionPaused(guarded)&&!Control.isEntitySilenced(guarded)&&!Control.isEntityMovementBlocked(guarded),name+': cancelled control has no gameplay effect');
        ok(!document.querySelector(`#effectsContainer_${guarded.id} [data-control-effect]`),name+': cancelled control has no visual');
        Math.random=()=>.01;
        const agile=actor('B',{hindranceResistance:99});
        const result=apply(agile,name,source);
        ok(name==='immobilisation'?result==='alteration_canceled':result===true,name+': only immobilisation uses hindrance resistance');
        Fx.clearControlEffects(agile);Math.random=()=>.999999;
      }
      for(const name of ['stun','silence']){
        const smart=actor('B',{alterationResistance:50});apply(smart,name,source,3);
        await advance(1499);ok(name==='silence'?Control.isEntitySilenced(smart):Control.isEntityActionPaused(smart),name+': active before reduced expiry');
        await advance(2);ok(name==='silence'?!Control.isEntitySilenced(smart):!Control.isEntityActionPaused(smart),name+': 50% resistance halves duration');
      }
      const combined=actor('B');apply(combined,'immobilisation',source,1);apply(combined,'stun',source,2);
      ok(Control.isEntityMovementBlocked(combined)&&Control.isEntityActionPaused(combined),'Immobilisation and Stun combine');
      await advance(1001);ok(!Control.isEntityMovementBlocked(combined)&&Control.isEntityActionPaused(combined),'Independent control expiries');
      await advance(1000);

      const target=actor('B');
      const caster=actor('A');const defs=configure(caster,[spell('silent-turn')]);
      const deadline=R.startAttackCooldown(caster,defs[0],1500);
      apply(caster,'silence',source,3);
      ok(D.consumeEntityMovement(caster).allowed,'Silence allows voluntary movement');
      const turn=Battle.entiteTurn(caster);
      await advance(500);ok(caster.speedTimer>0&&caster.speedTimer<1000,'Silence lets the turn charge');
      await advance(600);ok(caster.isATBFull&&!caster._combatAction,'Full turn waits without casting');
      eq(caster.turnCount,1,'Waiting does not accumulate turns');
      await advance(500);
      eq(R.getAttackRuntime(caster,defs[0]).readyAt,deadline,'Silence never shifts cooldown deadline');
      ok(R.describeAttackChoices(caster,defs,a=>a.cooldown)[0].remaining===0,'Cooldown expires during Silence');
      ok((await Battle.selectAttackDecision(caster)).status==='silenced','Ready abilities remain uncastable while silenced');
      ok(!caster._targetSearch&&caster.currentPhase==='silence-wait','Silence waits without forced target search');
      await advance(1450);
      ok(caster._combatAction?.stage==='preparation','Ready turn starts preparation when Silence ends');
      ok(caster.preparationTime>=4900,'Preparation starts from zero after Silence');
      eq(caster.turnCount,1,'No new turn is charged on Silence expiry');
      await stop(caster,turn);

      for(const switchSpell of [false,true]){
        const e=actor('A');
        const list=configure(e,switchSpell?[spell('interrupted',{cooldown:12000}),spell('preferred'),spell('other')]:[spell('restart')]);
        R.setAttackPriority(e,list,R.attackSelectionKey(list[0]),1);
        if(switchSpell)R.startAttackCooldown(e,list[1],6000);
        const completed=[];const listener=event=>{if(event.detail.entityId===e.id)completed.push(event.detail);};
        document.addEventListener('entityTurnCompleted',listener);
        const task=Battle.entiteTurn(e);
        await advance(5000);
        ok(e._combatAction?.stage==='preparation','Actual turn is preparing before interruption');
        ok(e.preparationTime>900&&e.preparationTime<1100,'Actual preparation reached 4 / 5 seconds');
        const resetReady=C.clockNow()+e._combatAction.timings.cooldown;
        apply(e,'silence',source,3);
        await advance(60);
        ok(!e._combatAction&&e.currentPhase==='silence-wait','Silence abandons the pending preparation');
        eq(e.preparationTime,0,'Interrupted preparation is cleared');
        eq(completed.length,0,'Interruption does not complete a turn');
        eq(R.getAttackRuntime(e,list[0]).readyAt,resetReady,'Silence restarts the interrupted attack full cooldown');
        if(switchSpell)R.setAttackPriority(e,list,R.attackSelectionKey(list[1]),1);
        await advance(2000);
        ok(!e._combatAction&&!e._targetSearch,'No cast or forced search during Silence');
        await advance(1000);
        const selected=switchSpell?list[1]:list[0];
        ok(e.currentAttackId===R.attackSelectionKey(selected),'Silence expiry reevaluates available attacks and priority');
        ok(e._combatAction?.stage==='preparation'&&e.preparationTime>=4900,'Selected attack restarts its full preparation');
        eq(e.turnCount,1,'Interrupted turn remains acquired');
        eq(completed.length,0,'No extra turn/search recovery sanction');
        await stop(e,task);document.removeEventListener('entityTurnCompleted',listener);
      }
      const short=actor('A');const shortAttack=spell('short-silence');
      const interrupted=F.executeAttack(short,target,shortAttack);
      await advance(500);apply(short,'silence',source,.001);await advance(60);
      ok(await interrupted==='silenced','Even Silence shorter than one timer tick discards preparation');
      const meleeCaster=actor('A'),meleeTarget=actor('B');
      const meleeSpell=spell('suspended-melee',{attackRange:['melee'],preparationTime:100,executionTime:1000,physicalRatio:1});
      meleeCaster.stats.physicalDamage=20;
      const meleeTask=F.executeAttack(meleeCaster,meleeTarget,meleeSpell);
      await advance(200);const beforeMelee=meleeTarget.stats.HP.current;
      apply(meleeCaster,'stun',source,1);
      await advance(950);eq(meleeTarget.stats.HP.current,beforeMelee,'Stun postpones an already engaged melee execution');
      await advance(1000);await meleeTask;
      ok(meleeTarget.stats.HP.current<beforeMelee,'Melee execution resumes its remaining time and hits once');
      const noTarget=actor('A');configure(noTarget,[spell('no-target',{attackTarget:['hexa'],deadTarget:['yes']})]);
      // A normal no-target decision is distinct from the Silence availability gate.
      apply(noTarget,'silence',source,.1);
      ok((await Battle.selectAttackDecision(noTarget)).status==='silenced','Silence precedes target search');
      await advance(101);
      ok((await Battle.selectAttackDecision(noTarget)).status==='no-target','Ordinary incompatible-target search remains available after Silence');

      const savedTarget=actor('B');apply(savedTarget,'silence',source,3);apply(savedTarget,'stun',source,2);apply(savedTarget,'immobilisation',source,1);
      const snapshot=C.captureCombatState();
      ok(snapshot.alterations.filter(e=>e.target===savedTarget.id).length===3,'Snapshot includes all three independent controls');
      const messages=document.getElementById(`PopDow_${savedTarget.id}`).childElementCount;
      await C.restoreCombatState({alterations:snapshot.alterations},{entities:E.entites});
      eq(document.getElementById(`PopDow_${savedTarget.id}`).childElementCount,messages,'Restore adds no duplicate application popup');
      ok(Control.isEntitySilenced(savedTarget)&&Control.isEntityActionPaused(savedTarget)&&Control.isEntityMovementBlocked(savedTarget),'Restore retains three controls');
      C.freezeCombatClock();const paused=C.clockNow();await advance(5000);eq(C.clockNow(),paused,'Combat pause freezes control durations');C.resumeCombatClock();
      await advance(1001);ok(!Control.isEntityMovementBlocked(savedTarget)&&Control.isEntitySilenced(savedTarget),'Restored durations expire independently');
      Fx.clearControlEffects(savedTarget);
      ok(!Control.isEntitySilenced(savedTarget)&&!Control.isEntityActionPaused(savedTarget),'Cleanup removes all control locks');
      const projectileCaster=actor('A'),projectileTarget=actor('B');
      const flight=F.createAttackFlight(projectileCaster,projectileTarget,spell('in-flight'),{physical:20});
      apply(projectileCaster,'silence',source);
      const hp=projectileTarget.stats.HP.current;
      const impact=F.resolveAttackImpact(flight);await advance(10);await impact;
      ok(projectileTarget.stats.HP.current<hp,'Silence does not cancel an already launched projectile');
      Fx.clearControlEffects();host.remove();
      return checks;
    }finally{Fx.clearControlEffects();Math.random=random;Date.now=date;delete window.__resilienceTimerBackend;}
  });
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,errors},null,2));
  console.log(`Immobilisation / Stun / Silence: ${checks.length} checks passed.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
