import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('docs');
const output = resolve(process.env.AURA_OUTPUT || 'outputs/life-aura-composition');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = {};
try {
  const safari = process.env.AURA_ENGINE === 'webkit';
  browser = await (safari ? webkit : chromium).launch({ headless: true, ...(safari ? {} : { channel: 'chrome' }) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#game-container').waitFor({ state: 'attached' });
  await page.evaluate(async () => {
    window.Aura = await import('/js/rendering/auras.js');
    const { loadResource } = await import('/js/data/loaderList.js');
    await Promise.all(['eternallife','extralife','fadedlife'].map(name=>loadResource(`./media/assets/effects/picto-aura-${name}.svg`)));
    const host = document.createElement('main'); host.id = 'aura-composition-test';
    host.style.cssText = 'position:fixed;inset:0;background:#171717;z-index:2147483647;';
    document.body.append(host);
    window.testActors = [];
    for (const [i, scale] of [1, .7, 1.4].entries()) {
      const size = document.createElement('div'); size.className = 'entity-size-layer';
      size.style.cssText = `position:absolute;left:${170+i*370}px;top:300px;transform:scale(${scale})${i===1?' scaleX(-1)':''};transform-origin:center;`;
      const frame = document.createElement('div'); frame.className = 'entity-visual-frame';
      frame.style.cssText = 'position:relative;width:160px;height:150px;--popup-sprite-w:160px;--popup-sprite-h:150px;';
      frame.dataset.spriteWidth = 160; frame.dataset.spriteHeight = 150;
      const container = document.createElement('div'); container.className = 'aura-container';
      const actor = { id: 992410+i, stats: { HP: {current:100}, fadedLife: 1, extraLife: 1, eternalLife: 1 } };
      container.id = `auraContainer_${actor.id}`;
      frame.append(container); size.append(frame); host.append(size); testActors.push(actor);
      Aura.syncEntityAuras(actor, container, { lifeOnly: true });
    }
    await Promise.all([...host.querySelectorAll('img')].map(img => img.decode()));
    window.sampleHalos = (composed, time) => {
      for (const motion of host.querySelectorAll('.life-aura-anim')) motion.classList.toggle('life-aura-composed', composed);
      for (const animation of host.getAnimations({subtree:true})) { animation.pause(); animation.currentTime = time; }
      return [...host.querySelectorAll('.life-aura-img')].map(img => {
        const motion = img.parentElement, style = getComputedStyle(motion), rect = img.getBoundingClientRect();
        return { rect: [rect.x,rect.y,rect.width,rect.height], filter: style.filter, opacity: style.opacity,
          animations: [...motion.getAnimations(), ...img.getAnimations()].map(a => ({ name: a.animationName, duration:a.effect.getTiming().duration, direction:a.effect.getTiming().direction })).sort((a,b)=>a.name.localeCompare(b.name)),
          childAnimations:img.getAnimations().length };
      });
    };
  });
  assert.equal(await page.evaluate(() => CSS.supports('animation-composition','add')), true);
  if (!safari) {
    const cdp = await page.context().newCDPSession(page);
    let layers = [];
    cdp.on('LayerTree.layerTreeDidChange', data => { layers = data.layers || []; });
    await cdp.send('LayerTree.enable');
    report.layers = {};
    for (const composed of [false,true]) {
      await page.evaluate(composed => {
        sampleHalos(composed,0);
        for (const animation of document.getElementById('aura-composition-test').getAnimations({subtree:true})) animation.play();
      },composed);
      await page.waitForTimeout(350);
      report.layers[composed?'after':'before'] = {total:layers.length, drawing:layers.filter(l=>l.drawsContent).length};
    }
    await cdp.detach();
  }
  const samples = [];
  for (const time of [0, 99, 175, 315, 490, 630, 875, 950, 1750, 1900, 3200, 4300, 6200]) {
    const before = await page.evaluate(t => sampleHalos(false,t), time);
    if ([0,875,3200].includes(time)) await page.screenshot({path:resolve(output,`before-${time}.png`)});
    const after = await page.evaluate(t => sampleHalos(true,t), time);
    if ([0,875,3200].includes(time)) await page.screenshot({path:resolve(output,`after-${time}.png`)});
    for (let i=0; i<before.length; i++) {
      assert.deepEqual(after[i].animations, before[i].animations, `Timings/directions at ${time}, halo ${i}`);
      assert.equal(after[i].filter,before[i].filter,`Filter at ${time}, halo ${i}`);
      assert.equal(after[i].opacity,before[i].opacity,`Opacity at ${time}, halo ${i}`);
      assert.equal(after[i].childAnimations,0,'No nested animated image');
      assert.ok(after[i].rect.every((n,j)=>Math.abs(n-before[i].rect[j])<.04), `Geometry at ${time}, halo ${i}: ${JSON.stringify({before:before[i],after:after[i]})}`);
    }
    samples.push({time,before,after});
  }
  report.samples = samples;
  report.lifecycle = await page.evaluate(() => {
    sampleHalos(true,1234);
    const host = document.getElementById('aura-composition-test'), original = [...host.querySelectorAll('img')];
    const animations = host.getAnimations({subtree:true});
    const observer = new MutationObserver(()=>{});
    observer.observe(host,{subtree:true,childList:true,attributes:true});
    for (const actor of testActors) for(let i=0;i<20;i++) Aura.syncEntityAuras(structuredClone(actor), 'battle', {lifeOnly:true});
    const refreshMutations = observer.takeRecords().length; observer.disconnect();
    const sameImages = original.every((img,i)=>img===host.querySelectorAll('img')[i]);
    const sameAnimations = animations.every(animation=>animation.currentTime===1234 && host.getAnimations({subtree:true}).includes(animation));
    const actor = testActors[0]; actor.stats.extraLife=0;
    Aura.syncEntityAuras(actor,'battle',{lifeOnly:true});
    const container = document.getElementById(`auraContainer_${actor.id}`);
    const removed = container.querySelectorAll('.life-aura-img--extraLife').length===0;
    const survivors = container.getAnimations({subtree:true});
    actor.stats.extraLife=1; Aura.syncEntityAuras(actor,'battle',{lifeOnly:true});
    const rebuilt = container.querySelectorAll('.life-aura-img--extraLife').length===1;
    const continuous = survivors.every(a=>a.currentTime===1234 && container.getAnimations({subtree:true}).includes(a));
    for (const e of testActors) Aura.cleanupEntityAuras(e);
    return {sameImages,sameAnimations,refreshMutations,removed,rebuilt,continuous,remaining:host.querySelectorAll('.life-sup').length};
  });
  assert.deepEqual(report.lifecycle,{sameImages:true,sameAnimations:true,refreshMutations:0,removed:true,rebuilt:true,continuous:true,remaining:0});
  assert.deepEqual(errors,[]);
  console.log('PASS: three halo types, 13 phases, 3 scales, mirroring, exact filters/timings, refresh and life consumption');
} finally {
  await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
  await browser?.close(); await new Promise(done=>server.close(done));
}
