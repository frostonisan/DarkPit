import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const output = resolve('outputs/vfx-calibrator'); await mkdir(output, { recursive: true });
const root = resolve('docs');
const server = createServer(async (request, response) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return response.writeHead(403).end();
  try { const data = await readFile(file); response.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'})[extname(file)] || 'application/octet-stream'); response.end(data); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const checks = [], errors = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
const url = pathToFileURL(resolve('docs/index-16.html')).href;
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => errors.push(request.url()));
const select = async key => { await page.locator('#vfx-effect').selectOption(key); await page.waitForFunction(key => !vfxCalibrator.inspect().loading && vfxCalibrator.inspect().selected === key, key); };
const input = async (field, value) => { await page.locator(`#vfx-${field}-number`).fill(String(value)); };
const state = () => page.evaluate(() => vfxCalibrator.inspect());
const geometry = () => page.evaluate(() => [...document.querySelectorAll('.vfx-calibration-frame img')].map(img => {
  const css = getComputedStyle(img), box = img.getBoundingClientRect(), frame = img.closest('.effects-container').getBoundingClientRect();
  return { w: parseFloat(css.width), h: parseFloat(css.height), top: parseFloat(css.top), left: parseFloat(css.left), right: parseFloat(css.right), box: box.toJSON(), frame: frame.toJSON(), transform: css.transform };
}));
const parity = [];
let combat;
async function readVfxGeometry() {
  return [...document.querySelectorAll('.entity-visual-calibrated')].map(root => {
    const sprite=root.querySelector('.sprite'), host=root.querySelector('.effects-container'), img=host.querySelector('img');
    sprite.getAnimations().forEach(a=>{a.pause();a.currentTime=0;});
    root.querySelectorAll('.entity-size-layer,.effects-container').forEach(node=>node.getAnimations().forEach(a=>a.finish()));
    img.getAnimations().forEach(a=>{a.pause();a.currentTime=250;});
    const base=sprite.getBoundingClientRect(), rect=img.getBoundingClientRect(), unitX=base.width/Number(root.dataset.spriteWidth),unitY=base.height/Number(root.dataset.spriteHeight),css=getComputedStyle(img);
    return { x:(rect.left-base.left)/unitX,y:(rect.top-base.top)/unitY,w:rect.width/unitX,h:rect.height/unitY,
      width:css.width,height:css.height,top:css.top,left:css.left,right:css.right,bottom:css.bottom,transform:css.transform,filter:css.filter,fit:css.objectFit,
      parents:[host.parentElement.className,root.querySelector('.aura-container').parentElement.className,root.querySelector('.pop-up-txt').parentElement.className] };
  });
}
async function compareCombat(key,label) {
  const cssText=(await state()).css;
  await combat.evaluate(async ({key,cssText})=>{
    const files={indestructibility:'indestructibility.gif',astrality:'astrality.gif',resilience:'resilience-cancel.gif',ambidextry:'ambidextry.gif',esoterism:'esoterism.gif',transcendence:'transcendence.gif',bloodfuryexec:'bloodFuryExec.gif',recovery:'recovery.gif',stun:'stun.gif',mysticism:'mysticism.gif',heal:'heal-green.gif',burn:'burn.gif',poison:'poison.gif',lifesteal:'blood-loss.gif',extraLife:'life.gif',fadedLife:'fadedlife.gif',eternalLife:'eternallife.gif',dodge:'dodge.gif','death-blood':'death-blood.gif','broken-spell':'broken-spell.gif'};
    let style=document.getElementById('exported-vfx-rule');if(!style){style=document.createElement('style');style.id='exported-vfx-rule';document.head.append(style);}style.textContent=cssText;
    await Promise.all([...document.querySelectorAll('.entity-visual-calibrated .effects-container')].map(async host=>{
      const img=new Image();img.className=key==='recovery'?'recoveryGif':`effect-vfx ${key}`;
      if(key==='ambidextry')Object.assign(img.style,{top:'50%',left:'50%',transform:'translate(-50%, -50%)'});
      if(key==='mysticism')img.classList.add('mysticism-pop');
      if(key==='heal')img.classList.add('healing-feedback-vfx');
      img.src=`media/assets/effects/${files[key]}`;host.replaceChildren(img);await img.decode();
    }));
  },{key,cssText});
  const actual=await page.evaluate(readVfxGeometry), expected=await combat.evaluate(readVfxGeometry);
  let maxDifference=0;
  actual.forEach((value,index)=>{
    const reference=expected[index];
    for(const field of ['x','y','w','h']) { const delta=Math.abs(value[field]-reference[field]);maxDifference=Math.max(maxDifference,delta);assert.ok(delta<.08,`${label} ${index} ${field}: preview ${value[field]} / game ${reference[field]}`); }
    for(const field of ['width','height','top','left','right','bottom','transform','filter','fit'])assert.equal(value[field],reference[field],`${label} ${field}`);
    assert.equal(value.parents[0],'drag-box');assert.ok(value.parents[1].startsWith('animation-sprite')&&value.parents[2].startsWith('entitesContainer'));
  });
  parity.push({key,label,entities:actual.length,maxDifference});
  checks.push(`${label}: original DOM, native styles and exported CSS match real createEntiteInDOM entities`);
}
try {
  await page.addInitScript(() => {
    window.vfxProbe = { writes: 0, rect: 0, style: 0, raf: 0 };
    const write = Storage.prototype.setItem, rect = Element.prototype.getBoundingClientRect, style = window.getComputedStyle, raf = window.requestAnimationFrame;
    Storage.prototype.setItem = function (...args) { vfxProbe.writes++; return write.apply(this, args); };
    Element.prototype.getBoundingClientRect = function (...args) { vfxProbe.rect++; return rect.apply(this, args); };
    window.getComputedStyle = function (...args) { vfxProbe.style++; return style.apply(this, args); };
    window.requestAnimationFrame = function (...args) { vfxProbe.raf++; return raf.apply(this, args); };
  });
  await page.goto(url); await page.evaluate(() => vfxCalibrator.ready);
  combat = await browser.newPage({viewport:{width:1600,height:1100}});
  combat.on('pageerror',error=>errors.push(error.message));
  await combat.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await combat.evaluate(async()=>{
    const Init = await import("/js/ui/application.js");Init.createGameContainer();Init.GameUi();
    const E = await import("/js/entities/runtime.js"),C = await import("/js/rendering/entities.js");
    window.vfxBoard=await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const template=(await import("/js/data/entityTemplates.js")).entitesNest.find(e=>e.class==='mouche-asticoteuse');
    window.vfxBuildEntities=async(side='A')=>{
    document.querySelectorAll('[data-vfx-parity]').forEach(node=>node.remove());
    E.entites.length=0;window.vfxEntities=[];
    for(const [index,size] of [2,3,6].entries()) {
      const entity=E.enrichEntityStats({...structuredClone(template),id:999910+index,side,type:'sbire',role:'gueux',level:1,awakening:1,stuff:{},stats:{},modifierStats:{},baseStats:{HP:1000,extraLife:0},attacks:['autoAttack']});
      entity.sizeInCells=size;entity.statut=['alive'];entity.isDEAD=false;E.entites.push(entity);vfxEntities.push(entity);
      const anchor=document.createElement('div');anchor.dataset.vfxParity=side;anchor.style.cssText=`position:absolute;left:${200+index*400}px;top:450px;width:160px;height:140px;transform:rotateX(50deg);transform-style:preserve-3d`;document.body.append(anchor);
      const created=C.createEntiteInDOM(entity);anchor.append(created.element);await created.spriteReady;
    }
    };await vfxBuildEntities();
  });
  check(await page.evaluate(()=>document.getElementById('vfx-calibration-rules').textContent==='') && await page.locator('#vfx-copy').isDisabled(), 'Selecting an untouched effect preserves the exact game CSS');
  await compareCombat('indestructibility','Native indestructibility');
  check(await page.locator('#vfx-effect option').count() === 20, 'Twenty real game VFX are individually selectable');
  await page.locator('#vfx-loop').uncheck();
  check(await page.locator('.vfx-calibration-frame img').count() === 3, 'One preview per entity, outside the animated sprite');
  const initial = await geometry();
  check(Math.abs(initial[1].box.width / initial[0].box.width - 1.65/1.35) < .01 && Math.abs(initial[2].box.width / initial[0].box.width - 2.5/1.35) < .01, 'VFX inherit the same size factors as the entities');
  check(await page.evaluate(() => [...document.querySelectorAll('.vfx-calibration-frame')].every(frame => !frame.closest('.sprite-container') && frame.parentElement.classList.contains('drag-box') && frame.closest('.entity-visual-calibrated'))), 'VFX keep their original drag-box parent and calibrated entity scale');
  await input('top', 12.5); await input('x', 32); await input('width', 75); await input('ratio', 120); await input('cap', 80);
  let read = await state(), boxes = await geometry();
  check(boxes.every(box => Math.abs(box.top - 15) < .02 && Math.abs(box.left - 38.4) < .02 && box.w === 80 && box.h === 96), 'Top, left, proportional width, height and cap update live on every entity');
  check(read.css === await page.locator('#vfx-css').inputValue() && read.css.includes('top: 12.5% !important;') && read.css.includes('width: var(--vfx-size)') && read.css.includes('0.75'), 'Displayed CSS is exactly the applied rule');
  const leftBox = boxes[0].box;
  await page.locator('#vfx-side').selectOption('right'); boxes = await geometry();
  check(Math.abs(boxes[0].box.x - leftBox.x) < .02 && (await state()).css.includes('left: auto !important;'), 'Switching to right preserves the visible position and clears left');
  await input('x', 5); boxes = await geometry();
  check(boxes.every(box => Math.abs(box.right - 6) < .02), 'Right control is applied as an actual right offset');
  const beforeUnit = boxes[0].box;
  await page.locator('#vfx-x-unit').selectOption('px'); await page.locator('#vfx-top-unit').selectOption('px'); await page.locator('#vfx-width-unit').selectOption('px');
  boxes = await geometry();
  check(Math.abs(boxes[0].box.x - beforeUnit.x) < .02 && Math.abs(boxes[0].box.y - beforeUnit.y) < .02 && (await state()).css.includes('right: 6px'), 'Changing percent/pixel units preserves placement and size');
  const remembered = (await state()).settings.indestructibility;
  await select('ambidextry'); await input('top', 21); await input('x', 35);
  boxes = await geometry();
  check(boxes.every(box => Math.abs(box.top - 25.2) < .02 && Math.abs(box.left - 42) < .02), 'Exported CSS overrides native inline Ambidextry placement while retaining its transform');
  await compareCombat('ambidextry','Edited inline Ambidextry offsets');
  await select('indestructibility'); check(JSON.stringify((await state()).settings.indestructibility) === JSON.stringify(remembered), 'Switching effects retains each individual setting');
  check((await state()).allCss.includes('img.effect-vfx.indestructibility') && (await state()).allCss.includes('img.effect-vfx.ambidextry'), 'Combined export includes every edited effect');
  const exported = (await state()).css;
  await compareCombat('indestructibility','Edited right offset, pixel units and size cap');
  await page.evaluate(() => { window.copiedVfxCss = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedVfxCss = text; } } }); });
  await page.locator('#vfx-copy').click(); check(await page.evaluate(() => copiedVfxCss) === exported, 'Copy current rule exports the displayed CSS');
  await page.locator('#vfx-copy-all').click(); check(await page.evaluate(() => copiedVfxCss) === (await state()).allCss, 'Copy all exports both independent rules');
  await page.locator('#vfx-target').selectOption('cyan'); check(await page.locator('.vfx-calibration-frame:not([hidden])').count() === 1, 'A single entity can be isolated for calibration');
  await page.locator('#vfx-visible').uncheck(); check(await page.locator('.vfx-calibration-frame:not([hidden])').count() === 0 && !(await state()).timer, 'Hiding effects stops the replay timer');
  await page.locator('#vfx-visible').check(); await page.locator('#vfx-target').selectOption('all');
  const beforeReplay = await page.locator('.vfx-calibration-frame img').first().getAttribute('src');
  await page.locator('#vfx-replay').click();
  check(await page.locator('.vfx-calibration-frame img').first().getAttribute('src') !== beforeReplay && await page.locator('.vfx-calibration-frame img').count() === 3, 'Replay restarts fresh GIF readers without accumulating nodes');
  await page.locator('#vfx-loop').check(); const seq = (await state()).sequence;
  await page.waitForFunction(seq => vfxCalibrator.inspect().sequence > seq, seq);
  check(await page.locator('.vfx-calibration-frame img').count() === 3, 'Automatic replay remains bounded to three images');
  await page.locator('#vfx-loop').uncheck();
  const keys = await page.locator('#vfx-effect option').evaluateAll(options => options.map(option => option.value));
  for (const key of keys) {
    await select(key);
    await compareCombat(key,`${key} selected`);
    if (!(await state()).dirty.includes(key)) {
      await input('top',13.5); await input('x',24); await input('width',61); await input('ratio',125); await input('cap',83);
      await compareCombat(key,`${key} exported overrides`);
      await page.locator('#vfx-reset').click(); await page.waitForFunction(()=>!vfxCalibrator.inspect().loading);
    }
    check(await page.locator('.vfx-calibration-frame img').first().evaluate(img => img.complete && img.naturalWidth > 0) && !!(await state()).settings[key], `${key}: actual asset decodes and native CSS dimensions calibrate`);
  }
  await page.locator('#vfx-mirror').check();
  await combat.evaluate(()=>vfxBuildEntities('B'));
  await compareCombat('broken-spell','Side B keeps VFX independent of sprite mirror');
  await page.locator('#vfx-mirror').uncheck();
  await combat.evaluate(()=>vfxBuildEntities('A'));
  await page.locator('[data-size-for="yellow"]').fill('0');
  await combat.evaluate(()=>{vfxEntities[0].sizeInCells=1;vfxBoard.applyEntitySizeVisual(vfxEntities[0]);});
  await compareCombat('broken-spell','One-cell scale is the game factor 1');
  await page.locator('#reset').click();
  await combat.evaluate(()=>{vfxEntities[0].sizeInCells=2;vfxBoard.applyEntitySizeVisual(vfxEntities[0]);});
  await select('indestructibility');
  const probes = await page.evaluate(() => {
    const before = { ...vfxProbe }, slider = document.getElementById('vfx-top');
    for (let i = 0; i < 100; i++) { slider.value = String(i - 50); slider.dispatchEvent(new Event('input', { bubbles: true })); }
    return { before, after: { ...vfxProbe }, measurements: hexGroupLab.snapshot().metrics.spriteMeasurements };
  });
  check(JSON.stringify(probes.before) === JSON.stringify(probes.after) && probes.measurements === 3, 'One hundred adjustments do not read geometry, remeasure sprites, schedule animation frames or write saves');
  await page.locator('#vfx-reset').click(); await page.waitForFunction(() => !vfxCalibrator.inspect().loading);
  check(!(await state()).dirty.includes('indestructibility') && (await state()).dirty.includes('ambidextry') && (await state()).settings.indestructibility.top === -25, 'Reset restores just the chosen effect from game CSS');
  await input('top', 24); await input('width', 55); await input('cap', 100);
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'Mobile layout has no horizontal page overflow');
  await input('top', 18); check((await state()).settings.indestructibility.top === 18, 'Mobile numeric controls apply immediately');
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  check(await page.evaluate(() => vfxProbe.writes) === 0, 'The standalone tool never writes to game saves');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, parity }, null, 2));
  console.log(`PASS VFX calibrator: ${checks.length} checks, all real GIFs, live CSS, independent settings, copy, scale, replay, mobile and no save writes.`);
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors }, null, 2));
  throw error;
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
