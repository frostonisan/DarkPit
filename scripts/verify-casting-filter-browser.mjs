import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('docs'), output = resolve(process.env.CASTING_OUTPUT || 'outputs/casting-filter');
const baseline = process.env.CASTING_BASELINE && resolve(process.env.CASTING_BASELINE);
let variant = 'current';
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.gif':'image/gif', '.jpg':'image/jpeg' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(variant === 'baseline' && /^\/(js|css)\//.test(path) ? resolve(baseline, '.' + path) : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const count of [10, 40, 80]) {
    const trials = {};
    for (variant of baseline ? ['baseline', 'current'] : ['current']) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 700 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        const timeout = setTimeout.bind(window), clear = clearTimeout.bind(window);
        const raf = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window);
        const date = Date.now, computed = getComputedStyle.bind(window);
        const probe = window.castProbe = { active:false, now:1000000, next:100000000, timers:new Map(), frames:new Map(), reads:0 };
        Date.now = () => probe.active ? probe.now : date();
        window.setTimeout = (fn, delay = 0, ...args) => {
          if (!probe.active) return timeout(fn, delay, ...args);
          const id = ++probe.next; probe.timers.set(id, { fn, at:probe.now + Math.max(0, Number(delay) || 0), args }); return id;
        };
        window.clearTimeout = id => probe.timers.delete(id) || clear(id);
        window.requestAnimationFrame = fn => {
          if (!probe.active) return raf(fn);
          const id = ++probe.next; probe.frames.set(id, fn); return id;
        };
        window.cancelAnimationFrame = id => probe.frames.delete(id) || cancel(id);
        window.getComputedStyle = (node, ...args) => {
          if (probe.active && node.matches?.('.cast')) probe.reads++;
          return computed(node, ...args);
        };
        probe.step = time => {
          probe.now = 1000000 + time;
          for (const [id, timer] of [...probe.timers]) if (timer.at <= probe.now) {
            probe.timers.delete(id); timer.fn(...timer.args);
          }
          const frames = [...probe.frames.values()]; probe.frames.clear();
          let index = 0;
          for (const fn of frames) {
            // Equal intervening HUD writes expose repeated synchronous flushes.
            document.querySelector('#casting-dirty').style.width = `${101 + index++ % 2}px`;
            fn(time);
          }
        };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#game-container').waitFor({ state:'attached' });
      const metadata = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
      const release = metadata.gameVersion || metadata.version;
      assert.equal(await page.locator('#game-version').textContent(), `The Dark Pit v${release}`);
      assert.equal(await page.locator('#game-version').isVisible(), true);
      await page.evaluate(async count => {
        window.Cast = await import('/js/rendering/animations.js'); window.Clock = await import('/js/combat/clock.js');
        Clock.clearCombatClock(); castProbe.active = true;
        document.getElementById('game-windows').style.display = 'none';
        const host = document.createElement('section'); host.id = 'casting-test';
        host.style.cssText = 'position:fixed;inset:0;background:#161922;z-index:2147483647';
        host.innerHTML = '<div id="casting-dirty" style="height:1px;width:100px"></div>';
        document.body.append(host);
        window.castActors = []; window.castAttacks = [];
        for (let i = 0; i < count; i++) {
          const entity = { id:998300+i, side:i%2?'B':'A', preparationProgressRatio:.9 };
          const kind = i % 8;
          const attack = { functionName:['physical','magic','hybrid','support','invocation','soin','resurrection','boulassefeu'][kind],
            attacknature:[kind===0?'physicalDamage':kind===2?'hybridalDamage':'magicalDamage'],
            combatFunction:kind===3||kind===5||kind===6?'Support':'Attaquant', attackRange:['ranged'], attackTarget:[kind===4?'hexa':'enemy'] };
          if (kind >= 5) attack.castingAsset = './media/assets/effects/magic-circle.png';
          const box = document.createElement('div'); box.className = 'entity-visual-calibrated';
          box.style.cssText = `position:absolute;left:${40+i%10*112}px;top:${50+Math.floor(i/10)*85}px;width:70px;height:70px;--popup-sprite-w:70px;--popup-sprite-h:70px`;
          box.innerHTML = `<div id="Cast_Animation_${entity.id}"></div><div id="DragSprite_${entity.id}" class="sprite iddle" style="transform:translateX(2px)"></div>`;
          host.append(box); Cast.animatePreparation(entity, attack);
          // Freeze media differences; this test compares filters, not GIF decoding.
          document.getElementById(`cast_${entity.id}`).src = '/media/assets/effects/magic-circle.png';
          castActors.push(entity); castAttacks.push(attack);
        }
        await Promise.all([...host.querySelectorAll('img')].map(img => img.decode()));
        window.sampleCasts = () => {
          for (const a of host.getAnimations({ subtree:true })) {
            a.pause(); a.currentTime = a.transitionProperty ? 500 : 300;
          }
          return castActors.map(entity => {
          const img = document.getElementById(`cast_${entity.id}`), sprite = document.getElementById(`DragSprite_${entity.id}`);
          for (const a of img.getAnimations()) { a.pause(); a.currentTime = a.transitionProperty ? 500 : 300; }
          const css = getComputedStyle(img), r = img.getBoundingClientRect();
          return { filter:css.filter, boxShadow:css.boxShadow, transform:css.transform, opacity:css.opacity, rect:[r.x,r.y,r.width,r.height],
            spriteTransform:sprite.style.transform, willChange:img.style.willChange };
          });
        };
        window.initialCastFilters = sampleCasts().map(x => x.filter);
        void host.offsetWidth; castProbe.reads = 0;
      }, count);
      const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
      const before = await metrics();
      const reads = await page.evaluate(() => { castProbe.step(0); return castProbe.reads; });
      const after = await metrics();
      assert.equal(reads, variant === 'baseline' ? count : 0, 'Production phase starts must avoid computed-style reads');
      const samples = [];
      for (const time of [100, 500, 900, 1000, 1351]) {
        const values = await page.evaluate(time => { castProbe.step(time); return sampleCasts(); }, time);
        if (time < 1000) for (const [i, sample] of values.entries()) {
          assert.ok(sample.filter.endsWith(`brightness(${1+time/1000})`), `Brightness at ${time}/${i}: ${sample.filter}`);
        }
        samples.push({ time, values });
        if (count === 10 && [500,1351].includes(time)) {
          // Recreate compositor layers at the already-frozen pose so cached
          // flame raster scales do not depend on earlier wall-clock frames.
          await page.evaluate(() => {
            const host = document.getElementById('casting-test');
            host.style.visibility = 'hidden'; void host.offsetWidth;
          });
          await page.evaluate(() => { castProbe.active = false; });
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
          await page.evaluate(() => { document.getElementById('casting-test').style.visibility = ''; });
          await page.screenshot({ path:resolve(output, `${variant}-${time}.png`) });
          await page.evaluate(() => { castProbe.active = true; });
        }
      }
      const lifecycle = await page.evaluate(() => {
        const initial = sampleCasts();
        if (!initial.every((v,i) => v.filter === initialCastFilters[i] && v.willChange === '')) throw Error('Final phase must restore the base filter and layer hints');
        for (const entity of castActors) entity.stopPreparationAnimation();
        const entity = castActors[0], attack = castAttacks[0];
        entity.preparationProgressRatio = .9; Cast.animatePreparation(entity, attack); castProbe.step(1400); castProbe.step(1650);
        const saved = JSON.parse(JSON.stringify(entity._preparationVisual));
        const originalFilter = getComputedStyle(document.getElementById(`cast_${entity.id}`)).filter;
        entity.stopPreparationAnimation(); entity._preparationVisual = saved;
        Cast.animatePreparation(entity, attack); castProbe.step(1650);
        const restoredFilter = getComputedStyle(document.getElementById(`cast_${entity.id}`)).filter;
        if (restoredFilter !== originalFilter) throw Error(`Restored phase: ${originalFilter} / ${restoredFilter}`);
        entity.stopPreparationAnimation();
        const custom = document.createElement('img'); custom.className = 'cast'; custom.style.filter = 'sepia(.4) saturate(2)';
        document.querySelector('#casting-test').append(custom); castProbe.reads = 0;
        Cast.animateFinalPhase(custom); const customReads = castProbe.reads; castProbe.step(1900);
        const customFilter = getComputedStyle(custom).filter;
        if (customReads !== 1 || !customFilter.includes('sepia(0.4) saturate(2) brightness(1.25)')) throw Error('Custom filter fallback changed');
        Clock.clearCombatClock(); return { restoredFilter, customFilter, customReads, remainingPreparations:document.querySelectorAll('#casting-test .cast-preparation-container').length };
      });
      assert.equal(lifecycle.remainingPreparations, 0); assert.deepEqual(errors, []);
      trials[variant] = { reads, styleCount:after.RecalcStyleCount-before.RecalcStyleCount,
        layoutCount:after.LayoutCount-before.LayoutCount, samples, lifecycle, errors };
      await context.close();
    }
    if (baseline) {
      assert.deepEqual(trials.current.samples, trials.baseline.samples, `Visual filter/pose parity at ${count}`);
      assert.deepEqual(trials.current.lifecycle, trials.baseline.lifecycle, `Saved/custom casting parity at ${count}`);
    }
    results.push({ count, trials }); await writeFile(resolve(output,'report.json'), JSON.stringify(results,null,2));
    console.log('PASS casting', count, 'reads', JSON.stringify(Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,{reads:v.reads,styles:v.styleCount,layouts:v.layoutCount}]))), 'filters, brightness, transforms, cleanup, saved state and custom filter');
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
