import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/equilibre-presence-2026-11-27/browser');
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
  page.setDefaultTimeout(10000);
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), P = await import("/js/entities/progression.js");
    const State = await import("/js/app/state.js");
    window.levelRunning = 'worldmap'; G.setAdminMode(true); State.refreshStageAccess();
    const entity = { id: 986742, name: 'Équilibre', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, baseStats: { HP: 100, strength: 25, intelligence: 50, agility: 50,
        equilibre: 50, charge: 3 },
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
    const D = await import("/js/combat/statistics.js"), L = await import("/js/combat/lordTurn.js"), F = await import("/js/combat/minionTargeting.js");
    const checks=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
    const e=audit.entity,random=Math.random;
    try {
      e.currentAttack={};
      const chance=D.calculateEquilibreAttackChance(e);
      for(const [roll,success] of [[0,true],[chance/100-1e-8,true],[chance/100+1e-8,false],[.4,false]]) {
        Math.random=()=>roll;
        const result=D.attemptEquilibreAttack(e);
        ok(result.success===success&&e.attackBalancedNoAggro===success&&e.currentAttack.isBalancedNoAggro===success,'Actual balanced attack proc and flags');
      }
      const attacker={id:981100,name:'Lord',stats:{},role:['lord']};
      const balanced={...e,id:981101,name:'Balanced',role:['gueux'],totalDamage:100};
      const ordinary={id:981102,name:'Ordinary',role:['gueux'],stats:{HP:1000},totalDamage:110};
      let selected; L.lordEnemyTarget([balanced,ordinary],[],v=>selected=v,attacker);
      ok(selected===ordinary,'Actual lord targeting discounts balanced damage aggro');
      const choose=(a,b)=>{let chosen;L.lordEnemyTarget([a,b],[],v=>chosen=v,attacker);return chosen;};
      const source={id:981110,name:'Presence',role:[],stats:{HP:1000,equilibreAggroBonus:50,equilibreAggroReduction:20},totalAggroDamage:100,totalDamage:900,totalHeal:10,kills:2};
      const expected=((100*.8)+(10*1.1)+(2*2))*1.5;
      const rival=score=>({id:981111,name:'Rival',role:[],stats:{HP:1000},totalDamage:score});
      ok(choose(source,rival(expected-.001))===source,'Presence multiplies damage, healing and kills exactly once');
      ok(choose(source,rival(expected+.001)).name==='Rival','Reduction precedes presence; no other damage counted');
      source.totalAggroDamage=0;source.totalHeal=0;source.kills=0;
      ok(choose(source,rival(.001)).name==='Rival','Balanced damage stays zero even with presence');
      source.totalHeal=10;
      ok(choose(source,rival(16.49))===source,'Healing alone benefits from presence');
      source.totalHeal=0;source.kills=1;
      ok(choose(source,rival(2.99))===source,'Kills alone benefit from presence');
      source.role=['tank'];
      ok(choose(source,rival(4.79))===source,'Tank role still multiplies presence');
      source.stats.equilibreAggroBonus=0;
      ok(choose(source,rival(4.79)).name==='Rival','Live source change takes effect at next targeting');
      const invisible={id:981103,name:'Invisible',stats:{HP:100,occultism:1,agility:0},role:['gueux'],isInvisible:true,occultismInvisible:true};
      const alternative={...ordinary,stats:{HP:1000}};
      Math.random=()=>0;
      const seer={id:981104,name:'Seer',stats:{equilibreInvisibleDetection:99},role:['gueux']};
      ok(D.calculateEquilibreInvisibleDetection(seer)>D.calculateOccultismTargetableChanceDisplay(invisible),'Perception exceeds invisible avoidance in this fixture');
      const target=F.sbireFocusEnemy(seer,[invisible,alternative],['gueux'],['gueux']);
      ok(target===invisible,'Actual invisible targeting never has negative avoidance');
    } finally {Math.random=random;}
    return checks;
  }));
  const root=page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
  await page.evaluate(()=>{audit.mode('Stats');audit.open('equilibre');});
  await root.waitFor({state:'visible'});
  assert.equal(await root.locator('.umbra-effect-row').count(),4);
  assert.equal(await root.locator('[data-umbra-passive="equilibreBalancedAttackChance"]').count(),1);
  assert.match(await root.locator('.umbra-description').innerText(),/Intelligence.*niveau 2/i);
  const geometry=await root.evaluate(node=>({width:node.getBoundingClientRect().width,
    icon:getComputedStyle(node.querySelector('.picto-stat.equilibreAggroBonus')).backgroundImage}));
  assert.match(geometry.icon,/picto-aggro/);
  assert.doesNotMatch(await root.innerText(),/Total de l’entité|NaN|undefined/);
  checks.push('Four effects, Presence pictogram, source-only card and exclusive passive');
  // Opening calculation details must not widen the card.
  const toggle=root.locator('[data-umbra-detail-toggle]').first();await toggle.click();
  const width=await root.evaluate(node=>node.getBoundingClientRect().width);assert.equal(width,geometry.width);
  await toggle.click();assert.equal(await root.evaluate(node=>node.getBoundingClientRect().width),width);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail])')).opacity==='1');
  await page.mouse.move(2,2);
  await page.evaluate(()=>document.fonts.ready);
  await root.screenshot({path:resolve(output,'equilibre-card.png')});
  const ratio=root.locator('[data-helper-ratio]').first();
  assert.ok(await ratio.count());
  await toggle.click();
  await ratio.hover();await page.locator('[data-umbra-detail]').first().waitFor({state:'visible'});
  await page.mouse.move(2,2);
  await root.locator('[data-helper-entry="equilibreInvisibleDetectionUmbraGrant"]').first().click();
  const perception=page.locator('[data-umbra-detail]').last();
  await perception.waitFor({state:'visible'});
  assert.match(await perception.innerText(),/évitement.*invisibles/);
  checks.push('Precise ratio hover and pinned perception subhelper');
  checks.push('Opening calculations preserves width');
  // Every requested stat retains its real total and pictogram in the Codex.
  await page.evaluate(()=>audit.mode('Stats','stat'));
  for(const key of ['equilibreAggroBonus','equilibreAggroReduction','equilibreInvisibleDetection','equilibreBalancedAttackChance']) {
    const row=page.locator(`#icon-audit .stat-container[data-stat="${key}"]`).filter({visible:true});
    assert.ok(await row.count(),`Codex row: ${key}`);
  }
  checks.push('All four stats appear in Codex');
  await page.evaluate(()=>{audit.mode('Level up');audit.open('equilibre');});
  assert.equal(await root.locator('[data-umbra-passive="equilibreBalancedAttackChance"]').count(),1);
  checks.push('Level up retains the same card and passive');
  // Source total, separate entity total, individual calculation preference and portrait layout.
  await page.evaluate(async()=>{
    const E=await import('/js/entities/runtime.js');
    audit.entity.baseStats.equilibreAggroBonus=7;audit.entity.baseStats.equilibreAggroBonusPlus=5;
    E.recomputeEntityStats(audit.entity,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    const G=await import('/js/storage/gameStorage.js');G.saveToLocalStorage('selectedArmyA',[audit.entity]);
    audit.UI.closeOpenHelpers();audit.host.replaceChildren();
    audit.UI.createCodexEntityScan(audit.entity,audit.host,`codex-entity_${audit.entity.id}`);
    audit.mode('Stats');audit.open('equilibre');
  });
  const presence=root.locator('[data-umbra-capacity="equilibreAggroBonusUmbraGrant"]');
  const amount=presence.locator('[data-helper-value] .helper-figure').first();
  const number=text=>Number(text.replace(/[^0-9.−-]/g,'').replace('−','-'));
  const expected=await page.evaluate(()=>{
    const d=audit.UI.calculateStatsDisplay('equilibre',audit.entity);
    const e=d.umbraPresentation.entries.find(e=>e.stat==='equilibreAggroBonus');return {own:e.value,total:e.total.value};
  });
  assert.equal(number(await amount.innerText()),Math.round(expected.own*100)/100);
  await amount.click();
  const detail=page.locator('[data-umbra-detail]').last();await detail.locator('.helper-score-total').waitFor({state:'visible'});
  assert.equal(number(await detail.locator('.helper-score-total .helper-figure').innerText()),Math.round(expected.total*100)/100);
  await page.keyboard.press('Escape');
  const presenceToggle=presence.locator('[data-umbra-detail-toggle]');await presenceToggle.click();
  assert.equal(await presenceToggle.getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>audit.open('equilibre'));
  assert.equal(await presenceToggle.getAttribute('aria-expanded'),'true');
  assert.equal(await root.locator('[data-umbra-capacity="equilibreInvisibleDetectionUmbraGrant"] [data-umbra-detail-toggle]').getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>audit.open('equilibre'));
  await root.waitFor({state:'visible'});
  assert.ok(await root.evaluate(n=>n.scrollWidth<=n.clientWidth+2),'Portrait card has no horizontal overflow');
  const formula=presence.locator('[data-umbra-inline-detail]');
  assert.ok(await formula.isVisible());
  assert.equal(await formula.evaluate(n=>getComputedStyle(n).textAlign),'center');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail])')).opacity==='1');
  await root.screenshot({path:resolve(output,'equilibre-mobile.png')});
  await page.evaluate(()=>{audit.UI.closeOpenHelpers();});
  const version=page.locator('#game-version');assert.match(await version.innerText(),/0.92.6-dev/);
  assert.ok(await version.isVisible(),'Current version remains visible on mobile');
  checks.push('External totals, saved per-effect calculations, centered formulas and mobile layout');
  const lab=await browser.newPage();lab.on('pageerror',error=>errors.push(error.message));
  await lab.goto(`http://127.0.0.1:${server.address().port}/index-14.html`);
  for(const [key,limit] of [['equilibreAggroBonus',99],['equilibreAggroReduction',60],['equilibreInvisibleDetection',99],['equilibreBalancedAttackChance',40]]){
    await lab.locator('#conversion-stat').selectOption(key);
    assert.equal(await lab.locator('#conversion-limit').inputValue(),String(limit));
    await lab.locator('#conversion-agility').fill('50');await lab.locator('#conversion-points').fill('50');
    assert.match(await lab.locator('#conversion-result').innerText(),/Équilibre/);
    assert.doesNotMatch(await lab.locator('#conversion-result').innerText(),/NaN|undefined/);
  }
  checks.push('Index 14 displays the four configured curves live');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-checks.json'),JSON.stringify(checks,null,2));
  console.log('PASS:\n'+checks.join('\n'));
} finally {await browser.close();await new Promise(done=>server.close(done));}
