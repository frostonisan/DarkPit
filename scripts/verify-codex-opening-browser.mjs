import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/codex-opening');
await mkdir(output, { recursive: true });
const probes = {
  "/js/ui/codex/index.js": [
    ['function  createCodexEntityScan(entite, container, codexId, positionClass = \'\') {', 'buildCodex'],
    ['function EntityCodexDetails(entiteId, shiftKey = false) {', 'openCodexHandler'],
  ],
  "/js/ui/statistics/details.js": [
    ['export function calculateStatsDisplay(statKey, entite, statValue, options = {}) {', 'displayStat', 'statKey'],
  ],
  "/js/combat/statistics.js": [
    ['export function getStatContributions(entity, stat, { resolveLabels = true, includePreview = false, includePlus = false } = {}) {', 'statContributions'],
  ],
  "/js/entities/runtime.js": [
    ['export function getStatSystemInputs(entity, { preview = true, combat = true } = {}) {', 'statInputs'],
  ],
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(path));
  if (relative(root, file).startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    let content = await readFile(file);
    if (probes[path]) {
      content = content.toString();
      for (const [needle, name, arg] of probes[path]) {
        if (!content.includes(needle)) throw Error('Probe missing: ' + name);
        content = content.replace(needle, needle + `\nglobalThis.__codexProbe?.record('${name}'${arg ? ', ' + arg : ''});\n`);
      }
    }
    res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch (e) { res.writeHead(404).end(String(e)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const fixture = await page.evaluate(async () => {
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const G = await import("/js/app/state.js");
    window.levelRunning = 'worldmap'; G.setGameOver(false);
    const template = E.entitesNestUp.find(e=>/mouche astic/i.test(e.name)) || E.entitesNestUp.find(e=>e.type==='sbire');
    const actor = structuredClone(template);
    actor.id = 999761; actor.side = 'A';
    const actors = [actor, ...[1,2].map(offset => ({...structuredClone(actor),id:actor.id+offset}))];
    S.saveToLocalStorage('selectedArmyA', actors); window.selectedArmyA = actors;
    E.entites.splice(0,E.entites.length,...actors);
    UI.createGameContainer(); UI.GameUi();
    document.querySelectorAll('.entitylootContainer,#black-overlay').forEach(n=>n.remove());
    const icons = document.querySelector('.menu-player-icons');
    UI.PlayerArmyCodex(icons);
    icons.querySelector('.army-codex-icon').click();
    window.__fixture={UI,S,E,actor,actors};
    window.__codexProbe={active:false,counts:{},stats:{},record(name,stat){
      if(!this.active)return; this.counts[name]=(this.counts[name]||0)+1;
      if(stat)this.stats[stat]=(this.stats[stat]||0)+1;
    }};
    return {name:actor.name,statKeys:Object.keys(actor.stats||{}).length,attacks:actor.attackDetails?.length,entries:document.querySelectorAll('.codex-entity-list').length};
  });
  const measure = async (mode, menu) => page.evaluate(async ({mode,menu}) => {
    const {UI,S,actor}=window.__fixture;
    document.querySelectorAll('.codex-entity-scan').forEach(n=>n.remove());
    S.saveToLocalStorage('CodexMenuIndex',menu); S.saveToLocalStorage('CodexSubstatMode','umbra');
    const probe=window.__codexProbe; probe.counts={};probe.stats={};probe.active=true;
    const start=performance.now();
    if(mode==='click')document.getElementById('CodexEntityList_'+actor.id).querySelector('img').click();
    else UI.EntityCodexDetails(actor.id);
    const syncMs=performance.now()-start;
    const immediateCounts={...probe.counts},immediateStats={...probe.stats};
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const frameMs=performance.now()-start;
    probe.active=false;
    const codex=document.querySelector('.codex-entity-scan');
    return {mode,menu,syncMs,frameMs,counts:immediateCounts,stats:immediateStats,open:!!codex,nodes:codex?.querySelectorAll('*').length,statsPanels:codex?[...codex.querySelectorAll('.codex-attack-stat-block,.codex-substat-container')].map(n=>({class:n.className,display:getComputedStyle(n).display,nodes:n.querySelectorAll('*').length})):[]};
  }, {mode,menu});
  const results=[];
  for(const menu of [1,3])for(const mode of ['click','direct','click','direct'])results.push(await measure(mode,menu));
  for (const result of results) {
    assert.equal(result.counts.openCodexHandler,1,'A single handler per opening');
    assert.equal(result.counts.buildCodex,1,'A single Codex construction per opening');
    assert.ok(result.open,'The thumbnail leaves its Codex open');
    assert.ok(result.counts.statInputs < 300,'Repeated reads stay below the old thousands of preparations');
    if(result.menu===3) assert.equal(result.statsPanels.find(panel=>panel.display==='none').nodes,0,'Hidden statistics are not constructed');
  }
  const checks = await page.evaluate(async () => {
    const {UI,S,E,actor,actors}=window.__fixture;
    const D = await import("/js/combat/statistics.js"),System = await import("/js/entities/statSystem.js");
    const checks=[];
    const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
    const click=(id,shiftKey=false)=>document.getElementById('CodexEntityList_'+id).querySelector('img').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey}));
    const codices=()=>[...document.querySelectorAll('.codex-entity-scan')];
    click(actor.id);check(codices().length===0,'Second click closes once');
    click(actor.id);click(actors[1].id,true);
    check(codices().length===2&&codices().every(node=>node.classList.contains('dual-view')),'Shift-click opens comparison');
    click(actors[1].id,true);check(codices().length===2,'Shift-click on an open entity is stable');
    click(actors[2].id,true);
    check(codices().length===2&&codices().find(node=>node.classList.contains('left'))?.id===`codex-entity_${actors[1].id}`
      &&codices().find(node=>node.classList.contains('right'))?.id===`codex-entity_${actors[2].id}`,'Third comparison keeps the two newest entities');
    click(actor.id);check(codices().length===1&&codices()[0].id===`codex-entity_${actor.id}`,'Normal click exits comparison');
    const card=codices()[0];
    check(card.querySelector('.codex-attack-stat-block').childElementCount===0,'Statistics remain deferred while Umbras are selected');
    const latest=structuredClone(actor);latest.baseStats.physicalDamage=1234;
    E.recomputeEntityStats(latest,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
    S.saveToLocalStorage('selectedArmyA',[latest,...actors.slice(1)]);window.selectedArmyA=[latest,...actors.slice(1)];
    card.querySelector('.section-content.stats [data-mode="stat"]').click();
    const shown=Number(card.querySelector('.codex-attack-stat-block [data-stat="physicalDamage"] .entite-stat').textContent);
    check(shown===D.getSafe(latest,'physicalDamage'),'Deferred panel reads changes made since opening');
    const content=card.querySelector('.codex-attack-stat-block').firstElementChild;
    card.querySelector('.section-content.stats [data-mode="umbra"]').click();
    card.querySelector('.section-content.stats [data-mode="stat"]').click();
    check(content===card.querySelector('.codex-attack-stat-block').firstElementChild,'Switching modes preserves existing panels');
    card.querySelector('.codex-inner-menu .codex-stat').parentElement.click();
    card.querySelector('.section-content.stats [data-mode="umbra"]').click();
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    check(card.querySelector('.section-content.stats [data-mode="umbra"]').classList.contains('active'),'A quick tab choice is never replaced by deferred navigation restoration');
    for(const icon of ['codex-profil','codex-attacks','codex-stat','codex-soul','codex-lore']) {
      card.querySelector('.codex-inner-menu .'+icon).parentElement.click();
      check(!!card.querySelector('.section-content'),'Section opens: '+icon);
    }
    card.querySelector('.close-button').click();UI.closePlayerArmyCodex();
    document.querySelector('.army-codex-icon').click();
    const probe=window.__codexProbe;probe.counts={};probe.active=true;click(actor.id);probe.active=false;
    check(probe.counts.openCodexHandler===1&&probe.counts.buildCodex===1,'Reopening the army list never accumulates click handlers');
    const entity={baseStats:{vision:10,agility:6}};
    const first=System.withStatDisplayReads(()=>System.getStatSystemResult(entity,'bullsEye').value);
    entity.baseStats.vision=81;
    check(System.withStatDisplayReads(()=>System.getStatSystemResult(entity,'bullsEye').value)>first,'Display cache does not survive a calculation');
    try{System.withStatDisplayReads(()=>{System.getStatSystemResult(entity,'bullsEye');throw Error('test');});}catch{}
    entity.baseStats.vision=1;check(System.getStatSystemResult(entity,'bullsEye').value===1,'Display cache is cleared after exceptions');
    const Items=await import('/js/items/itemManager.js');
    const recruit=Items.addEntityLootToArmyA(structuredClone(actor),{source:'loot'});
    check(!!document.getElementById(`CodexEntityList_${recruit.id}`),'Recruitment adds its thumbnail to the open army list');
    probe.counts={};probe.active=true;click(recruit.id);probe.active=false;
    check(probe.counts.openCodexHandler===1&&probe.counts.buildCodex===1
      &&codices().length===1&&codices()[0].id===`codex-entity_${recruit.id}`,'A newly recruited entity opens once and stays open');
    probe.counts={};probe.active=true;click(recruit.id);probe.active=false;
    check(probe.counts.openCodexHandler===1&&!probe.counts.buildCodex&&codices().length===0,'Clicking the recruit again closes it once');
    click(recruit.id);
    const otherTemplate=E.entitesNestUp.find(candidate=>candidate.type==='sbire'&&candidate.serial!==actor.serial);
    const otherRecruit=Items.addEntityLootToArmyA(structuredClone(otherTemplate),{source:'loot'});
    probe.counts={};probe.active=true;click(otherRecruit.id,true);probe.active=false;
    check(probe.counts.openCodexHandler===1&&probe.counts.buildCodex===1&&codices().length===2
      &&codices().every(node=>node.classList.contains('dual-view'))
      &&codices().some(node=>node.id===`codex-entity_${recruit.id}`)
      &&codices().some(node=>node.id===`codex-entity_${otherRecruit.id}`),'Shift-click compares two newly recruited entities');
    document.getElementById(`codex-entity_${recruit.id}`).querySelector('.close-button').click();
    check(codices().length===1&&codices()[0].id===`codex-entity_${otherRecruit.id}`,'Closing one recruited entity preserves the other Codex');
    UI.closePlayerArmyCodex();document.querySelector('.army-codex-icon').click();
    for(const id of [recruit.id,otherRecruit.id,actor.id]) {
      probe.counts={};probe.active=true;click(id);probe.active=false;
      check(probe.counts.openCodexHandler===1&&probe.counts.buildCodex===1&&codices().length===1
        &&codices()[0].id===`codex-entity_${id}`,'Rebuilt army list opens the correct entity once: '+id);
    }
    return checks;
  });
  assert.deepEqual(errors,[]);
  const report={fixture,results,checks,errors};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({timings:results.map(({mode,menu,syncMs,frameMs,counts})=>({mode,menu,syncMs,frameMs,counts})),checks:checks.length,errors},null,2));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
