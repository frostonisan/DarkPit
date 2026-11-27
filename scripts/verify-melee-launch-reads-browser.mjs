import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const root=resolve('docs'),out=resolve(process.env.MELEE_LAUNCH_OUTPUT||'outputs/melee-launch-reads');
const baseline=process.env.MELEE_LAUNCH_BASELINE&&resolve(process.env.MELEE_LAUNCH_BASELINE);
const current=process.env.MELEE_LAUNCH_CURRENT&&resolve(process.env.MELEE_LAUNCH_CURRENT);
let version='current';await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+sep))return res.writeHead(403).end();const archive=version==='baseline'?baseline:current;
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await fs.readFile(archive&&p.startsWith('/js/')?resolve(archive,'.'+p):file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true}),results={};
try{
 for(const count of [10,40,80]){
  const trials={};
  for(version of baseline?['baseline','current']:['current']){
   const context=await browser.newContext({viewport:{width:1536,height:864}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    const timeout=setTimeout.bind(window),raf=requestAnimationFrame.bind(window),date=Date.now,animate=Element.prototype.animate;
    globalThis.meleeProbe={active:false,next:100000000,animations:[]};
    Date.now=()=>meleeProbe.active?1000000:date();
    window.setTimeout=(fn,delay,...args)=>meleeProbe.active?++meleeProbe.next:timeout(fn,delay,...args);
    window.requestAnimationFrame=fn=>meleeProbe.active?++meleeProbe.next:raf(fn);
    Element.prototype.animate=function(frames,options){const a=animate.call(this,frames,options);
     if(meleeProbe.active){a.pause();a.currentTime=0;meleeProbe.animations.push({id:this.id,className:this.className,frames,options});}return a;
    };
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#game-container').waitFor({state:'attached'});
   trials[version]=await page.evaluate(async count=>{
    const M=await import('/js/rendering/animations.js'),C=await import('/js/combat/clock.js'),E=await import('/js/entities/runtime.js');
    C.clearCombatClock();meleeProbe.active=true;document.getElementById('game-windows').style.display='none';
    const host=document.createElement('section');host.style.cssText='position:fixed;inset:0;';document.body.append(host);E.entites.length=0;
    const entities=Array.from({length:count},(_,i)=>{
     const entity={id:997000+i,type:'sbire',side:i%2?'B':'A',name:'Launch '+i,stats:{},statut:['alive'],isDEAD:false,baseStats:{HP:100,strength:1,intelligence:1,agility:1},attacks:['autoAttack'],executionTime:600};E.enrichEntityStats(entity);E.entites.push(entity);
     const hex=document.createElement('div');hex.className='hex occupied Side'+entity.side;hex.dataset.position=String(i);entity.position=String(i);
     hex.style.cssText=`position:absolute;left:${50+i%10*130}px;top:${60+Math.floor(i/10)*75}px;width:48px;height:48px`;
     hex.innerHTML=`<div id="Box_Entite_${entity.id}" class="entite-box"><div id="sbire_${entity.id}"><div id="spriteContainer_${entity.id}"><div id="Animationsprite_${entity.id}"><div id="DragSprite_${entity.id}" class="iddle" style="opacity:${i%3===0?.45:1};transform:translateX(2px)"><canvas id="spriteCanvas_${entity.id}" width="48" height="48"></canvas></div></div></div><div id="effectsContainer_${entity.id}"></div><div id="PopDow_${entity.id}"></div></div></div>`;
     host.append(hex);const ctx=hex.querySelector('canvas').getContext('2d');ctx.fillStyle='#f85';ctx.fillRect(5,5,38,38);return entity;
    });
    const capture=()=>({sprites:entities.map(e=>{const n=document.getElementById('DragSprite_'+e.id);return {style:n.style.cssText,classes:n.className,rect:n.getBoundingClientRect().toJSON()};}),fx:document.querySelector('.BattleFX')?.outerHTML,animations:structuredClone(meleeProbe.animations)});
    for(let i=0;i<count;i++)M.animationMelee(entities[i],entities[(i+5)%count],i%2===1,{duration:600,flightId:'fixture-'+i});
    const first=capture();
    const fx=document.querySelector('.BattleFX');fx.style.zIndex='10';fx.style.overflow='hidden';fx.style.pointerEvents='auto';
    // A second launch also exercises cancellation and recovery of a previous visual.
    M.animationMelee(entities[0],entities[1],false,{duration:800,flightId:'fixture-again'});
    const repeated=capture();
    if(fx.style.zIndex!=='9998'||fx.style.overflow!=='visible'||fx.style.pointerEvents!=='none')throw Error('FX container not repaired');
    const canvas=document.getElementById('spriteCanvas_'+entities[1].id);canvas.remove();
    const missing=M.animationMelee(entities[0],entities[1],false,{duration:600});
    if(missing!==undefined)throw Error('Missing target canvas must cancel creation');
    return {count,first,repeated,missingSprite:document.getElementById('DragSprite_'+entities[0].id).style.cssText};
   },count);
   assert.deepEqual(errors,[]);await context.close();
  }
  if(baseline)assert.deepEqual(trials.current,trials.baseline,`Changed melee geometry, opacity or keyframes at ${count}`);
  assert.ok(trials.current.first.animations.length>=count);results[count]=trials;
  console.log('PASS launch',count,'geometry, opacity, keyframes, repeated launch and FX repair');
 }
 await fs.writeFile(resolve(out,'report.json'),JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
