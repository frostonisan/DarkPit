import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.POSITION_EVENTS_OUTPUT || 'outputs/target-position-events');
const baseline = process.env.POSITION_EVENTS_BASELINE;
const server = createServer(async (req, res) => {
  if (req.url === '/') return res.end('<!doctype html><title>Target position events</title>');
  const path = req.url === '/before.js' && baseline ? resolve(baseline, 'js/rendering/projectileGeometry.js')
    : req.url === '/after.js' ? resolve('docs/js/rendering/projectileGeometry.js') : null;
  if (!path) return res.writeHead(404).end();
  res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(path));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await fs.mkdir(output, { recursive: true });
const reports = [];
let browser;
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (const total of [10, 40, 80]) for (const variant of baseline ? ['before', 'after'] : ['after']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const report = await page.evaluate(async ({ total, variant }) => {
      let mutations = 0;
      const NativeObserver = window.MutationObserver;
      window.MutationObserver = class extends NativeObserver {
        constructor(callback) { super((records, observer) => { mutations += records.length; callback(records, observer); }); }
        takeRecords() { const records = super.takeRecords(); mutations += records.length; return records; }
      };
      const geometry = await import(`/${variant}.js`);
      const check = (condition, message) => { if (!condition) throw Error(message); };
      document.body.innerHTML = `<style>
        #hexGrid {position:absolute;left:12px;top:20px;width:1100px;height:800px}
        .hex {position:absolute;width:80px;height:80px}
        .entite-box {position:absolute;width:100%;height:100%}
        .drag-box {display:flex;justify-content:center;transform:rotateX(-50deg)}
        .entitesContainer {width:30px;height:60px;transform:scale(.85)}
        .animation-sprite,.effects-container,.hud-ingame {position:absolute}
        #game-screen-effects {position:absolute;inset:0}
      </style><div id="game-shell"><div id="hexGrid"></div><div id="game-screen-effects"></div></div>`;
      const targets = [], natives = [], counters = [], sprites = [], effects = [], overlays = [], releases = [];
      const reads = Array(total).fill(0);
      for (let i = 0; i < total; i++) {
        const hex = document.createElement('div'); hex.className = 'hex';
        hex.style.cssText = `left:${i % 10 * 100}px;top:${Math.floor(i / 10) * 90}px`;
        hex.innerHTML = '<div class="entite-box entity-visual-calibrated"><div class="hud-ingame"><span>100</span></div><div class="drag-box"><div class="entitesContainer"><div class="animation-sprite"><div></div></div><div class="effects-container"></div></div></div></div>';
        document.getElementById('hexGrid').append(hex);
        const target = hex.querySelector('.entitesContainer'); targets.push(target);
        natives.push(target.getBoundingClientRect.bind(target));
        target.getBoundingClientRect = () => { reads[i]++; return natives[i](); };
        counters.push(hex.querySelector('span')); sprites.push(hex.querySelector('.animation-sprite > div'));
        effects.push(hex.querySelector('.effects-container'));
        // Several consumers share the same target; one moving entity must not
        // cause one native layout read per projectile.
        for (let j = 0; j < 3; j++) {
          const overlay = document.createElement('div'); overlay.style.position = 'absolute';
          document.getElementById('game-screen-effects').append(overlay); overlays.push(overlay);
          releases.push(geometry.trackProjectileGeometry(overlay, () => target));
        }
      }
      let stamp = 0;
      const sample = () => {
        const result = [];
        for (let i = 0; i < total; i++) {
          let first;
          for (let j = 0; j < 3; j++) {
            const rect = geometry.readProjectileTargetRect(targets[i], stamp);
            if (first) check(first === rect, 'Consumers share the same position in a frame');
            first = rect;
            geometry.setProjectileTransform(overlays[i * 3 + j], `translate(${stamp + j}px,2px)`);
          }
          const actual = natives[i]();
          for (const key of ['x', 'y', 'width', 'height']) check(Math.abs(first[key] - actual[key]) < .001, `Native position differs: ${i} ${key}`);
          result.push([first.x, first.y, first.width, first.height]);
        }
        return result;
      };
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      sample(); mutations = 0; reads.fill(0);
      const stationary = [];
      for (let frame = 0; frame < 8; frame++) {
        await new Promise(requestAnimationFrame); stamp++;
        for (let i = 0; i < total; i++) {
          counters[i].firstChild.data = String(100 - frame);
          sprites[i].style.transform = `translateX(${frame}px)`;
          effects[i].innerHTML = `<span>${frame}</span>`;
        }
        stationary.push(sample());
      }
      const hud = { mutations, reads: [...reads] };
      check(reads.every(n => n === 0), `${variant}: stationary targets do not need new rectangle reads (${reads})`);
      if (variant === 'after') check(mutations === 0, 'HUD and effect descendants produce no positioning observer records');

      const beforeLaunchReads = reads[0];
      for (let launch = 0; launch < 6; launch++) geometry.readProjectileTargetRect(targets[0]);
      const launchReads = reads[0] - beforeLaunchReads;
      if (variant === 'after') check(launchReads === 0, 'New launches reuse an observed stationary target');
      reads.fill(0);

      let gameplayEvents = 0;
      window.addEventListener('entityCombatInteraction', () => gameplayEvents++);
      const owner = targets[0].closest('.entite-box');
      // WAAPI can move a target without any DOM mutation. The movement owner
      // explicitly announces it, separately from gameplay movement events.
      const animation = owner.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(60px)' }],
        { duration: 420, easing: 'cubic-bezier(.22,.65,.3,1)', fill: 'both' });
      animation.pause();
      if (geometry.notifyTargetGeometryChanged) geometry.notifyTargetGeometryChanged(owner);
      else geometry.invalidateProjectileGeometry();
      const moving = [];
      for (const time of [0, 50, 120, 240, 350]) {
        animation.currentTime = time; stamp++;
        moving.push(sample());
      }
      check(new Set(moving.map(frame => frame[0][0])).size === 5, 'The test actually follows intermediate positions');
      if (variant === 'after') {
        check(reads[0] === 5, 'One read per moving target and frame');
        check(reads.slice(1).every(n => n === 0), 'A moving entity does not reread stationary neighbours');
      }
      animation.finish(); stamp++; sample();
      const stoppedReads = reads[0];
      for (let frame = 0; frame < 4; frame++) { stamp++; sample(); }
      if (variant === 'after') check(reads[0] === stoppedReads, 'Filled finished animations stop position sampling');
      animation.cancel();
      if (geometry.notifyTargetGeometryChanged) geometry.notifyTargetGeometryChanged(owner);
      else geometry.invalidateProjectileGeometry();
      stamp++; sample();
      check(gameplayEvents === 0, 'Visual position changes never replay combat movement effects');
      // Physical and homing projectiles can track a cell and its occupant at
      // the same time. Registering the cell must preserve the occupant's watch.
      const cell = owner.closest('.hex'), extra = document.createElement('div');
      document.getElementById('game-screen-effects').append(extra);
      const releaseCell = geometry.trackProjectileGeometry(extra, () => cell);
      geometry.readProjectileTargetRect(cell, ++stamp);
      const spacer = document.createElement('div'); spacer.style.cssText = 'position:relative;height:20px';
      owner.insertBefore(spacer, owner.querySelector('.drag-box'));
      stamp++; sample();
      spacer.remove(); releaseCell(); extra.remove(); stamp++; sample();

      // A GIF loading in an untargeted, isolated cell must not announce a
      // displacement of every other entity.
      const other = document.createElement('div'); other.className = 'hex';
      other.innerHTML = '<div class="entite-box entity-visual-calibrated"><div class="effects-container"><img></div></div>';
      document.getElementById('hexGrid').append(other); stamp++; sample();
      const beforeLoad = [...reads];
      other.querySelector('img').dispatchEvent(new Event('load'));
      stamp++; sample();
      if (variant === 'after') check(reads.every((n, i) => n === beforeLoad[i]), 'Unrelated effect loads preserve stationary positions');
      other.remove();
      for (const release of releases) release();
      const stoppedMutations = mutations;
      targets[0].style.width = '42px'; await Promise.resolve();
      check(mutations === stoppedMutations, 'Last flight releases its observers');
      return { total, variant, hud, stationary, moving, gameplayEvents, launchReads, reads };
    }, { total, variant });
    assert.deepEqual(errors, []); reports.push(report);
    await context.close();
    console.log('PASS', total, variant, 'HUD observer records:', report.hud.mutations);
  }
  if (baseline) for (const total of [10, 40, 80]) {
    const before = reports.find(row => row.total === total && row.variant === 'before');
    const after = reports.find(row => row.total === total && row.variant === 'after');
    assert.deepEqual(before.stationary, after.stationary);
    assert.deepEqual(before.moving, after.moving);
    assert.ok(after.hud.mutations < before.hud.mutations);
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
