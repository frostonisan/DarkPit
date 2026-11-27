import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/impact-aura-fix');
const baseline = process.env.IMPACT_BASELINE && resolve(process.env.IMPACT_BASELINE);
let before = false;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  if (before && ["/js/rendering/animations.js", "/js/rendering/auras.js"].includes(pathname)) file = resolve(baseline, '.' + pathname);
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir(output, { recursive: true });
let browser;
const results = {};
async function fixture() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    window.An = await import("/js/rendering/animations.js"); window.Aura = await import("/js/rendering/auras.js");
    window.Clock = await import("/js/combat/clock.js");
    window.sleep = ms => new Promise(done => setTimeout(done, ms));
    window.actors = [{ id: 993900, side: 'A' }, { id: 993901, side: 'B' }].map(entity => ({ ...entity, stats: { HP: { current: 1000 }, hpBattleRegen: 150 } }));
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;background:#111'; document.body.append(host);
    host.innerHTML = actors.map((e, i) => `<div id="Box_Entite_${e.id}" style="position:absolute;left:${150 + i * 440}px;top:150px"><div id="spriteContainer_${e.id}" class="sprite-container ${e.side}" style="position:relative;width:100px;height:100px;top:7px;transform:translate(4px, 6px) ${i ? 'scaleX(-1)' : ''};transition:none"><div id="Animationsprite_${e.id}"><div id="DragSprite_${e.id}"><canvas id="spriteCanvas_${e.id}" width="100" height="100"></canvas></div><div id="auraContainer_${e.id}" class="aura-container" style="inset:0;width:100px;height:100px"></div></div></div><div id="effectsContainer_${e.id}" class="effects-container"></div></div>`).join('');
    for (const canvas of host.querySelectorAll('canvas')) { const ctx = canvas.getContext('2d'); ctx.fillStyle = '#77aacc'; ctx.fillRect(0, 0, 100, 100); }
    window.pose = e => { const s = document.getElementById(`spriteContainer_${e.id}`); return { transform: s.style.transform, top: s.style.top, transition: s.style.transition, willChange: s.style.willChange }; };
    window.runs = () => Clock.captureCombatState()['canvas-visuals'].runs;
    window.rest = actors.map(pose);
  });
  return page;
}
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const version of baseline ? ['before', 'after'] : ['after']) {
    before = version === 'before';
    const page = await fixture(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const impacts = await page.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        for (const e of actors) {
          if (i % 7 === 0) An.brokenMagicImpact(e.id);
          An.shakeImpact(e.id);
          An.damageImpact(e.id, { randomBloodImpact: false, className: 'blood-impact fx-1', src: './media/assets/effects/blood-impact-1.gif' });
        }
        await sleep(5);
      }
      const active = runs().reduce((out, run) => { out[run.name] = (out[run.name] || 0) + 1; return out; }, {});
      const blood = document.querySelectorAll('img.blood-impact').length;
      await sleep(1100);
      return { rest, end: actors.map(pose), active, blood, remaining: runs().length,
        colors: actors.map(e => [...document.getElementById(`spriteCanvas_${e.id}`).getContext('2d').getImageData(50, 50, 1, 1).data]) };
    });
    const auras = await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) for (const e of actors) Aura.syncEntityAuras({ ...e, stats: structuredClone(e.stats) });
      const count = () => actors.map(e => document.getElementById(`auraContainer_${e.id}`).querySelectorAll('.battleHpRegen-aura-fx').length);
      const initial = count(); await sleep(1100); const later = count();
      for (const e of actors) Aura.cleanupEntityAuras(e);
      await sleep(650); const cleaned = count();
      // Opening a rebuilt view immediately reuses the entity's single emitter.
      const e = actors[0]; Aura.syncEntityAuras(e);
      const old = document.getElementById(`auraContainer_${e.id}`), fresh = old.cloneNode(false); old.replaceWith(fresh);
      Aura.syncEntityAuras({ ...e });
      const rebuilt = fresh.querySelectorAll('.battleHpRegen-aura-fx').length;
      Aura.syncEntityAuras({ ...e, stats: { HP: { current: 1000 }, hpBattleRegen: 0 } });
      await sleep(650); const disabled = count()[0];
      Aura.cleanupEntityAuras(e);
      Aura.syncEntityAuras(e); window.dispatchEvent(new Event('battleStopped')); Clock.clearCombatClock();
      Aura.syncEntityAuras(e); const restarted = count()[0]; Aura.cleanupEntityAuras(e);
      return { initial, later, cleaned, rebuilt, disabled, restarted };
    });
    const coverage = await page.evaluate(async () => {
      const e = actors[0], codex = document.createElement('div'); codex.className = 'codex-scan-image-container';
      codex.style.cssText = 'position:absolute;left:300px;top:350px;width:330px;height:240px;display:block;transform:scale(1.4);transform-origin:top left';
      codex.innerHTML = `<div id="auraContainer_codex_${e.id}" class="aura-container codex" style="inset:0"></div><img class="codex-scan-image" style="position:absolute;left:65px;top:30px;width:200px;height:180px;max-width:none;max-height:none" src="./media/sprites/mouche-asticoteuse.png">`;
      document.body.append(codex); await codex.querySelector('img').decode();
      const container = codex.querySelector('.aura-container'), samples = [], quadrants = new Set();
      await (await import('/js/data/loaderList.js')).loadResource('./media/assets/effects/hp-battle-regen.gif');
      let seed = 321; const random = Math.random;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      try {
        for (let i = 0; i < 40; i++) {
          Aura.syncEntityAuras(e, container);
          const fx = container.querySelector('.battleHpRegen-aura-fx');
          await fx.decode();
          const x = parseFloat(fx.style.left), y = parseFloat(fx.style.top), w = parseFloat(fx.style.width);
          const h = fx.getBoundingClientRect().height / 1.4;
          samples.push({ x, y, w, h }); quadrants.add(`${x < 165 ? 0 : 1},${y < 120 ? 0 : 1}`);
          Aura.cleanupEntityAuras(e);
        }
      } finally { Math.random = random; }
      codex.remove();
      return { samples, quadrants: [...quadrants], inside: samples.every(({x,y,w,h}) => x >= 64.9 && y >= 29.9 && x+w <= 265.1 && y+h <= 210.1) };
    });
    results[version] = { impacts, auras, coverage, errors };
    if (version === 'after') {
      assert.deepEqual(impacts.end, impacts.rest, 'Physical and broken-magic bursts restore the initial pose exactly on both sides');
      assert.equal(impacts.remaining, 0); assert.equal(impacts.blood, 2, 'One reusable blood GIF per target/variant');
      for (const name of ['damageImpact', 'shakeImpact', 'brokenMagicImpact']) assert.ok(impacts.active[name] <= 2, 'One active ' + name + ' per target');
      assert.deepEqual(impacts.colors, [[119,170,204,255],[119,170,204,255]], 'Tints fully release after the burst');
      assert.deepEqual(auras.initial, [1,1], '50 object refreshes per entity do not duplicate aura emitters');
      assert.ok(auras.later.every(count => count >= 2 && count <= 4), 'Aura cadence remains normal');
      assert.deepEqual(auras.cleaned, [0,0], 'Cleanup prevents old copies from emitting again');
      assert.equal(auras.rebuilt, 1); assert.equal(auras.disabled, 0);
      assert.equal(auras.restarted, 1, 'Stopping and restarting creates one fresh emitter');
      assert.ok(coverage.inside, 'Codex emissions use local sprite bounds even with a scaled view');
      assert.equal(coverage.quadrants.length, 4, 'Crosses cover all four parts of the sprite');
      assert.deepEqual(errors, []);
      // Restore on a fresh page, as F5 would, with the DOM still in the hit pose.
      const saved = await page.evaluate(async () => {
        An.brokenMagicImpact(actors[0].id); An.shakeImpact(actors[0].id); await sleep(65);
        Clock.freezeCombatClock();
        return { at: Clock.clockNow(), visual: Clock.captureCombatState()['canvas-visuals'], poses: actors.map(pose) };
      });
      await page.close();
      const restored = await fixture();
      const replay = await restored.evaluate(async saved => {
        actors.forEach((e, i) => Object.assign(document.getElementById(`spriteContainer_${e.id}`).style, saved.poses[i]));
        Clock.restoreCombatClock(saved.at);
        await Clock.restoreCombatState({ 'canvas-visuals': saved.visual }, { entities: actors });
        const frozen = actors.map(pose); await sleep(450);
        const stable = JSON.stringify(frozen) === JSON.stringify(actors.map(pose));
        Clock.resumeCombatClock(); await sleep(600);
        return { stable, rest, end: actors.map(pose), remaining: runs().length };
      }, saved);
      results.after.replay = replay;
      assert.ok(replay.stable); assert.deepEqual(replay.end, replay.rest); assert.equal(replay.remaining, 0);
      const stopped = await restored.evaluate(async () => {
        An.shakeImpact(actors[0].id); An.brokenMagicImpact(actors[0].id); await sleep(50);
        window.dispatchEvent(new Event('battleStopped')); Clock.clearCombatClock(); await sleep(400);
        return { rest, end: actors.map(pose), remaining: runs().length };
      });
      assert.deepEqual(stopped.end, stopped.rest); assert.equal(stopped.remaining, 0);
      await restored.close();
    } else await page.close();
  }
  if (baseline) {
    assert.notDeepEqual(results.before.impacts.end, results.before.impacts.rest, 'Baseline reproduces the stuck pose');
    assert.ok(results.before.auras.initial.every(count => count === 50), 'Baseline reproduces duplicated aura loops');
  }
  console.log('PASS: impact bursts, neutral pose, reused GIFs, aura copies, codex coverage and paused visual restoration');
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser?.close(); await new Promise(done => server.close(done));
}
