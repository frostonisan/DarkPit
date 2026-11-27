import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/status-icons-integration');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.__nativeTimeout = timeout;
    window.setTimeout = (...args) => (window.__effectTimers?.setTimeout || timeout)(...args);
    window.clearTimeout = (...args) => (window.__effectTimers?.clearTimeout || clear)(...args);
  });
  await page.goto(origin + '/index.html');
  const checks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), U = await import("/js/ui/application.js"), Create = await import("/js/rendering/entities.js");
    const A = await import("/js/combat/vitals.js"), Fx = await import("/js/combat/effects.js");
    const Clock = await import("/js/combat/clock.js"), Timeline = await import("/js/combat/timeline.js");
    const Display = await import("/js/ui/statistics/components.js"), Loader = await import('/js/data/loaderList.js');
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.sprite?.includes('mouche-asticoteuse'));
    const helpers = await import("/js/ui/statistics/helpers.js");
    U.createGameContainer(); U.GameUi(); helpers.initializeStatHelpers(); window.levelRunning = 'worldmap';
    const visuals = Object.values((await import('/js/data/effectVisuals.js')).EFFECT_VISUALS);
    await Loader.preloadResources(visuals.map(visual => visual.src));
    const decoded = await Promise.all(visuals.map(async visual => {
      const image = new Image(); image.src = Loader.cachedResourceUrl(visual.src); await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    }));
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;top:210px;left:330px;width:850px;height:280px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    for (const [i, side] of ['A', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1); hex.dataset.row = '1'; hex.dataset.col = String(i * 5);
      hex.style.cssText = `position:absolute;left:${i * 540}px;top:50px;width:180px;height:200px`; grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999920 + i, name: `Mouche ${side}`, side,
        type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, armor: 0, strength: 0, intelligence: 0, agility: 0, alterationResistance: 50 }, attacks: ['autoAttack'] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = Create.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    const [a, b] = E.entites;
    const source2 = { ...a, id: 999930, name: 'Alchimiste', portrait: './media/portrait/porc-des-bas-fond.jpg' };
    let now = Date.now(), next = 0;
    const timers = new Map(); const nativeDate = Date.now, nativeRandom = Math.random;
    const flush = () => new Promise(done => window.__nativeTimeout(done, 0));
    window.__effectTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++next; timers.set(id, { fn: () => fn(...args), at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) };
    Date.now = () => now; Math.random = () => .999999;
    const advance = async ms => {
      const end = now + ms; let guard = 0;
      while (true) {
        await flush(); await Timeline.settleCombatTimeline(); await flush();
        const due = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
        if (!due) break; if (++guard > 20000) throw Error('Timer loop');
        const [id,t] = due; now = Math.max(now,t.at); timers.delete(id); t.fn();
      }
      now = end; await flush(); await Timeline.settleCombatTimeline(); await flush(); Display.refreshEntityEffectViews();
    };
    const checks = [], ok = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
    const apply = (target, name, caster, key, patch = {}) => A.applyEffect(target, name, caster, {
      functionName: key, displayName: key, effets: [name], effectOverrides: { [name]: patch },
    });
    const column = target => document.querySelector(`#effectsContainer_${target.id} .entity-effect-column`);
    const badge = (target, name) => column(target)?.querySelector(`[data-entity-effect="${name}"]`);
    const order = target => [...column(target).children].map(node => node.dataset.entityEffect).join(',');
    const hover = node => { node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelector(`.stat-hover[data-helper-key="${node.dataset.helperKey}"]`); };
    const dot = (duration, damage) => ({ effectDuration: duration, effectDot: damage, effectPhysicalRatio: 0, effectMagicalRatio: 0 });
    try {
      const resources = Loader.collectLevelResources();
      ok(visuals.length === 22 && decoded.every(Boolean), 'All 22 effects and visual variants have decodable artwork');
      ok(visuals.every(visual => resources.has(Loader.resourceKey(visual.src))), 'Every status image is preloaded with the level');
      ok(visuals.every(visual => /\/statuts\/statut-[\w-]+\.jpg$/.test(visual.src)), 'Only statut- artwork is used');
      for (const visual of visuals) {
        const key = `artwork-${visual.key}`;
        Display.setEntityEffectView(b, key, { kind: visual.key, label: visual.label, type: 'control', endAt: () => Clock.clockNow() + 10000, read: () => ({ html: 'Aperçu' }) });
        const row = badge(b, visual.key), helper = hover(row);
        ok(row.querySelector('img.entity-effect-icon')?.getAttribute('src') === Loader.cachedResourceUrl(visual.src), `${visual.label}: badge uses its cached artwork`);
        ok(helper.querySelector('img.effect-helper-icon')?.getAttribute('src') === Loader.cachedResourceUrl(visual.src), `${visual.label}: hover uses the same artwork`);
        Display.removeEntityEffectView(key);
      }
      Display.setEntityEffectView(b, 'artwork-fallback', { kind: 'astrality', label: 'Astralité', stat: 'astrality', endAt: () => Clock.clockNow() + 10000, read: () => ({ html: 'Aperçu' }) });
      ok(badge(b, 'astrality').querySelector('.entity-effect-icon.picto-stat.astrality'), 'Effects without statut- artwork keep their statistic pictogram');
      Display.removeEntityEffectView('artwork-fallback');
      Fx.brulure(b, { criticalBurn: true, effectDuration: 6, effectDot: 60 }, a);
      const magicalBadge = badge(b, 'magicalBurn'), magicalHelper = hover(magicalBadge);
      ok(magicalHelper.textContent.includes('Dégâts restants avant protections : 60')
        && !/NaN|undefined|Feu commun|Prochaine baisse/.test(magicalHelper.textContent), 'Magical burn describes its finite damage reserve without ordinary fire fields');
      const magicalPopup = document.querySelector(`#PopDow_${b.id} [data-effect-key="magicalBurn"] .combat-popup-status-icon`);
      for (const [name, icon] of [['badge', magicalBadge.querySelector('img')], ['helper', magicalHelper.querySelector('.effect-helper-icon')], ['popup', magicalPopup]]) {
        ok(icon && getComputedStyle(icon).filter.includes('hue-rotate'), `Magical burn ${name} uses the blue filter`);
      }
      ok(getComputedStyle(document.getElementById(`brulureVFX_${b.id}`)).opacity === '0.85', 'Magical flames are more opaque');
      apply(b, 'brulure', a, 'Flamme', { effectDot: 10 });
      ok(badge(b, 'brulure') && badge(b, 'magicalBurn'), 'Ordinary and magical burn helpers remain distinct');
      ok(!getComputedStyle(badge(b, 'brulure').querySelector('img')).filter.includes('hue-rotate'), 'Ordinary fire retains its original icon');
      hover(magicalBadge);
      await advance(1000);
      ok(magicalHelper.textContent.includes('Dégâts restants avant protections : 50') && !/NaN|undefined/.test(magicalHelper.textContent), 'Open magical helper follows the remaining damage after ticks');
      const magicSnapshot = Clock.captureCombatState();
      await Clock.restoreCombatState({ alterations: magicSnapshot.alterations }, { entities: E.entites, removed: [] });
      ok(badge(b, 'magicalBurn') && !/NaN|undefined/.test(hover(badge(b, 'magicalBurn')).textContent), 'Restoration rebuilds the correct magical burn helper');
      Fx.clearCombatEffects();
      apply(a, 'silence', b, 'Mutisme', { effectDuration: 4 });
      apply(b, 'silence', a, 'Mutisme', { effectDuration: 4 });
      apply(b, 'poison', a, 'Venin bref', dot(4, 80));
      apply(b, 'poison', a, 'Venin lent', dot(12, 480));
      apply(b, 'poison', source2, 'Toxine', dot(8, 240));
      apply(b, 'brulure', a, 'Flamme', { effectDot: 10, effectStack: 3 });
      apply(b, 'brulure', source2, 'Braise', { effectDot: 20, effectStack: 3 });
      ok(column(a).dataset.side === 'A' && column(b).dataset.side === 'B', 'Columns follow both combat sides');
      const boundsA = column(a).getBoundingClientRect(), boundsB = column(b).getBoundingClientRect();
      ok(boundsA.right <= document.getElementById(`effectsContainer_${a.id}`).getBoundingClientRect().left, 'Side A column behind the left edge');
      ok(boundsB.left >= document.getElementById(`effectsContainer_${b.id}`).getBoundingClientRect().right, 'Side B column behind the right edge');
      ok(order(b) === 'silence,brulure,poison', 'Sort by end of effect, including estimated fire extinction and last Poison source');
      const poison = badge(b, 'poison'), helper = hover(poison);
      const iconBounds = poison.querySelector('.entity-effect-icon').getBoundingClientRect();
      const iconCSS = getComputedStyle(poison.querySelector('.entity-effect-icon'));
      ok(iconCSS.width === '26px' && iconCSS.height === '26px' && iconCSS.objectFit === 'contain' && Math.abs(iconBounds.width - iconBounds.height) < .1, `Status artwork stays square without cropping (${iconCSS.width} × ${iconCSS.height}, ${iconCSS.objectFit})`);
      ok(column(b).querySelectorAll('[data-dot-effect="poison"]').length === 1 && poison.dataset.effectCount === '3', 'One Poison badge with three distinct provenances');
      ok(helper.querySelectorAll('tbody tr').length === 3, 'Three source rows, including two attacks of one caster');
      for (const label of ['Venin bref', 'Venin lent', 'Alchimiste', 'Toxine', '10 dégâts/s', '20 dégâts/s', '15 dégâts/s']) ok(helper.textContent.includes(label), `Source detail: ${label}`);
      ok(helper.querySelectorAll('.effect-source-portrait').length === 3, 'Every source retains its portrait');
      await advance(1000);
      ok(helper.textContent.includes('10 HP') && helper.textContent.includes('20 HP') && helper.textContent.includes('15 HP'), 'Each source shows its own real HP damage after resistance');
      apply(b, 'silence', a, 'Mutisme', { effectDuration: 40 });
      ok(order(b) === 'brulure,poison,silence', 'Refresh reorders the column by the new applied duration');
      ok(poison === badge(b, 'poison') && helper.isConnected, 'Reordering preserves a hovered badge and helper');
      apply(b, 'poison', a, 'Venin bref', dot(6, 240));
      ok(poison.dataset.effectCount === '3' && helper.querySelectorAll('tbody tr').length === 3, 'Same provenance refresh does not create a duplicate');
      ok(helper.textContent.includes('11,0 s'), 'Refreshing a short source does not overwrite the longest source expiry');
      await advance(7000);
      ok(poison.dataset.effectCount === '1' && helper.querySelectorAll('tbody tr').length === 1, 'Expired sources leave the shared badge and live tooltip');
      const burn = badge(b, 'brulure'), fire = hover(burn);
      ok(fire.textContent.includes('Feu commun · 2 apports · 2 lanceur(s)'), 'Fire is shared across casters');
      ok(fire.textContent.includes('6 dégâts/s') && fire.textContent.includes('6 HP'), 'Decayed shared fire exposes current power and actual last damage');
      ok(burn.classList.contains('is-decaying'), 'Unmaintained fire is visually distinguished');
      apply(b, 'brulure', a, 'Flamme', { effectDot: 10, effectStack: 3 });
      ok(badge(b, 'brulure') === burn && !burn.classList.contains('is-decaying') && fire.isConnected, 'Maintenance keeps the badge and resets the active fire state');
      ok(fire.textContent.includes('3 apports') && fire.textContent.includes('11 dégâts/s'), 'New input updates the common fire without independent timers');
      Clock.freezeCombatClock(); const beforePause = burn.textContent; await advance(3000);
      ok(burn.textContent === beforePause, 'Pause freezes badge durations'); Clock.resumeCombatClock();
      apply(b, 'charme', a, 'Charme', { effectDuration: 6 });
      ok(b.side === 'A' && column(b).dataset.side === 'A', 'Charme moves the column to the new side');
      Fx.clearControlEffects(b); ok(b.side === 'B' && column(b).dataset.side === 'B', 'Charme expiry restores the original side placement');
      const snapshots = Clock.captureCombatState();
      Clock.freezeCombatClock(); Clock.restoreCombatClock(Clock.clockNow());
      await Clock.restoreCombatState({ alterations: snapshots.alterations }, { entities: E.entites, removed: [source2] });
      ok(column(b).querySelectorAll('[data-dot-effect="brulure"]').length === 1, 'Restoring effects reconstructs one fire badge');
      ok(hover(badge(b, 'brulure')).textContent.includes('Alchimiste'), 'Removed caster metadata survives restoration');
      Clock.resumeCombatClock();
      Fx.clearCombatEffects();
      ok(!document.querySelector('.entity-effect-column,.active-effect-hover'), 'Cleanup removes all columns and helpers');
      // A paused final composition with real sprites, real effect handlers and real hover UI.
      Clock.freezeCombatClock();
      for (const target of [a,b]) {
        apply(target, 'silence', target === a ? b : a, 'Silence', { effectDuration: 7 });
        apply(target, 'poison', a, 'Venin bref', dot(6, 120));
        apply(target, 'poison', source2, 'Toxine', dot(12, 480));
        apply(target, 'brulure', a, 'Flamme', { effectDot: 10, effectStack: 3 });
        apply(target, 'brulure', source2, 'Braise', { effectDot: 20, effectStack: 3 });
      }
      document.querySelectorAll('.pop-up-message,.effect-message-line').forEach(node => node.remove());
      document.querySelectorAll('.entitylootContainer,.worldmap,.worldmap-container').forEach(node => node.remove());
      const scene = document.createElement('section');
      scene.style.cssText = 'position:fixed;left:0;top:0;width:1536px;height:676px;background:url(/media/decors/marecage/ground.jpg) center/cover;z-index:10';
      // Keep the preview in the same responsive stacking context as the real helpers.
      scene.append(grid); document.getElementById('game-shell').append(scene);
      window.__effectPreview = { a: a.id, b: b.id };
      return checks;
    } finally { Math.random = nativeRandom; Date.now = nativeDate; delete window.__effectTimers; }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(output, 'colonnes-en-jeu.png') });
  await page.locator('#effectsContainer_999921 [data-dot-effect="poison"]').hover();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(output, 'poison-sources.png') });
  await page.locator('#effectsContainer_999921 [data-dot-effect="brulure"]').hover();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(output, 'brulure-feu-commun.png') });
  await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), Fx = await import('/js/combat/effects.js');
    const target = E.entites.find(entity => entity.id === window.__effectPreview.b);
    const source = E.entites.find(entity => entity.id === window.__effectPreview.a);
    Fx.brulure(target, { criticalBurn: true, effectDuration: 6, effectDot: 60 }, source);
    (await import('/js/rendering/displayBatch.js')).flushCombatDisplay();
  });
  await page.locator('#effectsContainer_999921 [data-dot-effect="magicalBurn"]').hover();
  await page.waitForFunction(() => [...document.querySelectorAll('.active-effect-hover')]
    .some(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.locator('.active-effect-hover').screenshot({ path: resolve(output, 'brulure-magique-helper.png') });
  assert.deepEqual(errors, []);
  const visuals = await page.evaluate(async () => Object.values((await import('/js/data/effectVisuals.js')).EFFECT_VISUALS));
  const art = await browser.newPage({ viewport: { width: 1560, height: 1420 }, deviceScaleFactor: 1 });
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Malus — pictogrammes</title><style>
    *{box-sizing:border-box}body{margin:0;background:#000;color:#eee;font-family:Arial,sans-serif}main{padding:34px 60px 30px;width:1560px}
    h1{font:28px Georgia,serif;letter-spacing:4px;margin:0 0 10px;color:#e1c582}header p{color:#888;font-size:14px;margin:0 0 24px}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px 24px}.tile{text-align:center;min-width:0}
    .art{display:block;width:256px;height:256px;margin:auto;object-fit:contain}
    h2{font:19px Georgia,serif;margin:0 0 10px;color:var(--color)}.note{padding-top:70px;color:#ad9770;font:19px/1.6 Georgia,serif}footer{color:#777;font-size:12px;margin-top:16px}
    </style><main><header><h1>MALUS · PICTOGRAMMES</h1><p>Images statut- intégrées au jeu</p></header><div class="grid">${visuals.map(v => `<section class="tile" style="--color:${v.color}"><img class="art" id="art-${v.key}" src="${v.src}" alt=""><h2>${v.label}</h2></section>`).join('')}<div class="tile note">${visuals.length} effets<br>Une identité par malus</div></div><footer>Grab et Interruption sont instantanés : aucun compte à rebours persistant.</footer></main></html>`;
  await art.route('**/__status-preview__', route => route.fulfill({ contentType: 'text/html', body: html }));
  await art.goto(origin + '/__status-preview__');
  await art.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await art.locator('main').screenshot({ path: resolve(output, 'malus-pixel-art.jpg'), type: 'jpeg', quality: 96 });
  await writeFile(resolve(output, 'malus-planche.html'), html.replaceAll('./media/', '../../docs/media/'));
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ checks, errors, icons: visuals.map(v => v.key) }, null, 2));
  console.log(`Entity effect display: ${checks.length} checks passed; ${visuals.length} status images loaded and contact sheet rendered.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
