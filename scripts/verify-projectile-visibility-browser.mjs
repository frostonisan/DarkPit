import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve('outputs/projectile-visibility');
const fixture = await createProjectileFixture(output), reports = [];
try {
  for (const status of ['hit', 'miss', 'dodged']) {
    const { page, context, errors, missing } = await fixture.open({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });
    const ids = await page.evaluate(status => Array.from({ length: 12 }, (_, i) =>
      launchShot({ duration: 1000, status, scheduled: true, nature: i % 2 ? 'magicalDamage' : 'physicalDamage' })), status);
    await page.waitForFunction(ids => ids.every(id => readShot(id).x > innerWidth * .2), ids);
    const visible = await page.evaluate(ids => ids.map(id => readShot(id)), ids);
    for (const shot of visible) {
      assert.ok(shot.exists && shot.width > 0 && shot.height > 0 && shot.x < 915 && shot.y < 412);
      assert.equal(shot.visibility, 'visible'); assert.ok(Number(shot.opacity) > 0);
      assert.notEqual(shot.display, 'none'); assert.equal(shot.hits, 0);
    }
    await page.screenshot({ path: resolve(output, `${status}.png`), scale: 'css' });
    const outcomes = await page.evaluate(async () => {
      await Promise.all(shots.map(shot => shot.done));
      return shots.map(({ hits, logicalImpacts, result }) => ({ hits, logicalImpacts, result }));
    });
    for (const shot of outcomes) assert.deepEqual(shot, { hits: 1, logicalImpacts: 1, result: status });
    assert.equal(await page.locator('.projectile-parent').count(), 0, 'No completed projectile remains');
    await page.evaluate(() => { launchShot({ duration: 5000 }); renderer.clearProjectileEffects(actors); });
    assert.equal(await page.evaluate(() => shots.at(-1).done), 'removed');
    assert.equal(await page.evaluate(() => shots.at(-1).hits), 0, 'Cancellation never triggers an impact');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.projectile-parent').count(), 0, 'Cleanup cannot revive a cancelled projectile');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    reports.push({ status, visible, outcomes, errors, missing }); await context.close();
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS: 36 visible HTML projectiles, scheduled hit/miss/dodge, unique impacts and cancellation cleanup.');
} finally { await fixture.close(); }
