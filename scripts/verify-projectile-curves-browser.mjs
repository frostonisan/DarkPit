import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve(process.env.CURVES_OUTPUT || 'outputs/projectile-static-20261124/functional');
const fixture = await createProjectileFixture(output), reports = [];
try {
  for (const count of [10,40,80]) {
    const views=[];
    for (const width of [1536,915]) {
      const {page,context,errors,missing}=await fixture.open({viewport:{width,height:width===915?412:864},isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await page.evaluate(async count=>{
        const V=await import('/js/ui/viewport.js');V.layoutGameShell();
        window.trailRenderer=await import('/js/rendering/projectileTrails.js');
        const host=document.getElementById('projectile-fixture');host.replaceChildren();
        host.style.cssText='position:absolute;inset:0;pointer-events:none';document.getElementById('game-shell').append(host);
        window.actors=Array.from({length:count},(_,i)=>{
          const actor={id:994000+i,type:'sbire'},node=document.createElement('div');node.id=`sbire_${actor.id}`;
          node.style.cssText=`position:absolute;left:${i<count/2?200:1100}px;top:${180+i%(count/2)*7}px;width:20px;height:20px;background:#557`;host.append(node);return actor;
        });
        clock.freezeCombatClock();
        window.makePoses=(progress,onlyMagic=false)=>{
          renderer.clearProjectileEffects(actors);
          for(let i=0;i<count;i++){
            const magical=!!(i%2),start={x:i<count/2?210:1110,y:190+i%(count/2)*7};
            if(onlyMagic&&!magical)continue;
            void renderer.animationProjectile(actors[i],actors[(i+count/2)%count],null,{id:`curve-${i}`,
              attacknature:[magical?'magicalDamage':'physicalDamage'],executionTime:2000,impactPromise:new Promise(()=>{}),
              restoredVisual:{x:660,y:start.y,startTime:clock.clockNow()-progress*2000,dx:i<count/2?1:-1,dy:0,
                waveAmplitude:10,travelDistance:900,...(!magical?{curve:{...start,at:0,height:60}}:{})}});
          }
          trailRenderer.flushProjectileTrails();
        };
        window.readPoses=()=>{
          const size=id=>{const n=document.querySelector(`#curve-${id} > .projectile`),r=n.getBoundingClientRect();return Math.max(r.width,r.height)};
          const tails=[...document.querySelectorAll('.projectile-speed-trail,.projectile-magic-trail')].map(n=>{
            const c=getComputedStyle(n);return {className:n.className,transform:c.transform,opacity:c.opacity,
              image:c.backgroundImage,filaments:n.children.length};
          });
          return {canvasCount:document.querySelectorAll('#projectile-trails').length,tails,
            physical:new DOMMatrix(document.getElementById('curve-0').style.transform).toJSON(),
            magical:new DOMMatrix(document.getElementById('curve-1').style.transform).toJSON(),
            physicalSize:size(0),magicalSize:size(1),scale:V.effectViewport().scale,
            positions:actors.map(a=>a.projectiles[0].visual)};
        };
        makePoses(.5);
      },count);
      const initial=await page.evaluate(()=>readPoses());
      assert.equal(initial.canvasCount,0,'No shared canvas is redrawn for projectile tails');
      assert.equal(initial.tails.length,count);
      assert.ok(initial.tails.every(t=>Number(t.opacity)>0));
      assert.ok(initial.tails.filter(t=>t.className==='projectile-speed-trail').every(t=>t.filaments===3));
      const magicImages=initial.tails.filter(t=>t.className==='projectile-magic-trail').map(t=>t.image);
      assert.equal(new Set(magicImages).size,1);assert.ok(magicImages.every(t=>t.startsWith('url("data:image/png;base64,')));
      assert.ok(Math.abs(initial.physical.m41-660)<.01&&Math.abs(initial.physical.m42-130)<.01,'Physical arc has its peak halfway between locked endpoints');
      assert.ok(Math.abs(initial.magical.m42-197)<.01,'Magical head crosses the logical route at half flight');
      assert.ok(Math.abs(initial.physicalSize-10*initial.scale)<.02);
      assert.ok(Math.abs(initial.magicalSize-32*initial.scale)<.02);
      await page.waitForTimeout(100);
      const paused=await page.evaluate(()=>readPoses());
      assert.deepEqual(paused.tails,initial.tails,'Tail bitmap, filaments and orientation are frozen while paused');
      assert.deepEqual(paused.positions,initial.positions);
      if(width===1536){
        await page.setViewportSize({width:915,height:412});
        await page.evaluate(async()=>{(await import('/js/ui/viewport.js')).layoutGameShell();trailRenderer.flushProjectileTrails()});
        const resized=await page.evaluate(()=>readPoses());views.push(resized);
        assert.deepEqual(resized.positions,initial.positions,'Resize never changes flight data');
        await page.setViewportSize({width:412,height:915});
        await page.evaluate(async()=>{(await import('/js/ui/viewport.js')).layoutGameShell();trailRenderer.flushProjectileTrails()});
        const rotated=await page.evaluate(()=>readPoses());
        assert.ok(Math.abs(rotated.magicalSize-resized.magicalSize)<.02);
        assert.deepEqual(rotated.positions,initial.positions,'Auto-landscape never changes flight data');
      } else {
        assert.ok(Math.abs(initial.magicalSize-views[0].magicalSize)<.02,'Fresh mobile matches resized desktop');
        assert.ok(Math.abs(initial.physicalSize-views[0].physicalSize)<.02);
      }
      // Same head position and direction at quarter/half flight: the bitmap
      // and its pose must stay identical, without a phase-dependent flagellum.
      const tail=await page.evaluate(()=>{
        makePoses(.25,true);const firstHead=new DOMMatrix(document.getElementById('curve-1').style.transform).toJSON();
        const firstTail=document.querySelector('#curve-1 .projectile-magic-trail').style.cssText;
        makePoses(.5,true);const secondHead=new DOMMatrix(document.getElementById('curve-1').style.transform).toJSON();
        return {firstHead,secondHead,identical:firstTail===document.querySelector('#curve-1 .projectile-magic-trail').style.cssText};
      });
      assert.ok(Math.abs(tail.firstHead.m41-tail.secondHead.m41)<.01&&Math.abs(tail.firstHead.m42-tail.secondHead.m42)<.01);
      assert.ok(tail.identical,'The magical trail stays static');
      await page.evaluate(()=>makePoses(.5));
      if(count===40&&width===915)await page.screenshot({path:resolve(output,'mobile-curves.png')});
      if(count===10&&width===1536)await page.screenshot({path:resolve(output,'projectiles.png')});
      const speed=await page.evaluate(async()=>{
        const {colorMeleeTrail}=await import('/js/rendering/attackAppearance.js');
        const control=renderer.createSpeedTrail();colorMeleeTrail(control,['physicalDamage']);
        const physical=document.querySelector('#curve-0 .projectile-speed-trail');
        return {ribbon:physical.style.background===control.style.background,
          filaments:[...physical.children].every((n,i)=>n.style.cssText===control.children[i].style.cssText),
          parentFilter:getComputedStyle(physical.parentElement).filter,
          headFilter:getComputedStyle(physical.parentElement.querySelector('.projectile')).filter,
          headShadow:getComputedStyle(physical.parentElement.querySelector('.projectile')).boxShadow};
      });
      assert.deepEqual(speed,{ribbon:true,filaments:true,parentFilter:'none',headFilter:'none',headShadow:'none'});
      const endpoints=await page.evaluate(async()=>{
        makePoses(0);const a=readPoses();makePoses(1);const b=readPoses();
        const V=await import('/js/ui/viewport.js');
        const r=V.screenEffectRect(document.getElementById(`sbire_${actors[actors.length/2].id}`).getBoundingClientRect());
        return {start:[a.physical.m41,a.physical.m42],end:[b.physical.m41,b.physical.m42],expected:[r.left+r.width/2,r.top+r.height/2]};
      });
      assert.deepEqual(endpoints.start,[210,190]);
      assert.ok(endpoints.end.every((v,i)=>Math.abs(v-endpoints.expected[i])<.01),'Arc ends at the actual target: '+JSON.stringify(endpoints));
      await page.evaluate(()=>{renderer.clearProjectileEffects(actors);clock.clearCombatClock()});
      assert.equal(await page.locator('.projectile-speed-trail,.projectile-magic-trail').count(),0,'All tails are removed at cleanup');
      const restarted=await page.evaluate(async()=>{
        let hits=0;const impact=new Promise(done=>clock.setTimeout(()=>done('hit'),350));
        const result=await renderer.animationProjectile(actors[0],actors[actors.length/2],()=>{hits++;return impact},
          {id:'restarted-flight',attacknature:['magicalDamage'],executionTime:350,impactPromise:impact});
        return {hits,result,remaining:document.querySelectorAll('.projectile-parent,.projectile-speed-trail,.projectile-magic-trail').length};
      });
      assert.deepEqual(restarted,{hits:1,result:'hit',remaining:0},'A new battle can launch and settle projectiles after the clock was cleared');
      assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
      reports.push({count,width,...initial,image:undefined});await context.close();
    }
    console.log(`PASS ${count}: curved endpoints, static magic bitmap, melee speed filaments, no physical blur, pause, fresh/resized/rotated mobile`);
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));
} finally {await fixture.close()}
