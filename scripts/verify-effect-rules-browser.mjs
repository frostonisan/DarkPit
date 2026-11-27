import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/effect-rules');await mkdir(output,{recursive:true});
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
    const E = await import("/js/entities/runtime.js"),D = await import("/js/combat/statistics.js"),A = await import("/js/combat/vitals.js");
    const UI = await import("/js/ui/application.js"),F = await import("/js/combat/attacks.js"),State = await import("/js/app/state.js");
    const Fx = await import("/js/combat/effects.js"),R = await import("/js/combat/attackResolution.js"),C = await import("/js/combat/clock.js");
    const Timeline = await import("/js/combat/timeline.js");
    const Control = await import("/js/combat/control.js"),Move = await import("/js/board/controller.js"),Rules = await import("/js/entities/rules.js");
    const Data=await import('/js/data/attackEffects.js'),catalog=(await import('/js/data/attackList.js')).attackDetails;
    const T=await import('/js/procedural/proc-bareme.js');
    const Loader=await import('/js/data/loaderList.js');
    await Promise.all(['./media/assets/effects/stun.gif','./media/assets/ui/picto-grab.svg'].map(Loader.loadResource));
    const checks=[],ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
    const eq=(a,b,label)=>ok(Object.is(a,b)||Math.abs(a-b)<1e-6,`${label}: ${a} / ${b}`);
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
      const source=actor('A'),other=actor('A'),target=actor('B',{armor:0,magicalResistance:0,alterationResistance:0});
      const states=(e,kind)=>Fx.getActiveEffectStates(e).filter(s=>s.kind===kind);
      const applyFx=(e,name,from,key,params={})=>A.applyEffect(e,name,from,{attackId:key,functionName:key,displayName:key,effets:[name],effectOverrides:{[name]:params}});
      const setStat=(e,key,value)=>{e.baseStats[key]=value;E.recomputeEntityStats(e);};
      const clear=e=>Fx.clearCombatEffects(e);
      const zeroPoison={effectDot:50,effectDuration:5,effectTickInterval:1,effectPhysicalRatio:0,effectMagicalRatio:0};
      applyFx(target,'poison',source,'p1',zeroPoison);
      const first=states(target,'poison')[0],deadline=first.nextTickAt;
      await advance(600);
      applyFx(target,'poison',source,'p1',{...zeroPoison,effectDot:100});
      eq(states(target,'poison').length,1,'Same provenance refreshes one poison');
      eq(states(target,'poison')[0].nextTickAt,deadline,'Poison refresh keeps next tick');
      eq(states(target,'poison')[0].perSecond,20,'Poison refresh updates its own DPS');
      applyFx(target,'poison',other,'p1',zeroPoison);
      applyFx(target,'poison',source,'p2',{...zeroPoison,effectDot:150});
      eq(states(target,'poison').length,3,'Caster AND attack distinguish poison origins');
      const hp=target.stats.HP.current;await advance(400);
      eq(hp-target.stats.HP.current,14,'Partial interval retains previous 6 damage plus new 8, without resetting tick');
      const originals=states(target,'poison').map(s=>[s.runtimeKey,s.expiresAt]);
      setStat(target,'resilienceTotal',100);Math.random=()=>0;
      eq(applyFx(target,'poison',source,'replacement',{...zeroPoison,applicationMode:'replace'}),'alteration_canceled','RT blocks replacement first');
      ok(JSON.stringify(originals)===JSON.stringify(states(target,'poison').map(s=>[s.runtimeKey,s.expiresAt])),'Blocked attempt leaves every older source unchanged');
      setStat(target,'resilienceTotal',0);Math.random=()=>.999999;
      const earliest=Math.min(...states(target,'poison').map(s=>s.nextTickAt));
      applyFx(target,'poison',other,'replace',{...zeroPoison,effectDot:5,effectDuration:1,applicationMode:'replace'});
      eq(states(target,'poison').length,1,'Replacement removes other origins of same effect');
      eq(states(target,'poison')[0].perSecond,5,'Weaker shorter replacement wins');
      eq(states(target,'poison')[0].nextTickAt,earliest,'Replacement preserves next cadence');clear(target);

      applyFx(target,'brulure',source,'fire1',{effectDot:10,effectStack:2});
      const fire=states(target,'brulure')[0],fireTick=fire.nextTickAt;
      await advance(400);
      applyFx(target,'brulure',source,'fire1',{effectDot:10,effectStack:2});
      applyFx(target,'brulure',source,'fire1',{effectDot:10,effectStack:2});
      applyFx(target,'brulure',other,'fire2',{effectDot:5,effectStack:3});
      eq(states(target,'brulure').length,1,'All casters feed one fire');
      eq(fire.capacity,5,'Shared cap sums distinct source quotas only once');
      eq(target.brulureStacks,3,'One source cannot occupy the other quota');
      eq(fire.perSecond,25,'Contributions add, without averaging');
      eq(fire.nextTickAt,fireTick,'Feeding fire does not postpone its tick');
      const maintenance=fire.expiresAt;setStat(target,'resilienceTotal',100);Math.random=()=>0;
      applyFx(target,'brulure',other,'refused',{effectDot:500,effectStack:20});
      eq(fire.expiresAt,maintenance,'Refused fire input cannot maintain');eq(fire.capacity,5,'Refused input cannot raise cap');
      setStat(target,'resilienceTotal',0);Math.random=()=>.999999;
      const fireHp=target.stats.HP.current;await advance(600);eq(fireHp-target.stats.HP.current,25,'Shared fire deals the sum on original cadence');
      await advance(4400);eq(fire.perSecond,10,'Expired unmaintained cycle loses 60%');
      ok(Boolean(document.querySelector(`#effectsContainer_${target.id} [data-dot-effect="brulure"]`)),'Burn badge stays visible during extinction cycle');
      await advance(1000);eq(fire.perSecond,10,'No further loss on each damage tick');
      applyFx(target,'brulure',source,'fire1',{effectDot:10,effectStack:2});
      eq(fire.perSecond,16,'Feeding decayed fire replaces weakest own contribution only');
      await advance(5000);eq(fire.perSecond,6.4,'New maintenance cycle then decays once');
      await advance(5000);eq(states(target,'brulure').length,0,'Fire extinguishes below 30% of decay reference');

      setStat(target,'alterationResistance',50);
      applyFx(target,'poison',source,'mitigated',zeroPoison);const poisonHp=target.stats.HP.current;
      await advance(1000);eq(poisonHp-target.stats.HP.current,5,'RAA halves DoT damage');
      eq(states(target,'poison')[0].duration,5,'RAA does not reduce poison duration');clear(target);
      applyFx(target,'insolence',source,'ins',{effectDuration:8,effectMinInterval:1,effectMaxInterval:1,effectPriorityWeight:0,effectActivationWeight:1});
      eq(states(target,'insolence')[0].expiresAt-C.clockNow(),4000,'RAA halves non damaging alteration duration');clear(target);
      setStat(target,'alterationResistance',0);
      const defs=configure(target,[spell('one'),spell('two')]),keys=defs.map(R.attackSelectionKey);
      R.setAllAttacksEnabled(target,defs,false);
      Math.random=()=>.2;
      applyFx(target,'insolence',source,'ins',{effectDuration:5,effectMinInterval:1,effectMaxInterval:1,effectPriorityWeight:0,effectActivationWeight:1});
      await advance(999);eq(Control.getControlState(target,'insolence').changes,0,'No immediate RNG action');
      await advance(1);eq(Control.getControlState(target,'insolence').changes,1,'Exactly one action after minimum delay');
      ok(!R.describeAttackChoices(target,defs,()=>0)[0].disabled,'Insolence can enable a previously manually disabled attack');
      const AttackUI = await import("/js/ui/attacks.js");
      const manualUI=AttackUI.MultiAttackDisplay(target,{showUmbraPanel:false});document.body.append(manualUI);
      const manualToggle=manualUI.querySelector('.attack-imgs .attack-activation-indicator');
      ok(Boolean(manualToggle),'Real manual attack toggle is present under Insolence');manualToggle.click();
      ok(R.describeAttackChoices(target,defs,()=>0)[0].disabled,'Manual UI disable immediately overrides Insolence');manualUI.remove();
      await advance(1000);ok(!R.describeAttackChoices(target,defs,()=>0)[0].disabled,'Future RNG may change the manual selection again');
      R.setAllAttacksEnabled(target,defs,true);
      ok(R.describeAttackChoices(target,defs,()=>0).every(c=>!c.disabled),'Manual enable all clears all activation overlays');
      await advance(1000);ok(R.describeAttackChoices(target,defs,()=>0)[0].disabled,'RNG keeps running independently of turns');
      clear(target);ok(R.describeAttackChoices(target,defs,()=>0).every(c=>!c.disabled),'Cleanup preserves last manual baseline');
      applyFx(target,'insolence',source,'ins',{effectDuration:5,effectMinInterval:1,effectMaxInterval:1,effectPriorityWeight:1,effectActivationWeight:0});
      await advance(1000);eq(R.describeAttackChoices(target,defs,()=>0)[0].priority,2,'Insolence swaps priority');
      R.setAttackPriority(target,defs,keys[0],1);clear(target);
      eq(R.describeAttackChoices(target,defs,()=>0)[0].priority,1,'Manual priority survives cleanup');

      Math.random=()=>.999999;
      R.startAttackCooldown(target,defs[0],100);const readyBeforeSleep=R.getAttackRuntime(target,defs[0]).readyAt;
      await advance(200);applyFx(target,'sommeil',source,'sleep-late',{effectDuration:1});await advance(1000);
      eq(R.getAttackRuntime(target,defs[0]).readyAt,readyBeforeSleep,'A sleep after cooldown completion does not make that attack unavailable again');clear(target);
      R.startAttackCooldown(target,defs[1],5000);const beforeOverlap=R.getAttackRuntime(target,defs[1]).readyAt;
      applyFx(target,'sommeil',source,'sleep-a',{effectDuration:2});applyFx(target,'sommeil',other,'sleep-b',{effectDuration:2});
      await advance(1000);eq(R.getAttackRuntime(target,defs[1]).readyAt,beforeOverlap+1000,'Overlapping sleep sources pause cooldown only once');
      ok(Fx.wakeFromDamage(target,100,30,()=>0),'A real HP hit can wake overlapping sleeps');
      eq(Control.getControlStates(target,'sommeil').length,0,'Wake clears every active sleep source');clear(target);

      Math.random=()=>.999999;
      applyFx(target,'bafouillage',source,'slowA',{effectDuration:5,effectSlowPercent:50});
      applyFx(target,'bafouillage',other,'slowB',{effectDuration:2,effectSlowPercent:50});
      const slowStart=C.clockNow();await advance(1000);
      eq(Control.getPhaseElapsed(target,slowStart,C.clockNow(),'preparationTime'),250,'Independent slows multiply remaining speed');
      applyFx(target,'bafouillage',source,'slowA',{effectDuration:5,effectSlowPercent:25});
      await advance(1000);eq(Control.getPhaseElapsed(target,slowStart,C.clockNow(),'preparationTime'),625,'Own slow refresh updates without erasing other source');
      eq(states(target,'bafouillage').length,1,'Other slow expires independently');clear(target);

      applyFx(target,'charme',source,'charm',{effectDuration:8});eq(target.side,'A','Charme actually changes side');
      applyFx(target,'folie',other,'mad',{effectDuration:5});
      applyFx(target,'insolence',other,'ins',{effectDuration:5,effectMinInterval:2,effectMaxInterval:2});
      ok(['charme','folie','insolence'].every(kind=>Control.getControlState(target,kind)),'Charme Folie Insolence coexist');
      const rezSpell=spell('rez',{deadTarget:['yes'],combatFunction:'Resurrecteur',effets:['rez']});
      ok(F.acceptsSelectedTarget(target,rezSpell,source),'Folie can select living target for resurrection');
      ok(!F.acceptsImpactTarget(rezSpell,source),'Spell remains incompatible at impact');
      const terrainSpell=spell('terrain',{attackTarget:['hexa']});
      ok(F.acceptsSelectedTarget(target,terrainSpell,source),'Folie may even aim a terrain spell at an entity');
      ok(Battle.collectAttackTargetCandidates(target,terrainSpell).includes(source),'Folie candidate collection admits that incompatible target');
      ok(!F.acceptsImpactTarget(terrainSpell,source),'Terrain spell still fails on incompatible entity at impact');
      eq(State.resolveBattleOutcome(E.entites),false,'Charme cannot produce victory while original armies still alive');
      eq(target.side,'A','Non terminal verdict check preserves ongoing Charme');
      await advance(5000);ok(Control.getControlState(target,'charme'),'Charme remains after Folie and Insolence expire');
      clear(target);eq(target.side,'B','Charme cleanup restores original side');
      applyFx(target,'charme',source,'layer1',{effectDuration:5,applicationMode:'refresh'});
      applyFx(target,'charme',{...other,side:'B'},'layer2',{effectDuration:1,applicationMode:'refresh'});
      eq(target.side,'B','Most recent active Charme determines camp');
      await advance(1000);eq(target.side,'A','Expired Charme recomputes from remaining active sources');
      applyFx(target,'charme',{...other,side:'B'},'replace-charm',{effectDuration:1,applicationMode:'replace'});
      await advance(1000);eq(target.side,'B','Replaced Charme cannot return after replacement expires');clear(target);

      const badCast=configure(target,[spell('invalid-rez',{deadTarget:['yes'],combatFunction:'Support',effets:['rez'],
        attacknature:['magicalDamage'],preparationTime:1000,executionTime:100,recoveryTime:100,cooldown:5000})])[0];
      applyFx(target,'folie',source,'mad',{effectDuration:.5});
      const hpBeforeBadCast=source.stats.HP.current;
      const badAttempt=F.executeAttack(target,source,badCast);
      await advance(1500);await badAttempt;
      eq(source.stats.HP.current,hpBeforeBadCast,'Incompatible resurrection never affects a living target');
      ok(R.getAttackRuntime(target,badCast).readyAt>C.clockNow(),'Folie commits the cooldown even for an incompatible target');
      ok(!target._combatAction,'Invalid cast ends normally after Folie expires, without reroll');

      applyFx(target,'charme',source,'save-charm',{effectDuration:7});
      applyFx(target,'brulure',source,'save-fire',{effectDot:5,effectStack:2});
      applyFx(target,'brulure',other,'save-fire2',{effectDot:3,effectStack:3});
      applyFx(target,'bafouillage',source,'save-slow',{effectDuration:7,effectSlowPercent:50});
      applyFx(target,'bafouillage',other,'save-slow2',{effectDuration:7,effectSlowPercent:50});
      await advance(400);
      const saved=C.captureCombatState(),savedFire=states(target,'brulure')[0],savedDeadline=savedFire.nextTickAt;
      C.freezeCombatClock();const savedNow=C.clockNow();C.restoreCombatClock(savedNow);
      await C.restoreCombatState({alterations:saved.alterations},{entities:E.entites});C.resumeCombatClock();
      eq(states(target,'brulure')[0].nextTickAt,savedDeadline,'Restoring collective fire preserves exact tick deadline');
      eq(states(target,'brulure')[0].capacity,5,'Restoring fire preserves contributing quotas');
      eq(Control.getControlStates(target,'bafouillage').length,2,'Restoring retains independent slows');
      eq(target.side,'A','Restoring retains Charme camp');
      clear(target);eq(target.side,'B','Restored Charme still restores original camp on cleanup');

      applyFx(target,'charme',source,'charm',{effectDuration:8});
      applyFx(source,'poison',target,'p',zeroPoison);
      const baseWeight=Rules.getSafe(other,'weight',0);
      applyFx(other,'lourdeur',target,'weight',{effectDuration:20,effectWeightPercent:50});
      target.isDEAD=true;target.stats.HP.current=0;
      let observed=null;window.addEventListener('battleResolved',()=>{observed={side:target.side,effects:Fx.getActiveEffectStates().length};},{once:true});
      ok(State.resolveBattleOutcome(E.entites),'Battle resolves when original enemy dies');
      eq(observed.side,'B','Original side restored before resolved event');eq(observed.effects,0,'All alterations cleaned before resolved event');
      eq(State.battleOutcome,'victory','Verdict uses original camps');
      eq(Rules.getSafe(other,'weight',0),baseWeight,'Temporary weight boost removed before verdict');
      const after=source.stats.HP.current;await advance(6000);eq(source.stats.HP.current,after,'No orphan DoT after combat');
      ok(!document.querySelector('[data-dot-effect], [data-control-effect]'),'No leftover badges after cleanup');
      State.resetBattleResolution();E.entites.length=0;
      const dotA=actor('A',{armor:0,magicalResistance:0}),dotB=actor('B',{armor:0,magicalResistance:0});
      dotA.stats.HP.current=dotB.stats.HP.current=10;
      applyFx(dotA,'poison',dotB,'fatal',zeroPoison);applyFx(dotB,'poison',dotA,'fatal',zeroPoison);
      await advance(1000);
      eq(State.battleOutcome,'draw','Equal fatal DoT ticks use the shared simultaneous impact batch');
      eq(Fx.getActiveEffectStates().length,0,'Double DoT KO also cleans every effect before verdict');
      State.resetBattleResolution();E.entites.length=0;
      const solo=actor('A');applyFx(solo,'silence',solo,'admin-solo',{effectDuration:2});
      eq(State.resolveBattleOutcome(E.entites),false,'A solo admin scene is not a terminal battle');
      ok(Boolean(Control.getControlState(solo,'silence')),'Non terminal check does not purge effects');clear(solo);
      return checks;
    } finally { Math.random=random; Date.now=date; C.clearCombatClock(); }
  });
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'checks.json'),JSON.stringify(checks,null,2));
  console.log('Effect rules browser checks:',checks.length);
} finally { await browser.close();await new Promise(done=>server.close(done)); }
