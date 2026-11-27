import { dismissStarterForFixture } from "./browser-test-fixture.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/vision');
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
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const checks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), D = await import("/js/combat/statistics.js");
    const F = await import("/js/combat/attacks.js"), State = await import("/js/app/state.js");
    const G = await import("/js/storage/gameStorage.js"), Focus = await import("/js/combat/minionTargeting.js");
    const P = await import('/js/items/permanentItems.js'), I = await import('/js/items/itemEffectMecanics.js');
    const results = [];
    const check = (ok, label) => { if (!ok) throw Error(label); results.push(label); };
    const eq = (a,b,label) => check(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
    window.levelRunning = 'worldmap'; State.setGameOver(false);
    G.saveToLocalStorage('ArmyB', { armies: {} });
    G.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    G.saveToLocalStorage('equippedItems', []);
    const host = document.createElement('main'); host.className = 'hex-grid'; document.body.append(host);
    const Board = await import('/js/board/controller.js');
    let id = 989600;
    const actor = (side, baseStats = {}) => {
      const e = E.enrichEntityStats({ id: ++id, name: `Vision ${id}`, type:'sbire', side, level:1, role:'gueux',
        attacks:['autoAttack'], stuff:{}, baseStats:{HP:1000,...baseStats}, position:`hex_${id}` });
      e.isDEAD=false; e.statut=['alive'];
      const hex=document.createElement('div'); hex.className='hex Neutral occupied'; hex.dataset.position=e.position;
      hex.innerHTML=`<div id="Box_Entite_${id}" class="entite-box" data-position="${e.position}"><div id="sbire_${id}"><div id="spriteContainer_${id}" class="sprite-container"><div id="Animationsprite_${id}"><div id="DragSprite_${id}"><canvas id="spriteCanvas_${id}" width="70" height="70"></canvas></div></div><div id="Cast_Animation_${id}"></div></div><div id="effectsContainer_${id}"></div><div id="PopDow_${id}"></div></div></div>`;
      host.append(hex); E.entites.push(e);
      Board.invalidateFootprintGeometry(host); Board.rebuildBoardOccupancy(host); return e;
    };
    const attack = (range, natures, extra={}) => ({ functionName:'vision-test', displayName:'Vision test', combatFunction:'Attaquant',
      attackTarget:['enemy'], deadTarget:['no'], attackRange:[range], attacknature:natures, effets:[], selfEffects:[],
      executionTime:10000, effectiveExecutionTime:10000, natureEffectSecondary:true, ...extra });
    const original = Math.random;
    try {
      const attacker=actor('A');
      const cases=[
        ['physical',['physicalDamage'],{physical:100},50], ['piercing',['piercingDamage'],{piercingDamage:100},50],
        ['inert',[],{physical:100},50], ['kinetic',['physicalDamage','piercingDamage'],{physical:60,piercingDamage:40},50],
        ['magical',['magicalDamage'],{magical:100},100], ['hybrid',['hybridalDamage'],{hybridalDamage:100},75],
        ['spectral',['magicalDamage','piercingDamage'],{magical:60,piercingDamage:40},80],
        ['prismatic',['physicalDamage','magicalDamage','piercingDamage'],{physical:20,magical:30,piercingDamage:50},100],
      ];
      for(const [label,natures,sources,expected] of cases) {
        const target=actor('B'); Math.random=()=>.9;
        const a=attack('range',natures,label==='inert'?{natureEffectSecondary:false}:{});
        check(await F.resolveAttackImpact(F.createAttackFlight(attacker,target,a,sources))==='hit',`${label} hits`);
        eq(1000-target.stats.HP.current,expected,`${label}: actual ranged damage`);
      }
      const visionary=actor('A',{vision:99});
      eq(D.calculateBullsEyePercent(visionary),50,'Vision generates 50% Bull’s Eye for combat');
      const improvedDamage={physical:75,piercing:75,inert:75,kinetic:75,magical:100,hybrid:88,spectral:90,prismatic:100};
      for(const [label,natures,sources] of cases) {
        const target=actor('B'); Math.random=()=>.9;
        const a=attack('range',natures,label==='inert'?{natureEffectSecondary:false}:{});
        check(await F.resolveAttackImpact(F.createAttackFlight(visionary,target,a,sources))==='hit',`${label}: Vision projectile hits`);
        eq(1000-target.stats.HP.current,improvedDamage[label],`${label}: Vision passive reduces only the affected damage`);
      }
      for(const [resistance,expected] of [['physicalResistance',62],['magicalResistance',50]]) {
        const target=actor('B',{[resistance]:70});Math.random=()=>.9;
        await F.resolveAttackImpact(F.createAttackFlight(attacker,target,attack('range',['hybridalDamage']),{hybridalDamage:100}));
        eq(1000-target.stats.HP.current,expected,'Hybrid keeps its original magic half through resistances');
      }
      for(const range of ['melee','range']) for(const [label,natures,sources] of cases) {
        const target=actor('B'); target.isInvisible=true;
        D.markForcedInvisibleTargetAccuracy(attacker,target);
        const flight=F.createAttackFlight(attacker,target,attack(range,natures,label==='inert'?{natureEffectSecondary:false}:{}),sources);
        D.clearForcedInvisibleTargetAccuracy(attacker,target);
        Math.random=()=>0;
        const outcome=await F.resolveAttackImpact(flight);
        check(outcome===(label==='magical'?'hit':'miss'),`${range}/${label}: invisible forced target roll, pure magic exempt`);
        if(label!=='magical') eq(target.stats.HP.current,1000,'The missed composite is fully avoided');
      }
      for(const precision of [0,1,30,150]) for(const delta of [-.000001,.000001]) {
        const source=actor('A',{precision}), target=actor('B'); target.isInvisible=true;
        D.markForcedInvisibleTargetAccuracy(source,target);
        const flight=F.createAttackFlight(source,target,attack('range',['physicalDamage']),{physical:100});
        const chance=D.calculateInvisibleTargetAvoidChance(source)/100;
        Math.random=()=>chance+delta;
        const status=await F.resolveAttackImpact(flight);
        check(status===(delta<0?'miss':'hit'),`Exact invisible threshold at Precision ${precision}`);
      }
      // Acquiring invisibility after selection does not create a new forced-target roll.
      const late=actor('B'); D.clearForcedInvisibleTargetAccuracy(attacker);
      const lateFlight=F.createAttackFlight(attacker,late,attack('range',['physicalDamage']),{physical:100});
      late.isInvisible=true; Math.random=()=>0;
      check(await F.resolveAttackImpact(lateFlight)==='hit','Already launched attack retains target');
      const visible=actor('B'); visible.isInvisible=true; D.markForcedInvisibleTargetAccuracy(attacker,visible);
      const visibleFlight=F.createAttackFlight(attacker,visible,attack('range',['physicalDamage']),{physical:100});
      visible.isInvisible=false;
      check(await F.resolveAttackImpact(visibleFlight)==='hit','No invisibility penalty after target becomes visible');
      const buffed=actor('A',{bullsEye:50}), victim=actor('B');
      const frozen=F.createAttackFlight(buffed,victim,attack('range',['physicalDamage']),{physical:100});
      buffed.baseStats.bullsEye=0; E.recomputeEntityStats(buffed,{equippedItems:[],persistEquipment:false});
      Math.random=()=>.9; await F.resolveAttackImpact(frozen);
      eq(1000-victim.stats.HP.current,75,'Projectile keeps launch-time Bull’s Eye');
      const fallen=actor('A'), survivor=actor('B');
      const remnant=F.createAttackFlight(fallen,survivor,attack('range',['hybridalDamage']),{hybridalDamage:100});
      fallen.isDEAD=true;fallen.stats.HP.current=0;Math.random=()=>.9;
      await F.resolveAttackImpact(remnant);
      eq(1000-survivor.stats.HP.current,25,'Physical hybrid remnant retains the launch-time ranged penalty');
      const precise=actor('A',{precision:150}), hidden=actor('B');hidden.isInvisible=true;
      D.markForcedInvisibleTargetAccuracy(precise,hidden);
      const preciseFlight=F.createAttackFlight(precise,hidden,attack('range',['physicalDamage']),{physical:100});
      precise.baseStats.precision=0;E.recomputeEntityStats(precise,{equippedItems:[],persistEquipment:false});Math.random=()=>.3;
      check(await F.resolveAttackImpact(preciseFlight)==='hit','Invisible-target roll keeps launch-time Precision');
      const weak=actor('B',{HP:100,occultism:1,agility:150}), alternative=actor('B'); weak.isInvisible=true;
      Math.random=()=>.95;
      check(Focus.sbireFocusEnemy(attacker,[weak,alternative],'gueux','gueux')===alternative,'High agility avoids targeting when an alternative exists');
      check(Focus.sbireFocusEnemy(attacker,[weak],'gueux','gueux')===weak,'Last invisible target remains targetable');
      check(D.shouldApplyForcedInvisibleTargetAccuracy(attacker,weak),'Last invisible target is marked');
      const detector=actor('A',{equilibre:1,agility:150});Math.random=()=>.75;
      check(Focus.sbireFocusEnemy(detector,[weak,alternative],'gueux','gueux')===weak,'Equilibre progressive perception reduces invisible targeting avoidance');
      const crystalEntity=actor('A',{vision:160});
      G.saveToLocalStorage('selectedArmyA',[crystalEntity]);
      const before=crystalEntity.stats.vision;
      const crystal=P.createUmbraCrystal({statKey:'vision',amount:20,origin:'admin-spawn'});
      check((await I.itemApplyEffect(crystalEntity,'itemPermanentStat',crystal)).ok,'Vision crystal consumed');
      eq(crystalEntity.stats.vision-before,20,'Vision crystal retains 100% above the limit');
      const reload=JSON.parse(JSON.stringify(crystalEntity));E.recomputeEntityStats(reload,{equippedItems:[],persistEquipment:false});
      eq(reload.stats.precision,crystalEntity.stats.precision,'Vision crystal generated Precision survives reload');
      eq(reload.stats.bullsEye,crystalEntity.stats.bullsEye,'Vision crystal Bull’s Eye survives reload');
    } finally { Math.random=original; host.remove(); E.entites.length=0; }
    return results;
  });
  console.log(`Vision combat: ${checks.length} checks passed.`);
  const expected = await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js"), E = await import("/js/entities/runtime.js"), S = await import("/js/entities/statSystem.js");
    const e={id:989141,name:'Vision',type:'sbire',side:'A',awakening:1,level:{current:1,max:250},attacks:['autoAttack'],stuff:{},stats:{},
      baseStats:{HP:100,vision:10,agility:10,precision:7,precisionPlus:5}};
    E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    localStorage.setItem('selectedArmyA',JSON.stringify([e]));
    const host=document.createElement('main');host.id='vision-test';host.style.cssText='position:fixed;inset:0;overflow:auto;background:#001024;z-index:1';document.body.append(host);
    UI.createCodexEntityScan(e,host,`codex-entity_${e.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const row=S.getStatSystemResult(e,'precision');
    return [row.progression.source,row.bonuses[0]].map(p=>({ratio:String(p.coefficient),raw:String(p.raw)}));
  });
  const helper=page.locator('[data-umbra-pinned="true"]');
  const waitHelper=async()=>{await helper.waitFor({state:'visible'});await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity)>=.99);};
  const precision=page.locator('#vision-test .stat-container[data-stat="precision"]').first();
  assert.match(await precision.innerText(),/51\s*%/);
  await precision.click();await waitHelper();
  assert.match((await helper.innerText()).replace(/\s+/g,' '),/Score de Précision : 39 points/);
  await page.screenshot({path:resolve(output,'precision-helper.png')});await page.keyboard.press('Escape');
  const bull=page.locator('#vision-test .stat-container[data-stat="bullsEye"]').first();
  assert.match(await bull.innerText(),/10\.3\s*%/);
  assert.match(await bull.locator('.picto-stat.bullsEye').first().evaluate(el=>getComputedStyle(el).backgroundImage),/picto-bulls-eye\.svg/);
  await bull.click();await waitHelper();assert.match((await helper.innerText()).replace(/\s+/g,' '),/Réduction du malus à distance : 10\.3 %/);
  assert.equal(await helper.locator('.umbra-description').innerText(),'Passive exclusive de Vision : Bull’s Eye');
  assert.doesNotMatch(await helper.innerText(),/Score de Bull|Conversion :/);
  await page.keyboard.press('Escape');
  await page.locator('#vision-test .section-content.stats [data-mode="umbra"]').click();
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.locator('#vision-test .stat-container[data-stat="vision"]').first().click();await waitHelper();
    await page.mouse.move(width-1,1);
    const body=(await helper.innerText()).replace(/\s+/g,' ');
    for(const p of expected) {
      const ratio = helper.locator(`[data-helper-ratio][data-ratio-value="${p.ratio}"]`).first();
      assert.equal(await ratio.innerText(), Number(p.ratio).toLocaleString('fr-FR', { minimumFractionDigits:1, maximumFractionDigits:1 }));
      await ratio.focus();
      const detail = page.locator('[data-umbra-detail]');
      await detail.waitFor({state:'visible'});
      assert.equal(await detail.locator('.helper-figure').innerText(), Number(p.ratio).toLocaleString('fr-FR', { maximumFractionDigits: 4, useGrouping: false }));
    }
    assert.ok(!body.includes('avant arrondi'));
    assert.match(body,/Bull’s Eye/);assert.ok(!/critique|undefined|NaN/i.test(body));
    assert.match(await helper.locator('[data-stat-description="vision"]').innerText(),/Confère\s*\+10/);
    assert.equal(await helper.locator('[data-umbra-inline-detail]').count(),2,'Both Vision abilities use the shared calculation layout');
    const passiveDetail=helper.locator('[data-umbra-inline-detail="bullsEyeRatio"]');
    assert.equal((await passiveDetail.innerText()).replace(/\s+/g,' '),'10 × 1,1');
    assert.equal(await passiveDetail.locator('.picto-stat.vision').count(),1);
    assert.equal(await passiveDetail.locator('.picto-stat.agility').count(),1);
    const passiveRatio=passiveDetail.locator('[data-helper-ratio]');
    assert.equal(await passiveRatio.evaluate(node=>getComputedStyle(node).borderBottomStyle),'dotted');
    await passiveRatio.locator('.picto-stat').hover();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(),'10 × 0,114');
    await page.mouse.move(width-1,1);
    await passiveRatio.focus();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(),'10 × 0,114');
    await page.screenshot({path:resolve(output,`passive-ratio-${width}.png`)});
    const totals = helper.locator('[data-umbra-section="total"] .helper-calculation-result');
    assert.deepEqual((await totals.allInnerTexts()).map(text => text.trim()), ['+ 27', '+ 10.3 %']);
    assert.equal(await helper.locator('.umbra-header-name').innerText(), 'Vision');
    assert.equal(await helper.locator('.umbra-card-totals [data-umbra-section="total"]').count(), 1);
    assert.deepEqual(await helper.locator('[data-umbra-layout="card"] > [data-umbra-capacity], [data-umbra-layout="card"] > .umbra-card-totals, [data-umbra-layout="card"] > [data-umbra-passive]').evaluateAll(nodes => nodes.map(node =>
      node.dataset.umbraPassive ? `passive:${node.dataset.umbraPassive}` : node.dataset.umbraCapacity ? `capacity:${node.dataset.umbraCapacity}` : `total:${node.querySelector('[data-umbra-summary-for]').dataset.umbraSummaryFor}`)),
      ['capacity:generatedUmbraRatio', 'total:generatedUmbraRatio', 'passive:bullsEye']);
    assert.doesNotMatch(body,/Bull’s Eye X/);
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(width-1,1);
    await helper.locator('.umbra-passive-icon').hover();
    const bullDescription=page.locator('[data-umbra-detail]');
    await page.waitForFunction(() => document.querySelector('[data-umbra-detail] .umbra-description')?.textContent === 'Passive exclusive de Vision : Bull’s Eye');
    assert.equal(await bullDescription.locator('.umbra-description').innerText(),'Passive exclusive de Vision : Bull’s Eye');
    assert.match(await bullDescription.locator('.stat-hover-body').innerText(),/Réduit la réduction des dégâts due au Malus distance sur les parties non magiques des attaques à distance/);
    assert.equal(await bullDescription.locator('span.rangeAttack:not(.picto-stat)').innerText(),'Malus distance');
    assert.match(await bullDescription.locator('.picto-stat.rangeAttack').evaluate(node=>getComputedStyle(node).backgroundImage),/picto-range\.svg/);
    assert.equal(await bullDescription.locator('span.rangeAttack:not(.picto-stat)').evaluate(node=>getComputedStyle(node).color),'rgb(255, 232, 157)');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-detail]')).opacity) >= 0.99);
    await page.screenshot({path:resolve(output,`bull-description-${width}.png`)});
    await helper.locator('.umbra-passive-icon').focus();
    assert.equal(await bullDescription.locator('.umbra-description').innerText(),'Passive exclusive de Vision : Bull’s Eye');
    assert.equal(await helper.locator('[data-helper-picto-stat="bullsEye"][data-helper-stat-state="X"], [data-helper-picto-stat="bullsEye"][data-helper-stat-state="+"]').count(),0);
    assert.equal(await helper.locator('.umbra-passive-heading').innerText(),'Passive exclusive');
    await helper.locator('.umbra-passive-heading [data-helper-source]').hover();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(),'Capacité passive exclusive à l’Umbra.');
    await page.mouse.move(width-1,1);
    await helper.locator('.umbra-passive-heading [data-helper-source]').focus();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(),'Capacité passive exclusive à l’Umbra.');
    assert.match(await helper.locator('.umbra-passive-corner').first().evaluate(el=>getComputedStyle(el).backgroundImage),/exclu-passiv-corner-agi\.png/);
    await totals.first().focus();
    assert.match(await page.locator('[data-umbra-detail] .helper-score-total').innerText(), /Total de l’entité\s*:\s*39\s*$/);
    assert.match(await page.locator('[data-umbra-detail] .helper-total-effect').innerText(), /51 %/);
    await totals.nth(1).focus();
    assert.match(await page.locator('[data-umbra-detail] .helper-score-total').innerText(), /Total de l’entité\s*:\s*10\.3 %\s*$/);
    assert.match(await page.locator('[data-umbra-detail] .helper-total-effect').innerText(), /10\.3 %/);
    await page.evaluate(() => document.activeElement?.blur());
    assert.match(await helper.locator('.picto-stat.vision').first().evaluate(el=>getComputedStyle(el).backgroundImage),/picto-vision\.svg/);
    assert.match(await helper.locator('.picto-stat.bullsEye').first().evaluate(el=>getComputedStyle(el).backgroundImage),/picto-bulls-eye\.svg/);
    assert.ok(await helper.evaluate(el=>el.scrollWidth-el.clientWidth)<=1,'Vision helper fits viewport');
    await page.screenshot({path:resolve(output,`vision-${width}.png`)});await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);
  console.log('Vision Codex and helpers: desktop/mobile checks passed.');
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
