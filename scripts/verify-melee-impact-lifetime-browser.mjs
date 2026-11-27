import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/melee-impact-lifetime');
const baseline = process.env.MELEE_BASELINE && await readFile(resolve(process.env.MELEE_BASELINE, 'js/rendering/animations.js'));
let before = false;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(before && file === resolve(root, 'js/rendering/animations.js') ? baseline : await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const results = {};
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const version of baseline ? ['before', 'after'] : ['after']) {
    before = version === 'before';
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const E = await import("/js/entities/runtime.js");
      window.M = await import("/js/rendering/animations.js");
      window.C = await import("/js/combat/clock.js");
      window.T = await import("/js/combat/timeline.js");
      window.A = await import("/js/combat/attacks.js");
      window.B = await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
      const host = document.createElement('div'); host.id = 'melee-test';
      host.style.cssText = 'position:fixed;inset:0;background:#222'; document.body.append(host);
      E.entites.length = 0;
      window.entities = Array.from({ length: 81 }, (_, i) => {
        const entity = { id: 996000 + i, name: `Melee ${i}`, type: 'sbire', side: i ? 'A' : 'B', level: 1,
          baseStats: { HP: 100000, physicalDamage: 10, strength: 0, agility: 0, intelligence: 0 },
          attacks: ['autoAttack'], position: String(i), sprite: './media/sprites/mouche-asticoteuse.png' };
        E.enrichEntityStats(entity); entity.isDEAD = false; entity.statut = ['alive'];
        entity.stats.dodge = 0; entity.stats.criticalChance = 0; E.entites.push(entity);
        const hex = document.createElement('div'); hex.className = `hex Side${entity.side} occupied`; hex.dataset.position = String(i);
        hex.style.cssText = `position:absolute;left:${i ? 30 + i % 10 * 65 : 1050}px;top:${i ? 50 + Math.floor(i / 10) * 65 : 350}px;width:48px;height:48px`;
        hex.innerHTML = `<div id="Box_Entite_${entity.id}" class="entite-box"><div id="sbire_${entity.id}"><div id="spriteContainer_${entity.id}"><div id="Animationsprite_${entity.id}"><div id="DragSprite_${entity.id}"><canvas id="spriteCanvas_${entity.id}" width="48" height="48"></canvas></div></div></div><div id="effectsContainer_${entity.id}"></div><div id="PopDow_${entity.id}"></div></div></div>`;
        host.append(hex); const ctx = hex.querySelector('canvas').getContext('2d'); ctx.fillStyle = i ? '#f85' : '#5bf'; ctx.fillRect(6, 6, 36, 36);
        return entity;
      });
      B.rebuildBoardOccupancy(host);
      window.sleep = ms => new Promise(done => setTimeout(done, ms));
      window.visuals = () => {
        const clones = [...document.querySelectorAll('canvas[id^="meleeClone_"]')];
        return { nodes: clones.length, visible: clones.filter(node => Number(getComputedStyle(node).opacity) > 0.01).length,
          trails: [...document.querySelectorAll('.melee-motion-trail')].filter(node => Number(getComputedStyle(node).opacity) > 0.01).length,
          impacts: document.querySelectorAll('.melee-impact-fx').length };
      };
      window.attack = { functionName: 'melee-lifetime', displayName: 'Impact', combatFunction: 'Attaquant',
        attacknature: ['physicalDamage'], attackRange: ['melee'], attackTarget: ['enemy'], deadTarget: ['no'],
        effets: [], selfEffects: [], type: [], executionTime: 400, physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 };
    });
    // Let the newly built 81-entity fixture paint before measuring lifetimes.
    // Otherwise its first layout competes with the burst on a cold renderer.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const burst = await page.evaluate(async () => {
      const target = entities[0], hp = target.stats.HP.current;
      const pending = entities.slice(1).map((entity, i) => {
        const flight = A.createAttackFlight(entity, target, attack, { physical: 10 });
        const visual = M.animationMelee(entity, target, i % 2 === 1, { duration: 400, flightId: flight.id });
        // The real impact queue runs late; visuals must not hold the arriving
        // clones for that whole delay or suppress the eventual damage.
        return A.resolveAttackImpact(flight, { at: T.combatNow() + 1400 })
          .then(status => { visual.resolveImpact(status === 'hit'); return status; });
      });
      await sleep(700);
      const waiting = visuals();
      const statuses = await Promise.all(pending);
      const atConfirmation = visuals();
      await sleep(350);
      return { waiting, atConfirmation, end: visuals(), statuses, damage: hp - target.stats.HP.current };
    });
    const timing = await page.evaluate(async () => {
      const entity = entities[1], target = entities[0];
      const visual = M.animationMelee(entity, target, false, { duration: 400 });
      await sleep(80); visual.resolveImpact(true);
      await sleep(350); const onTime = visuals();
      await sleep(230); const ended = visuals();
      const delayed = M.animationMelee(entity, target, false, { duration: 400 });
      await sleep(80); delayed.resolveImpact(true);
      const end = performance.now() + 650;
      while (performance.now() < end) {} // deliberate main-thread congestion
      await sleep(30); const afterStall = visuals();
      await sleep(300);
      return { onTime, ended, afterStall };
    });
    const retarget = await page.evaluate(async () => {
      const visual = M.animationMelee(entities[1], entities[0], false, { duration: 600 });
      await sleep(180);
      const hex = document.getElementById(`Box_Entite_${entities[0].id}`).closest('.hex');
      hex.style.left = '900px';
      M.notifyProjectileTargetMoved(entities[0]);
      await sleep(650); const waiting = visuals();
      visual.resolveImpact(false); await sleep(250);
      return { waiting, end: visuals() };
    });
    results[version] = { burst, timing, retarget, errors };
    await page.close();
    if (version === 'after') {
      assert.equal(burst.waiting.visible, 0, '80 arriving clones fade without awaiting the delayed damage callback');
      assert.equal(burst.waiting.trails, 0, 'Trails fade with their clones');
      assert.equal(burst.atConfirmation.visible, 0, 'Late hit confirmation never revives expired clones');
      assert.equal(burst.atConfirmation.impacts, 0, 'Expired impacts are not replayed in a burst');
      assert.equal(burst.end.nodes, 0, 'Clones are removed after confirmation');
      assert.ok(burst.statuses.every(status => status === 'hit') && burst.damage > 0, 'Every real hit still applies');
      assert.ok(timing.onTime.visible > 0 && timing.onTime.impacts > 0, 'On-time impact keeps its animation');
      assert.equal(timing.ended.nodes, 0, 'Normal impact cleans up');
      assert.equal(timing.afterStall.visible, 0, 'Busy main thread does not restart an expired impact');
      assert.equal(retarget.waiting.visible, 0, 'Moving target does not prolong the clone lifetime');
      assert.equal(retarget.end.nodes, 0);
      assert.deepEqual(errors, []);
    }
  }
  if (baseline) {
    assert.ok(results.before.burst.waiting.visible > 0, 'Baseline reproduces stacked clones');
    assert.deepEqual(results.after.burst.statuses, results.before.burst.statuses);
    assert.equal(results.after.burst.damage, results.before.burst.damage, 'Identical damage before and after');
  }
  console.log('PASS melee impact lifetime: 80 simultaneous hits, late confirmation, stalled main thread and moving target');
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser?.close();
  await new Promise(done => server.close(done));
}
