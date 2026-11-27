import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
const root=resolve('docs'),output=resolve(process.env.SPRITE_TEST_OUTPUT||'outputs/sprite-atlases-browser');
const auditOutput=resolve(output,'audit');
const auditRun=spawnSync(process.execPath,['scripts/audit-sprite-atlases.mjs'],{encoding:'utf8',windowsHide:true,env:{...process.env,SPRITE_AUDIT_OUTPUT:auditOutput}});
assert.equal(auditRun.status,0,auditRun.stdout+auditRun.stderr);
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/probe')return res.setHeader('Content-Type','text/html').end('<!doctype html><html><body></body></html>');
  const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.png':'image/png','.gif':'image/gif'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
    const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set();
    window.spriteRafProbe={maximum:0};
    window.requestAnimationFrame=callback=>{const id=raf(t=>{pending.delete(id);callback(t);});pending.add(id);spriteRafProbe.maximum=Math.max(spriteRafProbe.maximum,pending.size);return id;};
    window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const runtime=await page.evaluate(async()=>{
    const S=await import('/js/rendering/spriteAnimation.js'),C=await import('/js/combat/clock.js'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const check=(v,m)=>{if(!v)throw Error(m);},source='/media/assets/effects/ambidextry.gif';
    const root=document.createElement('div');root.id='game-windows';document.body.append(root);
    const sprites=Array.from({length:40},()=>S.createSpriteImage(source));root.append(...sprites);
    await Promise.all(sprites.map(n=>n.decode()));await sleep(150);
    check(S.inspectSpriteAnimations().active===40,'40 separate playheads');check(sprites.every(n=>n.width===260&&n.height===180),'100% source dimensions');
    const a=await S.loadSpriteAtlas(source),b=await S.loadSpriteAtlas(source+'#another');check(a===b,'Shared atlas pages');
    C.freezeCombatClock();S.captureSpriteAnimations();const image=sprites[0].toDataURL();await sleep(100);check(image===sprites[0].toDataURL(),'Pause holds the exact frame');
    const html=root.innerHTML;root.replaceChildren();root.innerHTML=html;await S.restoreSpriteAnimations(root);
    check(root.firstElementChild.toDataURL()===image,'Restore keeps the exact paused frame');
    C.resumeCombatClock();await sleep(150);check(root.firstElementChild.toDataURL()!==image,'Resume continues animation');
    const switched=root.firstElementChild;switched.src='/media/assets/effects/dead-cafard.png';await switched.decode();check(switched.naturalWidth>0,'Static image replacement works');
    root.remove();await sleep(50);check(S.inspectSpriteAnimations().active===0&&!S.inspectSpriteAnimations().pending,'Removed effects release playheads and RAF');
    const finiteRoot=document.createElement('section');finiteRoot.id='game-windows';document.body.append(finiteRoot);
    const finite=S.createSpriteImage(source,{loop:'source'});finiteRoot.append(finite);await finite.decode();await sleep(1150);
    check(S.inspectSpriteAnimations().active===0,'Finite source animation ends without a running RAF');
    C.freezeCombatClock();S.captureSpriteAnimations();const finalFrame=finite.toDataURL(),finiteHTML=finiteRoot.innerHTML;
    finiteRoot.innerHTML=finiteHTML;await S.restoreSpriteAnimations(finiteRoot);
    check(finiteRoot.firstElementChild.toDataURL()===finalFrame&&S.inspectSpriteAnimations().active===0,'An ended animation stays ended after restoring');
    finiteRoot.remove();C.resumeCombatClock();S.evictSpriteAtlases(0);check(S.inspectSpriteAnimations().cached===0,'Unused atlas textures can be evicted');
    window.__combatSimulation=true;
    const simulated=S.createSpriteImage(source);document.body.append(simulated);await simulated.decode();await sleep(40);
    check(simulated.naturalWidth===260&&!S.inspectSpriteAnimations().pending,'Invisible simulation keeps image geometry without rendering RAFs');
    simulated.remove();await sleep(20);delete window.__combatSimulation;
    const multi=await S.loadSpriteAtlas('/media/assets/effects/castingfx-base.gif');check(multi.images.length===2,'Multiple atlas pages load');
    check(spriteRafProbe.maximum===1,'All 40 animations share a single scheduled RAF');
    return {dimensions:[260,180],instances:40,multiPageCount:multi.images.length,maximumScheduledRAF:spriteRafProbe.maximum,renderer:S.inspectSpriteAnimations()};
  });
  assert.equal(requests.filter(url=>/\.gif(?:[?#]|$)/i.test(url)).length,0,'Rendering must not fetch source GIFs');assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'runtime.json'),JSON.stringify({runtime,requests,errors},null,2));
  const audit=JSON.parse(await readFile(resolve(auditOutput,'atlas-audit.json'),'utf8'));
  const frames=[];
  for(const definition of audit.definitions){
    const gif=audit.used.find(g=>g.atlas===definition.file)?.gif||audit.unusedGifs.find(g=>g.split('/').pop().slice(0,-4).toLowerCase()===definition.name.toLowerCase());
    if(!gif)throw Error('Original GIF missing for '+definition.name);
    const result=await page.evaluate(async({gif,name})=>{
      const S=await import('/js/rendering/spriteAnimation.js'),atlas=await S.loadSpriteAtlas('/'+gif);
      const bytes=await fetch('/'+gif).then(r=>r.arrayBuffer()),decoder=new ImageDecoder({data:bytes,type:'image/gif',preferAnimation:true});await decoder.tracks.ready;
      const make=()=>{const c=document.createElement('canvas');c.width=atlas.width;c.height=atlas.height;return c;},expected=make(),actual=make(),ec=expected.getContext('2d',{willReadFrequently:true}),ac=actual.getContext('2d',{willReadFrequently:true});
      let changedPixels=0,changedFrames=0,maxDifference=0,wrongTiming=0;
      if(decoder.tracks.selectedTrack.frameCount!==atlas.frames.length)throw Error('Frame count: '+name);
      for(let i=0;i<atlas.frames.length;i++){
        const {image}=await decoder.decode({frameIndex:i,completeFramesOnly:true});
        if(image.displayWidth!==atlas.width||image.displayHeight!==atlas.height)throw Error('Source dimensions: '+name);
        const duration=image.duration/1000;if((duration<=10?100:duration)!==(atlas.frames[i].duration<=10?100:atlas.frames[i].duration))wrongTiming++;
        ec.clearRect(0,0,expected.width,expected.height);ec.drawImage(image,0,0);image.close();S.drawSpriteFrame(actual,atlas,i);
        const x=ec.getImageData(0,0,expected.width,expected.height).data,y=ac.getImageData(0,0,actual.width,actual.height).data;let changed=0;
        for(let p=0;p<x.length;p+=4){let d=Math.abs(x[p+3]-y[p+3]);if(x[p+3]||y[p+3])d=Math.max(d,Math.abs(x[p]-y[p]),Math.abs(x[p+1]-y[p+1]),Math.abs(x[p+2]-y[p+2]));if(d){changed++;maxDifference=Math.max(maxDifference,d);}}
        if(changed){changedFrames++;changedPixels+=changed;}
      }
      decoder.close();return {name,frames:atlas.frames.length,changedFrames,changedPixels,maxDifference,wrongTiming};
    },{gif,name:definition.name});
    frames.push(result);console.log(JSON.stringify(result));await writeFile(resolve(output,'frames.json'),JSON.stringify(frames,null,2));
  }
  assert.ok(frames.every(f=>f.wrongTiming===0),'Atlas timings match source GIFs');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({animations:frames.length,frames:frames.reduce((n,f)=>n+f.frames,0),pixelDifferences:frames.filter(f=>f.changedPixels),runtime}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
