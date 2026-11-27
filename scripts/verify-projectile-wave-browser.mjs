import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve(process.env.WAVE_OUTPUT || 'outputs/projectile-straight-20261124/straight');
const fixture = await createProjectileFixture(output), reports = [];
try {
  for (const count of [10, 40, 80]) {
    // Isolate projectile rendering, with one projectile per entity. This is not
    // a whole-combat FPS benchmark: other combat systems are deliberately idle.
    for (const variant of ['current']) {
      const { page, context, errors, missing } = await fixture.open({ viewport: { width: 1280, height: 720 } });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.evaluate(count => {
        const host = document.getElementById('projectile-fixture'); host.replaceChildren();
        window.actors = Array.from({ length: count }, (_, i) => {
          const actor = { id: 997000 + i, type: 'sbire' };
          const node = document.createElement('div'); node.id = `sbire_${actor.id}`;
          node.style.cssText = `position:absolute;left:${i % 2 ? 75 : 15}vw;top:${15 + Math.floor(i / 2) % 10 * 7}vh;width:24px;height:24px`;
          host.append(node); return actor;
        });
        window.waveSamples = []; window.waveHits = [];
        window.launchWaveGroup = () => {
          window.waveStarted = clock.clockNow();
          window.waveFlights = actors.map((actor, i) => {
            const target = actors[i ^ 1];
            const impact = new Promise(done => clock.setTimeout(() => done('hit'), 2400));
            return renderer.animationProjectile(actor, target, () => {
              const node = document.getElementById(`wave-${i}`), matrix = new DOMMatrix(node.style.transform);
              waveHits.push({ id: i, x: matrix.m41, y: matrix.m42 });
              return impact;
            }, { id: `wave-${i}`, attacknature: ['magicalDamage'], executionTime: 2400, impactPromise: impact });
          });
          function sample() {
            const record = actors[0].projectiles?.find(p => p.id === 'wave-0'), node = document.getElementById('wave-0');
            if (!record?.visual || !node || record.status !== 'in-flight') return;
            const m = new DOMMatrix(node.style.transform), v = record.visual;
            waveSamples.push({ at: clock.clockNow() - waveStarted, x: v.x, y: v.y, offsetX: m.m41-v.x, offsetY: m.m42-v.y });
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        };
      }, count);
      // Avoid measuring fixture construction and its first layout.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const metrics = r => Object.fromEntries(r.metrics.map(m => [m.name, m.value]));
      const before = metrics(await cdp.send('Performance.getMetrics'));
      await page.evaluate(() => launchWaveGroup());
      const result = await page.evaluate(async () => {
        const outcomes = await Promise.all(waveFlights);
        return { outcomes, hits: waveHits, samples: waveSamples, remaining: document.querySelectorAll('.projectile-parent').length };
      });
      const after = metrics(await cdp.send('Performance.getMetrics'));
      await writeFile(resolve(output, `wave-${count}-${variant}-raw.json`), JSON.stringify(result));
      assert.equal(result.hits.length, count);
      assert.equal(new Set(result.hits.map(h => h.id)).size, count, 'Exactly one impact per projectile');
      assert.ok(result.outcomes.every(o => o === 'hit'));
      assert.equal(result.remaining, 0);
      assert.ok(result.samples.length > 8, 'Enough rendered frames to verify the straight path');
      const offsets = result.samples.map(s => s.offsetY);
      // CSSOM serializes large logical coordinates to six significant digits.
      assert.ok(result.samples.every(s => Math.abs(s.offsetX) < 0.01), 'Visual X follows the logical route');
      assert.ok(result.samples.every(s => Math.abs(s.y-result.samples[0].y) < 0.001), 'The fixed target keeps a straight logical path');
      assert.ok(offsets.every(y => Math.abs(y) < 0.01), 'No transverse oscillation at any sampled phase');
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      reports.push({ count, variant, scriptMs: (after.ScriptDuration-before.ScriptDuration)*1000,
        layoutMs: (after.LayoutDuration-before.LayoutDuration)*1000, styleMs: (after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,
        ...result });
      console.log(`PASS ${variant}: ${count} entities/projectiles, straight path, unique impacts and cleanup`);

      if (variant === 'current' && count === 10) {
        const poses = await page.evaluate(async () => {
          clock.freezeCombatClock();
          const values = [];
          for (const progress of [0, .125, .375, .625, .875, 1]) {
            const id = `restored-wave-${progress}`;
            void renderer.animationProjectile(actors[0], actors[1], null, { id,
              attacknature: ['magicalDamage'], executionTime: 2000, impactPromise: new Promise(() => {}),
              restoredVisual: { x: 450, y: 300, startTime: clock.clockNow()-progress*2000, dx: 1, dy: 0, waveAmplitude: 10 } });
            const node = document.getElementById(id), matrix = new DOMMatrix(node.style.transform);
            values.push({ progress, distance: Math.hypot(matrix.m41-450, matrix.m42-300), transform: node.style.transform });
          }
          window.wavePauseTransforms = () => [...document.querySelectorAll('[id^="restored-wave-"]')].map(n => n.style.transform);
          return values;
        });
        assert.ok(poses.every(p => p.distance < 0.001), 'Restored magical flights remain straight at every phase');
        await page.waitForTimeout(120);
        assert.deepEqual(await page.evaluate(() => wavePauseTransforms()), poses.map(p => p.transform), 'Paused straight flight remains frozen');
        await page.evaluate(() => { renderer.clearProjectileEffects(actors); clock.resumeCombatClock(); });
      }
      await context.close();
    }
  }
  await writeFile(resolve(output, 'wave-report.json'), JSON.stringify(reports, null, 2));
} finally { await fixture.close(); }
