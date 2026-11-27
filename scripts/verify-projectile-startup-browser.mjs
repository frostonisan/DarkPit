import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

// The current game renders projectiles in HTML. Exercise a fresh page, pause,
// resize and first-shot completion without depending on a removed Phaser API.
const output = resolve('outputs/projectile-startup');
const fixture = await createProjectileFixture(output), reports = [];
try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1280, height: 800 } }],
    ['mobile', { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ]) {
    const { page, context, errors, missing } = await fixture.open(options);
    const id = await page.evaluate(() => launchShot());
    await page.waitForFunction(id => readShot(id).x > innerWidth * .2, id);
    const moving = await page.evaluate(id => readShot(id), id);
    assert.ok(moving.width > 0 && moving.height > 0 && moving.x < options.viewport.width * .75);
    assert.equal(moving.visibility, 'visible');
    assert.notEqual(moving.display, 'none');
    const paused = await page.evaluate(id => { clock.freezeCombatClock(); return readShot(id); }, id);
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(id => readShot(id), id), paused, 'Pause freezes the first projectile and its impact');
    await page.setViewportSize({ width: options.viewport.width - 80, height: options.viewport.height });
    await page.evaluate(() => clock.resumeCombatClock());
    const result = await page.evaluate(() => shots[0].done);
    assert.equal(result, 'hit');
    assert.equal(await page.evaluate(() => shots[0].hits), 1, 'Exactly one impact after pause and resize');
    assert.equal(await page.locator(`#${id}`).count(), 0, 'The completed projectile is removed');
    const second = await page.evaluate(async () => { launchShot({ duration: 250 }); return shots[1].done; });
    assert.equal(second, 'hit', 'The following shot also completes');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    reports.push({ name, first: result, second, errors, missing });
    await context.close();
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS: desktop/mobile HTML projectile startup, pause, resize and exactly one impact.');
} finally { await fixture.close(); }
