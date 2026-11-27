import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/combat-popups');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const checks = [], errors = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
const evaluateChecks = async fn => checks.push(...await page.evaluate(fn));
// Keep the reference's lifetime and typography contracts, and measure the new
// centered impact, shorter travel and smaller older cards at identical scales.
async function sampleFountain({ production, entityIndex = 0 }) {
  const Board = production ? await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))) : null;
  const owner = production ? document.getElementById(`Box_Entite_${E.entites[entityIndex].id}`) : document.querySelector('.lab-unified');
  const sprite = owner.querySelector('.sprite');
  const host = production ? owner.querySelector('.combat-popup-damages') : owner.querySelector('.lab-fountain');
  sprite.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; });
  const results = [];
  const width = production ? Number(owner.dataset.spriteWidth) : parseFloat(getComputedStyle(sprite).width);
  const readRect = node => production ? __popupProbe.rectOf(node) : node.getBoundingClientRect();
  const clear = () => production ? Popups.clearCombatPopups() : visualLab.popups.clear();
  // Match the reference's no-aura message mode, then its full one-halo mode.
  const priorAuraCount = owner.style.getPropertyValue('--aura-count');
  for (const auras of [0, 1]) {
    if (production) owner.style.setProperty('--aura-count', auras);
    else {
      document.getElementById('lab').dataset.withAuras = String(Boolean(auras));
      owner.querySelector('.lab-frame').style.setProperty('--aura-count', auras);
      owner.dataset.hasStatus = 'false';
    }
    for (const [size, scale] of [[1,1],[2,1.35],[3,1.65],[6,2.5]]) {
      if (production) {
        E.entites[entityIndex].sizeInCells = size; Board.applyEntitySizeVisual(E.entites[entityIndex]);
        owner.querySelectorAll('.entity-size-layer,.combat-popup-damages,.combat-popup-status,.effects-container,.cast-animation-container').forEach(node => node.getAnimations().forEach(a => a.finish()));
      } else document.getElementById('lab').style.setProperty('--lab-scale', scale);
      for (const [type, kind] of [['normal','physical'], ['critical','critical'], ['execution','execution'], ['execution-critical','executionCritical']]) {
        clear();
        for (let i = 0; i < 3; i++) {
          if (production) D.PopUpDamages(E.entites[entityIndex], 123, [], '', {}, type, 0, 'physicalDamage');
          else visualLab.popups.emit(0, kind, 123, { nature: 'physical' });
        }
        const cards = [...host.children];
        cards.forEach(node => node.getAnimations({ subtree: true }).forEach(a => a.pause()));
        for (const progress of [0, .065, .25, .5, .8, .85, .9, .95, 1]) {
          for (const card of cards) {
            const body = card.firstElementChild, animation = body.getAnimations()[0], duration = animation.effect.getTiming().duration;
            animation.currentTime = duration * progress;
            const rect = readRect(body), base = readRect(sprite), unit = base.width / width;
            const css = production ? __popupProbe.styleOf(body) : getComputedStyle(body);
            results.push({ size, auras, type, path: card.dataset.flight, progress, duration,
              centerX: (rect.left + rect.width / 2 - base.left - base.width / 2) / unit,
              centerY: (rect.top + rect.height / 2 - base.top) / unit, spriteHeight: base.height / unit,
              x: (rect.left - base.left - base.width / 2) / unit, y: (rect.bottom - base.top) / unit,
              w: rect.width / unit, h: rect.height / unit, opacity: Number(css.opacity),
              font: css.font, padding: css.paddingInline });
          }
        }
      }
    }
  }
  clear();
  if (production) {
    owner.style.setProperty('--aura-count', priorAuraCount);
    E.entites[entityIndex].sizeInCells = 1; Board.applyEntitySizeVisual(E.entites[entityIndex]);
    owner.querySelectorAll('.entity-size-layer,.combat-popup-damages,.combat-popup-status,.effects-container,.cast-animation-container').forEach(node => node.getAnimations().forEach(a => a.finish()));
  }
  return results;
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js"); window.Popups = await import("/js/rendering/popups.js");
    window.E = await import("/js/entities/runtime.js"); window.D = await Promise.all([import("/js/rendering/hud.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))); window.U = await Promise.all([import("/js/ui/display.js"), import("/js/rendering/popups.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    window.FX = await Promise.all([import("/js/combat/effects.js"), import("/js/rendering/auras.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))); window.G = await import("/js/app/state.js");
    const Init = await import("/js/ui/application.js"), C = await import("/js/rendering/entities.js");
    Init.createGameContainer(); Init.GameUi();
    (await import("/js/storage/gameStorage.js")).setAdminMode(true); window.levelRunning = 'admin';
    const Store = await import("/js/storage/sessionStorage.js"); Store.beginAdminSession(); window.currentStageId = 'popup-audit';
    Store.gameStorage.setItem('GameStages', JSON.stringify({ stages: [{ id: 'popup-audit', level_type: 'admin' }] }));
    Store.gameStorage.setItem('currentLevel', 'popup-audit');
    document.querySelector('.worldmap')?.remove(); document.querySelectorAll('.entitylootContainer').forEach(node => node.remove());
    const grid = document.createElement('div'); grid.id = 'hexGrid';
    grid.style.cssText = 'position:absolute;top:500px;left:180px;width:1100px;height:300px'; document.getElementById('game-container').append(grid);
    const nest = (await import("/js/data/entityTemplates.js")).entitesNest;
    E.entites.length = 0;
    for (const [index, key] of ['mouche-asticoteuse', 'foudre-fange', 'cockroach-king'].entries()) {
      const template = nest.find(entity => entity.class === key) || { ...nest[0], class: key, sprite: `./media/sprites/${key}.png` };
      const side = index === 1 ? 'B' : 'A';
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(index + 1);
      hex.style.cssText = `position:absolute;left:${index * 370}px;top:0;width:160px;height:140px`; grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999840 + index, name: key, side, type: 'sbire', role: 'gueux',
        position: String(index + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, speed: 60000, strength: 0, intelligence: 0, agility: 0, physicalDamage: 10, magicalDamage: 10, extraLife: 0 },
        attacks: ['autoAttack'] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    G.configureBattleActionManager({ createStartButton: node => node, createFleeButton: node => node, createQuitButton: node => node });
    const rect = Element.prototype.getBoundingClientRect, rects = Element.prototype.getClientRects, style = window.getComputedStyle, raf = window.requestAnimationFrame;
    window.__popupProbe = { rect: 0, rects: 0, style: 0, raf: 0, rectOf: node => rect.call(node), styleOf: node => style(node) };
    Element.prototype.getBoundingClientRect = function (...args) { __popupProbe.rect++; return rect.apply(this, args); };
    Element.prototype.getClientRects = function (...args) { __popupProbe.rects++; return rects.apply(this, args); };
    window.getComputedStyle = function (...args) { __popupProbe.style++; return style.apply(this, args); };
    window.requestAnimationFrame = function (...args) { __popupProbe.raf++; return raf.apply(this, args); };
  });
  await evaluateChecks(() => {
    const passed = [], ok = (value, label) => { if (!value) throw Error(label); passed.push(label); };
    for (const entity of E.entites) {
      const sprite = document.getElementById(`DragSprite_${entity.id}`), box = document.getElementById(`Box_Entite_${entity.id}`);
      const frame = document.getElementById(`auraContainer_${entity.id}`);
      ok(document.getElementById(`PopUp_${entity.id}`).parentElement.classList.contains('entitesContainer') && document.getElementById(`PopDow_${entity.id}`).parentElement.classList.contains('entitesContainer'), entity.class + ': both popup hosts keep their original entitesContainer parent');
      ok(!box.querySelector('.combat-popup-frame, .combat-popup-anchor'), entity.class + ': no replacement frame or anchor in the DOM');
      const a = __popupProbe.rectOf(frame), animations = sprite.getAnimations(); animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      const s = __popupProbe.rectOf(sprite);
      ok(Math.abs(a.x - s.x) < 1 && Math.abs(a.y - s.y) < 1 && Math.abs(a.width - s.width) < 1 && Math.abs(a.height - s.height) < 1,
        entity.class + ': CSS-calibrated frame matches the unanimated visible sprite box ' + JSON.stringify({ frame: [a.x, a.y, a.width, a.height], sprite: [s.x, s.y, s.width, s.height] }));
      const reads = [__popupProbe.rect, __popupProbe.rects, __popupProbe.style];
      Popups.calibrateEntityVisuals(sprite, null, null, null, {});
      ok(JSON.stringify(reads) === JSON.stringify([__popupProbe.rect, __popupProbe.rects, __popupProbe.style]), entity.class + ': a repeated calibration request performs no measurements');
      const anchor = document.getElementById(`PopUp_${entity.id}`), before = __popupProbe.rectOf(anchor).toJSON();
      animations.forEach(animation => { animation.currentTime = 240; });
      ok(JSON.stringify(before) === JSON.stringify(__popupProbe.rectOf(anchor).toJSON()), entity.class + ': idle animation does not move the message anchor');
    }
    return passed;
  });
  await evaluateChecks(async () => {
    const A = await import("/js/rendering/auras.js"), An = await import("/js/rendering/animations.js");
    const Board = await import("/js/board/controller.js");
    const passed = [], ok = (value, label) => { if (!value) throw Error(label); passed.push(label); };
    const near = (a, b) => Math.abs(a - b) < .15;
    for (const entity of E.entites) {
      const owner = document.getElementById(`Box_Entite_${entity.id}`), frame = document.getElementById(`auraContainer_${entity.id}`);
      const aura = document.getElementById(`auraContainer_${entity.id}`), effects = document.getElementById(`effectsContainer_${entity.id}`);
      const cast = document.getElementById(`Cast_Animation_${entity.id}`);
      ok(aura.parentElement.id === `Animationsprite_${entity.id}` && effects.parentElement.classList.contains('drag-box') && cast.parentElement === owner, entity.class + ': aura, effects and cast retain their original parents');
      for (const name of ['extraLife', 'eternalLife', 'fadedLife']) (entity.stats[name] ||= {}).current = 1;
      const reads = { rect: __popupProbe.rect, style: __popupProbe.style };
      A.syncEntityAuras(entity, aura, { lifeOnly: true });
      const wraps = [...aura.querySelectorAll('.life-aura-wrap')], original = wraps[0].querySelector('img');
      for (let i = 0; i < 20; i++) A.syncEntityAuras(entity, aura, { lifeOnly: true });
      ok(__popupProbe.rect === reads.rect && __popupProbe.style === reads.style && original === aura.querySelector('.life-aura-wrap img'), entity.class + ': aura refresh reuses nodes and cached CSS dimensions');
      const width = Number(owner.dataset.spriteWidth), height = Number(owner.dataset.spriteHeight), scale = __popupProbe.rectOf(frame).width / width;
      const haloWidth = Math.min(width * .4, height * .45, 64), gap = Math.min(height * .025, 5);
      ok(wraps.length === 3 && wraps.every((node, row) => near(parseFloat(__popupProbe.styleOf(node).width), haloWidth * [.35/.55, .45/.55, 1][row])), entity.class + ': halos retain the original nested size ratios within the 64px cap');
      const base = __popupProbe.rectOf(frame);
      ok(wraps.every((node, row) => near(base.top - __popupProbe.rectOf(node).bottom, (gap + row * haloWidth * .06) * scale)), entity.class + ': compact overlapping halos sit just above the CSS box');
      const anchors = () => wraps.map(node => __popupProbe.rectOf(node).toJSON());
      const before = JSON.stringify(anchors());
      owner.querySelectorAll('.sprite-container *').forEach(node => node.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 640; }));
      aura.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 700; });
      ok(JSON.stringify(anchors()) === before, entity.class + ': neither sprite motion nor halo pulse moves the halo anchors');
      const originalClass = aura.className;
      for (const key of ['grouille-doigt', 'torche-noire', 'jeune-salamandron', 'versa-soufle']) {
        aura.className = `aura-container ${key}`;
        const root = aura.querySelector('.life-sup'), css = __popupProbe.styleOf(root);
        ok(css.transform === 'none' && parseFloat(css.top) === 0 && parseFloat(css.left) === 0 && __popupProbe.styleOf(aura).animationName === 'none', key + ': monster-specific aura offsets and idle no longer override the shared frame');
      }
      aura.className = originalClass;
      const nodes = [];
      for (const family of ['stun', 'mysticism', 'heal', 'burn', 'indestructibility', 'astrality', 'resilience', 'ambidextry']) {
        const node = document.createElement('img'); node.className = `effect-vfx ${family}`; node.src = './media/assets/effects/burn.gif'; effects.append(node); nodes.push(node);
      }
      const expected = [[Math.min(width*.48,height*.65,64), null], [Math.min(width*.8,height*.55,140),Math.min(height*.9,200)], [Math.min(width*.7,height*.6,110),Math.min(height*.9,160)], [Math.min(width*.75,height*.7,110),Math.min(height*.7,140)]];
      expected.forEach(([w,h], i) => { const css = __popupProbe.styleOf(nodes[i]); ok(near(parseFloat(css.width),w) && (h === null || near(parseFloat(css.height),h)), entity.class + ': ' + nodes[i].className + ' uses its family cap'); });
      ok(nodes.slice(4).every(node => parseFloat(__popupProbe.styleOf(node).width) <= 110.1 && parseFloat(__popupProbe.styleOf(node).height) <= 110.1), entity.class + ': transient procs retain capped dimensions');
      const start = An.animatePreparation(entity, { functionName: 'autoAttack', type: ['physical'], attacknature: ['physicalDamage'] }, 60000);
      const circle = cast.querySelector('.cast'), circleParent = circle.parentElement;
      ok(near(parseFloat(__popupProbe.styleOf(circleParent).width), Math.min(width*1.2,height*1.5,190)), entity.class + ': real preparation circle follows the 190px ground cap');
      const initial = [wraps[0], nodes[1], circleParent].map(node => __popupProbe.rectOf(node).width);
      const initialFoot = __popupProbe.rectOf(frame);
      const frameStyle = frame.style.cssText;
      for (const [size, factor] of [[2,1.35],[3,1.65],[6,2.5],[1,1]]) {
        entity.sizeInCells = size; Board.applyEntitySizeVisual(entity); owner.querySelectorAll('.entity-size-layer,.combat-popup-damages,.combat-popup-status,.effects-container,.cast-animation-container').forEach(node => node.getAnimations().forEach(a => a.finish()));
        ok([wraps[0], nodes[1], circleParent].every((node,i) => near(__popupProbe.rectOf(node).width, initial[i]*factor)) && frame.style.cssText === frameStyle, entity.class + ': size ' + size + ' scales overlays once without recalibration');
        const foot = __popupProbe.rectOf(frame);
        for (const host of [effects, cast]) {
          const actual = __popupProbe.rectOf(host);
          ok(['x','y','width','height'].every(key => near(actual[key], foot[key])), entity.class + ': original ' + host.className + ' matches the sprite box at scale ' + factor + ' ' + JSON.stringify({ actual: actual.toJSON(), expected: foot.toJSON() }));
        }
        ok(near(foot.bottom, initialFoot.bottom) && near(foot.x + foot.width / 2, initialFoot.x + initialFoot.width / 2), entity.class + ': size ' + size + ' keeps feet fixed on the board');
      }
      entity.sizeInCells = 6; Board.applyEntitySizeVisual(entity);
      const scaleHosts = [owner.querySelector('.entity-size-layer'), effects, cast, document.getElementById(`PopUp_${entity.id}`), document.getElementById(`PopDow_${entity.id}`)];
      const transitions = scaleHosts.flatMap(node => node.getAnimations());
      transitions.forEach(animation => { animation.pause(); animation.currentTime = 80; });
      const middle = __popupProbe.rectOf(frame);
      ok([effects,cast].every(node => { const rect = __popupProbe.rectOf(node); return ['x','y','width','height'].every(key => near(rect[key], middle[key])); }), entity.class + ': overlays remain aligned halfway through growth');
      transitions.forEach(animation => animation.finish());
      entity.sizeInCells = 1; Board.applyEntitySizeVisual(entity);
      scaleHosts.forEach(node => node.getAnimations().forEach(a => a.finish()));
      entity.stopPreparationAnimation?.(); nodes.forEach(node => node.remove());
      entity.stats.fadedLife.current = 0; A.syncEntityAuras(entity, aura, { lifeOnly: true });
      ok(aura.querySelectorAll('.life-aura-slot').length === 2 && [...aura.querySelectorAll('.life-aura-slot')].map(node => node.style.getPropertyValue('--aura-row')).join() === '0,1', entity.class + ': consumed halo releases and compacts its row');
    }
    // A tall, narrow CSS sprite catches the height-only sizing regression.
    const C = await import("/js/rendering/entities.js");
    const thinStyle = document.createElement('style'); thinStyle.textContent = '.sprite.visual-thin-fixture { width: 60px !important; height: 300px !important; }'; document.head.append(thinStyle);
    const thin = E.enrichEntityStats({ id: 999849, class: 'visual-thin-fixture', sprite: E.entites[0].sprite, name: 'Tall narrow fixture', side: 'A', type: 'sbire', role: 'gueux', level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {}, baseStats: {HP:1000,extraLife:1}, attacks:['autoAttack'] });
    const created = C.createEntiteInDOM(thin); await created.spriteReady;
    const thinFrame = created.element;
    ok(thinFrame.dataset.spriteWidth === '60' && thinFrame.dataset.spriteHeight === '300' && near(parseFloat(__popupProbe.styleOf(thinFrame.querySelector('.life-aura-wrap')).width),24*.45/.55), 'Tall narrow sprite: halo preserves its size ratio within the width AND height cap (24px)');
    A.cleanupEntityAuras(thin); created.element.remove(); thinStyle.remove();
    const randomEntity = { id: E.entites[0].id, stats: { HP: { current: 1000 }, hypercognition: 150 } };
    const randomAura = document.getElementById(`auraContainer_${randomEntity.id}`);
    A.syncEntityAuras(randomEntity, randomAura);
    const randomReads = [__popupProbe.rect, __popupProbe.style];
    await new Promise(done => setTimeout(done, 650));
    ok(randomAura.querySelectorAll('.hypercognition-aura-fx').length >= 2 && JSON.stringify(randomReads) === JSON.stringify([__popupProbe.rect,__popupProbe.style]), 'Repeated random aura emissions use cached local dimensions with no geometry reads: ' + JSON.stringify({ count: randomAura.querySelectorAll('.hypercognition-aura-fx').length, before: randomReads, after: [__popupProbe.rect,__popupProbe.style] }));
    A.cleanupEntityAuras(randomEntity);
    A.syncEntityAuras(E.entites[0], randomAura, { lifeOnly: true });
    return passed;
  });
  await evaluateChecks(() => {
    const passed = [], ok = (value, label) => { if (!value) throw Error(label); passed.push(label); };
    const target = E.entites[0], dataBefore = JSON.stringify(target);
    const before = { rect: __popupProbe.rect, rects: __popupProbe.rects, style: __popupProbe.style, raf: __popupProbe.raf };
    const vfxBefore = document.querySelectorAll('.effect-vfx, .aura-fx').length;
    for (const type of ['normal', 'critical', 'execution-critical']) D.PopUpDamages(target, 123, [], '', { magical: 123 }, type, 0, 'magicalDamage');
    const cards = [...document.querySelectorAll(`#PopUp_${target.id} > .combat-popup-flight`)];
    ok(cards.map(node => node.dataset.flight).join() === 'center,left,right', 'Damage uses center, left and right fountain paths');
    ok(cards.filter(node => node.dataset.latest === 'true').length === 1 && cards.at(-1).dataset.latest === 'true', 'Only the latest impact keeps its large foreground size');
    ok(cards.every(node => node.querySelectorAll('.damage-popup').length === 1), 'Each hit uses a single amount node throughout its flight');
    ok(cards[1].querySelector('.damage-popup-critical-icon.criticalPower') && cards[2].querySelector('.damage-popup-critical-icon.execution-critical'), 'Critical icons replace the nature icon');
    ok(cards[1].querySelector('.combat-popup-critical-suffix').textContent === '!!!', 'Critical suffix is separate from the nature-colored amount');
    ok(cards.every(node => node.querySelector('.damage-popup-value').textContent === '−123'), 'Actual damage amounts are preserved without component breakdowns');
    ok(cards.map(node => parseFloat(__popupProbe.styleOf(node.querySelector('.damage-popup-value')).fontSize)).join() === '24,32,40', 'Normal, critical and execution-critical pops have the validated size tiers');
    const frames = cards[0].querySelector('.combat-popup-life').getAnimations()[0].effect.getKeyframes();
    ok(Number(frames[0].opacity) === 1 && new DOMMatrix(frames[0].transform).a >= 1.39, 'An impact starts visible and enlarged immediately');
    ok([.8, .9, 1].every((offset, index) => frames.some(frame => Math.abs(frame.offset - offset) < .0001 && Number(frame.opacity) === [1, .5, 0][index])), 'Damage keeps the approved 80/90/100 percent fade');
    D.PopUpDamages(target, 10, [], '', {}, 'execution', 0, 'physicalDamage');
    const execution = document.querySelector(`#PopUp_${target.id} > .combat-popup-flight:last-child`);
    ok(execution.dataset.priority === '2' && parseFloat(__popupProbe.styleOf(execution.querySelector('.damage-popup-value')).fontSize) === 28, 'A noncritical execution keeps its distinct intermediate size');
    const stressStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      D.PopUpDamages(target, i, [], '', { physical: i }, 'normal', 0, 'physicalDamage');
      U.EffectMessage(target, 'Stun !', 'normal', { effectKey: 'stun', durationSeconds: 3 });
    }
    window.__popupStressMs = performance.now() - stressStart;
    ok(document.querySelectorAll(`#PopUp_${target.id} > .combat-popup-flight`).length === 8, 'A thousand impacts retain at most eight damage cards');
    const status = document.getElementById(`PopDow_${target.id}`);
    ok(status.querySelectorAll('.combat-popup-history-row').length === 6 && status.querySelectorAll('.combat-popup-front').length <= 3 && status.querySelectorAll('.combat-popup-outgoing').length <= 3, 'Effect history/front/outgoing remain bounded under a thousand arrivals');
    ok([...status.querySelectorAll('.combat-popup-front')].every(node => node.textContent === 'Stun 3 scd !'), 'Effect text uses a short label, icon and real duration in seconds');
    const after = { rect: __popupProbe.rect, rects: __popupProbe.rects, style: __popupProbe.style, raf: __popupProbe.raf };
    ok(JSON.stringify(before) === JSON.stringify(after), '2004 emissions add no geometry reads or JS animation frames');
    const active = [...document.getElementById(`PopUp_${target.id}`).children];
    ok(active.length === 8 && cards.every(card => active.includes(card)) && active.includes(execution),
      'The damage fountain reuses its original cards under sustained arrivals');
    const ordered = [...active].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
    ok(ordered.map(node => node.querySelector('.damage-popup-value').textContent).join() === Array.from({ length: 8 }, (_, i) => `−${992 + i}`).join(),
      'Recycling retains the last eight damage amounts in the original stacking order');
    ok(active.every(node => node.dataset.priority === '0' && !node.querySelector('.combat-popup-critical-suffix')),
      'A reused normal hit clears the previous critical priority and suffix');
    ok(JSON.stringify(target) === dataBefore, 'Rendering leaves entity gameplay data unchanged');
    ok(document.querySelectorAll('.effect-vfx, .aura-fx').length === vfxBefore, 'The new popup renderer neither creates nor alters VFX/auras');
    Popups.clearCombatPopups();
    D.PopUpDamages(target, 10, [], '', {}, 'normal', 0, 'physicalDamage');
    ok(document.querySelector(`#PopUp_${target.id} > .combat-popup-flight`).dataset.flight === 'center', 'An empty fountain restarts at the center');
    return passed;
  });
  await evaluateChecks(async () => {
    const passed = [], ok = (value, label) => { if (!value) throw Error(label); passed.push(label); };
    const target = E.entites[0], host = document.getElementById(`PopUp_${target.id}`);
    const card = host.querySelector('.combat-popup-flight'), body = card.firstElementChild;
    const oldAnimation = body.getAnimations()[0];
    await new Promise(done => setTimeout(done, 1800));
    ok(!host.children.length && !card.isConnected && !body.getAnimations().length,
      'Expired damage leaves the DOM and retains no running animation');
    D.PopUpDamages(target, 987, [], '', {}, 'execution-critical', 0, 'magicalDamage');
    ok(host.querySelector('.combat-popup-flight') === card && card.firstElementChild === body
      && body.getAnimations()[0] !== oldAnimation && card.dataset.flight === 'center',
      'An expired slot restarts with the same nodes, a fresh animation and the center trajectory');
    ok(card.querySelector('.damage-popup-value.magicalDamage').textContent === '−987'
      && card.querySelector('.execution-critical') && card.querySelector('.combat-popup-critical-suffix'),
      'Reused contents take the new amount, damage nature and critical icon');
    Popups.clearCombatPopups();
    ok(!host.children.length, 'Explicit cleanup removes active messages and releases the spare cache');
    return passed;
  });
  const reference = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await reference.goto(`http://127.0.0.1:${server.address().port}/index-15.html`);
  await reference.evaluate(async () => { await visualLab.ready; document.querySelector('button[data-mode="messages"]').click(); });
  const comparisons = [];
  for (const [entityIndex, key] of ['mouche-asticoteuse', 'foudre-fange', 'cockroach-king'].entries()) {
    await reference.evaluate(async key => {
      const select = document.querySelector('.lab-caption select');
      select.value = key; select.dispatchEvent(new Event('change')); await visualLab.ready;
    }, key);
    const actual = await page.evaluate(sampleFountain, { production: true, entityIndex });
    const expected = await reference.evaluate(sampleFountain, { production: false });
    assert.equal(actual.length, expected.length);
    let maxRise = 0;
    actual.forEach((point, index) => {
      const wanted = expected[index];
      for (const field of ['size','auras','type','path','progress','duration','font','padding']) assert.equal(point[field], wanted[field], `${key} ${field}`);
      if (point.progress > 0) assert.ok(Math.abs(point.opacity - wanted.opacity) < .001, `${key}: fade and duration preserved`);
      const rise = point.spriteHeight / 2 - point.centerY;
      maxRise = Math.max(maxRise, rise);
      assert.ok(rise <= 32 && rise >= -10, `${key}: compact cascade at scale ${point.size}: rise ${rise}`);
      if (point.progress === 0) {
        assert.ok(Math.abs(point.centerX) < .15 && Math.abs(point.centerY - point.spriteHeight / 2) < .15,
          `${key}: impact centered on the entity at scale ${point.size}: ${point.centerX}, ${point.centerY}`);
        assert.equal(point.opacity, 1, `${key}: impact is visible immediately`);
        if (point.path === 'right') {
          const previous = actual.find(sample => sample.size === point.size && sample.auras === point.auras
            && sample.type === point.type && sample.progress === 0 && sample.path === 'left');
          assert.ok(point.h >= previous.h * 1.9, `${key}: newest impact is larger than the cascade`);
        }
      }
    });
    comparisons.push({ key, samples: actual.length, maxRise });
    checks.push(`${key}: ${actual.length} centered compact cascade samples (four scales, four damage tiers, three paths, two aura modes); lifetime and typography preserved`);
  }
  await reference.close();
  const stressMs = await page.evaluate(() => window.__popupStressMs);
  await page.waitForTimeout(1800);
  check(await page.locator('.combat-popup-card').count() === 0, 'All damage and status cards expire after the stream stops');
  await evaluateChecks(() => {
    const passed = [], ok = (value, label) => { if (!value) throw Error(label); passed.push(label); };
    const target = E.entites[0], attacker = E.entites[1];
    U.EffectMessage(target, 'OVERKILL !');
    const overkill = document.querySelector(`#PopUp_${target.id} .combat-popup-flight`);
    ok(overkill?.querySelector('.damage-popup--overkill .picto-stat.overkill')
      && overkill.dataset.latest === 'true' && overkill.textContent === 'OVERKILL !', 'Overkill uses the centered damage cascade and its original icon');
    ok(!document.querySelector(`#PopDow_${target.id} .overkill`), 'Overkill is not duplicated in the status history');
    D.PopUpDamages(target, 8, [], '', {}, 'normal');
    ok(!overkill.hasAttribute('data-latest') && document.querySelector(`#PopUp_${target.id} [data-latest="true"]`).textContent === '−8', 'A later damage replaces Overkill in the foreground');
    Popups.clearCombatPopups();
    FX.stun(target, { effectName: 'stun', effectDisplay: 'Stun', effectDuration: 3 }, attacker);
    FX.poison(target, { effectDot: 2, effectDuration: 4 }, attacker);
    FX.brulure(target, { effectDot: 2 }, attacker);
    const texts = [...document.querySelectorAll(`#PopDow_${target.id} .combat-popup-front`)].map(node => node.textContent);
    ok(texts.some(text => /^Stun 3 scd !$/.test(text)) && texts.some(text => /^Poison .* scd !$/.test(text)) && texts.some(text => /^Brûlure .* scd !$/.test(text)), 'Real stun, poison and burn applications send their durations to the popup feed: ' + JSON.stringify(texts));
    FX.clearCombatEffects(); Popups.clearCombatPopups();
    FX.brulure(target, { criticalBurn: true, effectDuration: 3, effectDot: 30 }, attacker);
    const magicalFire = document.getElementById(`brulureVFX_${target.id}`);
    ok(magicalFire?.matches('.burn.magical-burn.magicalDamage') && getComputedStyle(magicalFire).opacity === '0.6', 'Magical burn reuses one smaller translucent flame');
    const message = document.querySelector(`#PopDow_${target.id} .combat-popup-front .BattleText`);
    ok(message?.textContent === 'Brûlure magique 3 scd !' && message.classList.contains('magicalDamage'), 'Magical burn popup uses its explicit label and magic damage color');
    FX.clearCombatEffects(); Popups.clearCombatPopups();
    U.showHealingFeedback(target, 17);
    ok(document.querySelector(`#PopDow_${target.id} .combat-popup-front`).textContent.includes('+17 HP'), 'Real healing feedback uses the text feed');
    ok(document.querySelector('.healing-feedback-vfx'), 'The original healing VFX is still handled by the existing game code');
    D.PopUpDamages(target, 12, [], '', {}, 'critical', 3, 'physicalDamage');
    ok(document.querySelector(`#PopUp_${target.id} .damage-popup-value`).textContent === '−15' && document.querySelector(`#PopDow_${target.id} .combat-popup-front .damage-popup--armor-destroyed`), 'HP plus armor damage retain their total and armor-break notice');
    Popups.clearCombatPopups();
    return passed;
  });
  await page.evaluate(async () => {
    FX.brulure(E.entites[0], { criticalBurn: true, effectDuration: 10, effectDot: 30 }, E.entites[1]);
    for (const value of [18, 24, 32]) D.PopUpDamages(E.entites[0], value, [], '', {}, 'normal', 0, 'magicalDamage');
    U.EffectMessage(E.entites[1], 'OVERKILL !');
    for (const node of document.querySelectorAll('.combat-popup-card')) {
      node.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = node.dataset.latest === 'true' ? 40 : 350; });
    }
  });
  await page.screenshot({ path: resolve(output, 'magic-burn-and-centered-impacts.png'), fullPage: true });
  await page.locator('.combat-popup-flight:has(.damage-popup--overkill)').screenshot({ path: resolve(output, 'overkill-centered.png') });
  await page.evaluate(() => { FX.clearCombatEffects(); Popups.clearCombatPopups(); });
  await page.evaluate(async () => {
    // Expired cached cards must not enter the existing paused DOM snapshot.
    for (let i = 0; i < 3; i++) D.PopUpDamages(E.entites[0], 40 + i, [], '', {}, 'normal');
    window.__expiredDamageCards = [...document.getElementById(`PopUp_${E.entites[0].id}`).children];
    await new Promise(done => setTimeout(done, 1800));
    G.startGame();
    for (const entity of E.entites) {
      D.PopUpDamages(entity, 128, [], '', {}, 'critical', 0, 'magicalDamage');
      U.EffectMessage(entity, 'Stun !', 'normal', { effectKey: 'stun', durationSeconds: 3 });
    }
    await new Promise(done => setTimeout(done, 180)); await P.pauseCombat();
  });
  await page.waitForFunction(() => !document.querySelector('#combat-pause-control')?.disabled);
  const readPaused = () => page.evaluate(async () => {
    const clock = await import("/js/combat/clock.js");
    return { paused: clock.isCombatPaused(), frames: [...document.querySelectorAll('.entity-visual-calibrated')].map(frame => ({ style: frame.style.cssText,
      width: frame.dataset.spriteWidth, height: frame.dataset.spriteHeight,
      hosts: [...frame.children].map(node => node.className), rows: [...frame.querySelectorAll('.life-aura-slot')].map(node => [node.dataset.life,node.style.cssText]) })),
      cards: [...document.querySelectorAll('.combat-popup-card')].map(node => ({ text: node.textContent, flight: node.dataset.flight, latest: node.dataset.latest,
      deadline: node.dataset.combatRemoveAt, animations: node.querySelector('.combat-popup-life').getAnimations().map(animation => ({ time: animation.currentTime, state: animation.playState })) })) };
  });
  const beforePause = await readPaused(); await page.waitForTimeout(200); assert.deepEqual(await readPaused(), beforePause);
  check(await page.evaluate(() => __expiredDamageCards.filter(node => !node.isConnected).length === 2
    && document.getElementById(`PopUp_${E.entites[0].id}`).children.length === 1),
    'Unused cached cards stay detached; only the active message enters the paused DOM');
  checks.push('Tactical pause freezes popup animation positions and removal deadlines');
  await page.screenshot({ path: resolve(output, 'battle-popups.png'), fullPage: true });
  await page.reload();
  await page.evaluate(async () => (await import("/js/combat/pause.js")).restorePausedCombat());
  await page.waitForFunction(async () => (await import("/js/combat/clock.js")).isCombatPaused() && document.querySelector('.combat-popup-card'));
  assert.deepEqual(await readPaused(), beforePause); checks.push('Reload restores the paused popup DOM and exact animation positions without replay');
  check(await page.evaluate(() => document.querySelector('.combat-popup-damages').children.length === 1),
    'Reload restores only the active message without old cached contents');
  checks.push('F5 retains the original host tree, calibrated dimensions and aura rows');
  await page.waitForFunction(() => !document.querySelector('#combat-pause-control')?.disabled);
  await page.evaluate(async () => (await import("/js/combat/pause.js")).resumeCombat());
  await page.waitForTimeout(1900);
  check(await page.locator('.combat-popup-card').count() === 0, 'Restored popups expire after resume even though their original callbacks no longer exist');
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), D = await import("/js/rendering/hud.js"), U = await import("/js/ui/display.js");
    const target = E.entites[0];
    for (let i = 0; i < 50; i++) { D.PopUpDamages(target, i, [], '', {}, 'critical'); U.EffectMessage(target, 'Reprise !'); }
  });
  check(await page.locator('.combat-popup-flight').count() === 8, 'New arrivals after reload retain the same bound');
  await page.evaluate(async () => (await import("/js/app/state.js")).StopGame({ preserveScene: true }));
  check(await page.locator('.combat-popup-card').count() === 0, 'Stopping combat clears both popup families');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, stressMs, comparisons, beforePause }, null, 2));
  console.log(`PASS combat popups: ${checks.length} checks; real entity creation, all text feeds, frame calibration, load bounds, no geometry polling, pause/reload/resume.`);
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  const geometry = await page.evaluate(() => [...document.querySelectorAll('.entity-visual-calibrated')].map(frame => {
    const sprite = frame.querySelector('.sprite'), chain = [];
    for (let node = sprite; node && node !== document.body; node = node.parentElement) {
      const css = getComputedStyle(node); chain.push({ className: node.className, offsetParent: node.offsetParent?.className, x: node.offsetLeft, y: node.offsetTop, transform: css.transform, translate: css.translate, width: css.width, height: css.height, left: css.left, top: css.top });
    }
    return { style: frame.style.cssText, chain };
  })).catch(() => []);
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, geometry }, null, 2));
  throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
