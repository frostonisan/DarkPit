import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createProjectileFixture } from './projectile-test-fixture.mjs';

const output = resolve('outputs/render-read-sharing');
const fixture = await createProjectileFixture(output);
try {
  const { page, context, errors, missing } = await fixture.open({ viewport: { width: 1440, height: 900 } });
  const result = await page.evaluate(async () => {
    const geometry = await import('/js/rendering/projectileGeometry.js');
    const { getOpenViewRoots: roots } = await import('/js/ui/viewRoots.js');
    const check = (value, message) => { if (!value) throw Error(message); };
    const target = document.getElementById('sbire_998002');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;left:0;top:0;transform:translate3d(0,0,0)';
    document.body.append(overlay);
    let reads = 0;
    const nativeRect = target.getBoundingClientRect.bind(target);
    target.getBoundingClientRect = () => { reads++; return nativeRect(); };
    const release = geometry.trackProjectileGeometry(overlay);
    geometry.readProjectileTargetRect(target, 1); geometry.readProjectileTargetRect(target, 1);
    check(reads === 2, 'A lone flight reads directly without an observer');
    const peer = overlay.cloneNode(); document.body.append(peer);
    const releasePeer = geometry.trackProjectileGeometry(peer);
    reads = 0;
    const first = geometry.readProjectileTargetRect(target, 1);
    check(geometry.readProjectileTargetRect(target, 1) === first && reads === 1, 'Same frame shares a read');
    geometry.setProjectileTransform(overlay, 'translate3d(20px,10px,0)');
    await Promise.resolve();
    check(geometry.readProjectileTargetRect(target, 1) === first && reads === 1, 'Projectile transform preserves sharing');
    const responsiveHost = (await import('/js/ui/viewport.js')).screenEffectHost();
    check(responsiveHost.id === 'game-screen-effects', 'Exercise the production responsive effects host');
    responsiveHost.append(overlay, peer);
    const responsiveRect = geometry.readProjectileTargetRect(target, 1);
    const beforeResponsive = reads;
    for (let i = 0; i < 40; i++) {
      geometry.setProjectileTransform(i % 2 ? overlay : peer, `translate3d(${i}px,10px,0)`);
      check(geometry.readProjectileTargetRect(target, 1) === responsiveRect,
        'Responsive projectile writes preserve shared geometry in the same frame');
    }
    await Promise.resolve();
    check(reads === beforeResponsive && geometry.readProjectileTargetRect(target, 1) === responsiveRect,
      'Responsive writes do not invalidate asynchronously either');
    const originalLeft = target.style.left;
    target.style.left = '48vw';
    geometry.setProjectileTransform(overlay, 'translate3d(45px,10px,0)');
    const afterResponsiveMove = geometry.readProjectileTargetRect(target, 1);
    check(afterResponsiveMove !== responsiveRect && afterResponsiveMove.left === nativeRect().left,
      'Responsive write preserves a pending real target movement');
    const unknown = document.createElement('div'); document.body.append(unknown); unknown.append(overlay);
    const beforeUnknown = geometry.readProjectileTargetRect(target, 1);
    geometry.setProjectileTransform(overlay, 'translate3d(50px,10px,0)');
    check(geometry.readProjectileTargetRect(target, 1) !== beforeUnknown, 'Unknown hosts remain conservative');
    responsiveHost.append(overlay); unknown.remove(); target.style.left = originalLeft;
    const decoration = document.createElement('div');
    decoration.style.cssText = 'position:absolute;width:12px;height:12px';
    target.append(decoration);
    const beforeDecoration = geometry.readProjectileTargetRect(target, 1);
    const decorationReads = reads;
    for (let i = 0; i < 40; i++) {
      geometry.setDecorativeStyle(decoration, 'transform', `translateX(${i}px)`);
      geometry.setDecorativeStyle(decoration, 'filter', `brightness(${1 + i / 100})`);
      geometry.setDecorativeStyle(decoration, 'opacity', String(1 - i / 100));
      check(geometry.readProjectileTargetRect(target, 1) === beforeDecoration, 'Decorative animation shares target geometry');
      check(nativeRect().left === beforeDecoration.left && nativeRect().width === beforeDecoration.width, 'Decorative writes really preserve the target rectangle');
    }
    check(reads === decorationReads, 'Forty decorative updates add no target reads');
    geometry.setDecorativeStyle(target, 'transform', 'translateX(3px)');
    check(geometry.readProjectileTargetRect(target, 1).left === beforeDecoration.left + 3, 'A target transform is not decorative');
    geometry.setDecorativeStyle(target.parentElement, 'transform', 'translateX(5px)');
    check(geometry.readProjectileTargetRect(target, 1).left === beforeDecoration.left + 8, 'An ancestor transform still invalidates');
    target.style.transform = ''; target.parentElement.style.transform = ''; decoration.remove();
    geometry.readProjectileTargetRect(target, 1);
    reads = 1;
    target.style.left = '60vw';
    const moved = geometry.readProjectileTargetRect(target, 1);
    check(moved.left !== first.left && reads === 2, 'Synchronous target movement invalidates');
    target.parentElement.style.transform = 'translateX(10px)';
    check(geometry.readProjectileTargetRect(target, 1).left === moved.left + 10, 'Ancestor movement invalidates');
    // A known projectile write must not swallow earlier unrelated mutations.
    target.style.left = '55vw';
    geometry.setProjectileTransform(overlay, 'translate3d(25px,10px,0)');
    const relocated = geometry.readProjectileTargetRect(target, 1);
    check(relocated.left === nativeRect().left, 'Pending target movement survives a projectile write');
    overlay.style.width = '50px';
    geometry.setProjectileTransform(overlay, 'translate3d(30px,10px,0)');
    const afterResize = geometry.readProjectileTargetRect(target, 1);
    check(afterResize !== relocated, 'Pending overlay layout edit invalidates');
    overlay.style.transform = 'translate3d(35px,10px,0)';
    check(geometry.readProjectileTargetRect(target, 1) !== afterResize, 'Unowned writes stay conservative');
    const beforeFrame = reads;
    geometry.readProjectileTargetRect(target, 2);
    check(reads === beforeFrame + 1, 'New frame rereads CSS animation geometry');
    const beforeFresh = reads;
    geometry.readProjectileTargetRect(target);
    geometry.readProjectileTargetRect(target);
    check(reads === beforeFresh + 2, 'Reads outside RAF are always fresh');
    geometry.readProjectileTargetRect(target, 2);
    const beforeScroll = reads;
    window.dispatchEvent(new Event('scroll'));
    geometry.readProjectileTargetRect(target, 2);
    check(reads === beforeScroll + 1, 'Scroll invalidates');
    const style = document.createElement('style');
    style.textContent = '#sbire_998002 { width: 36px !important; }';
    document.head.append(style);
    check(geometry.readProjectileTargetRect(target, 2).width === 36, 'Stylesheet DOM changes invalidate');
    style.remove();
    release();
    const beforeRelease = reads;
    geometry.readProjectileTargetRect(target, 2); geometry.readProjectileTargetRect(target, 2);
    check(reads === beforeRelease + 2, 'Returning to one flight releases the cache');
    releasePeer(); peer.remove();
    const oldRelease = geometry.trackProjectileGeometry(overlay);
    geometry.clearProjectileGeometry();
    const newOverlay = overlay.cloneNode(); document.body.append(newOverlay);
    const newRelease = geometry.trackProjectileGeometry(newOverlay);
    const releaseOther = geometry.trackProjectileGeometry(overlay);
    oldRelease();
    const fresh = geometry.readProjectileTargetRect(target, 3);
    check(geometry.readProjectileTargetRect(target, 3) === fresh, 'Old flight cleanup preserves new flights');
    newRelease(); releaseOther(); overlay.remove(); newOverlay.remove();
    target.parentElement.style.transform = '';
    delete target.getBoundingClientRect;

    const display = await import('/js/rendering/displayBatch.js');
    const counter = document.createElement('span'); document.body.append(counter);
    counter.textContent = '1.0s'; const textNode = counter.firstChild;
    display.setDOMText(counter, '0.9s');
    check(counter.firstChild === textNode && textNode.data === '0.9s', 'Counter updates reuse the existing text node');
    counter.innerHTML = '<b>0.9s</b>'; display.setDOMText(counter, '0.9s');
    check(counter.childNodes.length === 1 && counter.firstChild.nodeType === Node.TEXT_NODE, 'Unexpected counter markup is normalized');
    display.setDOMText(counter, ''); check(counter.childNodes.length === 0, 'Empty text removes stale nodes');
    counter.remove();

    // Compare the index with the previous selector behavior after real DOM
    // operations, including same-task updates and HTML-restored helpers.
    const selectors = { dialogue: '.dialogue-window', codexSummary: '.codex-profile-summary',
      codexBattle: '.codex-information-battle', attackProgression: '.attack-progression',
      attackEffects: '.attack-effects-list[data-attack-key]', levelBattleStats: '[data-level-battle-stat]' };
    const verify = label => {
      for (const [kind, selector] of Object.entries(selectors)) {
        const expected = [...document.querySelectorAll(selector)], actual = roots(kind);
        check(actual.length === expected.length && actual.every((node, i) => node === expected[i]), `${label}: ${kind}`);
      }
    };
    verify('initial');
    const host = document.createElement('div');
    host.innerHTML = '<div class="dialogue-window"><div class="codex-profile-summary"></div></div>'
      + '<div class="codex-information-battle attack-progression"></div>'
      + '<div class="attack-effects-list" data-attack-key="a"></div><span data-level-battle-stat="damage" data-entity-id="1"></span>';
    document.body.append(host); verify('append then refresh');
    const clone = host.cloneNode(true); document.body.prepend(clone); verify('serialized clone and DOM order');
    const effects = host.querySelector('.attack-effects-list');
    effects.removeAttribute('data-attack-key'); verify('attribute removal');
    effects.setAttribute('data-attack-key', 'b'); verify('attribute addition');
    effects.className = 'attack-progression'; verify('class replacement');
    host.querySelector('.dialogue-window').innerHTML = '<span class="codex-profile-summary">restored</span>';
    verify('nested replacement');
    clone.remove(); verify('detached subtree');
    document.body.append(clone); verify('reopened subtree');
    host.remove(); clone.remove(); verify('closed views');
    return { geometryReads: reads, viewFamilies: Object.keys(selectors).length };
  });
  // The gameplay clock still samples each callback separately and preserves
  // native microtask ordering, while forwarding the common rendering stamp.
  const clockResult = await page.evaluate(() => new Promise(resolve => {
    const order = [], samples = [];
    clock.requestAnimationFrame((now, stamp) => {
      order.push('first'); samples.push({ now, stamp, current: clock.clockNow() });
      queueMicrotask(() => order.push('microtask'));
    });
    clock.requestAnimationFrame((now, stamp) => {
      order.push('second'); samples.push({ now, stamp, current: clock.clockNow() });
      resolve({ order, samples });
    });
  }));
  assert.deepEqual(clockResult.order, ['first', 'microtask', 'second']);
  assert.ok(Number.isFinite(clockResult.samples[0].stamp));
  assert.equal(clockResult.samples[0].stamp, clockResult.samples[1].stamp);
  for (const sample of clockResult.samples) assert.ok(Math.abs(sample.now - sample.current) < 10);
  // Real concurrent flights: each hit fires exactly once, then all overlays
  // disappear. This also exercises cache lifecycle between successive battles.
  const flights = [];
  for (const count of [10, 40, 80]) {
    await page.evaluate(count => { window.batch = Array.from({ length: count }, () => launchShot({ duration: 500 })); }, count);
    await page.waitForFunction(() => batch.every(id => shots.find(shot => shot.id === id).result === 'hit'));
    const state = await page.evaluate(() => batch.map(id => ({ hits: shots.find(s => s.id === id).hits, exists: !!document.getElementById(id) })));
    assert.ok(state.every(row => row.hits === 1 && !row.exists));
    flights.push({ count, hits: state.reduce((n, row) => n + row.hits, 0) });
  }
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ result, clockResult, flights, errors, missing }, null, 2));
  await context.close();
  console.log('PASS: geometry invalidation, six live view families, native callback ordering, 10/40/80 concurrent flights');
} finally { await fixture.close(); }
