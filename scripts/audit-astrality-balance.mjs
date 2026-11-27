import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.AUDIT_OUTPUT || 'outputs/astralite-balance');
await mkdir(output, { recursive: true });
// All trials in a run use the same source bytes, even if another editor saves
// a module while simulations are in progress. Assets can remain streamed.
const sourceFiles = new Map(), hashes = {};
const frozen = process.env.AUDIT_SOURCE ? JSON.parse(await readFile(resolve(process.env.AUDIT_SOURCE),'utf8')) : null;
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
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(sourceFiles.get(file) || await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });


const errors=[],cases=[];
const add=(id,name,nature,stats={},extra={})=>cases.push({id,name,nature,stats,count:16,...extra});
for(const nature of ['physicalDamage','magicalDamage']){
 const t=nature==='physicalDamage'?'Physique':'Magique';
 for(const points of [0,1,50,150])add(`${nature}-a${points}`,`${t} · Astralité ${points}`,nature,{astrality:points});
 add(`${nature}-f50`,`${t} · Survie fatale fixe 50 %`,nature,{fatalSurvival:50});
 add(`${nature}-a50f50`,`${t} · Astralité 50 + Survie fatale 50 %`,nature,{astrality:50,fatalSurvival:50});
 add(`${nature}-f99`,`${t} · Survie fatale fixe 99 %`,nature,{fatalSurvival:99},{count:nature==='physicalDamage'?100:16});
 add(`${nature}-a1f99`,`${t} · Astralité 1 + Survie fatale 99 %`,nature,{astrality:1,fatalSurvival:99},{count:nature==='physicalDamage'?100:16});
}
add('physical-constitution50','Physique · Constitution 50','physicalDamage',{constitution:50});
add('magic-integrite50','Magique · Intégrité 50','magicalDamage',{integrite:50});
add('physical-robustness50','Physique · Robustesse 50','physicalDamage',{robustness:50});
add('magic-robustness50','Magique · Robustesse 50','magicalDamage',{robustness:50});
for(const nature of ['hybridalDamage','piercingDamage'])for(const points of [0,50])add(`${nature}-a${points}`,`${nature==='hybridalDamage'?'Hybride':'Perçant'} · Astralité ${points}`,nature,{astrality:points});
for(const cadence of ['fast','slow'])for(const nature of ['physicalDamage','magicalDamage'])add(`${cadence}-${nature}-a150`,`${cadence==='fast'?'Rapide':'Lent'} ${nature==='physicalDamage'?'physique':'magique'} · Astralité 150`,nature,{astrality:150},{cadence});
for(const points of [0,150])add(`duo-magic-a${points}`,`Deux ennemis magiques · Astralité ${points}`,'magicalDamage',{astrality:points},{opponents:2});
if(process.env.AUDIT_GROUP==='plus') {
 cases.length=0;
 for(const nature of ['physicalDamage','magicalDamage'])for(const points of [0,50])
  add(`${nature}-plus50-a${points}`,`${nature==='physicalDamage'?'Physique':'Magique'} · Survie fatale + 50 et Astralité ${points}`,nature,{fatalSurvivalPlus:50,astrality:points});
}
if(process.env.AUDIT_GROUP==='cooldown') {
 const retained=cases.filter(c=>c.stats.fatalSurvival>0);cases.splice(0,cases.length,...retained);
 for(const nature of ['physicalDamage','magicalDamage'])for(const points of [0,50])
  add(`${nature}-plus50-a${points}`,`${nature==='physicalDamage'?'Physique':'Magique'} · Survie fatale + 50 et Astralité ${points}`,nature,{fatalSurvivalPlus:50,astrality:points});
}
if(process.env.AUDIT_GROUP==='cooldown-spaced') {
 cases.length=0;
 for(const kind of ['fixed','plus'])for(const points of [0,1])
  add(`spaced-${kind}-a${points}`,`Physique espacé · Survie fatale ${kind==='fixed'?'fixe 30 %':'+ 10'} et Astralité ${points}`,
   'physicalDamage',{[kind==='fixed'?'fatalSurvival':'fatalSurvivalPlus']:kind==='fixed'?30:10,astrality:points},{cadence:'spaced',count:32});
}
if(process.env.AUDIT_GROUP==='agility') {
 cases.length=0;
 for(const nature of ['physicalDamage','magicalDamage'])for(const agility of [0,150])for(const points of [0,1])
  add(`${nature}-agi${agility}-a${points}`,`${nature} · Agilité ${agility} · Astralité ${points}`,nature,{astrality:points,agility,fatalSurvival:30},{count:16,cadence:'spaced'});
}
if(process.env.AUDIT_GROUP==='force') {
 cases.length=0;
 for(const nature of ['physicalDamage','magicalDamage'])for(const strength of [0,150])for(const points of [1,150])
  add(`${nature}-force${strength}-a${points}`,`${nature} · Force ${strength} · Astralité ${points}`,nature,{astrality:points,strength,fatalSurvival:30},{count:16,cadence:'spaced'});
}
const path=resolve(output,'trials.jsonl');
let rows=[];try{rows=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
const done=new Set(rows.map(r=>`${r.caseId}/${r.index}`));
const limit=Number(process.env.AUDIT_LIMIT)||Infinity, jobs=[];
const expectedCooldown=process.env.AUDIT_EXPECT_COOLDOWN==null?null:Number(process.env.AUDIT_EXPECT_COOLDOWN);
for(const c of cases)for(let index=0;index<Math.min(limit,c.count);index++)if(!done.has(`${c.id}/${index}`))jobs.push({c,index});
await writeFile(resolve(output,'cases.json'),JSON.stringify(cases,null,2));
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
    const subjectSide=flip?'B':'A',foeSide=flip?'A':'B',foes=c.opponents||1;
    for(let i=0;i<=foes;i++){
     const subject=i===0,side=subject?subjectSide:foeSide,nature=subject?'physicalDamage':c.nature;
     const fast=!subject&&c.cadence==='fast',slow=!subject&&c.cadence==='slow';
     const power=subject?40:fast?16:slow?200:55/foes;
     const pure=nature==='magicalDamage',pierce=nature==='piercingDamage',hybrid=nature==='hybridalDamage';
     const attack={functionName:'astral-audit-'+i,attackId:'astral-audit-'+i,displayName:subject?'Frappe du sujet':'Attaque adverse',combatFunction:'Attaquant',
      attacknature:[nature],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],type:[],effets:[],selfEffects:[],
      preparationTime:fast?80:slow?500:200,executionTime:fast?100:slow?500:300,recoveryTime:fast?100:slow?500:200,cooldown:0,
      physicalRatio:pure||pierce?0:hybrid?.5:1,magicalRatio:pure?1:hybrid?.5:0,piercingRatio:pierce?1:0};
     const entity={...structuredClone(template),id:998000+i,name:subject?'Sujet Astralité':'Adversaire '+i,side,
      type:'sbire',role:'gueux',position:String(i+1),level:{current:30,max:250},awakening:3,stuff:{},stats:{},modifierStats:{durable:{levelUpMeta:{source:'manualLevelUp',confirmedLevel:30,reverseBaseLevel:1}}},
      baseStats:{HP:subject?400:c.cadence==='slow'?800:400/foes,strength:50,intelligence:50,agility:0,will:0,physicalDamage:power,magicalDamage:power,piercingDamage:power,
       speed:fast?300:slow?6000:!subject&&c.cadence==='spaced'?1700:1300,...(subject?c.stats:{})},attacks:[attack]};
     E.recomputeEntityStats(entity,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
     if(entity.stats.strength!==(subject?c.stats.strength??50:50)||entity.stats.intelligence!==50||entity.stats.physicalDamage!==power||entity.stats.criticalChance!==0)throw Error('Uncontrolled starting stats '+JSON.stringify(entity.stats));
     entity.statut=['alive'];entity.isDEAD=false;E.entites.push(entity);
     const hex=document.createElement('div');hex.className=`hex Side${side} occupied`;hex.dataset.position=String(i+1);
     hex.style.cssText=`position:absolute;left:${side==='A'?0:650}px;top:${i>1?260:0}px;width:180px;height:220px`;grid.append(hex);
     const created=C.createEntiteInDOM(entity);hex.append(created.element);await created.spriteReady;
    }
    snapshot=Sim.captureSimulationBoard();snapshots.set(key,snapshot);
   }
   const trial=await Sim.simulateTrial(snapshot,{seed:(0xA57A0000+index*7919)>>>0,durationMs:90000,trace:index===0});
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
   for(const e of trial.entities){assert.equal(e.initialStats.strength,String(e.id)==='998000'?c.stats.strength??50:50,'No generated attribute drift');assert.equal(e.initialStats.intelligence,50,'No generated attribute drift');assert.equal(e.initialStats.criticalChance,0,'No extra critical chance');}
   const record={caseId:c.id,index,seed:trial.seed,end:trial.end,winner:trial.winner,durationMs:trial.durationMs,firstDeath:trial.firstDeath,steps:trial.steps,timings:trial.timings,
    entities:trial.entities.map(e=>({id:e.id,name:e.name,side:e.side,hpStart:e.hpStart,hpEnd:e.hpEnd,armorStart:e.armorStart,armorEnd:e.armorEnd,turns:e.turns,actions:e.actions,damage:e.damage,heal:e.heal,dead:e.dead,details:e.details,initialStats:index===0?e.initialStats:undefined}))};
   rows.push(record);write=write.then(()=>appendFile(path,JSON.stringify(record)+'\n'));await write;
   if(index===0)await writeFile(resolve(output,c.id+'-trace.json'),JSON.stringify(trial,null,2));
   if(rows.length%8===0||limit===1)console.log(`${rows.length} enregistrés · ${c.id} #${index+1} · ${trial.end} ${trial.winner||''} · ${(trial.durationMs/1000).toFixed(2)} s`);
  }await page.close();
 }));
 await writeFile(resolve(output,'run.json'),JSON.stringify({cases:cases.length,requested:cases.reduce((n,c)=>n+Math.min(limit,c.count),0),completed:rows.length,expectedCooldown,errors},null,2));
 assert.deepEqual(errors,[]);console.log('Audit terminé.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
