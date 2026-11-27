import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/vivacite');
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
    const entity = { id: 986742, name: 'Vivacité', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, baseStats: { HP: 100, strength: 25, intelligence: 50, agility: 50,
        vivacite: 50, speed: 10000, charge: 3 },
      attacks: ['autoAttack'], stuff: {} };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, entity);
    G.saveToLocalStorage('selectedArmyA', [entity]); G.saveToLocalStorage('equippedItems', []);
    P.setPlayerExperience(1000000);
    const host = document.createElement('main'); host.id = 'icon-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000'; document.getElementById('game-shell').append(host);
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
    const Fx = await import("/js/combat/effects.js"),C = await import("/js/combat/clock.js");
    const D = await import("/js/combat/statistics.js"),Anim = await import("/js/rendering/animations.js");
    const E = await import("/js/entities/runtime.js");
    const checks=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
    const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} / ${b}`);
    const e=audit.entity,random=Math.random;
    try {
      e.baseStats.resilienceTotal=99;e.baseStats.alterationResistance=99;
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      let rolls=0;Math.random=()=>{rolls++;return 0;};
      e._combatAction={stage:'preparation',attack:{attackRange:['melee']}};
      Fx.applyMovementDestabilisation(e,null,'player');
      const expected=20*(1-D.calculateControlledSpeed(e)/100);
      eq(e._combatAction.preparationRecoils[0].percent,expected,'Player movement uses exclusive attenuation');
      Fx.applyMovementDestabilisation(e);
      eq(e._combatAction.preparationRecoils[1].percent,20,'Automatic movement ignores Vivacité and alteration resistance');
      Fx.applyMovementDestabilisation(e,{effectMovementRecoilPercent:30});
      eq(e._combatAction.preparationRecoils[2].percent,30,'Forced effect retains its explicit recoil');
      eq(rolls,0,'Movement is a mechanic: no alteration cancellation or random proc');
      C.freezeCombatClock();const at=C.clockNow();
      Anim.notifyProjectileTargetMoved(e,null,'player');
      const saved=C.combatData(e._combatAction);
      eq(saved.preparationRecoils.at(-1).percent,expected,'Paused recoil persists with full precision');
      eq(saved.preparationRecoils.at(-1).at,at,'Paused recoil uses frozen combat time');
      delete e._combatAction;e._combatAction=JSON.parse(JSON.stringify(saved));
      C.resumeCombatClock();
      eq(e._combatAction.preparationRecoils.length,4,'Snapshot restoration does not replay recoil');
      e._combatAction={stage:'transport',attack:{attackRange:['melee']}};e.executionRecoils=[];
      Fx.applyMovementDestabilisation(e,null,'player');
      eq(e.executionRecoils[0].percent,expected,'Melee execution receives the same attenuation');
      e._combatAction={stage:'transport',attack:{attackRange:['ranged']}};
      ok(!Fx.applyMovementDestabilisation(e,null,'player'),'Flying projectile execution is not rewound');
      e._combatAction={stage:'speed',attack:{}};
      ok(!Fx.applyMovementDestabilisation(e,null,'player'),'ATB is not rewound by movement');
      e.baseStats.vivacite=0;E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
      e._combatAction={stage:'preparation',attack:{attackRange:['melee']}};
      Fx.applyMovementDestabilisation(e,null,'player');
      eq(e._combatAction.preparationRecoils[0].percent,20,'No Vivacité means ordinary recoil');
    } finally {
      Math.random=random;C.resumeCombatClock();delete e._combatAction;delete e.executionRecoils;
      delete e.baseStats.resilienceTotal;delete e.baseStats.alterationResistance;e.baseStats.vivacite=50;
      E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    }
    return checks;
  }));
  const root=page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
  await page.evaluate(()=>{audit.mode('Stats');audit.open('vivacite');});
  await root.waitFor({state:'visible'});
  assert.equal(await root.locator('[data-umbra-passive="controlledSpeed"]').count(),1);
  assert.equal(await root.locator('[data-umbra-capacity="agileRetreat"]').count(),1);
  assert.match(await root.locator('.umbra-description').innerText(),/Agilité.*niveau 2/i);
  assert.match(await root.innerText(),/Vélocité\s+X[\s\S]*Retraite agile[\s\S]*Vitesse contrôlée/);
  assert.equal(await page.evaluate(()=>audit.UI.calculateStatsDisplay('velocity',audit.entity).velocityAdjustedSpeedMs),6501,'Entity timing remains available in the statistic helper');
  assert.equal(await root.locator('.umbra-timing').count(),0,'Entity turn duration stays outside the Umbra card');
  const width=await root.evaluate(e=>e.getBoundingClientRect().width);
  await root.locator('[data-umbra-detail-toggle]').first().click();
  assert.ok(await root.evaluate((e,width)=>e.getBoundingClientRect().width>=width&&e.scrollWidth<=e.clientWidth+2,width),'Expanded calculation remains readable without horizontal overflow');
  assert.doesNotMatch(await root.innerText(),/NaN|undefined/);
  if(await root.locator('[data-umbra-detail-toggle]').first().getAttribute('aria-expanded')!=='true')await root.locator('[data-umbra-detail-toggle]').first().click();
  await page.mouse.move(2,2);await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail])')).opacity==='1');
  await root.screenshot({path:resolve(output,'vivacite-card.png')});
  await root.locator('[data-helper-ratio]').filter({visible:true}).first().hover();
  await page.locator('[data-umbra-detail]').first().waitFor({state:'visible'});
  await page.mouse.move(2,2);
  await root.locator('[data-umbra-capacity="agileRetreat"] [data-helper-picto-stat="agileRetreat"]').first().click();
  await page.locator('[data-umbra-detail][data-helper-picto-subject="agileRetreat"]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-umbra-detail][data-helper-picto-subject="agileRetreat"]').innerText(),/Augmente.*retraite.*Vélocité/);
  checks.push('Card: ordered Umbra contributions, exclusive passive, entity timing in statistic helper, bounded layout and precise ratio hover');
  await page.evaluate(()=>audit.mode('Stats','stat'));
  for(const key of ['velocity','controlledSpeed','agileRetreat'])assert.ok(await page.locator(`#icon-audit .stat-container[data-stat="${key}"]`).filter({visible:true}).count(),key);
  await page.evaluate(()=>{audit.mode('Level up');audit.open('vivacite');});
  assert.equal(await root.locator('[data-umbra-passive="controlledSpeed"]').count(),1);
  checks.push('Codex and level-up expose the final values and the same card');
  const lab=await browser.newPage();lab.on('pageerror',error=>errors.push(error.message));
  await lab.goto(`http://127.0.0.1:${server.address().port}/index-14.html`);
  await lab.locator('[data-catalog="umbras"]>summary').click();
  await lab.locator('[data-add="umbra-vivacite"]').click();
  await lab.locator('input[data-group="umbras"][data-key="vivacite"]').fill('50');
  await lab.locator('input[data-group="attributes"][data-key="agility"]').fill('50');
  assert.match(await lab.locator('[data-umbra-breakdown="velocity"]').innerText(),/34[.,]990717/);
  assert.match(await lab.locator('[data-umbra-breakdown="velocity"]').innerText(),/Retraite agile/);
  await lab.locator('#mode-current').click();await lab.locator('#mode-maj').click();
  assert.equal(await lab.locator('input[data-group="umbras"][data-key="vivacite"]').inputValue(),'50');
  assert.match(await lab.locator('[data-umbra-breakdown="velocity"]').innerText(),/34[.,]990717/);
  for(const [key,limit] of [['velocity',65],['controlledSpeed',99]]){
    await lab.locator('#conversion-stat').selectOption(key);
    assert.equal(await lab.locator('#conversion-limit').inputValue(),String(limit));
    await lab.locator('#conversion-agility').fill('50');await lab.locator('#conversion-points').fill('50');
    assert.match(await lab.locator('#conversion-result').innerText(),/Vivacité/);
    assert.doesNotMatch(await lab.locator('#conversion-result').innerText(),/NaN|undefined/);
  }
  checks.push('Index 14: both conversion curves and values update live');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-checks.json'),JSON.stringify(checks,null,2));
  console.log('PASS:\n'+checks.join('\n'));
} finally {await browser.close();await new Promise(done=>server.close(done));}
