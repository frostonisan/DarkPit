import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/critical-update');
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
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin+'/index.html');
  const checks=await page.evaluate(async()=>{
    const E=await import("/js/entities/runtime.js"),D=await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))),UI=await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const F = await import("/js/combat/attacks.js"),G = await import("/js/storage/gameStorage.js"),U = await import("/js/ui/statistics/components.js");
    const R = await import("/js/combat/attackResolution.js"),State = await import("/js/app/state.js");
    const checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
    const eq=(a,b,label)=>check(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
    window.levelRunning='worldmap';State.setGameOver(false);G.setAdminMode(true);State.refreshStageAccess();
    const sample=E.entitesNestUp.find(e=>/mouche astic/i.test(e.name));
    const e={id:989722,name:'Puissance critique audit',side:'A',type:'sbire',awakening:3,seuilUmbra:150,
      level:{current:1,max:250},attacks:['autoAttack'],stuff:{},sprite:sample.sprite,portrait:sample.portrait,
      baseStats:{HP:1000,criticalPower:50,agility:100,physicalDamage:100,piercingDamage:100}};
    const recompute=()=>E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});recompute();
    const initial=[e.stats.criticalChance,e.stats.criticalDamage];
    const battleHost=document.createElement('main');document.body.append(battleHost);
    let combatId=989730;
    const actor=(side,baseStats={})=>{
      const actor=E.enrichEntityStats({id:++combatId,name:'Critical impact',type:'sbire',side,awakening:3,level:1,role:'gueux',
        attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,...baseStats},position:`hex_${combatId}`});
      actor.isDEAD=false;actor.statut=['alive'];
      const hex=document.createElement('div');hex.className='hex Neutral occupied';hex.dataset.position=actor.position;
      hex.innerHTML=`<div id="Box_Entite_${combatId}" class="entite-box" data-position="${actor.position}"><div id="sbire_${combatId}"><div id="effectsContainer_${combatId}"></div><div id="PopDow_${combatId}"></div></div></div>`;
      battleHost.append(hex);E.entites.push(actor);return actor;
    };
    const random=Math.random;
    try {
      Math.random=()=>0;
      for(const secondary of [false,true]) {
        const attacker=actor('A',{criticalPower:1}),victim=actor('B');
        const strike={functionName:'criticalImpact',displayName:'Critical impact',combatFunction:'Attaquant',attackRange:['melee'],
          attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],executionTime:0,attacknature:[],natureEffectSecondary:secondary,
          essenceSlots:[{slotId:'impact-yellow',kind:'open',color:'yellow',essenceSource:'test'}]};
        eq(D.calculateCritDamageBonus(attacker),51,'First Puissance critique adds 1% above the native 50%');
        check(await F.resolveAttackImpact(F.createAttackFlight(attacker,victim,strike,{piercingDamage:100}))==='hit','Critical impact resolves');
        eq(1000-victim.stats.HP.current,secondary?100:151,'Actual HP loss respects critical eligibility and bonus');
      }
    }finally{Math.random=random;battleHost.remove();}

    const template=structuredClone(e.attackDetails[0]);
    const colors=[['yellow'],['red'],['yellow','blue'],['yellow','yellow','blue'],[]];
    e.attackDetails=colors.map((colors,i)=>({...structuredClone(template),functionName:`critAudit${i}`,attackKey:`critAudit${i}`,
      entityAttackId:`critAudit${i}`,displayName:`Critique ${i}`,attackRange:['range'],combatFunction:'Attaquant',
      attackTarget:['enemy'],deadTarget:['no'],effets:[],selfEffects:[],attacknature:[],physicalRatio:.5,piercingRatio:.5,
      executionTime:10000,preparationTime:0,recoveryTime:0,cooldown:0,
      essenceSlots:colors.map((color,j)=>({slotId:`crit-${j}`,kind:'open',color,essenceSource:'test'}))}));
    e.attacks=e.attackDetails.map(a=>a.functionName);e.currentAttack=e.attackDetails[0];
    const target={id:989723,stats:{HP:{max:1000,current:1000}},side:'B',isDEAD:false};
    for(let i=0;i<colors.length;i++) {
      const flight=F.createAttackFlight(e,target,e.attackDetails[i],{piercingDamage:100});
      const eligible=[0,3].includes(i);
      eq(D.calculateCritTotalChance(flight.source),eligible?initial[0]:0,'Flight preserves attack chance eligibility');
      eq(D.calculateCritDamageBonus(flight.source),eligible?initial[1]:50,'Flight preserves passive eligibility');
      e.baseStats.criticalPower=0;recompute();
      eq(D.calculateCritTotalChance(flight.source),eligible?initial[0]:0,'In-flight chance is frozen');
      eq(D.calculateCritDamageBonus(flight.source),eligible?initial[1]:50,'In-flight damage is frozen');
      e.baseStats.criticalPower=50;recompute();
    }
    G.saveToLocalStorage('selectedArmyA',[e]);G.saveToLocalStorage('equippedItems',[]);E.entites.splice(0,E.entites.length,e);window.selectedArmyA=[e];
    document.getElementById('game-shell').innerHTML='<div class="Game-helper"></div><main class="Game-UI" style="position:fixed;inset:0;background:#180606"><div class="menu-map-container"></div></main>';
    const codex=UI.createCodexEntityScan(e,document.querySelector('.menu-map-container'),`codex-entity_${e.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    const attacks=R.readAttackDefinitionsForEntity(e);
    for(let i=0;i<attacks.length;i++) {
      codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[i])}"] .attack-image`).click();
      const panel=codex.querySelector('.codex-attack-context .attack-submenu-infos');
      const chance=panel.querySelector('[data-stat="criticalChance"] .entite-stat');
      check(!!chance===[0,3].includes(i),'Attack properties show only active critical chance');
      if(chance) {
        eq(parseFloat(chance.textContent),Math.round(initial[0]*100)/100,'Property shows final chance');
        check(panel.querySelector('[data-stat="criticalDamage"] .stat-name').textContent==='Super dégât critique :','Compatible attack names its exclusive passive');
      }
    }
    codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[0])}"] .attack-image`).click();
    const panel=codex.querySelector('.codex-attack-context .attack-submenu-infos');
    const previous=structuredClone(e.stats);e.baseStats.criticalPower=12;recompute();G.saveToLocalStorage('selectedArmyA',[e]);U.syncDOMWithStats(previous,e.stats,e.id,e);
    eq(parseFloat(panel.querySelector('[data-stat="criticalChance"] .entite-stat').textContent),Math.round(e.stats.criticalChance*100)/100,'Open properties refresh without treating percentage as Umbra points');
    eq(parseFloat(panel.querySelector('[data-stat="criticalDamage"] .entite-stat').textContent),e.stats.criticalDamage,'Passive damage refreshes');
    codex.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    codex.querySelector('.section-content.stats [data-mode="stat"]').click();
    const statsPanel=codex.querySelector('.section-content.stats');
    for(const [power,name,expected] of [[10,'Super dégât critique',70],[0,'Dégâts critiques',59],[10,'Super dégât critique',70]]) {
      const old=structuredClone(e.stats);
      Object.assign(e.baseStats,{criticalPower:power,criticalChance:5,criticalDamage:9});recompute();
      G.saveToLocalStorage('selectedArmyA',[e]);U.syncDOMWithStats(old,e.stats,e.id,e);
      const rows=statsPanel.querySelectorAll('.stat-container[data-stat="criticalDamage"]');
      eq(rows.length,1,'Normal and exclusive damage use one stat row');
      check(rows[0].querySelector('.stat-name').textContent===`${name} :`,'Adding/removing the Umbra refreshes its display name');
      eq(parseFloat(rows[0].querySelector('.entite-stat').textContent.replace('+','')),expected,'Native, manual and Umbra damage merge exactly once');
      rows[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const header=document.querySelector('[data-umbra-pinned] .umbra-description')?.textContent;
      check(header?.includes(name)&&header.includes(power?'Passive exclusive de Puissance critique':'Statistique'),'Helper title follows passive activation');
      UI.closeOpenHelpers();
    }
    codex.querySelector('.codex-attacks').parentElement.click();
    for(const [index,name,expected] of [[1,'Dégâts critiques',59],[0,'Super dégât critique',70]]) {
      codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[index])}"] .attack-image`).click();
      const row=codex.querySelector('.codex-attack-context .attack-submenu-infos .stat-container[data-stat="criticalDamage"]');
      check(row.querySelector('.stat-name').textContent===`${name} :`,'Attack label follows projected Umbra compatibility');
      eq(parseFloat(row.querySelector('.entite-stat').textContent),expected,'Attack keeps the correct combined supplement');
    }
    delete e.baseStats.criticalDamage;delete e.baseStats.criticalChance;recompute();G.saveToLocalStorage('selectedArmyA',[e]);
    window.criticalAudit={e,E,D,UI};
    return checks;
  });
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>{
      const {e,UI}=criticalAudit;UI.closeOpenHelpers();
      document.getElementById('game-shell').innerHTML='<div class="Game-helper"></div><main id="audit" class="codex-entity-scan" style="position:fixed;inset:0;padding:60px;background:#190707"></main>';
      UI.createUmbraBlock(document.getElementById('audit'),'Puissance critique',()=>e.stats.criticalPower,e,'criticalPower');
      const row=document.querySelector('#audit .stat-container');UI.bindHelperEntity(row,e);row.click();
    });
    const card=page.locator('[data-umbra-pinned="true"]');await card.waitFor({state:'visible'});
    assert.equal(await card.locator('.umbra-header-name').innerText(),'Puissance critique');
    assert.match(await card.locator('.umbra-description').innerText(),/attaque d’Agilité niveau 2/);
    const passive=card.locator('[data-umbra-passive="criticalDamage"]');
    assert.match(await card.locator('.umbra-passive-heading').innerText(),/Passive exclusive/);assert.doesNotMatch(await card.innerText(),/Dégâts critiques [X+]/);
    assert.match(await passive.locator('.umbra-passive-value').innerText(),/Super dégât critique\s*:\s*11 %/);
    const toggle=passive.locator('[data-umbra-detail-toggle]');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    assert.match(await passive.locator('[data-umbra-inline-detail]').innerText(),/10 × 1,1/);
    assert.doesNotMatch(await passive.locator('[data-umbra-inline-detail]').innerText(),/50/,'Native critical damage stays outside the Umbra calculation');
    await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity)>.99);
    await card.screenshot({path:resolve(output,`critical-helper-${width}.png`)});
    await passive.locator('[data-helper-value="criticalDamageTotal"]').focus();
    const detail=page.locator('[data-umbra-detail]');await detail.waitFor({state:'visible'});
    assert.match(await detail.locator('.helper-score-total').innerText(),/Total de l’entité[\s\S]*61 %/);
    const bounds=await card.boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);
    await page.keyboard.press('Escape');
  }
  await page.goto(origin+'/index-14.html');
  const lab=await page.evaluate(()=>{
    const L=umbraLab,P=umbraProgression,state=L.initialState();state.mode='maj';state.umbras.criticalPower=50;state.attributes.agility=100;
    state.fixed.criticalChance=7;state.plus.criticalChance=3;state.fixed.criticalDamage=9;
    const rows=L.calculate(state).results;
    const settings=L.conversionSettings('criticalChance');
    const inactive=L.calculate({...state,umbras:{...state.umbras,criticalPower:0}}).results.criticalDamage;
    return {chance:rows.criticalChance.total,expected:P.criticalChanceDetails(50,100,7,3).value,
      damage:rows.criticalDamage.total,expectedDamage:59+P.criticalDamageDetails(50).value,
      damageName:rows.criticalDamage.name,inactiveDamageName:inactive.name,
      roundtrip:L.conversionPoints(L.conversionPercent(50,settings),settings)};
  });
  assert.equal(lab.chance,lab.expected);assert.equal(lab.damage,lab.expectedDamage);assert.ok(Math.abs(lab.roundtrip-50)<1e-7);
  assert.equal(lab.damageName,'Super dégât critique');assert.equal(lab.inactiveDamageName,'Dégâts critiques');
  await page.selectOption('#conversion-stat','criticalChance');
  await page.fill('#conversion-points','150');await page.fill('#conversion-percent','50');
  assert.equal(await page.locator('#conversion-percent').inputValue(),'50');
  await page.locator('[data-mode="maj"]').first().click();
  await page.locator('[data-catalog="umbras"] > summary').first().click();
  await page.locator('[data-add="umbra-criticalPower"]').first().click();
  await page.locator('input[data-group="umbras"][data-key="criticalPower"]').first().fill('50');
  await page.locator('[data-ui="curve-effect"]').first().selectOption('criticalChance');
  assert.doesNotMatch(await page.locator('[data-ratio="umbra-criticalPower"]').first().innerText(),/NaN|undefined/);
  assert.equal(await page.locator('[data-add="x-criticalDamage"]').count(),0);
  assert.equal(await page.locator('[data-add="plus-criticalDamage"]').count(),0);
  await page.screenshot({path:resolve(output,'critical-lab.png')});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'browser-report.json'),JSON.stringify({checks,lab,errors},null,2));
  console.log(`PASS: ${checks.length} critical flight/UI checks, compact desktop/mobile helpers and Index 14.`);
} finally {await browser.close();await new Promise(done=>server.close(done));}
