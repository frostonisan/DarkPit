import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve('docs'),output=resolve('outputs/active-effect-helpers');await mkdir(output,{recursive:true});
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
      (await import("/js/ui/statistics/helpers.js")).initializeStatHelpers();
      if(!document.querySelector('.Game-helper')){const layer=document.createElement('div');layer.className='Game-helper';document.body.append(layer);}
      Math.random=()=>.999999;
      const source=actor('A'),target=actor('B',{alterationResistance:50,magicalResistance:0,armor:0});
      const badge=(e,name)=>document.querySelector(`#effectsContainer_${e.id} [data-control-effect="${name}"],#effectsContainer_${e.id} [data-dot-effect="${name}"]`);
      const hover=node=>{ok(Boolean(node),'Badge exists');node.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));const helper=document.querySelector(`.stat-hover[data-helper-key="${node.dataset.helperKey}"]`);ok(Boolean(helper),'Real helper opens through the shared hover handler');return helper;};
      const has=(node,text,label)=>ok(node.textContent.includes(text),`${label}: ${node.textContent}`);
      const setStat=(e,key,value)=>{e.baseStats[key]=value;E.recomputeEntityStats(e);};
      const applied=effectAttack('silence',6);A.applyEffect(target,'silence',source,applied);
      const silenceNode=badge(target,'silence'),silenceHelper=hover(silenceNode);
      has(silenceHelper,'Effet : Silence','Effect title');
      has(silenceHelper,'Durée restante : 3,0 s','50% alteration resistance reduces 6s to 3s');
      has(silenceHelper,'pendant 3 secondes','Description uses applied duration');
      await advance(1000);has(silenceHelper,'Durée restante : 2,0 s','An already-open helper counts down');
      C.freezeCombatClock();await advance(5000);has(silenceHelper,'Durée restante : 2,0 s','Combat pause freezes the countdown');C.resumeCombatClock();
      applied.effectOverrides.silence.effectDuration=100;
      setStat(target,'alterationResistance',0);await advance(250);
      has(silenceHelper,'Durée restante : 1,8 s','Later admin/source/resistance changes do not rewrite an active control');
      apply(target,'silence',source,5);
      ok(badge(target,'silence')===silenceNode&&silenceHelper.isConnected,'Reapplying preserves the badge and the open helper');
      has(silenceHelper,'Durée restante : 5,0 s','Refresh extends expiry');
      apply(target,'silence',source,1);
      has(silenceHelper,'Durée restante : 1,0 s','A refresh uses the newly applied duration');
      await advance(5000);ok(!badge(target,'silence')&&!silenceHelper.isConnected,'Expiry removes both badge and open helper');
      setStat(target,'alterationResistance',50);
      A.applyEffect(target,'bafouillage',source,{effets:['bafouillage'],effectOverrides:{bafouillage:{effectDuration:10,effectSlowPercent:40}}});
      const slow=hover(badge(target,'bafouillage'));
      has(slow,'Durée restante : 5,0 s','Non-damaging alteration duration is mitigated once');
      has(slow,'40 % pendant 5 secondes','Intensity retained with reduced duration');
      Fx.clearControlEffects(target);apply(target,'immobilisation',source,4);
      has(hover(badge(target,'immobilisation')),'Durée restante : 4,0 s','Hindrance-only duration is not reduced by alteration resistance');Fx.clearControlEffects(target);
      A.applyEffect(target,'confusion',source,{effets:['confusion'],effectOverrides:{confusion:{effectDuration:4,effectMoveInterval:30,effectMovementRecoilPercent:40}}});
      const confused=hover(badge(target,'confusion'));
      has(confused,'40 points de pourcentage','Forced movement recoil remains the configured movement mechanic');
      Fx.clearControlEffects(target);
      const immune=actor('B',{resilienceTotal:100});Math.random=()=>0;
      for(const name of ['silence','poison','brulure','sommeil']){eq(A.applyEffect(immune,name,source)==='alteration_canceled',true,name+' canceled');ok(!badge(immune,name),name+': no badge/helper after total resilience cancellation');}
      const hindranceImmune=actor('B',{hindranceResistance:100});
      ok(A.applyEffect(hindranceImmune,'immobilisation',source)==='alteration_canceled'&&!badge(hindranceImmune,'immobilisation'),'Hindrance resistance creates no active helper');Math.random=()=>.999999;
      const poisonAttack={effets:['poison'],effectOverrides:{poison:{effectDuration:8,effectDot:160,effectPhysicalRatio:0,effectMagicalRatio:0,effectTickInterval:1}}};
      A.applyEffect(target,'poison',source,poisonAttack);
      const poisonNode=badge(target,'poison'),poisonHelper=hover(poisonNode);
      has(poisonHelper,'Dernière fin : 8,0 s','DoT keeps its full duration');
      has(poisonHelper,'10 dégâts/s','DoT intensity includes the 50% alteration resistance');
      const hp=target.stats.HP.current;await advance(1000);
      eq(hp-target.stats.HP.current,10,'Actual poison damage after alteration resistance');
      has(poisonHelper,'10 HP · 0 armure','Last tick shows actual HP damage');
      has(poisonHelper,'Dernière fin : 7,0 s','Poison helper counts down while open');
      setStat(target,'magicalResistance',100);const beforeMag=target.stats.HP.current;await advance(1000);
      const magicLoss=beforeMag-target.stats.HP.current;ok(magicLoss<10,'Magic resistance also mitigates the tick');
      has(poisonHelper,`${magicLoss} HP · 0 armure`,'Last tick includes all actual protections');
      setStat(target,'alterationResistance',75);await advance(250);has(poisonHelper,'5 dégâts/s','Current DoT resistance updates while open');
      poisonAttack.effectOverrides.poison.effectDot=800;await advance(250);has(poisonHelper,'5 dégâts/s','Admin changes do not rewrite the running DoT snapshot');
      const snap=C.captureCombatState();C.freezeCombatClock();const time=C.clockNow();C.restoreCombatClock(time);
      await C.restoreCombatState({alterations:snap.alterations},{entities:E.entites});
      const restored=hover(badge(target,'poison'));has(restored,'Dernière fin : 5,5 s','Restoring retains the exact remaining duration');
      has(restored,`${magicLoss} HP · 0 armure`,'Restoring retains the last real tick');
      C.resumeCombatClock();
      A.applyEffect(target,'poison',source,{...poisonAttack,effectOverrides:{poison:{...poisonAttack.effectOverrides.poison,effectDot:160,effectDuration:4}}});
      ok(restored.isConnected,'Refreshing Poison keeps its open helper');has(restored,'Dernière fin : 4,0 s','Poison refresh uses its own reset rule');
      await advance(4000);ok(!badge(target,'poison')&&!restored.isConnected,'Poison expiry cleans its helper');
      const armored=actor('B',{armor:100,alterationResistance:50});armored.stats.armor={current:100,max:100};
      A.applyEffect(armored,'poison',source,{effets:['poison'],effectOverrides:{poison:{effectDuration:4,effectDot:80,effectPhysicalRatio:0,effectMagicalRatio:0}}});
      const armorHelper=hover(badge(armored,'poison'));const armorHp=armored.stats.HP.current;await advance(1000);
      eq(armorHp-armored.stats.HP.current,0,'Armor blocks HP loss');has(armorHelper,'0 HP · 20 armure','Actual armor loss is distinct from HP loss');
      const burned=actor('B',{alterationResistance:50});
      const burnAttack={effets:['brulure'],effectOverrides:{brulure:{effectDot:60,effectStack:2}}};
      A.applyEffect(burned,'brulure',source,burnAttack);const burnNode=badge(burned,'brulure'),burnHelper=hover(burnNode);
      has(burnHelper,'30 dégâts/s','One burn contribution after resistance');
      A.applyEffect(burned,'brulure',source,burnAttack);
      ok(badge(burned,'brulure')===burnNode&&burnHelper.isConnected,'Stack increase preserves the open burn helper');
      has(burnHelper,'Feu commun · 2 apports','Burn helper shows actual stacks');has(burnHelper,'60 dégâts/s','Stacked burn intensity is actual');
      const beforeBurn=burned.stats.HP.current;await advance(1000);eq(beforeBurn-burned.stats.HP.current,60,'Actual stacked burn damage agrees');
      has(burnHelper,'Dernier tick subi : 60 HP · 0 armure','Burn helper shows actual last tick');
      apply(target,'sommeil',source,20);const sleepHelper=hover(badge(target,'sommeil'));
      ok(Fx.wakeFromDamage(target,100,30,()=>0),'Damage wakes sleeping target');
      ok(!badge(target,'sommeil')&&!sleepHelper.isConnected,'Wake-up removes the helper immediately');
      const natureTarget=actor('B');const natureAttack=spell('nature',{attacknature:['magicalDamage','piercingDamage']});
      const result=Fx.applyAttackNatureEffect(natureTarget,source,natureAttack);ok(result?.key==='dissolution','Dissolution applies');
      const natureNode=document.querySelector(`[data-helper-key="${natureTarget.id}-effect-dissolution"]`),natureHelper=hover(natureNode);
      has(natureHelper,'Effet : Dissolution','Nature effect title');has(natureHelper,'Durée restante : 8,0 s','Nature effect helper exposes its real expiry');
      await advance(1000);has(natureHelper,'Durée restante : 7,0 s','Nature helper counts down while open');
      Fx.applyAttackNatureEffect(natureTarget,source,natureAttack);has(natureHelper,'2/5 cumuls','Nature helper updates stacks live');has(natureHelper,'Durée restante : 8,0 s','Nature effect refreshes expiry');
      const readBefore=JSON.stringify(C.captureCombatState().alterations);let rolls=0;Math.random=()=>{rolls++;return .9;};
      for(let i=0;i<3;i++)natureNode.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      eq(rolls,0,'Hover makes no resistance rolls');ok(readBefore===JSON.stringify(C.captureCombatState().alterations),'Hover does not change applied effects');
      // Leave one compact real helper visible for visual review.
      window.__activeEffectAudit={checks,target:natureTarget.id};
      window.dispatchEvent(new Event('battleStopped'));
      ok(!document.querySelector('[data-control-effect],[data-dot-effect]'),'Battle stop removes active badges');
      ok(!document.querySelector('.active-effect-hover'),'Battle stop removes their helpers');
      return checks;
    }finally{Fx.clearControlEffects();Math.random=random;Date.now=date;delete window.__resilienceTimerBackend;}
  });
  assert.deepEqual(errors,[]);
  await page.evaluate(async()=>{
    const E = await import("/js/entities/runtime.js"),A = await import("/js/combat/vitals.js"),C = await import("/js/combat/clock.js");
    C.clearCombatClock();C.freezeCombatClock();
    const source=E.entites[0],target=E.entites.find(e=>e.id===window.__activeEffectAudit.target);
    target.baseStats.alterationResistance=50;E.recomputeEntityStats(target);
    const panel=document.createElement('section');panel.style.cssText='position:fixed;left:80px;top:120px;width:430px;padding:24px;background:#111820;color:#eee;border:1px solid #bca366;z-index:10000';
    panel.innerHTML='<h2>Cible — Résistance aux altérations : 50 %</h2><p>Effets reçus : Bafouillage 40 % pendant 10 s ; Poison.</p>';
    const effectsHost=document.getElementById(`effectsContainer_${target.id}`);effectsHost.style.cssText='position:relative;width:60px;height:80px';panel.append(effectsHost);document.body.append(panel);
    A.applyEffect(target,'bafouillage',source,{effets:['bafouillage'],effectOverrides:{bafouillage:{effectDuration:10,effectSlowPercent:40}}});
    A.applyEffect(target,'poison',source,{effets:['poison'],effectOverrides:{poison:{effectDuration:8,effectDot:160,effectPhysicalRatio:0,effectMagicalRatio:0}}});
    document.querySelectorAll('.effect-message-line').forEach(node=>node.remove());
  });
  await page.locator('[data-control-effect="bafouillage"]').hover();
  await page.waitForTimeout(1200);
  await page.screenshot({path:resolve(output,'active-control-helper.png')});
  await page.locator('[data-dot-effect="poison"]').hover();
  await page.waitForTimeout(1200);
  await page.screenshot({path:resolve(output,'active-poison-helper.png')});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,errors},null,2));
  console.log(`Active effect helpers: ${checks.length} checks passed.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
