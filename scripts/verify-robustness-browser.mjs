import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/robustesse');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), P = await import("/js/entities/progression.js");
    const State = await import("/js/app/state.js");
    window.levelRunning = 'worldmap'; G.setAdminMode(true); State.refreshStageAccess();
    const entity = { id: 986742, name: 'Robustesse', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, baseStats: { HP: 100, strength: 50, intelligence: 50, agility: 50,
        robustness: 50, armor: 5, armorPlus: 7, speed: 10000, charge: 3 },
      attacks: ['autoAttack'], stuff: {} };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, entity);
    G.saveToLocalStorage('selectedArmyA', [entity]); G.saveToLocalStorage('equippedItems', []);
    P.setPlayerExperience(1000000);
    const host = document.createElement('main'); host.id = 'icon-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000'; document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    window.audit = { UI, host, entity,
      mode(mode, kind = 'umbra') {
        UI.closeOpenHelpers();
        host.querySelector(`.codex-inner-menu:has(.codex-${mode === 'Stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'Stats') host.querySelector(`.section-content.stats [data-mode="${kind}"]`).click();
      },
      open(key) {
        UI.closeOpenHelpers();
        const row = [...host.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(node => node.getClientRects().length);
        if (!row) throw Error('Missing visible row: ' + key);
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    };
  });
  checks.push(...await page.evaluate(async()=>{
    const E = await import("/js/entities/runtime.js"),A=await import('/js/items/armor.js'),G = await import("/js/storage/gameStorage.js");
    const Updates = await import("/js/storage/entityStorage.js");
    const e=audit.entity,dead=structuredClone(e);dead.id++;dead.stats.HP.current=0;
    A.destroyEntityArmor(dead);A.consumeEntityArmor(e,80);
    const gear={serial:'i42',itemId:'i42-solar',equippedId:'e-solar',equippedTo:e.id,itemType:['stuff'],
      Stuffeffets:[{type:'stat-buff',stat:'armor',value:80}],armorReserve:{current:30,max:80}};
    e.stuff={slot1:[gear.equippedId]};E.recomputeEntityStats(e,{equippedItems:[gear],persistEquipment:false,skipReverseArchetype:true});
    A.grantEntityExternalArmor(e,15);
    const remaining=e.armorLayers.robustness.current;
    G.saveToLocalStorage('selectedArmyA',[e,dead]);G.saveToLocalStorage('ArmyB',{armies:{test:{entities:[structuredClone(dead)]}}});
    Updates.resetStoredArmorCurrentToMax();
    const [living,d]=G.loadFromLocalStorage('selectedArmyA');
    const ok=(v,msg)=>{if(!v)throw Error(msg);};
    ok(living.armorLayers.robustness.current===164,'Dawn restores full solar capacity');
    ok(living.armorLayers.stuff[gear.equippedId].current===30,'Dawn preserves worn equipment');
    ok(living.armorLayers.spell.current===15,'Dawn preserves spell reserve');
    ok(living.armorLayers.external.current===0,'Dawn does not refill standalone armor');
    ok(d.stats.armor.current===0&&G.loadFromLocalStorage('ArmyB').armies.test.entities[0].stats.armor.current===0,'Dead entities do not refill');
    ok(e.armorLayers.robustness.current===remaining,'Stored dawn processing does not mutate unrelated live object');
    return ['Daily recharge: living only, equipment/spell/direct reserves preserved'];
  }));
  const root=page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
  await page.evaluate(()=>{audit.mode('Stats');audit.open('robustness');});
  await root.waitFor({state:'visible'});
  assert.equal(await root.locator('[data-umbra-passive="solarArmor"]').count(),1);
  assert.match(await root.locator('.umbra-description').innerText(),/défense.*Force.*niveau 2/i);
  assert.match(await root.innerText(),/Armure\s+X[\s\S]*Passive exclusive[\s\S]*Armure solaire/);
  assert.match(await root.locator('[data-umbra-section="introduction"]').innerText(),/50[\s\S]*50/);
  assert.equal(Number((await root.locator('.umbra-card-total .helper-calculation-result').innerText()).replace('+','').trim()),164);
  const armorTotal=await page.evaluate(()=>audit.entity.stats.armor.totalMax);
  assert.ok((await root.locator('[data-armor-reserve]').innerText()).includes(String(armorTotal)));
  await root.locator('.umbra-card-total .helper-calculation-result').hover();
  await page.locator('[data-umbra-detail]').first().waitFor({state:'visible'});
  assert.ok((await page.locator('[data-umbra-detail]').first().innerText()).includes(String(armorTotal)),'Hover includes all armor sources');
  await page.evaluate(()=>{audit.UI.closeOpenHelpers();audit.open('robustness');});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    const before=await root.evaluate(e=>e.getBoundingClientRect().width);
    await root.locator('[data-umbra-detail-toggle]').first().click();
    assert.equal(await root.evaluate(e=>e.getBoundingClientRect().width),before,'Expanding calculation does not grow card');
    assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+2),'No horizontal overflow');
    if(await root.locator('[data-umbra-detail-toggle]').first().getAttribute('aria-expanded')!=='true')await root.locator('[data-umbra-detail-toggle]').first().click();
    await page.mouse.move(2,2);await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail])')).opacity)>=.99);
    await root.screenshot({path:resolve(output,`robustesse-${width}.png`)});
  }
  await root.locator('[data-helper-ratio]').first().hover();await page.locator('[data-umbra-detail]').first().waitFor({state:'visible'});
  assert.match(await page.locator('[data-umbra-detail]').first().innerText(),/Ratio réel/);
  await page.evaluate(()=>{audit.UI.closeOpenHelpers();audit.open('robustness');});
  await root.locator('[data-umbra-passive="solarArmor"] [data-helper-picto-stat="solarArmor"]').first().click();
  await page.locator('[data-umbra-detail][data-helper-picto-subject="solarArmor"]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-umbra-detail][data-helper-picto-subject="solarArmor"]').innerText(),/vivante/);
  await page.evaluate(()=>{audit.mode('Level up');audit.open('robustness');});
  assert.equal(await root.locator('[data-umbra-passive="solarArmor"]').count(),1);
  checks.push('Codex / level-up card, nested precise ratios, solar helper and mobile layout');
  const lab=await browser.newPage();lab.on('pageerror',error=>errors.push(error.message));
  await lab.goto(`http://127.0.0.1:${server.address().port}/index-14.html`);
  await lab.locator('[data-catalog="umbras"]>summary').click();await lab.locator('[data-add="umbra-robustness"]').click();
  await lab.locator('input[data-group="umbras"][data-key="robustness"]').fill('50');
  await lab.locator('input[data-group="attributes"][data-key="strength"]').fill('50');
  await lab.locator('#mode-maj').click();
  assert.match(await lab.locator('[data-umbra-breakdown="armor"]').innerText(),/164/);
  assert.match(await lab.locator('[data-passive="solarArmor"]').innerText(),/vivante/);
  assert.equal(await lab.locator('[data-base-group="umbraBases"][data-base-effect="armor"]').inputValue(),'1');
  assert.equal(await lab.locator('[data-base-group="attributeBases"][data-base-effect="armor"]').inputValue(),'0.5');
  await lab.locator('#mode-current').click();assert.match(await lab.locator('[data-contribution-stat="armor"]').innerText(),/441/);
  await lab.locator('#mode-maj').click();assert.match(await lab.locator('[data-umbra-breakdown="armor"]').innerText(),/164/);
  assert.equal(await lab.locator('input[data-group="umbras"][data-key="robustness"]').inputValue(),'50');
  await lab.screenshot({path:resolve(output,'robustesse-index14.png'),fullPage:true});
  checks.push('Index 14: live Maj, historical comparison, shared settings and retained inputs');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,errors},null,2));
  console.log(`Robustesse browser: ${checks.length} groups passed.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
