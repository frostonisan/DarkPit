import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.HUD_GEOMETRY_OUTPUT || 'outputs/projectile-hud-geometry');
const baseline = process.env.HUD_GEOMETRY_BASELINE;
const root = resolve('docs');
const server = createServer(async (req, res) => {
  if (req.url === '/') return res.end('<!doctype html><title>HUD and target geometry</title>');
  const file = req.url === '/before.js' && baseline ? resolve(baseline, 'js/rendering/projectileGeometry.js')
    : req.url === '/after.js' ? resolve(root, 'js/rendering/projectileGeometry.js') : null;
  if (!file) return res.writeHead(404).end();
  try { res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await fs.mkdir(output, { recursive: true });
let browser;
const reports = [];
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (const total of [10, 40, 80]) for (const variant of baseline ? ['before', 'after'] : ['after']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async ({ total, variant }) => {
      window.geometry = await import(`/${variant}.js`);
      document.body.innerHTML = `<style>
        #hexGrid {position:absolute;left:10px;top:20px;width:1100px;height:600px}
        .hex {position:absolute;width:80px;height:80px}
        .entite-box {position:absolute;width:100%;height:100%}
        .drag-box {display:flex;justify-content:center;transform:rotateX(-50deg)}
        .entitesContainer {width:30px;height:60px;transform:scale(.85)}
        .animation-sprite, .effects-container {position:absolute;width:25px;height:25px}
        .hud-ingame {position:absolute;top:65px;width:90px;height:25px;contain:layout style}
        .attack-bar-container {width:90px;height:15px;position:relative;contain:layout style}
        .fill {position:absolute;background:red;height:15px;width:100%}
        #game-screen-effects {position:absolute;inset:0;pointer-events:none}
      </style><div id="game-shell"><div id="hexGrid"></div><div id="game-screen-effects"></div></div>`;
      window.targets = []; window.bars = []; window.labels = []; window.sprites = []; window.effects = []; window.overlays = []; window.releases = [];
      window.reads = 0; window.natives = [];
      for (let i = 0; i < total; i++) {
        const hex = document.createElement('div'); hex.className = 'hex';
        hex.style.cssText = `left:${i % 10 * 100}px;top:${Math.floor(i / 10) * 65}px`;
        hex.innerHTML = `<div class="entite-box entity-visual-calibrated"><div class="hud-ingame"><div class="attack-bar-container"><div class="fill"></div><span>9.9s</span></div></div><div class="drag-box"><div class="entitesContainer" id="sbire_${i}"><div class="animation-sprite"><div class="sprite"></div></div><div class="effects-container"></div></div></div></div>`;
        document.getElementById('hexGrid').append(hex);
        const target = hex.querySelector('.entitesContainer'); targets.push(target);
        bars.push(hex.querySelector('.fill')); labels.push(hex.querySelector('span'));
        sprites.push(hex.querySelector('.sprite')); effects.push(hex.querySelector('.effects-container'));
        const native = target.getBoundingClientRect.bind(target); natives.push(native);
        target.getBoundingClientRect = () => { reads++; return native(); };
        const overlay = document.createElement('div'); overlay.style.cssText = 'position:absolute;width:4px;height:4px';
        document.getElementById('game-screen-effects').append(overlay); overlays.push(overlay);
        releases.push(geometry.trackProjectileGeometry(overlay, () => targets[i]));
      }
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    }, { total, variant });
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = await metrics();
    const sample = await page.evaluate(async total => {
      const coordinates = [];
      for (let f = 0; f < 8; f++) {
        await new Promise(requestAnimationFrame);
        const screenFx = document.createElement('div');
        screenFx.textContent = String(f); document.getElementById('game-screen-effects').append(screenFx);
        screenFx.remove();
        for (let i = 0; i < total; i++) {
          labels[i].firstChild.data = `${9 - f}.9s`; bars[i].style.width = `${100 - f * 9}%`;
          sprites[i].style.transform = `translateX(${f}px)`;
          effects[i].innerHTML = `<span>${f}</span>`;
        }
        const frame = [];
        for (let i = 0; i < total; i++) {
          const r = geometry.readProjectileTargetRect(targets[i], f);
          frame.push([r.x, r.y, r.width, r.height]);
          geometry.setProjectileTransform(overlays[i], `translate(${f * 10 + i}px,3px)`);
        }
        coordinates.push(frame);
      }
      return { coordinates, reads };
    }, total);
    const after = await metrics();
    assert.equal(sample.reads, total * (variant === 'before' ? 8 : 1), 'HUD updates do not reread unchanged board anchors');
    const behavior = await page.evaluate(async ({ optimized }) => {
      const check = (value, why) => { if (!value) throw Error(why); };
      let stamp = 100;
      const read = () => geometry.readProjectileTargetRect(targets[0], ++stamp);
      const exact = why => {
        const cached = read(), native = natives[0]();
        for (const key of ['x', 'y', 'width', 'height']) check(Math.abs(cached[key] - native[key]) < .001, `${why}: ${key}`);
      };
      exact('Unchanged native coordinates');
      const target = targets[0], ancestor = target.parentElement;
      target.style.width = '37px'; exact('Synchronous target resize');
      ancestor.style.transform = 'translateX(12px)'; exact('Synchronous ancestor transform');
      const hud = labels[0].closest('.hud-ingame');
      const cached = read(), prior = reads;
      labels[0].className = 'changed'; labels[0].textContent = '10.0s';
      bars[0].style.width = '22%';
      const badge = document.createElement('b'); badge.textContent = '+'; hud.append(badge);
      await Promise.resolve();
      if (optimized) check(read() === cached && reads === prior, 'Text, class, width and badges preserve target geometry');
      exact('HUD changes preserve native coordinates');
      const beforeLoad = read(); effects[0].firstChild.dispatchEvent(new Event('load'));
      if (optimized) check(read() === beforeLoad, 'An effect image load does not discard target geometry');
      const unaffected = read(); targets[1].style.width = '77px';
      if (optimized) check(read() === unaffected, 'A neighbouring entity refresh does not discard this target');
      const other = geometry.readProjectileTargetRect(targets[1], ++stamp);
      check(other.width === natives[1]().width, 'Neighbour still gets its fresh geometry');
      const priorFresh = read(); geometry.readProjectileTargetRect(targets[1]);
      if (optimized) check(read() === priorFresh, 'Fresh launch reads do not discard another target');
      // Removing an out-of-flow boundary changes the contract: descendants
      // must once again participate in layout invalidation.
      target.style.height = 'auto'; effects[0].style.position = 'relative';
      effects[0].style.height = 'auto'; effects[0].innerHTML = '<div style="height:24px"></div>';
      exact('Boundary now participates in layout');
      effects[0].firstChild.style.height = '58px'; exact('Changed in-flow contents');
      effects[0].style.position = 'absolute'; target.style.height = '60px';
      ancestor.style.transition = 'transform 180ms linear'; ancestor.style.transform = 'translateX(64px)';
      const movement = [];
      for (let f = 0; f < 18; f++) {
        await new Promise(requestAnimationFrame); exact('CSS transition, including final frame'); movement.push(natives[0]().x);
      }
      check(new Set(movement).size > 2, 'The test actually observes a moving ancestor');
      ancestor.style.transition = ''; ancestor.style.transform = '';
      // Board placement starts WAAPI motion together with a DOM move/smoke node.
      const motion = ancestor.animate([{transform:'translateX(0)'},{transform:'translateX(50px)'}], {duration:220,fill:'forwards'});
      ancestor.dataset.placement = 'moved';
      for (let f = 0; f < 18; f++) { await new Promise(requestAnimationFrame); exact('Animated placement'); }
      motion.cancel(); ancestor.removeAttribute('data-placement'); exact('Cancelled placement');
      const nextHex = document.createElement('div'); nextHex.className = 'hex'; nextHex.style.left = '500px';
      document.getElementById('hexGrid').append(nextHex); nextHex.append(target.closest('.entite-box')); exact('Reparented target');
      const replacement = target.cloneNode(); target.replaceWith(replacement); targets[0] = replacement;
      natives[0] = replacement.getBoundingClientRect.bind(replacement); exact('Replacement target');
      geometry.readProjectileTargetRect(targets[0]); exact('Fresh launch/impact read');
      const old = read(); window.dispatchEvent(new Event('resize')); check(read() !== old, 'Resize invalidates');
      const oldScroll = read(); window.dispatchEvent(new Event('scroll')); check(read() !== oldScroll, 'Scroll invalidates');
      const style = document.createElement('style'); style.textContent = '.entitesContainer {width:42px!important}';
      document.head.append(style); exact('Changed stylesheet'); style.remove();
      targets[0].remove(); check(read().width === 0, 'Detached target');
      for (const release of releases) release(); geometry.clearProjectileGeometry();
      return { movement: true, hud: true, replacement: true, resize: true, scroll: true, stylesheet: true, detached: true };
    }, { optimized: variant === 'after' });
    assert.deepEqual(errors, []);
    reports.push({ total, variant, ...sample, behavior,
      styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
      layouts: after.LayoutCount - before.LayoutCount });
    console.log('PASS', total, variant, sample.reads, 'target reads');
    await context.close();
  }
  if (baseline) for (const total of [10, 40, 80]) {
    const before = reports.find(r => r.total === total && r.variant === 'before');
    const after = reports.find(r => r.total === total && r.variant === 'after');
    assert.deepEqual(after.coordinates, before.coordinates); assert.deepEqual(after.behavior, before.behavior);
    assert.ok(after.reads < before.reads);
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
