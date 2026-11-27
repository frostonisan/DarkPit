import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.AUDIT_OUTPUT || 'outputs/astralite-varied');
await mkdir(output, { recursive: true });
// All trials in a run use the same source bytes, even if another editor saves
// a module while simulations are in progress. Assets can remain streamed.
const sourceFiles = new Map(), hashes = {};
let frozen; try { frozen = JSON.parse(await readFile(resolve(process.env.AUDIT_SOURCE || resolve(output,'source-files.json')),'utf8')); } catch {}
const names = frozen ? Object.keys(frozen) : await readdir(root, { recursive: true });
for (const name of names.sort()) {
 if (!/\.(?:js|html|css)$/.test(name)) continue;
 const path = resolve(root, name), bytes = frozen ? Buffer.from(frozen[name]) : await readFile(path);
 sourceFiles.set(path, bytes); hashes[name.replaceAll('\\','/')] = createHash('sha256').update(bytes).digest('hex');
}
const manifest = resolve(output, 'source-hashes.json');
let previous; try { previous = JSON.parse(await readFile(manifest,'utf8')); } catch {}
if(previous)assert.deepEqual(hashes,previous,'Cannot mix source versions in one audit; choose another output folder.');
await writeFile(manifest,JSON.stringify(hashes,null,2));
await writeFile(resolve(output,'source-files.json'),JSON.stringify(Object.fromEntries([...sourceFiles].map(([path,bytes])=>[path.slice(root.length+1).replaceAll('\\','/'),bytes.toString('utf8')]))));
const assets=new Map();
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); let bytes=sourceFiles.get(file)||assets.get(file);if(!bytes){bytes=await readFile(file);assets.set(file,bytes);}res.end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });


const errors=[],cases=[];
const builds={
 high:{name:'Astralité 150, attributs 150, sans bonus fixe',stats:{astrality:150,strength:150,intelligence:150,agility:150}},
 cap:{name:'Astralité 150, attributs 150, +30 % Survie fatale',stats:{astrality:150,strength:150,intelligence:150,agility:150,fatalSurvival:30}},
 entry:{name:'Astralité 1, attributs 150',stats:{astrality:1,strength:150,intelligence:150,agility:150}},
 mid:{name:'Astralité 50, attributs 50',stats:{astrality:50,strength:50,intelligence:50,agility:50}},
 none:{name:'Sans Umbra, attributs 150',stats:{strength:150,intelligence:150,agility:150}},
 constitution:{name:'Constitution 150, attributs 150',stats:{constitution:150,strength:150,intelligence:150,agility:150}},
 integrite:{name:'Intégrité 150, attributs 150',stats:{integrite:150,strength:150,intelligence:150,agility:150}},
 robustness:{name:'Robustesse 150, attributs 150',stats:{robustness:150,strength:150,intelligence:150,agility:150}},
};
const foe=(nature='physicalDamage',power=90,extra={})=>({nature,power,hp:800,speed:1300,prep:200,exec:300,recovery:200,...extra});
const threats={
 physical:{name:'Duel physique régulier',foes:[foe()]},
 fast:{name:'Duel physique rapide, petits impacts',foes:[foe('physicalDamage',26,{speed:300,prep:80,exec:100,recovery:100})]},
 burst:{name:'Duel physique, coups uniques très lourds',foes:[foe('physicalDamage',450,{speed:6000,prep:500,exec:500,recovery:500})]},
 pressure:{name:'Duel physique, forte pression continue',foes:[foe('physicalDamage',160)]},
 magic:{name:'Duel magique pur',foes:[foe('magicalDamage')]},
 hybrid:{name:'Duel hybride physique / magique',foes:[foe('hybridalDamage')]},
 piercing:{name:'Duel perçant',foes:[foe('transpiercingDamage')]},
 poison:{name:'Duel physique avec Poison',foes:[foe('physicalDamage',55,{effects:['poison'],overrides:{poison:{effectDuration:6,effectTickInterval:0.5,effectDot:120,effectPhysicalRatio:0,effectMagicalRatio:0}}})]},
 duoPhysical:{name:'Un contre deux physiques synchronisés',foes:[foe('physicalDamage',45,{hp:400}),foe('physicalDamage',45,{hp:400})]},
 duoMixed:{name:'Un contre physique + magie synchronisés',foes:[foe('physicalDamage',45,{hp:400}),foe('magicalDamage',45,{hp:400})]},
 teams:{name:'Deux contre deux, attaques physiques',foes:[foe('physicalDamage',45,{hp:400}),foe('physicalDamage',45,{hp:400})],ally:true},
 long:{name:'Duel physique prolongé (adversaire 1 600 HP)',foes:[foe('physicalDamage',90,{hp:1600})]},
};
const add=(build,threat)=>cases.push({id:build+'-'+threat,build,threat,
 count:16,stats:builds[build].stats,...threats[threat],name:builds[build].name+' · '+threats[threat].name});
for(const build of ['high','cap'])for(const threat of Object.keys(threats))add(build,threat);
for(const build of ['entry','mid','none','constitution','integrite','robustness'])for(const threat of ['physical','magic'])add(build,threat);
// Matched-pressure complements: the pilot measured ~46.9 damage/s for regular
// physical attacks, ~39.7 for the initial fast case and ~55.7 for hybrid.
// Adjust the fixture's power, never the engine, to separate damage from cadence.
Object.assign(threats,{
 fastMatched:{name:'Physique rapide, pression ajustée',foes:[foe('physicalDamage',31,{speed:300,prep:80,exec:100,recovery:100})]},
 hybridMatched:{name:'Hybride, pression ajustée',foes:[foe('hybridalDamage',76)]},
});
for(const build of ['high','cap'])for(const threat of ['fastMatched','hybridMatched'])add(build,threat);
// At zero Intelligence the game's native spell-break risk is 30%.
// A trained caster tests Astral Body without that extra advantage to the defender.
threats.magicTrained={name:'Mage entraîné, Intelligence 150',foes:[foe('magicalDamage',90,{stats:{intelligence:150}})]};
for(const build of ['high','cap','entry','integrite','robustness'])add(build,'magicTrained');
const complementKeys=new Set(['fastMatched','hybridMatched','magicTrained']);
const complements=process.env.AUDIT_GROUP==='complements';
cases.splice(0,cases.length,...cases.filter(c=>complementKeys.has(c.threat)===complements));
const path=resolve(output,'trials.jsonl');
let rows=[];try{rows=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
const done=new Set(rows.map(r=>`${r.caseId}/${r.index}`));
const limit=Number(process.env.AUDIT_LIMIT)||Infinity, jobs=[];
const expectedCooldown=process.env.AUDIT_EXPECT_COOLDOWN==null?null:Number(process.env.AUDIT_EXPECT_COOLDOWN);
for(const c of cases)for(let index=0;index<Math.min(limit,c.count);index++)if(!done.has(`${c.id}/${index}`))jobs.push({c,index});
const casesPath=resolve(output,'cases.json');
let previousCases;try{previousCases=JSON.parse(await readFile(casesPath,'utf8'));}catch{}
if(previousCases)assert.deepEqual(cases,previousCases,'Cannot mix different fixtures in one audit.');
await writeFile(casesPath,JSON.stringify(cases,null,2));
import { appendFile } from 'node:fs/promises';
let cursor=0,write=Promise.resolve();
async function fixture(){
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.evaluate(async expectedCooldown=>{
  const UI = await import("/js/ui/application.js"),E = await import("/js/entities/runtime.js"),C = await import("/js/rendering/entities.js");
  const G = await import("/js/storage/gameStorage.js"),State = await import("/js/app/state.js"),Sim = await import("/js/debug/simulation.js");
  if(expectedCooldown!=null&&globalThis.umbraProgression.astrality.astralCooldown.baseSeconds!==expectedCooldown)throw Error('Unexpected autonomous cooldown');
  UI.createGameContainer();UI.GameUi();G.setAdminMode(true);window.levelRunning='admin';document.querySelector('.worldmap')?.remove();
  State.configureBattleActionManager({createStartButton:c=>c,createFleeButton:c=>c,createQuitButton:c=>c});
  const template=(await import("/js/data/entityTemplates.js")).entitesNest.find(e=>e.serial===900013);
  const grid=document.createElement('div');grid.id='hexGrid';grid.style.cssText='position:absolute;inset:100px 150px;';document.getElementById('game-container').append(grid);
  window.snapshots=new Map();
  window.auditTrial=async(c,index)=>{
   const flip=index%2===1,key=c.id+'/'+flip;let snapshot=snapshots.get(key);
   if(!snapshot){
    grid.replaceChildren();E.entites.length=0;
    const subjectSide=flip?'B':'A',foeSide=flip?'A':'B';
    const actors=[{subject:true,nature:'physicalDamage',power:40,hp:400,speed:1300,prep:200,exec:300,recovery:200},
      ...c.foes,...(c.ally?[{ally:true,nature:'physicalDamage',power:40,hp:400,speed:1300,prep:200,exec:300,recovery:200}]:[])];
    for(const [i,actor] of actors.entries()){
     const side=actor.subject||actor.ally?subjectSide:foeSide,nature=actor.nature;
     const pure=nature==='magicalDamage',pierce=nature==='transpiercingDamage',hybrid=nature==='hybridalDamage';
     const attack={functionName:'varied-audit-'+i,attackId:'varied-audit-'+i,displayName:actor.subject?'Frappe du sujet':'Attaque de contrôle',combatFunction:'Attaquant',
      attacknature:[nature],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],type:[],effets:actor.effects||[],selfEffects:[],effectOverrides:actor.overrides||{},
      preparationTime:actor.prep,executionTime:actor.exec,recoveryTime:actor.recovery,cooldown:0,
      physicalRatio:pure||pierce?0:hybrid?.5:1,magicalRatio:pure?1:hybrid?.5:0,piercingRatio:pierce?1:0};
     const entity={...structuredClone(template),id:998000+i,name:actor.subject?'Sujet Astralité':actor.ally?'Allié témoin':'Adversaire '+i,side,
      type:'sbire',role:'gueux',position:String(i+1),level:{current:30,max:250},awakening:3,stuff:{},stats:{},modifierStats:{durable:{levelUpMeta:{source:'manualLevelUp',confirmedLevel:30,reverseBaseLevel:1}}},
      baseStats:{HP:actor.hp,strength:0,intelligence:0,agility:0,will:0,physicalDamage:actor.power,magicalDamage:actor.power,piercingDamage:actor.power,
       speed:actor.speed,...(actor.subject?c.stats:actor.stats||{})},attacks:[attack]};
     E.recomputeEntityStats(entity,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
     for(const key of ['strength','intelligence','agility'])if(entity.stats[key]!==Number(actor.subject?c.stats[key]||0:actor.stats?.[key]||0))throw Error('Unexpected '+key);
     if(entity.stats.physicalDamage!==actor.power||entity.stats.criticalChance!==0)throw Error('Uncontrolled power/critical');
     entity.statut=['alive'];entity.isDEAD=false;E.entites.push(entity);
     const hex=document.createElement('div');hex.className=`hex Side${side} occupied`;hex.dataset.position=String(i+1);
     hex.style.cssText=`position:absolute;left:${side==='A'?0:650}px;top:${actor.subject?0:actor.ally?260:(i-1)*260}px;width:180px;height:220px`;grid.append(hex);
     const created=C.createEntiteInDOM(entity);hex.append(created.element);await created.spriteReady;
    }
    snapshot=Sim.captureSimulationBoard();snapshots.set(key,snapshot);
   }
   const trial=await Sim.simulateTrial(snapshot,{seed:(0xB1650000+index*7919)>>>0,durationMs:120000,trace:index===0});
   return trial;
  };
 },expectedCooldown);return page;
}
try{
 console.log(`Audit: ${jobs.length} combats à calculer ; ${rows.length} déjà enregistrés.`);
 await Promise.all(Array.from({length:Number(process.env.AUDIT_WORKERS)||2},async()=>{
  const page=await fixture();
  while(cursor<jobs.length){
   const {c,index}=jobs[cursor++];let trial;
   try{trial=await page.evaluate(({c,index})=>auditTrial(c,index),{c,index});}
   catch(e){throw Error(c.id+'/'+index+': '+e.message);}
   for(const e of trial.entities){
    const actorStats=String(e.id)==='998000'?c.stats:c.foes[Number(e.id)-998001]?.stats||{};
    for(const key of ['strength','intelligence','agility'])assert.equal(e.initialStats[key],actorStats[key]||0,'No generated attribute drift');
    assert.equal(e.initialStats.criticalChance,0,'No extra critical chance');
   }
   assert.ok(!trial.error);assert.ok(['victory','draw','timeout'].includes(trial.end),'No unexpected combat end');
   const record={caseId:c.id,index,seed:trial.seed,end:trial.end,winner:trial.winner,durationMs:trial.durationMs,firstDeath:trial.firstDeath,steps:trial.steps,timings:trial.timings,
    entities:trial.entities.map(e=>({id:e.id,name:e.name,side:e.side,hpStart:e.hpStart,hpEnd:e.hpEnd,armorStart:e.armorStart,armorEnd:e.armorEnd,turns:e.turns,actions:e.actions,damage:e.damage,heal:e.heal,dead:e.dead,details:e.details,initialStats:index===0?e.initialStats:undefined}))};
   const completed=rows.push(record);write=write.then(()=>appendFile(path,JSON.stringify(record)+'\n'));await write;
   if(index===0)await writeFile(resolve(output,c.id+'-trace.json'),JSON.stringify(trial,null,2));
   if(completed%8===0||limit===1)console.log(`${completed} enregistrés · ${c.id} #${index+1} · ${trial.end} ${trial.winner||''} · ${(trial.durationMs/1000).toFixed(2)} s`);
  }await page.close();
 }));
 await writeFile(resolve(output,'run.json'),JSON.stringify({cases:cases.length,requested:cases.reduce((n,c)=>n+Math.min(limit,c.count),0),completed:rows.length,expectedCooldown,errors},null,2));
 assert.deepEqual(errors,[]);console.log('Audit terminé.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
