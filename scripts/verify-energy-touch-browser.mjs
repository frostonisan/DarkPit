import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve('outputs/projectiles-touch-20261124/functional');
const fixture = await createProjectileFixture(output), report = [];
try {
  for (const count of [10, 40, 80]) {
    const {page, context, errors, missing} = await fixture.open({viewport:{width:1280,height:720}});
    const result = await page.evaluate(async count => {
      const visual = await import('/js/rendering/attackAppearance.js');
      const ids = Array.from({length:count}, () => launchShot({nature:'magicalDamage',duration:1200,scheduled:true}));
      clock.freezeCombatClock();
      const nodes = ids.map(id => document.getElementById(id));
      const textures = nodes.map(n => getComputedStyle(n.firstElementChild).backgroundImage);
      const palette = [['physicalDamage'],['magicalDamage'],['piercingDamage'],['hybridalDamage'],
        ['physicalDamage','piercingDamage'],['magicalDamage','piercingDamage'],['hybridalDamage','piercingDamage'],['inerte']];
      const trail = renderer.createSpeedTrail(document.getElementById('projectile-fixture'));
      const trails = palette.map(natures => {
        visual.colorMeleeTrail(trail,natures);
        return {nature:trail.dataset.attackNature,background:trail.style.background,filament:trail.firstElementChild.style.background};
      });
      trail.remove();
      const paused = {x:nodes[0].style.transform,angle:nodes[0].firstElementChild.style.transform};
      window.checkPausedShot = () => ({x:nodes[0].style.transform,angle:nodes[0].firstElementChild.style.transform});
      return {energy:nodes.filter(n=>n.classList.contains('energy-projectile')).length,
        textures:new Set(textures).size,baked:textures.every(t=>t.startsWith('url("data:image/png;base64,')),paused,trails};
    },count);
    assert.equal(result.energy,count);assert.equal(result.textures,1);assert.ok(result.baked);
    assert.equal(new Set(result.trails.map(t=>t.background)).size,8);
    assert.equal(new Set(result.trails.map(t=>t.filament)).size,8);
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(()=>checkPausedShot()),result.paused,'Pause preserves position and orientation');
    if(count===10)await page.screenshot({path:resolve(output,'energy.png')});
    const impacts=await page.evaluate(async()=>{clock.resumeCombatClock();await Promise.all(shots.map(s=>s.done));return shots.map(s=>[s.hits,s.logicalImpacts,s.result]);});
    for(const impact of impacts)assert.deepEqual(impact,[1,1,'hit']);
    assert.equal(await page.locator('.projectile-parent').count(),0);
    if(count===10){
      const frozenNatures=await page.evaluate(async()=>{
        const E=await import('/js/entities/runtime.js');
        const {presentAttackTransport}=await import('/js/rendering/attackTransport.js');
        E.entites.length=0;
        const entities=actors.map((actor,i)=>{
          const entity=E.enrichEntityStats({...actor,name:'Nature snapshot',side:i?'B':'A',stats:{},statut:['alive'],isDEAD:false,
            baseStats:{HP:100,strength:1,intelligence:1,agility:1},attacks:['autoAttack'],executionTime:600});
          entity.currentAttack={attacknature:['magicalDamage'],executionTime:600};E.entites.push(entity);
          const host=document.getElementById('sbire_'+actor.id);
          host.innerHTML=`<div id="spriteContainer_${actor.id}"><div id="Animationsprite_${actor.id}"><div id="DragSprite_${actor.id}"><canvas id="spriteCanvas_${actor.id}" width="24" height="24"></canvas></div></div></div><div id="effectsContainer_${actor.id}"></div><div id="PopDow_${actor.id}"></div>`;
          return entity;
        });
        const checks=[];
        for(const secondHit of [false,true]){
          const id='frozen-nature-'+secondHit;
          void presentAttackTransport({id,attacker:entities[0],target:entities[1],attack:{attacknature:['physicalDamage']}},
            new Promise(()=>{}),{duration:600,isRange:false,options:{secondHit}});
          const controller=renderer.getMeleeFlightVisual(id),snapshot=controller.snapshot();
          checks.push({nature:document.getElementById(snapshot.resume.trailId)?.dataset.attackNature,saved:snapshot.options.attacknature});
          controller.cancel();
        }
        return checks;
      });
      for(const item of frozenNatures)assert.deepEqual(item,{nature:'physicalDamage',saved:['physicalDamage']},'Primary/second hit and pause snapshot use the launched attack, not the next selected attack');
    }
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    report.push({count,...result,impacts:impacts.length});await context.close();
    console.log('PASS energy',count,'shared bitmap, colors, pause, unique impacts and cleanup');
  }

  for(const viewport of [{width:915,height:412},{width:412,height:915}]) {
    const {page,context,errors}=await fixture.open({viewport,isMobile:true,hasTouch:true});
    await page.evaluate(async()=>{
      const E=await import('/js/entities/runtime.js'), S=await import('/js/storage/gameStorage.js');
      const B=await import('/js/board/controller.js');
      const D=await import('/js/board/interaction.js');
      const V=await import('/js/ui/viewport.js');
      const template=(await import('/js/data/entityTemplates.js')).entitesNest.find(e=>e.serial===900013);
      document.querySelectorAll('.entitylootContainer, .loading-screen').forEach(n=>n.remove());
      const host=document.getElementById('projectile-fixture');host.replaceChildren();
      host.style.cssText='position:absolute;inset:0;pointer-events:auto';
      document.getElementById('game-shell').append(host);V.layoutGameShell();
      const grid=document.createElement('div');grid.id='hexGrid';
      grid.style.cssText='position:absolute;inset:0;transform:none;margin:0';host.append(grid);
      E.entites.length=0;S.setAdminMode(false);window.levelRunning='touch-test';
      const actor=E.enrichEntityStats({...structuredClone(template),id:998501,side:'A',type:'sbire',position:'hex_1',
        role:'gueux',stats:{},stuff:{},baseStats:{HP:100,strength:1,intelligence:1,agility:1,shift:5,trailer:0}});
      actor.isDEAD=false;actor.statut=['alive'];actor.stats.shift={current:5,max:5,baseDefault:true};
      actor.resourceStocks={shift:{temporary:0,spell:0,stuff:{}}};E.entites.push(actor);
      window.selectedArmyA=[actor];S.saveToLocalStorage('selectedArmyA',[actor]);
      for(let i=0;i<3;i++){
        const hex=document.createElement('div');hex.className=`hex Side${i===2?'B':'A'}`;hex.dataset.position=`hex_${i+1}`;
        hex.dataset.role='gueux';hex.style.cssText=`position:absolute;left:${350+i*350}px;top:320px;width:180px;height:180px;transform:none`;
        hex.innerHTML='<div class="socle gueux" style="width:100%;height:100%;background:#3456;opacity:1"><div class="image-role-hex-info"></div></div>';
        grid.append(hex);
      }
      const box=document.createElement('div');box.id='Box_Entite_998501';box.className='entite-box side-A';box.dataset.position='hex_1';
      box.style.cssText='position:absolute;inset:0;width:180px;height:180px';
      box.innerHTML='<div id="sbire_998501"><div id="spriteContainer_998501" class="sprite-container"><div id="DragSprite_998501" class="sprite" draggable="true" style="position:absolute;inset:0;width:180px;height:180px;transform:none"><canvas width="180" height="180" style="width:180px;height:180px"></canvas></div></div></div>';
      grid.firstElementChild.append(box);const ctx=box.querySelector('canvas').getContext('2d');ctx.fillStyle='#ff6864';ctx.fillRect(10,10,160,160);
      window.tapClicks=0;box.addEventListener('click',()=>tapClicks++);
      B.invalidateFootprintGeometry(grid);B.rebuildBoardOccupancy(grid);D.restoreEntityDragAndDrop();
      window.touchActor=actor;window.touchStorage=S;
      window.touchState=()=>({position:actor.position,shift:actor.stats.shift.current,stored:S.loadFromLocalStorage('selectedArmyA')[0].position,
        preview:document.querySelectorAll('.touch-entity-drag-preview').length,active:document.body.classList.contains('drag-drop-active'),
        dragged:document.querySelectorAll('.dragged').length,hovered:document.querySelectorAll('.hex.hovered').length});
    });
    const cdp=await context.newCDPSession(page);
    const center=async selector=>{const b=await page.locator(selector).boundingBox();assert.ok(b);return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
    const sprite='#DragSprite_998501';
    const before=await page.evaluate(()=>touchState());
    await touch('touchStart',await center(sprite));await touch('touchEnd');
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(()=>touchState()),before,'A short tap cannot move or spend a charge');
    assert.equal(await page.evaluate(()=>tapClicks),1,'A short touch still produces the normal entity click');
    const drag=async(destination,ending='touchEnd')=>{
      await touch('touchStart',await center(sprite));
      await page.waitForFunction(()=>document.querySelector('.touch-entity-drag-preview'));
      await touch('touchMove',destination);
      await touch(ending);
      await page.waitForFunction(()=>!document.body.classList.contains('drag-drop-active')&&!document.querySelector('.touch-entity-drag-preview'));
    };
    await drag(await center('.hex[data-position="hex_2"]'));
    let state=await page.evaluate(()=>touchState());
    assert.equal(state.position,'hex_2');assert.equal(state.stored,'hex_2');assert.ok(state.shift<before.shift);
    assert.equal(state.dragged,0);assert.equal(state.hovered,0);
    assert.equal(await page.evaluate(()=>tapClicks),1,'Releasing a drag cannot also select/open the entity');
    const moved=state;
    await drag(await center('.hex[data-position="hex_3"]'));
    assert.deepEqual(await page.evaluate(()=>touchState()),moved,'Enemy cells must reject a touch drop');
    await drag(await center('.hex[data-position="hex_1"]'),'touchCancel');
    assert.deepEqual(await page.evaluate(()=>touchState()),moved,'Cancelled touches cannot move or spend charges');
    await drag({x:5,y:5});
    assert.deepEqual(await page.evaluate(()=>touchState()),moved,'Dropping outside the board cannot move');
    const origin=await center(sprite);
    await touch('touchStart',origin);
    await page.waitForFunction(()=>document.querySelector('.touch-entity-drag-preview'));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,id:1},{x:origin.x+25,y:origin.y+25,id:2}]});
    await touch('touchEnd');
    assert.deepEqual(await page.evaluate(()=>touchState()),moved,'A second finger cancels, without dropping');
    await page.evaluate(()=>clock.freezeCombatClock());
    await drag(await center('.hex[data-position="hex_1"]'));
    state=await page.evaluate(()=>touchState());assert.equal(state.position,'hex_1','Touch holds work while combat time is frozen');
    assert.ok(state.shift<moved.shift);
    await page.evaluate(()=>{clock.resumeCombatClock();touchActor.stats.shift.current=0;});
    await drag(await center('.hex[data-position="hex_2"]'));
    assert.equal(await page.evaluate(()=>touchActor.position),'hex_1','No movement without a charge');
    await page.screenshot({path:resolve(output,`touch-${viewport.width}.png`)});
    assert.deepEqual(errors,[]);
    report.push({viewport,moved,state});await context.close();
    console.log('PASS touch',viewport.width,'native touch, hold, movement cost, save, enemy rejection, cancel and pause');
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
}finally{await fixture.close();}
