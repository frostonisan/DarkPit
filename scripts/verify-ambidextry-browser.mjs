import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
const root = resolve('docs'), output = resolve('outputs/ambidextry-progressive-20261126/browser');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const release = JSON.parse(await readFile('package.json', 'utf8'));
  await page.waitForFunction(version => document.querySelector('#game-version')?.textContent.includes(version), release.gameVersion);
  const fixture = await readFile('scripts/verify-umbra-helper-structure-browser.mjs', 'utf8');
  const start = fixture.indexOf('const keys = await page.evaluate(async () => {');
  const end = fixture.indexOf('  const card = page.locator', start);
  assert.ok(start >= 0 && end > start);
  await new (Object.getPrototypeOf(async function(){}).constructor)('page', fixture.slice(start, end))(page);
  const card = page.locator('.stat-hover[data-umbra-pinned="true"]:not([data-umbra-detail])');
  const detail = page.locator('[data-umbra-detail]').last();

  const ids = ['ambidextryTotalChance','ambidextryDamageBonus'];
  for(const width of [1440,1024,390]) for(const admin of [false,true]) {
    const height=width===1024?550:width===390?844:1000;
    await page.setViewportSize({width,height});
    await page.evaluate(admin=>{
      audit.G.setAdminMode(admin);
      audit.e.baseStats={HP:1000,ambidextry:150,agility:150};audit.e.modifierStats={};audit.e.seuilUmbra=150;
      audit.E.recomputeEntityStats(audit.e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});audit.show('ambidextry');
    },admin);
    await card.waitFor({state:'visible'});
    assert.equal(await page.locator('#game-version').isVisible(),true);
    assert.equal(await card.locator('.umbra-passive-icon').count(),2);
    assert.equal(await card.locator('.umbra-unique-passive [data-umbra-capacity]').count(),2);
    assert.equal(await card.locator('[data-stat-state="X"]').count(),0);
    assert.equal(await card.locator('[data-umbra-detail-toggle]').count(),admin?2:0);
    const fits=async locator=>{
      const metrics=await locator.evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('.stat-hover-body')||n;return{rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},scroll:b.scrollHeight>b.clientHeight+2||b.scrollWidth>b.clientWidth+2,overflow:getComputedStyle(b).overflowY};});
      assert.equal(metrics.scroll,false,JSON.stringify(metrics));assert.notEqual(metrics.overflow,'auto');
      assert.ok(metrics.rect.top>=-1&&metrics.rect.left>=-1&&metrics.rect.right<=width+1&&metrics.rect.bottom<=height+1,JSON.stringify(metrics));
    };
    for(const id of ids) {
      await card.locator(`[data-helper-entry="${id}"]`).first().click();await detail.waitFor({state:'visible'});
      assert.match(await detail.locator('.stat-hover-header').innerText(),/Passive exclusive/);await fits(detail);
      await card.locator('.umbra-card-ambiance').click();
      await card.locator(`[data-helper-value="${id}"]`).first().click();await detail.waitFor({state:'visible'});
      assert.equal(await detail.locator('[data-helper-technical]').count(),admin?1:0);await fits(detail);
      await card.locator('.umbra-card-ambiance').click();
    }
    if(admin) {
      const toggle=card.locator('[data-umbra-info-toggle]');
      if(await toggle.getAttribute('aria-expanded')==='true') await toggle.click();
      await toggle.click();assert.equal(await card.locator('[data-umbra-inline-detail]:visible').count(),2);
      await card.locator('[data-umbra-detail-toggle]').first().click();assert.equal(await card.locator('[data-umbra-inline-detail]:visible').count(),1);
      await toggle.click();assert.equal(await card.locator('[data-umbra-inline-detail]:visible').count(),2);
      await fits(card);
      await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);
      await page.waitForFunction(()=>[...document.querySelectorAll('[data-umbra-pinned]')].every(n=>Number(getComputedStyle(n).opacity)>=.99));
      await card.screenshot({path:resolve(output,`${width}-calculations.png`)});await toggle.click();
    }
    await fits(card);await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-umbra-pinned]')].every(n=>Number(getComputedStyle(n).opacity)>=.99));
    await card.screenshot({path:resolve(output,`${width}-${admin?'admin':'player'}.png`)});
    checks.push(`${width}: ${admin?'admin':'player'} two exclusive passives, helpers, calculations and no scrolling`);
  }
  await page.setViewportSize({width:1440,height:1000});
  const high=await page.evaluate(()=>{
    audit.e.baseStats.ambidextry=audit.e.baseStats.agility=1500;audit.e.seuilUmbra=1500;
    audit.E.recomputeEntityStats(audit.e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});audit.show('ambidextry');
    return audit.D.calculateStatsDisplay('ambidextry',audit.e).umbraPresentation.entries.map(e=>e.value);
  });
  assert.deepEqual(high.map(x=>Math.round(x*100)/100),[98.60,4898.38]);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity)>=.99);
  await card.screenshot({path:resolve(output,'1500.png')});checks.push('1500-point card matches the approved table');

  // Exercise the actual attack launcher and second-hit damage through the game's
  // isolated simulator; no replacement damage or chance formula in the fixture.
  const simulationFixture=await readFile('scripts/verify-combat-simulation-browser.mjs','utf8');
  const setupStart=simulationFixture.indexOf('  await page.evaluate(async () => {');
  const setupEnd=simulationFixture.indexOf('  const report = await page.evaluate',setupStart);
  assert.ok(setupStart>=0&&setupEnd>setupStart);
  await page.evaluate(()=>audit.H.closeOpenHelpers());
  await new (Object.getPrototypeOf(async function(){}).constructor)('page',simulationFixture.slice(setupStart,setupEnd))(page);
  const trials=await page.evaluate(async()=>{
    const trialSnapshot=structuredClone(snapshot);
    for(const [i,actor] of trialSnapshot.entities.entries()) {
      Object.assign(actor.baseStats,{HP:100000,physicalDamage:0,piercingDamage:i?0:100,ambidextry:i?0:150,agility:i?0:150,
        strength:0,intelligence:0,criticalChance:0,speed:i?60000:1000});
      actor.seuilUmbra=150;actor.stats={...actor.baseStats,HP:{current:100000,max:100000}};
      trialSnapshot.reserves[actor.id].HP={current:100000,max:100000};
      trialSnapshot.boardStats[actor.id]={...trialSnapshot.boardStats[actor.id],...actor.baseStats};
      for(const attack of actor.attackDetails) Object.assign(attack,{attacknature:['piercingDamage'],essences:['yellow'],
        essenceSlots:[{slotId:'ambi-regression',kind:'open',color:'yellow'}],physicalRatio:0,piercingRatio:1,magicalRatio:0});
    }
    const enabled=await Sim.simulateTrial(trialSnapshot,{seed:17,durationMs:8000,trace:true});
    trialSnapshot.entities[0].baseStats.ambidextry=0;trialSnapshot.entities[0].stats.ambidextry=0;
    trialSnapshot.boardStats[trialSnapshot.entities[0].id].ambidextry=0;
    const disabled=await Sim.simulateTrial(trialSnapshot,{seed:17,durationMs:8000,trace:true});
    return {enabled,disabled};
  });
  await writeFile(resolve(output,'combat-trials.json'),JSON.stringify(trials,null,2));
  const enabledHits=trials.enabled.journal.filter(row=>row.type==='damage_resolution'&&row.attacker?.id===999810);
  const secondHits=enabledHits.filter(row=>row.attack?.ambidextryHitIndex===2);
  assert.ok(secondHits.length>0,'Actual launcher produces second hits');
  for(const second of secondHits) {
    const first=enabledHits.filter(row=>row.timeMs<second.timeMs&&row.attack?.ambidextryHitIndex===1).at(-1);
    assert.ok(first,'Second hit follows an ordinary first hit');
    assert.equal(second.modifiers.critical,false);
    assert.equal(first.modifiers.critical,false);
    assert.equal(second.damage,Math.round(first.damage*1.15),'Actual second impact uses 115%');
  }
  const disabledHits=trials.disabled.journal.filter(row=>row.type==='damage_resolution'&&row.attacker?.id===999810);
  assert.ok(disabledHits.length>0,'Removing Umbra preserves normal attacks');
  assert.ok(disabledHits.every(row=>row.attack?.ambidextryHitIndex!==2),'Removing Umbra disables actual second hits');
  checks.push('Real attack launcher: second hits use 115%, normal attacks remain after Umbra removal');

  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'coverage.json'),JSON.stringify(checks,null,2));
  console.log(`Ambidextrie browser: ${checks.length} scenarios passed.`);
} catch(error) {
  if(page) await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  throw error;
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
