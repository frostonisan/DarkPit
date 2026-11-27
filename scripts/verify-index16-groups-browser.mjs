import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=resolve('outputs/index-16');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const errors=[],checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const url=pathToFileURL(resolve('docs/index-16.html')).href;
async function attach(p){
  p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>errors.push(r.url()));
  await p.addInitScript(()=>{window.probe={writes:0,frames:0};const set=Storage.prototype.setItem,raf=window.requestAnimationFrame;
    Storage.prototype.setItem=function(...args){window.probe.writes++;return set.apply(this,args);};
    window.requestAnimationFrame=function(...args){window.probe.frames++;return raf.apply(this,args);};});
  await p.goto(url);await p.evaluate(()=>hexGroupLab.ready);
}
const snapshot=p=>p.evaluate(()=>hexGroupLab.snapshot());
async function verify(p,label){
  const data=await snapshot(p),used=new Set();
  assert.equal(data.entities.length,3);assert.equal(Object.keys(data.occupied).length,data.entities.reduce((n,e)=>n+e.members.length,0));
  for(const entity of data.entities){
    assert.equal(entity.members.length,[1,2,3,6][entity.sizeIndex]);
    assert.equal(entity.scale,[1,1.35,1.65,2.5][entity.sizeIndex]);
    assert.equal(new Set(entity.neighbors).size,entity.neighbors.length);
    assert(!entity.neighbors.includes(`hex-${entity.id}`));
    for(const cell of entity.members){assert(!used.has(cell));used.add(cell);assert.equal(data.occupied[cell],entity.id);}
  }
  assert(await p.evaluate(()=>hexGroupLab.snapshot().entities.every(e=>e.members.every(c=>{
    const logical=hexGroupLab.logicalAt(c);return logical.occupant===e.id&&logical.members.length===e.members.length;
  }))));
  checks.push(label);return data;
}
async function gesture(p,id,destination,fromCell=null){
  await p.waitForFunction(()=>!document.querySelector('.actor-anchor.pushing'));
  return p.evaluate(({id,destination,fromCell})=>{
    const current=hexGroupLab.snapshot().entities.find(e=>e.id===id);
    const cellRect=key=>document.querySelector(`[data-cell="${key}"] polygon`).getBoundingClientRect();
    const a=cellRect(current.anchor),b=cellRect(destination);
    const source=fromCell?cellRect(fromCell):document.querySelector(`.actor-anchor[data-entity="${id}"] canvas`).getBoundingClientRect();
    const start={x:source.left+source.width/2,y:source.top+source.height/2};
    return {start,end:{x:start.x+b.left-a.left,y:start.y+b.top-a.top}};
  },{id,destination,fromCell});
}
async function drag(p,id,destination,{fromCell=null,cancel=false,beforeDrop=null}={}){
  const {start,end}=await gesture(p,id,destination,fromCell);
  await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:18});
  if(beforeDrop)await beforeDrop();
  if(cancel)await p.keyboard.press('Escape');await p.mouse.up();
}
const entity=(data,id)=>data.entities.find(e=>e.id===id);
const sizeControl=(p,id)=>p.locator(`[data-size-for="${id}"]`);
async function setSize(p,id,value){
  // Exercise the public range input, including its immediate input event (no Apply/change button).
  await sizeControl(p,id).evaluate((control,value)=>{control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
}
async function sizeStep(p,id,delta){
  await p.locator('.entity-panel').filter({has:p.locator(`[data-size-for="${id}"]`)}).locator(`[data-size-step="${delta}"]`).click();
}
try{
  await attach(page);await verify(page,'3 logical cells reserve 2, 3 and 6 underlying hexagons');
  assert.deepEqual((await snapshot(page)).entities.map(e=>e.members.length),[2,3,6]);
  assert.equal(await page.locator('#cells > g').count(),91);
  const sizes=await page.evaluate(()=>[...document.querySelectorAll('.actor-anchor')].map(actor=>{
    const canvas=actor.querySelector('canvas'),rect=canvas.getBoundingClientRect();return {id:actor.dataset.entity,width:rect.width,height:rect.height,buffer:[canvas.width,canvas.height]};
  }));
  assert(sizes.every(s=>s.buffer[0]===500&&s.buffer[1]===500));
  assert(Math.abs(sizes[1].width/sizes[0].width-1.65/1.35)<.01);assert(Math.abs(sizes[2].width/sizes[0].width-2.5/1.35)<.01);
  assert.equal((await snapshot(page)).metrics.spriteMeasurements,3);checks.push('Original sprite: fixed 500px canvas, measured once, visible battle scales 1.35 / 1.65 / 2.5');
  await page.screenshot({path:resolve(output,'desktop.png'),fullPage:true});
  const initial=await snapshot(page);
  await drag(page,'yellow','B2',{beforeDrop:async()=>assert.deepEqual((await snapshot(page)).entities,initial.entities)});
  assert.equal((await snapshot(page)).entities.find(e=>e.id==='yellow').anchor,'B2');await verify(page,'Dragging previews without mutating the board before drop');
  await drag(page,'cyan','E3',{fromCell:initial.entities.find(e=>e.id==='cyan').members.at(-1)});
  assert.equal((await snapshot(page)).entities.find(e=>e.id==='cyan').anchor,'E3');await verify(page,'Dragging any constituent cell moves its entire logical hex');
  let before=await snapshot(page);await drag(page,'purple','M7');assert.deepEqual((await snapshot(page)).entities,before.entities);checks.push('Out-of-board grouping is rejected, with no partial move');
  await page.locator('#reset').click();before=await snapshot(page);
  await drag(page,'yellow','I3',{cancel:true});assert.deepEqual((await snapshot(page)).entities,before.entities);checks.push('Escape cancels sprite movement and neighbour previews');
  await drag(page,'yellow','I3');let after=await verify(page,'A pushed neighbour keeps its entire six-cell grouping');
  assert.equal(after.entities.find(e=>e.id==='yellow').anchor,'I3');assert.notEqual(after.entities.find(e=>e.id==='purple').anchor,'I3');
  await page.locator('#reset').click();await page.locator('#push').uncheck();before=await snapshot(page);
  await drag(page,'yellow','I3');assert.deepEqual((await snapshot(page)).entities,before.entities);checks.push('Occupied drop rejected when pushing is disabled');
  await page.locator('#push').check();await drag(page,'yellow','E4');await drag(page,'cyan','G4');before=await snapshot(page);
  await drag(page,'purple','E4',{beforeDrop:async()=>{
    assert.deepEqual((await snapshot(page)).entities,before.entities);
    assert.equal(await page.locator('.logical-group.displaced').count(),2);
    // A full-page capture can resize the viewport and correctly cancel an active drag.
    await page.screenshot({path:resolve(output,'two-neighbours-preview.png')});
  }});
  after=await verify(page,'Two displaced groups are reserved and committed together');
  assert.equal(after.entities.find(e=>e.id==='purple').anchor,'E4');
  assert.notEqual(after.entities.find(e=>e.id==='yellow').anchor,'E4');assert.notEqual(after.entities.find(e=>e.id==='cyan').anchor,'G4');
  await page.locator('#reset').click();await drag(page,'yellow','J5');
  assert.equal((await snapshot(page)).entities.find(e=>e.id==='yellow').role,'fantassin');
  await drag(page,'yellow','F5');assert.equal((await snapshot(page)).entities.find(e=>e.id==='yellow').role,'tank');checks.push('Majority role follows the new constituent cells');
  await page.locator('.entity-card[data-entity="yellow"]').focus();await page.keyboard.press('ArrowLeft');
  assert.equal((await snapshot(page)).entities.find(e=>e.id==='yellow').anchor,'E5');checks.push('Keyboard moves the same logical grouping');
  const {start,end}=await gesture(page,'yellow','B4');await page.mouse.move(start.x,start.y);await page.mouse.down();
  const geometry=(await snapshot(page)).metrics.geometryReads;await page.mouse.move(end.x,end.y,{steps:40});
  assert.equal((await snapshot(page)).metrics.geometryReads,geometry);await page.mouse.up();checks.push('Pointer moves do not remeasure the DOM or the sprites');

  await page.locator('#reset').click();before=await snapshot(page);
  await setSize(page,'yellow',3);after=await verify(page,'Live growth reserves six cells and pushes its neighbour without moving the anchor');
  assert.equal(entity(after,'yellow').anchor,'C5');assert.equal(entity(after,'yellow').members.length,6);
  assert.notEqual(entity(after,'cyan').anchor,entity(before,'cyan').anchor);
  assert.equal(entity(after,'cyan').sizeIndex,entity(before,'cyan').sizeIndex);
  assert.equal(entity(after,'purple').anchor,entity(before,'purple').anchor);
  assert.equal(await sizeControl(page,'yellow').inputValue(),'3');
  assert.equal(await page.locator('#status').getAttribute('data-kind'),'push');
  await page.waitForTimeout(180);
  const grownSprite=await page.locator('.actor-anchor[data-entity="yellow"] canvas').boundingBox();
  assert(Math.abs(grownSprite.width-255*after.scale)<.01);assert.equal(after.metrics.geometryReads,before.metrics.geometryReads);
  await page.screenshot({path:resolve(output,'live-growth.png'),fullPage:true});
  const grown=after;
  await setSize(page,'yellow',0);after=await verify(page,'Shrinking frees cells; pushed neighbours keep their new positions');
  assert.equal(entity(after,'yellow').anchor,'C5');
  for(const id of ['cyan','purple']) assert.equal(entity(after,id).anchor,entity(grown,id).anchor);
  const freed=entity(grown,'yellow').members.filter(c=>c!=='C5');
  assert(await page.evaluate(freed=>freed.every(c=>hexGroupLab.logicalAt(c).occupant===null),freed));
  before=after;await setSize(page,'yellow',0);after=await snapshot(page);
  assert.deepEqual(after.entities,before.entities);assert.equal(after.metrics.commits,before.metrics.commits);
  checks.push('Repeating the same size does not trigger another move');
  await page.waitForTimeout(180);
  const smallSprite=await page.locator('.actor-anchor[data-entity="yellow"] canvas').boundingBox();assert(Math.abs(smallSprite.width-102*after.scale)<.01);
  await drag(page,'yellow','M7');before=await snapshot(page);assert.equal(entity(before,'yellow').anchor,'M7');
  await setSize(page,'yellow',3);after=await snapshot(page);
  assert.deepEqual(after.entities,before.entities);assert.equal(after.metrics.commits,before.metrics.commits);
  assert.equal(await sizeControl(page,'yellow').inputValue(),'0');
  assert.equal(await page.locator('#status').getAttribute('data-kind'),'invalid');
  checks.push('Off-board growth is rejected atomically; the slider and sprite retain their actual size');

  await page.locator('#reset').click();await page.locator('#push').uncheck();before=await snapshot(page);
  await setSize(page,'yellow',3);assert.deepEqual((await snapshot(page)).entities,before.entities);
  assert.equal(await sizeControl(page,'yellow').inputValue(),'1');checks.push('Growth into an occupied cell is refused when pushing is disabled');
  await page.locator('#push').check();
  await setSize(page,'purple',0);await page.waitForTimeout(180);await drag(page,'purple','E4');
  await drag(page,'yellow','F4');await drag(page,'cyan','F5');before=await snapshot(page);
  assert.equal(entity(before,'purple').anchor,'E4');assert.equal(entity(before,'yellow').anchor,'F4');assert.equal(entity(before,'cyan').anchor,'F5');
  await setSize(page,'purple',3);after=await verify(page,'Growing across two neighbours relocates both complete groups atomically');
  assert.equal(entity(after,'purple').anchor,'E4');assert.equal(entity(after,'purple').members.length,6);
  for(const id of ['yellow','cyan']) {assert.notEqual(entity(after,id).anchor,entity(before,id).anchor);assert.equal(entity(after,id).sizeIndex,entity(before,id).sizeIndex);}

  await page.locator('#reset').click();
  await sizeControl(page,'yellow').focus();await page.keyboard.press('ArrowRight');after=await snapshot(page);
  assert.equal(entity(after,'yellow').sizeIndex,2);assert.equal(entity(after,'yellow').anchor,'C5');
  await sizeStep(page,'yellow',1);assert.equal(entity(await snapshot(page),'yellow').sizeIndex,3);
  assert(await page.locator('.entity-panel').filter({has:sizeControl(page,'yellow')}).locator('[data-size-step="1"]').isDisabled());
  await sizeStep(page,'yellow',-1);assert.equal(entity(await snapshot(page),'yellow').sizeIndex,2);
  checks.push('Range arrow keys resize without moving the anchor; plus and minus change exactly one size step');
  for(const id of ['yellow','cyan','purple']) await setSize(page,id,0);
  after=await verify(page,'All three flies can independently shrink to a single cell');
  assert.equal(Object.keys(after.occupied).length,3);
  for(const id of ['yellow','cyan','purple']) await setSize(page,id,3);
  after=await verify(page,'All three flies can independently grow to six cells, without overlap');
  assert.equal(Object.keys(after.occupied).length,18);
  await page.waitForTimeout(180);await drag(page,'cyan','B2');after=await verify(page,'Dragging after resize uses the new grouping and centre');
  assert.equal(entity(after,'cyan').anchor,'B2');assert.equal(entity(after,'cyan').members.length,6);
  assert.equal(after.metrics.spriteMeasurements,3);
  assert(await page.evaluate(()=>[...document.querySelectorAll('.actor-anchor canvas')].every(c=>c.width===500&&c.height===500)));
  checks.push('Resizing reuses cached geometry and the original fixed canvas buffers');
  await page.locator('#reset').click();after=await snapshot(page);assert.deepEqual(after.entities,initial.entities);
  await page.waitForTimeout(180);checks.push('Reset restores the three initial sizes, roles and positions');

  const slideProbe=await page.evaluate(()=>{
    const actor=document.querySelector('.actor-anchor[data-entity="cyan"]');
    const foot=()=>{const r=actor.getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom};};
    const start=foot(),control=document.querySelector('[data-size-for="yellow"]');
    control.value='3';control.dispatchEvent(new Event('input',{bubbles:true}));
    const slide=actor.getAnimations()[0];slide.pause();slide.currentTime=0;
    const first=foot();slide.currentTime=210;const middle=foot();slide.currentTime=420;const end=foot();
    slide.currentTime=100;slide.play();
    const smoke=actor.querySelector('.push-smoke'),r=smoke.getBoundingClientRect(),a=actor.getBoundingClientRect();
    return {start,first,middle,end,smoke:{src:smoke.getAttribute('src'),footOffset:r.bottom-a.bottom,pointerEvents:getComputedStyle(smoke).pointerEvents},scale:hexGroupLab.snapshot().scale};
  });
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  assert(distance(slideProbe.start,slideProbe.first)<.1);
  assert(distance(slideProbe.first,slideProbe.end)>30);
  assert(distance(slideProbe.middle,slideProbe.first)>1);assert(distance(slideProbe.middle,slideProbe.end)>1);
  assert(distance(slideProbe.middle,slideProbe.end)<distance(slideProbe.first,slideProbe.end));
  assert.match(slideProbe.smoke.src,/^media\/assets\/effects\/dodge-smoke\.gif#push-\d+$/);assert.equal(slideProbe.smoke.pointerEvents,'none');
  assert(Math.abs(slideProbe.smoke.footOffset-8*slideProbe.scale)<.1);
  await page.waitForFunction(()=>document.querySelector('.push-smoke')?.naturalWidth===296);
  await page.screenshot({path:resolve(output,'pushed-neighbour-smoke.png')});
  await page.waitForFunction(()=>!document.querySelector('.push-smoke,.actor-anchor.pushing'));
  assert.equal(await page.locator('.actor-anchor').evaluateAll(actors=>actors.reduce((n,a)=>n+a.getAnimations().length,0)),0);
  checks.push('Pushed sprite starts at its previous position and visibly interpolates to the reserved group');
  checks.push('Existing smoke GIF follows the feet, ignores clicks and is removed with finished animation objects');

  await page.locator('#reset').click();
  const retarget=await page.evaluate(()=>{
    const change=(id,value)=>{const c=document.querySelector(`[data-size-for="${id}"]`);c.value=value;c.dispatchEvent(new Event('input',{bubbles:true}));};
    const actor=document.querySelector('.actor-anchor[data-entity="cyan"]');
    const foot=()=>{const r=actor.getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom};};
    change('yellow','3');const oldSlide=actor.getAnimations()[0];oldSlide.pause();oldSlide.currentTime=126;
    const before=foot(),oldSmoke=actor.querySelector('.push-smoke').src;change('cyan','3');const slide=actor.getAnimations()[0];slide.pause();slide.currentTime=0;
    const after=foot();slide.play();
    return {before,after,count:actor.querySelectorAll('.push-smoke').length,freshSmoke:oldSmoke!==actor.querySelector('.push-smoke').src,size:hexGroupLab.snapshot().entities.find(e=>e.id==='cyan').sizeIndex};
  });
  assert.equal(retarget.size,3);assert.equal(retarget.count,1);assert(retarget.freshSmoke);assert(distance(retarget.before,retarget.after)<.1);
  await page.waitForFunction(()=>!document.querySelector('.push-smoke,.actor-anchor.pushing'));
  assert(await page.evaluate(()=>hexGroupLab.snapshot().entities.every(e=>{
    const r=document.querySelector(`.actor-anchor[data-entity="${e.id}"]`).getBoundingClientRect(),w=document.getElementById('world').getBoundingClientRect(),scale=hexGroupLab.snapshot().scale;
    return Math.abs((r.left+r.width/2-w.left)/scale-e.center.x)<.1&&Math.abs((r.bottom-w.top)/scale-e.center.y-42*.23)<.1;
  })));
  await verify(page,'A second resize retargets from the visible position and ends on the latest group, without duplicate smoke');

  await page.locator('#reset').click();
  const interrupted=await page.evaluate(()=>{
    const c=document.querySelector('[data-size-for="yellow"]');c.value=3;c.dispatchEvent(new Event('input',{bubbles:true}));
    const actor=document.querySelector('.actor-anchor[data-entity="cyan"]'),slide=actor.getAnimations()[0];slide.pause();slide.currentTime=210;
    // Grab an exposed part: the growing foreground sprite can overlap the neighbour's centre.
    document.querySelectorAll('.entity-size-layer,.effects-container').forEach(el=>el.getAnimations().forEach(a=>a.finish()));
    const r=actor.getBoundingClientRect(),canvas=actor.querySelector('canvas').getBoundingClientRect();
    for(const fx of [.85,.95,.65,.5,.2]) for(const fy of [.4,.6,.2,.8]) {
      const pointer={x:canvas.x+canvas.width*fx,y:canvas.y+canvas.height*fy};
      if(document.elementFromPoint(pointer.x,pointer.y)?.closest('.actor-anchor')===actor) return {foot:{x:r.x+r.width/2,y:r.bottom},pointer};
    }
    throw Error('No exposed part of the pushed neighbour to grab.');
  });
  await page.mouse.move(interrupted.pointer.x,interrupted.pointer.y);await page.mouse.down();
  const held=await page.locator('.actor-anchor[data-entity="cyan"]').evaluate(actor=>{const r=actor.getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom,dragging:actor.classList.contains('dragging'),smoke:!!actor.querySelector('.push-smoke')};});
  assert(held.dragging);assert(!held.smoke);assert(distance(held,interrupted.foot)<.1);
  await page.keyboard.press('Escape');await page.mouse.up();
  checks.push('Grabbing a sliding neighbour takes over at its visible position without a jump');

  await page.locator('#reset').click();await setSize(page,'yellow',3);assert.equal(await page.locator('.push-smoke').count(),1);
  await page.locator('#reset').click();assert.equal(await page.locator('.push-smoke,.actor-anchor.pushing').count(),0);
  assert.deepEqual((await snapshot(page)).entities,initial.entities);
  await page.locator('#push').uncheck();await setSize(page,'yellow',3);assert.equal(await page.locator('.push-smoke,.actor-anchor.pushing').count(),0);
  await page.locator('#push').check();await setSize(page,'yellow',0);assert.equal(await page.locator('.push-smoke,.actor-anchor.pushing').count(),0);
  checks.push('Reset clears active pushes; refused growth and simple shrinking emit no smoke');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#reset').click();await setSize(page,'yellow',3);
  assert.notEqual(entity(await snapshot(page),'cyan').anchor,'E5');assert.equal(await page.locator('.push-smoke,.actor-anchor.pushing').count(),0);
  checks.push('Reduced-motion preference preserves neighbour placement without sliding or smoke');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#reset').click();

  const frames=await page.evaluate(()=>probe.frames);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>probe.frames),frames);
  assert.equal(await page.evaluate(()=>probe.writes),0);checks.push('No idle JS animation loop and no save writes');
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await attach(mobile);
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  await sizeStep(mobile,'yellow',1);assert.equal(entity(await snapshot(mobile),'yellow').sizeIndex,2);
  await sizeStep(mobile,'yellow',1);assert.equal(entity(await snapshot(mobile),'yellow').sizeIndex,3);
  assert.notEqual(entity(await snapshot(mobile),'cyan').anchor,'E5');
  await sizeStep(mobile,'yellow',-1);await mobile.waitForTimeout(180);
  checks.push('Mobile size controls grow and shrink immediately, including neighbour repulsion');
  const touch=await gesture(mobile,'yellow','D4'),cdp=await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch.start,id:1}]});
  for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.start.x+(touch.end.x-touch.start.x)*step/12,y:touch.start.y+(touch.end.y-touch.start.y)*step/12,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await snapshot(mobile)).entities.find(e=>e.id==='yellow').anchor,'D4');await verify(mobile,'Touch dragging preserves coordinates on the scaled mobile board');
  await mobile.screenshot({path:resolve(output,'mobile.png'),fullPage:true});await mobile.close();
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'report.json'),JSON.stringify({checks,sizes,errors},null,2));
  console.log(JSON.stringify({checks:checks.length,errors,sizes},null,2));
}finally{await browser.close();}
