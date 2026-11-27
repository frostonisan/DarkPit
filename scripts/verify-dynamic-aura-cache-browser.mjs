import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('docs'), baseline = process.env.DYNAMIC_AURA_BASELINE && resolve(process.env.DYNAMIC_AURA_BASELINE);
const output = resolve(process.env.DYNAMIC_AURA_OUTPUT || 'outputs/dynamic-aura-cache');
await mkdir(output, { recursive:true });
let before = false, browser;
const report = {};
const server = createServer(async (req,res) => {
  const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = resolve(root,'.'+(path==='/'?'/index.html':path));
  if (!file.startsWith(root+sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'})[extname(file)] || 'application/octet-stream');
    res.end(await readFile(before && path==='/js/rendering/auras.js' ? resolve(baseline,'.'+path) : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try {
  const safari = process.env.DYNAMIC_AURA_ENGINE==='webkit';
  browser = await (safari?webkit:chromium).launch({headless:true,...(safari?{}:{channel:'chrome'})});
  for (const variant of baseline?['before','after']:['after']) {
    before = variant==='before';
    const page = await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#game-container').waitFor({state:'attached'});
    await page.evaluate(async () => {
      window.Aura=await import('/js/rendering/auras.js');
      window.Clock=await import('/js/combat/clock.js'); Clock.freezeCombatClock();
      window.host=document.createElement('main');host.id='dynamic-aura-test';
      host.style.cssText='position:fixed;inset:0;background:#171717;z-index:2147483647';document.body.append(host);
      window.actor=id=>({id,side:'A',stats:{HP:{current:100},hpBattleRegen:10,hypercognition:10}});
      window.makeView=(id,codex=false)=>{
        const target=document.createElement('div');
        target.id=codex?`codex-target_${id}`:`spriteContainer_${id}`;
        if(codex)target.className='codex-scan-image-container';
        target.style.cssText=`position:absolute;left:${30+(id%10)*110}px;top:${70+Math.floor((id%100)/10)*70}px;width:70px;height:45px;background:#998866;`;
        const container=document.createElement('div'); container.className='aura-container';
        container.id=`auraContainer_${codex?'codex_':''}${id}`;target.append(container);host.append(target);
        return {target,container};
      };
      window.glow=target=>target.getAnimations().find(a=>a.animationName?.startsWith('dynamicAuraGlow_'));
      window.styles=()=>[...document.querySelectorAll('style[id^="dynamicAuraGlowStyle_"]')];
      window.cleanup=()=>{for(const target of host.children){const id=Number(target.id.split('_').pop());Aura.cleanupEntityAuras({id});} host.replaceChildren();};
    });
    const populations=[];
    for (const total of [10,40,80]) {
      const result=await page.evaluate(total=>{
        cleanup();const views=Array.from({length:total},(_,i)=>makeView(994000+i));
        views.forEach((v,i)=>Aura.syncEntityAuras(actor(994000+i),v.container));
        const originalStyles=styles(), animations=views.map(v=>glow(v.target));
        for(const a of animations){if(!a)throw Error('Missing glow');a.pause();a.currentTime=1234;}
        const observer=new MutationObserver(()=>{});observer.observe(document.head,{childList:true});
        const classes=new MutationObserver(()=>{});classes.observe(host,{subtree:true,attributes:true,attributeFilter:['class']});
        const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth');let forcedReads=0;
        Object.defineProperty(HTMLElement.prototype,'offsetWidth',{...descriptor,get(){if(this.id.startsWith('spriteContainer_'))forcedReads++;return descriptor.get.call(this);}});
        try {for(let pass=0;pass<8;pass++)views.forEach((v,i)=>Aura.syncEntityAuras(actor(994000+i),v.container));}
        finally {Object.defineProperty(HTMLElement.prototype,'offsetWidth',descriptor);}
        const records=observer.takeRecords();observer.disconnect();
        const classWrites=classes.takeRecords().filter(r=>r.target.id.startsWith('spriteContainer_')).length;classes.disconnect();
        const styleAdds=records.reduce((n,r)=>n+[...r.addedNodes].filter(n=>n.nodeName==='STYLE' && n.id.startsWith('dynamicAuraGlowStyle_')).length,0);
        const styleRemoves=records.reduce((n,r)=>n+[...r.removedNodes].filter(n=>n.nodeName==='STYLE' && n.id.startsWith('dynamicAuraGlowStyle_')).length,0);
        return {total,refreshes:total*8,forcedReads,styleAdds,styleRemoves,classWrites,
          sameStyles:originalStyles.every(s=>s.isConnected),sameAnimations:animations.every((a,i)=>a===glow(views[i].target) && a.currentTime===1234)};
      },total);
      populations.push(result);
      if(!before)assert.deepEqual(result,{total,refreshes:total*8,forcedReads:0,styleAdds:0,styleRemoves:0,classWrites:0,sameStyles:true,sameAnimations:true});
      else {assert.equal(result.forcedReads,total*8);assert.equal(result.styleAdds,total*8);assert.equal(result.sameStyles,false);}
    }
    const lifecycle=await page.evaluate(()=>{
      cleanup();const id=994090, battle=makeView(id), codex=makeView(id,true), other=makeView(id+1);
      const sync=(stats={},flags={})=>{const e=actor(id);Object.assign(e.stats,stats);e.flags=flags;Aura.syncEntityAuras(e,battle.container);};
      sync();Aura.syncEntityAuras(actor(id),codex.container);Aura.syncEntityAuras(actor(id+1),other.container);
      const codexAnimation=glow(codex.target), otherAnimation=glow(other.target);
      codexAnimation.pause();codexAnimation.currentTime=777;otherAnimation.pause();otherAnimation.currentTime=888;
      const cssSamples=[];
      for(const [stats,flags] of [[{hpBattleRegen:10,hypercognition:0},{}],[{hpBattleRegen:10,hypercognition:10},{}],[{}, {bloodCrazyNextExecution:true}],[{},{}]]){
        sync(stats,flags);const a=glow(battle.target);if(!a)throw Error('Changed aura missing');
        const initial=a.currentTime;const filters=[];
        for(const time of [0,625,1250,2500,3750,4999]){a.pause();a.currentTime=time;filters.push(getComputedStyle(battle.target).filter);}
        const style=document.getElementById(`dynamicAuraGlowStyle_${id}_auraContainer_${id}`);
        cssSamples.push({css:style.textContent,filters,duration:a.effect.getTiming().duration,restarted:Math.abs(initial||0)<100});
      }
      const independent=glow(codex.target)===codexAnimation && codexAnimation.currentTime===777 && glow(other.target)===otherAnimation && otherAnimation.currentTime===888;
      sync({hpBattleRegen:0,hypercognition:0});
      const disabled=!glow(battle.target) && !document.getElementById(`dynamicAuraGlowStyle_${id}_auraContainer_${id}`);
      sync();const reenabled=!!glow(battle.target);
      const old=battle.target,newTarget=document.createElement('div');newTarget.id=old.id;old.id+='-old';newTarget.style.cssText=old.style.cssText;host.append(newTarget);newTarget.append(battle.container);battle.target=newTarget;
      sync();const retargeted=!glow(old) && !!glow(newTarget);
      const fresh=battle.container.cloneNode(false);battle.container.replaceWith(fresh);battle.container=fresh;sync();const rebuilt=!!glow(newTarget);
      const style=document.getElementById(`dynamicAuraGlowStyle_${id}_auraContainer_${id}`);style.remove();sync();const repaired=!!glow(newTarget) && !!document.getElementById(style.id);
      Aura.cleanupEntityAuras({id});const cleaned=!glow(newTarget) && !glow(codex.target) && !!glow(other.target);
      sync();const restarted=!!glow(newTarget);
      const dead=actor(id);dead.stats.HP.current=0;Aura.syncEntityAuras(dead,battle.container);const deathCleaned=!glow(newTarget);
      cleanup();return {cssSamples,independent,disabled,reenabled,retargeted,rebuilt,repaired,cleaned,restarted,deathCleaned,stylesRemaining:styles().length};
    });
    if(!before){
      for(const key of ['independent','disabled','reenabled','retargeted','rebuilt','repaired','cleaned','restarted','deathCleaned'])assert.equal(lifecycle[key],true,key);
      assert.equal(lifecycle.stylesRemaining,0);assert.ok(lifecycle.cssSamples.every(s=>s.restarted && s.duration===5000));
    }
    assert.deepEqual(errors,[]);report[variant]={populations,lifecycle};await page.close();
  }
  if(baseline)assert.deepEqual(report.after.lifecycle.cssSamples,report.before.lifecycle.cssSamples,'Actual config changes keep exactly the same CSS, filters, durations and restart phase');
  console.log('PASS: stable fresh snapshots at 10/40/80, identical glow CSS, live buff switches, separate views, target/DOM rebuild, cleanup and death');
} finally {
  await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
  await browser?.close();await new Promise(done=>server.close(done));
}
