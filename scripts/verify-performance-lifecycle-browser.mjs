import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/performance-regression');
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { checks: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  await page.addInitScript(() => {
    const probe = window.__perf = { observers: [], frames: new Map(), ticks: {}, writes: [] };
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) {
        const state = { stack: new Error().stack, active: false, calls: 0 };
        super((...args) => { state.calls++; callback(...args); });
        this.state = state;
        probe.observers.push(state);
      }
      observe(...args) { this.state.active = true; return super.observe(...args); }
      disconnect() { this.state.active = false; return super.disconnect(); }
    };
    const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = callback => {
      const stack = new Error().stack;
      const name = stack.includes('/biome/meteo.js') ? 'weather' : callback.name || 'anonymous';
      const id = raf(time => {
        probe.frames.delete(id);
        probe.ticks[name] = (probe.ticks[name] || 0) + 1;
        callback(time);
      });
      probe.frames.set(id, { name, stack });
      return id;
    };
    window.cancelAnimationFrame = id => { probe.frames.delete(id); cancel(id); };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      probe.writes.push({ key, value: String(value) });
      return set.call(this, key, value);
    };
    window.__check = (value, label) => {
      if (!value) throw Error(label);
      (window.__checks ||= []).push(label);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const collect = async () => {
    report.checks.push(...await page.evaluate(() => (window.__checks || []).splice(0)));
  };

  report.storage = await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const Session = await import("/js/storage/sessionStorage.js");
    const check = window.__check, key = 'performance-saved-action';
    window.__perf.writes.length = 0;
    const state = { action: 0, nested: { charges: 100 } };
    for (let action = 0; action < 100; action++) {
      state.action = action;
      state.nested.charges = 100 - action;
      for (let repeat = 0; repeat < 4; repeat++) S.saveToLocalStorage(key, state);
      check(localStorage.getItem(key) === JSON.stringify(state), `Action ${action} saved synchronously`);
    }
    const writes = window.__perf.writes.filter(entry => entry.key === key);
    check(writes.length === 100, '400 save calls retain all 100 distinct states, no duplicate writes');
    S.saveToLocalStorage(key, { value: 'A' });
    S.saveToLocalStorage(key, { value: 'B' });
    S.saveToLocalStorage(key, { value: 'A' });
    check(window.__perf.writes.filter(entry => entry.key === key).length === 103, 'A to B to A is not coalesced');
    localStorage.setItem(key, '{"external":true}');
    S.saveToLocalStorage(key, { value: 'A' });
    check(localStorage.getItem(key) === '{"value":"A"}', 'An external write never makes the save comparison stale');
    const persistent = localStorage.getItem(key);
    Session.beginAdminSession();
    const beforeAdmin = window.__perf.writes.length;
    S.saveToLocalStorage(key, { admin: 1 });
    S.saveToLocalStorage(key, { admin: 2 });
    check(S.loadFromLocalStorage(key).admin === 2, 'Admin changes remain immediately readable');
    check(window.__perf.writes.length === beforeAdmin && localStorage.getItem(key) === persistent, 'Admin changes do not write the normal save');
    Session.endAdminSession();
    check(S.loadFromLocalStorage(key).value === 'A', 'Normal save remains intact after admin');
    return { saveRequests: 400, distinctStates: 100, writes: writes.length };
  });
  await collect();
  await page.reload();
  await page.evaluate(() => window.__check(localStorage.getItem('performance-saved-action') === '{"value":"A"}', 'Last action survives a page reload'));
  await collect();

  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const { persistEquippedResourceStocks } = await import("/js/storage/entityStorage.js");
    const check = window.__check;
    const item = { equippedId: 'perf-item', equippedTo: 777, resourceStocks: { shift: { current: 5, preciseCurrent: 5, max: 5 } } };
    const other = { equippedId: 'other-item', equippedTo: 778, resourceStocks: { shift: { current: 0, preciseCurrent: 0, max: 5 } } };
    const entity = { id: 777, resourceStocks: { shift: { stuff: { 'perf-item': { reserve: { ...item.resourceStocks.shift } } } } } };
    S.saveToLocalStorage('equippedItems', [item, other]);
    for (const key of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(key, { equippedItems: [item, other], unrelated: 'keep' });
    let notifications = 0;
    const notify = () => notifications++;
    window.addEventListener('equippedItemsUpdated', notify);
    window.__perf.writes.length = 0;
    persistEquippedResourceStocks(entity);
    check(window.__perf.writes.length === 0 && notifications === 0, 'Unchanged reserves do not write or emit a false update');
    entity.resourceStocks.shift.stuff['perf-item'].reserve.current = 3;
    entity.resourceStocks.shift.stuff['perf-item'].reserve.preciseCurrent = 3.25;
    persistEquippedResourceStocks(entity);
    check(notifications === 1, 'A real reserve change still notifies open helpers');
    for (const key of ['equippedItems', 'PlayerSave', 'IngameItemsData']) {
      const saved = S.loadFromLocalStorage(key);
      const items = key === 'equippedItems' ? saved : saved.equippedItems;
      check(items[0].resourceStocks.shift.preciseCurrent === 3.25, `${key}: exact reserve persisted immediately`);
      check(items[1].resourceStocks.shift.current === 0, `${key}: another owner is untouched`);
    }
    const bucket = S.loadFromLocalStorage('PlayerSave');
    bucket.equippedItems[0].resourceStocks.shift.current = 99;
    S.saveToLocalStorage('PlayerSave', bucket);
    persistEquippedResourceStocks(entity);
    check(S.loadFromLocalStorage('PlayerSave').equippedItems[0].resourceStocks.shift.current === 3, 'An out-of-sync secondary bucket is repaired even when main stock is unchanged');
    check(S.loadFromLocalStorage('PlayerSave').unrelated === 'keep', 'Other saved fields are preserved');
    window.removeEventListener('equippedItemsUpdated', notify);
  });
  await collect();

  await page.evaluate(async () => {
    const { glitterStuff, initWaterDrop, initDroplet, initSunray, initSnowstorm } = await import('/js/biome/meteo.js');
    const host = document.createElement('div'); host.id = 'meteo-fx'; document.body.append(host);
    for (const [id, init] of [['rain', initWaterDrop], ['ripples', initDroplet], ['sun', initSunray], ['snow', initSnowstorm]]) {
      const canvas = document.createElement('canvas'); canvas.id = `perf-${id}`;
      canvas.width = 1536; canvas.height = 676;
      host.append(canvas); init(canvas.id, id === 'rain' ? { dropsPerMinute: 600 } : undefined);
    }
    const item = document.createElement('div'); item.id = 'perf-glitter'; host.append(item);
    glitterStuff('#perf-glitter', 3); glitterStuff('#perf-glitter', 3);
    window.__check(item.querySelectorAll('.glitter').length === 1, 'Repeated glitter setup does not create duplicate spawn loops');
    window.__check([...window.__perf.frames.values()].filter(frame => frame.name === 'weather').length === 1, 'All four weather effects share one frame loop');
  });
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    const check = window.__check;
    check(window.__perf.ticks.weather > 0, 'Visible weather still animates');
    for (const canvas of document.querySelectorAll('#meteo-fx canvas')) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      check(pixels.some((value, index) => index % 4 === 3 && value > 0), `${canvas.id}: rendered canvas is not blank`);
    }
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    check(![...window.__perf.frames.values()].some(frame => frame.name === 'weather'), 'Hidden document pauses weather');
    delete document.hidden;
    for (let i = 0; i < 3; i++) document.dispatchEvent(new Event('visibilitychange'));
    check([...window.__perf.frames.values()].filter(frame => frame.name === 'weather').length === 1, 'Visibility changes do not duplicate weather');
    window.dispatchEvent(new Event('stageInterfaceClosing'));
    check(!document.getElementById('meteo-fx'), 'Level closing removes weather DOM');
    check(![...window.__perf.frames.values()].some(frame => frame.name === 'weather'), 'Level closing cancels the remaining weather frame');
    window.__weatherTicks = window.__perf.ticks.weather;
  });
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    window.__check(window.__perf.ticks.weather === window.__weatherTicks, 'No weather callbacks continue on the map');
    const { initWaterDrop } = await import('/js/biome/meteo.js');
    const canvas = document.createElement('canvas'); canvas.id = 'perf-removed-canvas'; document.body.append(canvas);
    initWaterDrop(canvas.id); canvas.remove();
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    window.__check(![...window.__perf.frames.values()].some(frame => frame.name === 'weather'), 'Unexpected canvas removal also stops its frame loop');
  });
  await collect();

  await page.evaluate(async () => {
    const { createGameContainer } = await import("/js/ui/application.js");
    createGameContainer();
    const check = window.__check;
    const observer = window.__perf.observers.find(state => state.stack.includes("/js/ui/statistics/helpers.js"));
    check(observer && !observer.active, 'Essence observer starts disconnected');
    const parent = document.createElement('div'), host = document.createElement('button');
    Object.assign(host.dataset, { stat: 'attackEssenceRed', hover: 'true', helperText: '<div>Essence test</div>', helperClass: 'essence-linked-hover red' });
    parent.append(host); document.body.append(parent);
    const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (let cycle = 0; cycle < 3; cycle++) {
      host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await frame();
      check(Boolean(document.querySelector('.essence-linked-hover')), `Helper opens after observer idle, cycle ${cycle}`);
      const reparent = document.createElement('div'); document.body.append(reparent); reparent.append(host); await frame();
      check(Boolean(document.querySelector('.essence-linked-hover')), 'Moving a live host preserves its helper');
      reparent.remove(); await frame();
      check(!document.querySelector('.essence-linked-hover'), 'Removing a host ancestor removes its helper');
      check(!observer.active, 'Essence observer disconnects with no open helper');
      parent.append(host);
    }
    parent.remove();
  });
  await collect();

  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    const { createHeadUpInDom, createEntiteScanInDOM } = await import("/js/rendering/entities.js");
    const check = window.__check;
    const entity = E.enrichEntityStats({ ...structuredClone(entitesNest.find(value => value.serial === 900013)),
      id: 977771, side: 'B', level: 1, stats: {}, baseStats: { HP: 50 }, stuff: {} });
    E.entites.push(entity);
    const atb = document.createElement('div'); atb.id = `atbFill_${entity.id}`; document.body.append(atb);
    const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (let cycle = 0; cycle < 3; cycle++) {
      createHeadUpInDom(entity.id); createEntiteScanInDOM(entity.id);
      atb.style.width = `${37 + cycle}%`; await frame();
      check(document.getElementById(`HUATBfill_${entity.id}`).style.width === atb.style.width, 'Visible HUD keeps live ATB synchronization');
      check(document.getElementById(`scanATBFill_${entity.id}`).style.width === atb.style.width, 'Visible scan keeps live ATB synchronization');
      document.getElementById(`headsup-container_${entity.id}`).remove();
      document.getElementById(`ScanEntity_${entity.id}`).remove(); await frame();
      check(![...window.__perf.frames.values()].some(frame => ['syncATB', 'syncScanATB'].includes(frame.name)), 'Closing HUD and scan leaves no recurring ATB callback');
    }
    createHeadUpInDom(entity.id); createEntiteScanInDOM(entity.id);
    atb.remove(); await frame();
    check(![...window.__perf.frames.values()].some(frame => ['syncATB', 'syncScanATB'].includes(frame.name)), 'Removing the original ATB also stops its mirrors');
    document.getElementById(`headsup-container_${entity.id}`).remove();
    document.getElementById(`ScanEntity_${entity.id}`).remove();
    E.entites.splice(E.entites.indexOf(entity), 1);
  });
  await collect();

  await page.evaluate(async () => {
    const L = await import('/js/data/loaderList.js');
    const check = window.__check;
    const path = './media/assets/ui/picto-armor.svg';
    const source = kind => `${path}?performance-cache=${kind}`;
    const sources = ['idle', 'live', 'css', 'pin'].map(source);
    await L.preloadResources(sources);
    const urls = Object.fromEntries(sources.map(key => [key, L.cachedResourceUrl(key)]));
    const image = new Image(); image.src = urls[source('live')]; document.body.append(image); await image.decode();
    const style = document.createElement('style'); style.textContent = `.not-currently-open { background-image: url("${urls[source('css')]}"); }`; document.head.append(style);
    const originalNow = Date.now;
    const sweep = minutes => {
      Date.now = () => originalNow() + minutes * 60000;
      try { return L.evictUnusedResources(); } finally { Date.now = originalNow; }
    };
    check(sweep(4) === 0, 'No early eviction before five minutes');
    const before = JSON.stringify(Object.entries(localStorage).sort());
    check(sweep(6) >= 1, 'Unused image bytes and decoded image can be evicted');
    check(L.cachedResourceUrl(source('idle')) === source('idle'), 'Unused image no longer resolves to a cached blob');
    check(L.cachedResourceUrl(source('live')) === urls[source('live')], 'A displayed image is never evicted');
    check(L.cachedResourceUrl(source('css')) === urls[source('css')], 'Dormant CSS never points to a revoked image');
    await L.preloadResources(sources);
    check(L.cachedResourceUrl(source('idle')) !== urls[source('idle')], 'Next complete preload fetches an evicted image again');
    await L.prepareLevelResources(new Set([source('pin')]));
    const pinUrl = L.cachedResourceUrl(source('pin'));
    sweep(20);
    check(L.cachedResourceUrl(source('pin')) === pinUrl, 'Complete level manifest stays available throughout the level');
    window.dispatchEvent(new Event('stageInterfaceClosing'));
    sweep(6);
    check(L.cachedResourceUrl(source('pin')) === source('pin'), 'Closing a level releases its unused manifest after the grace period');
    check(JSON.stringify(Object.entries(localStorage).sort()) === before, 'Cache eviction leaves every saved key and value untouched');
    image.remove(); style.remove();
    sweep(30);
    check(L.cachedResourceUrl(source('css')) === source('css'), 'Removing a CSS owner releases the cached image');
    check(L.cachedResourceUrl(source('live')) === source('live'), 'Removing a DOM owner releases the cached image');
    const parent = document.createElement('div'), gif = new Image(); parent.append(gif);
    await L.playCachedGif(gif, './media/assets/effects/heal-green.gif');
    document.body.append(parent);
    const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await frame();
    const gifObserver = window.__perf.observers.find(entry => entry.stack.includes('/data/loaderList.js'));
    check(gifObserver?.active, 'GIF cleanup observes a newly mounted animation');
    parent.remove(); await frame();
    check(!gifObserver.active, 'GIF cleanup disconnects after the last animated element is removed');
    const second = new Image(); document.body.append(second);
    await L.playCachedGif(second, './media/assets/effects/heal-green.gif');
    check(gifObserver.active, 'GIF cleanup resumes for a later animation');
    second.remove(); await frame();
    check(!gifObserver.active, 'A second animation is cleaned up without leaking its observer');
  });
  await collect();
  assert.deepEqual(report.errors, [], 'No browser runtime errors');
  report.result = 'passed';
  console.log(`PASS performance lifecycle: ${report.checks.length} checks`);
} catch (error) {
  report.result = 'failed'; report.failure = error.stack;
  throw error;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  server.close();
}
