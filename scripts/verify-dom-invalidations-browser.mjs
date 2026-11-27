import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root=resolve('docs'), baseline=process.env.DOM_BASELINE && resolve(process.env.DOM_BASELINE);
const output=resolve(process.env.DOM_OUTPUT || 'outputs/dom-invalidations');
await mkdir(output,{recursive:true}); let variant='current';
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
    res.end(await readFile(variant==='baseline' && /^\/(js|css)\//.test(path)?resolve(baseline,'.'+path):file));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
  for(const count of [10,40,80]){
    const trials={};
    for(variant of baseline?['baseline','current']:['current']){
      const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#game-container').waitFor({state:'attached'});
      const metadata=JSON.parse(await readFile('package.json','utf8'));
      const version=metadata.gameVersion || metadata.version;
      assert.equal(await page.locator('#game-version').textContent(),`The Dark Pit v${version}`);
      assert.equal(await page.locator('#game-version').isVisible(),true);
      trials[variant]=await page.evaluate(async({count,current})=>{
        const HUD=await import('/js/rendering/hud.js'),Batch=await import('/js/rendering/displayBatch.js');
        const Stats=await import('/js/combat/statistics.js'),UI=await import('/js/ui/attacks.js');
        const Game=await import('/js/app/state.js'),Clock=await import('/js/combat/clock.js');
        Clock.clearCombatClock();Game.restoreRunningBattle();
        const host=document.createElement('section');host.id='dom-test';document.body.append(host);
        const actors=Array.from({length:count},(_,i)=>({id:998100+i,type:'sbire',side:'A',stats:{shift:{current:1,max:3}},flags:{}}));
        const nodes=actors.map(e=>{
          const box=document.createElement('div');box.innerHTML=`<div id="sbire_${e.id}"></div><div id="DragSprite_${e.id}"></div><div id="spriteCanvas_${e.id}"></div><div id="Animationsprite_${e.id}"></div><div class="movement-counter" data-movement-entity-id="${e.id}"></div><div class="attack-bar-fill preparation occultism-slowed"></div><div class="active-attack-visual"><img id="currentAttackImage_${e.id}"></div><div id="battlePreparation_${e.id}"></div><div id="currentAttackBar_${e.id}"></div>`;
          for(const n of box.querySelectorAll('[id^="sbire_"],[id^="DragSprite_"],[id^="spriteCanvas_"],[id^="Animationsprite_"]'))n.className='entity-test-node';
          host.append(box);HUD.updateMovementDisplay(e,{animate:false});
          return {box,counter:box.querySelector('.movement-counter'),bar:box.querySelector('.attack-bar-fill')};
        });
        const observe=()=>{const ob=new MutationObserver(()=>{});ob.observe(host,{subtree:true,attributes:true,childList:true,characterData:true});return ()=>{const r=ob.takeRecords();ob.disconnect();return {attributes:r.filter(x=>x.type==='attributes').length,childList:r.filter(x=>x.type==='childList').length,characterData:r.filter(x=>x.type==='characterData').length};};};
        const same=(condition,message)=>{if(!condition)throw Error(message);};
        let end=observe();
        for(let pass=0;pass<8;pass++)for(const n of nodes){Batch.setDisplayClass(n.bar,'attack-bar-fill preparation');Batch.toggleDisplayClass(n.bar,'occultism-slowed',true);Batch.flushCombatDisplay();}
        const stableClasses=end();
        end=observe();
        for(const n of nodes){Batch.setDisplayClass(n.bar,'attack-bar-fill execution');Batch.toggleDisplayClass(n.bar,'occultism-slowed',true);Batch.flushCombatDisplay();}
        const changedClasses=end();
        same(nodes.every(n=>n.bar.className==='attack-bar-fill execution occultism-slowed'),'Phase/modifier state changed');
        const before=JSON.stringify(actors);end=observe();
        for(let pass=0;pass<8;pass++)actors.forEach(e=>HUD.updateMovementDisplay(e,{animate:false}));
        const movement=end();same(JSON.stringify(actors)===before,'Rendering changed movement state');
        end=observe();for(let pass=0;pass<8;pass++)actors.forEach(Stats.clearOccultismInvisibleState);
        const invisibility=end();
        actors.forEach(Stats.setOccultismInvisibleState);actors.forEach(Stats.clearOccultismInvisibleState);
        same(!host.querySelector('.invisible,.occultism-invisible,[data-invisible]'),'Invisible state not cleared');
        const views=actors.map(UI.createCooldownWaitView);
        const choice={key:'test',attack:{attackAsset:'/media/assets/effects/magic-circle',displayName:'Attaque <b>test</b>'},readyAt:5000};
        views.forEach(v=>v.update(choice,1000));end=observe();
        for(let pass=0;pass<8;pass++)views.forEach(v=>v.update(choice,1000+pass*50));
        const cooldown=end();
        const values=[...host.querySelectorAll('.attack-cooldown-countdown')].map(n=>[n.textContent,n.title]);
        views.forEach(v=>v.clear());same(!host.querySelector('.attack-cooldown-countdown,.cooldown-preview'),'Cooldown cleanup');
        const samples=[];
        for(const state of [{current:1,max:3,delta:0,extra:0},{current:-1,max:3,delta:-2,extra:0},{current:4,max:3,delta:1,extra:2},{current:2,max:5,delta:2,extra:1}]){
          const span=HUD.renderMovementCounter(nodes[0].counter,actors[0],state);
          const elements=[nodes[0].counter,span,span.parentNode.querySelector('.max')];
          samples.push(elements.map(n=>({text:n.textContent,classes:[...n.classList].sort(),color:getComputedStyle(n).color})));
        }
        nodes[0].counter.innerHTML='<span>Rebuilt externally</span>';
        HUD.updateMovementDisplay(actors[0],{animate:false});same(!!nodes[0].counter.querySelector('.current'),'External rebuild not repaired');
        actors[0].stats.shift.current=2;HUD.updateMovementDisplay(actors[0]);
        const first=nodes[0].counter.querySelector('.bounce-shift');same(!!first,'Generated move did not bounce');
        actors[0].stats.shift.current=3;HUD.updateMovementDisplay(actors[0]);
        const second=nodes[0].counter.querySelector('.bounce-shift');same(!!second && first!==second,'Repeated gain did not restart bounce');
        HUD.updateMovementDisplay(actors[0],{animate:false});same(!nodes[0].counter.querySelector('.bounce-shift'),'Ordinary refresh did not end old bounce');
        Clock.freezeCombatClock();Batch.setDisplayClass(nodes[0].bar,'paused');same(nodes[0].bar.className==='paused','Pause must publish synchronously');Clock.resumeCombatClock();
        if(current){same(stableClasses.attributes===0,'Unchanged final classes caused writes');same(changedClasses.attributes===count,'Class change should be atomic');same(movement.childList===0 && movement.attributes===0,'Stable movement rebuilt DOM');same(invisibility.attributes===0,'Visible entity mutated');same(cooldown.childList===0,'Countdown replaced text nodes');}
        Clock.clearCombatClock();host.remove();return {stableClasses,changedClasses,movement,invisibility,cooldown,values,samples,lifecycle:true};
      },{count,current:variant==='current'});
      assert.deepEqual(errors,[]);await page.close();
    }
    if(baseline)for(const key of ['values','samples','lifecycle'])assert.deepEqual(trials.current[key],trials.baseline[key],`${count}: ${key}`);
    results.push({count,trials});console.log('PASS DOM invalidations',count,JSON.stringify(Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,{classes:v.stableClasses.attributes,movement:v.movement.childList,invisible:v.invisibility.attributes,cooldown:v.cooldown.childList}]))));
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
