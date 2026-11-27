import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve(process.env.SHIELD_SWEEP_OUTPUT || 'outputs/shield-sweep');
const fixture = await createProjectileFixture(output);
try {
  const { page, context, errors, missing } = await fixture.open({ viewport: { width: 800, height: 700 } });
  await page.evaluate(async () => {
    const Aura = await import('/js/rendering/auras.js');
    const { entitesNestUp } = await import('/js/entities/runtime.js');
    const actor = { id: 998001, stats: { HP: { current:100 }, armor: { current:10 } }, sprite: entitesNestUp[0].sprite };
    const stage=document.createElement('div'); stage.id='shield-test';
    stage.style.cssText='position:fixed;left:20px;top:20px;width:550px;height:550px;background:#192331;z-index:2147483647';
    stage.innerHTML='<div id="DragSprite_998001" style="position:relative;width:300px;height:300px"><canvas id="spriteCanvas_998001" width="16" height="16"></canvas></div><div id="auraContainer_998001"></div>';
    document.body.append(stage);
    Aura.syncEntityAuras(actor);
    const original=document.querySelector('#DragSprite_998001 > .shield-sweep-layer');
    if(!original) throw Error('Production shield is missing');
    const duration=original.style.getPropertyValue('--shield-duration'),delay=original.style.getPropertyValue('--shield-delay');
    Aura.syncEntityAuras(actor);
    if(document.querySelectorAll('#DragSprite_998001 > .shield-sweep-layer').length!==1 || original.style.getPropertyValue('--shield-duration')!==duration || original.style.getPropertyValue('--shield-delay')!==delay) throw Error('Refresh restarts or duplicates shield');
    const reference=original.cloneNode(); reference.classList.add('shield-reference');
    const candidate=original.cloneNode(); candidate.classList.add('shield-candidate');
    for(const layer of [reference,candidate]) {
      layer.style.cssText=original.style.cssText+';position:absolute;left:20px;top:20px;width:300px;height:300px;--shield-duration:1000ms;--shield-delay:0ms';
      stage.append(layer);
    }
    const style=document.createElement('style');
    style.textContent='.shield-reference::after{animation-name:shieldSweepLegacy!important;transform:rotate(20deg)!important}@keyframes shieldSweepLegacy{0%{left:-100%}55%,100%{left:150%}}';
    document.head.append(style);
    // The real aura lifecycle must still remove the original at zero armor.
    actor.stats.armor.current=0; Aura.syncEntityAuras(actor);
    if(original.isConnected) throw Error('Depleted shield not removed');
    document.getElementById('DragSprite_998001').style.display='none';
    window.shieldPair={reference,candidate};
  });
  const rows=[];
  for(const width of [32,123.45,500]) for(const fraction of [0,.15,.25,.35,.55,.9]) {
    const state=await page.evaluate(({width,fraction})=>{
      const rows=[];
      for(const [kind,layer] of Object.entries(shieldPair)) {
        layer.style.width=width+'px'; layer.style.height=width+'px'; layer.style.visibility='visible';
        const animation=layer.getAnimations({subtree:true}).find(a=>/^shieldSweep/.test(a.animationName));
        animation.pause(); animation.currentTime=fraction*1000;
        const css=getComputedStyle(layer,'::after'), matrix=new DOMMatrix(css.transform);
        rows.push({kind,x:parseFloat(css.left)+matrix.e,y:parseFloat(css.top)+matrix.f,
          width:parseFloat(css.width),height:parseFloat(css.height),rotation:[matrix.a,matrix.b,matrix.c,matrix.d],
          background:css.backgroundImage,mask:getComputedStyle(layer).maskImage,progress:animation.effect.getComputedTiming().progress});
      }
      return rows;
    },{width,fraction});
    const [before,after]=state;
    assert.ok(Math.abs(before.x-after.x)<.1,`Horizontal position: ${width}/${fraction}`);
    assert.equal(before.y,after.y); assert.equal(before.width,after.width); assert.equal(before.height,after.height);
    assert.deepEqual(before.rotation,after.rotation); assert.equal(before.background,after.background); assert.equal(before.mask,after.mask);
    assert.equal(before.progress,after.progress);
    rows.push({width,fraction,maxPositionDifference:Math.abs(before.x-after.x)});
    if(width===123.45 && [.15,.25,.35].includes(fraction)) for(const kind of ['reference','candidate']) {
      await page.evaluate(kind=>{for(const [key,node] of Object.entries(shieldPair)) node.style.visibility=key===kind?'visible':'hidden';},kind);
      await page.screenshot({path:resolve(output,`shield-${fraction}-${kind}.png`),clip:{x:20,y:20,width:190,height:190}});
    }
  }
  // Count layout work, independently of wall-clock speed or other applications.
  const cdp=await context.newCDPSession(page); await cdp.send('Performance.enable');
  const layouts=[];
  for(const kind of ['reference','candidate']) {
    await page.evaluate(kind=>{
      for(const [key,layer] of Object.entries(shieldPair)) {
        layer.style.display=key===kind?'block':'none'; layer.style.visibility='visible';
        for(const animation of layer.getAnimations({subtree:true})) {animation.currentTime=0;animation.play();}
      }
    },kind);
    await page.waitForTimeout(200);
    const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    const frames=await page.evaluate(()=>new Promise(done=>{
      let frames=0; const start=performance.now();
      const tick=()=>{frames++;if(performance.now()-start>=1500)done(frames);else requestAnimationFrame(tick)};
      requestAnimationFrame(tick);
    }));
    const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    assert.ok(frames>=5,'Enough frames to exercise shield movement');
    layouts.push({kind,frames,count:after.LayoutCount-before.LayoutCount});
  }
  assert.ok(layouts[0].count>=5,'Legacy left animation triggers layout');
  assert.ok(layouts[1].count<=1,'Transform animation does not trigger repeated layout');
  assert.deepEqual(errors,[]); assert.deepEqual(missing,[]);
  await writeFile(resolve(output,'report.json'),JSON.stringify({rows,layouts,errors,missing},null,2));
  await context.close();
  console.log('PASS: 18 shield positions, identical gradient/masks/rotation/timing, stable refresh and armor depletion');
} finally {await fixture.close();}
