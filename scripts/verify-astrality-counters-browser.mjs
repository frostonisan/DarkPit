import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/astralite-common-cooldown/tests');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });

const errors = [];
async function fixture(config = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.testLog=[];page.on('console',message=>page.testLog.push(message.text()));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async config => {
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js");
    const U = await import("/js/ui/application.js");
    const E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const store = await import("/js/storage/sessionStorage.js");
    store.beginAdminSession(); window.currentStageId = 'pause-test';
    store.gameStorage.setItem('GameStages', JSON.stringify({stages:[{id:'pause-test',level_type:'admin'}]}));
    store.gameStorage.setItem('currentLevel','pause-test');
    window.baseStorage = JSON.stringify(Object.entries(window.localStorage).sort());
    const grid = document.createElement('div'); grid.id = 'hexGrid';
    grid.style.cssText = 'position:absolute;top:100px;left:180px;width:850px;height:500px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    for (const [i, side] of ['A', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1);
      hex.style.cssText = `position:absolute;left:${i * 400}px;top:50px;width:180px;height:200px`; grid.append(hex);
      const own = config[side] || {};
      const magic = own.magic || false;
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999820 + i, name: `Simultané ${side}`, side,
        type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 1000, strength: 0, intelligence: 0, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: config.speed ?? 60000, extraLife: own.extraLife || 0, astrality: side === 'A' ? 1 : 0 },
        attacks: [{ functionName: 'simultaneous-test', attackId: 'simultaneous-test', displayName: 'Impact simultané',
          combatFunction: own.support ? 'Support' : 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [own.range || 'melee'], attackTarget: [own.support ? 'ally' : 'enemy'], deadTarget: ['no'], type: [], effets: own.support ? ['heal'] : [], selfEffects: [],
          preparationTime: own.preparation ?? 500, executionTime: own.execution ?? 1800, recoveryTime: own.recovery ?? 300, cooldown: 20000,
          physicalRatio: magic ? 0 : 1, magicalRatio: magic ? 1 : 0, piercingRatio: 0 }] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    window.E = E; window.G = await import("/js/app/state.js"); window.F = await import("/js/combat/loop.js");
    G.configureBattleActionManager({ createStartButton: container=>container, createFleeButton: container=>container, createQuitButton: container=>container });
    window.Timeline = await import("/js/combat/timeline.js"); window.Attacks = await import("/js/combat/attacks.js");
    window.Sim = await import("/js/debug/simulation.js"); window.snapshot = Sim.captureSimulationBoard();
    window.entries = [];
    window.addEventListener('combatLogEntry', event => {
      const { type, data } = event.detail;
      entries.push({ type, at: Timeline.combatNow(), side: data.attacker?.side || data.entity?.side, damage: data.damage });
    });
  }, config);
  return page;
}

try{
 const page=await fixture();
 const checks=await page.evaluate(async()=>{
  const A = await import("/js/combat/effects.js"),D = await import("/js/combat/statistics.js"), _D = await import("/js/ui/statistics/details.js"),Damage = await import("/js/combat/vitals.js");
  const Armor=await import('/js/items/armor.js'),Control = await import("/js/combat/control.js");
  const results=[],ok=(v,msg)=>{if(!v)throw Error(msg);results.push(msg)};
  const subject=E.entites[0],enemy=E.entites[1];
  const reset=(entity,stats={})=>{
   A.clearCombatEffects(entity);entity.isDEAD=false;entity.battleStopped=false;entity.statut=['alive'];
   entity.baseStats={HP:100,physicalDamage:10,magicalDamage:10,speed:60000,strength:0,intelligence:0,agility:0,...stats};
   entity.modifierStats={durable:{levelUpMeta:{source:'manualLevelUp',confirmedLevel:30,reverseBaseLevel:1}}};delete entity.Archetype;
   E.recomputeEntityStats(entity,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
   entity.stats.HP.current=entity.stats.HP.max;Armor.destroyEntityArmor(entity);
  };
  const hit=(nature='physicalDamage',sources={physical:10},extra={})=>({attackId:'counter-'+nature,functionName:'counter-'+nature,displayName:'Contre Astralité',combatFunction:'Attaquant',
   attacknature:[nature],attackRange:['melee'],attackTarget:['enemy'],deadTarget:['no'],preparationTime:100,executionTime:100,recoveryTime:100,cooldown:1000,
   physicalRatio:1,magicalRatio:1,piercingRatio:1,type:[],effets:[],selfEffects:[],forceDamageSources:sources,...extra});
  reset(subject,{astrality:1});reset(enemy);G.startGame();Clock.freezeCombatClock();
  for(const [stats,chance] of [[{},0],[{astrality:1},1],[{fatalSurvival:50},50],[{fatalSurvivalPlus:50},50],[{fatalSurvival:1000},99]]){
   reset(subject,stats);let rolls=0;Math.random=()=>{rolls++;return (chance+.00001)/100};
   ok(!D.attemptAstrality(enemy,subject),'Échec juste au-dessus de '+chance+' %');
   ok(!A.getAstralityRuntime(subject),'Un jet raté ne déclenche aucun cooldown');
   if(chance>0){Math.random=()=>{rolls++;return (chance-.00001)/100};ok(D.attemptAstrality(enemy,subject),'Réussite juste en dessous de '+chance+' %');ok(rolls===2,'Un seul jet par tentative');}
   else ok(rolls===0,'Aucun jet sans chance de survie');
  }
  for(const stats of [{fatalSurvival:99},{fatalSurvivalPlus:99},{fatalSurvival:10,fatalSurvivalPlus:20}]){
   reset(subject,stats);let rolls=0;Math.random=()=>{rolls++;return 0};subject.stats.HP.current=1;
   Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
   ok(subject.stats.HP.current===1,'Premier coup fatal sauvé : '+JSON.stringify(stats));
   const state=A.getAstralityRuntime(subject),readyAt=state.survivalReadyAt;
   ok(readyAt===Timeline.combatNow()+5000,'Cooldown autonome de cinq secondes');
   ok(!state.return&&!state.body&&state.nextCheckAt==null,'Aucun soin ni jet de Corps astral autonome');
   ok(/Cooldown astral[\s\S]*5 s/.test(_D.calculateStatsDisplay('fatalSurvival',subject).helpContent),'Helper : délai réel de cinq secondes');
   const afterFirstHit=rolls;
   ok(!D.attemptAstrality(enemy,subject)&&rolls===afterFirstHit,'Aucun nouveau jet de survie pendant le cooldown');
   Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
   ok(subject.stats.HP.current<=0,'Second coup rapproché mortel');
   ok(state.survivalReadyAt===readyAt,'Un coup pendant le cooldown ne le prolonge pas');
   reset(subject,stats);subject.stats.HP.current=1;
   if(!G.gameStarted)G.startGame();Clock.freezeCombatClock();
   for(const remaining of [1,0]){
    await Clock.restoreCombatState({astrality:[{entity:subject.id,state:{survivalReadyAt:Timeline.combatNow()+remaining}}]},{entities:E.entites});
    const before=rolls;
    const diagnostic={remaining,state:A.getAstralityRuntime(subject),now:Timeline.combatNow(),paused:Clock.isCombatPaused(),dead:subject.isDEAD};
    ok(D.attemptAstrality(enemy,subject)===(remaining===0),(remaining?'Toujours bloqué à une milliseconde de la fin':'Disponible exactement à la fin des cinq secondes')+' '+JSON.stringify(diagnostic));
    ok(rolls===before+(remaining===0?1:0),'Le cooldown ne consomme pas de hasard');
   }
  }
  reset(subject,{fatalSurvival:99});Math.random=()=>0;subject.stats.HP.current=1;
  Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
  subject.baseStats.astrality=1;E.recomputeEntityStats(subject,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
  A.ensureAstralityEffects(subject);
  ok(A.astralCooldownRemaining(subject)===5,'Acquérir Astralité conserve le cooldown en cours, sans nouveau jet gratuit');
  ok(A.getAstralityRuntime(subject).nextCheckAt===Timeline.combatNow()+3000,'Acquérir Astralité lance ses contrôles de Corps astral');
  ok(!D.attemptAstrality(enemy,subject),'Le cooldown commun ne se cumule pas et reste bloquant');
  for(const astrality of [0,1]) {
   reset(subject,{astrality,agility:150,fatalSurvival:99});subject.stats.HP.current=1;
   Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
   const state=A.getAstralityRuntime(subject),cd=D.calculateAstralCooldown(subject).seconds;
   ok(Math.abs(A.astralCooldownRemaining(subject)-cd)<.000001,'Le moteur utilise le cooldown calculé');
   ok(astrality?cd<5:cd===5,'Réduction d’Agilité uniquement avec Umbra');
   if(astrality){
    ok(state.return.expiresAt===state.survivalReadyAt,'Le soin et le cooldown ont exactement la même échéance');
    subject.stats.HP.current=100;
    ok(!D.attemptAstrality(enemy,subject),'HP pleins : cooldown toujours actif');
   }
  }
  reset(subject,{astrality:1,fatalSurvival:99});subject.stats.HP.current=1;
  Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
  ok(subject.stats.HP.current===1&&A.isAstralReturnActive(subject),'Astralité + autonome : premier coup sauvé et Retour lancé');
  Damage.applyDamage(subject,30,enemy,hit('physicalDamage',{physical:30}),{physical:30});
  ok(subject.stats.HP.current<=0,'Le second coup rapproché traverse la survie pendant Retour');
  Damage.LifeandDeath(subject,enemy);ok(subject.isDEAD&&!A.getAstralityRuntime(subject),'Mort définitive : arrêt des effets et du soin');
  const body=async()=>{
   reset(subject,{astrality:50});const now=Clock.clockNow();
   await Clock.restoreCombatState({astrality:[{entity:subject.id,state:{body:{startedAt:now,expiresAt:now+3000}}}]},{entities:E.entites});
  };
  for(const [nature,sources] of [['physicalDamage',{physical:10}],['transpiercingDamage',{piercingDamage:10}],['hybridalDamage',{physical:5,magical:5}],
   ['physicalPiercingDamage',{physical:5,piercingDamage:5}],['magicalPiercingDamage',{magical:5,piercingDamage:5}],['hybridalPiercingDamage',{physical:4,magical:3,piercingDamage:3}],['inerte',{physical:10}]]){
   await body();const attack=hit(nature,sources),before=subject.stats.HP.current;
   ok(!A.blocksAstralSpell(subject,attack),nature+' : pas de blocage Corps astral');
   Damage.applyDamage(subject,10,enemy,attack,sources);ok(subject.stats.HP.current<before,nature+' : dégâts réellement appliqués');
  }
  await body();Armor.grantEntityExternalArmor(subject,20);enemy.stats.HP.current=50;
  const magical=hit('magicalDamage',{magical:20},{effets:['silence'],effectOverrides:{silence:{effectDuration:3}}});
  const blocked=Damage.applyDamage(subject,20,enemy,magical,{magical:20},['lifesteal']);
  ok(blocked.astralBody&&subject.stats.HP.current===100&&subject.stats.armor.current===20,'Magie pure : raté, HP et armure préservés');
  ok(!Control.getControlState(subject,'silence'),'Magie ratée : Silence non appliqué');ok(enemy.stats.HP.current===50,'Magie ratée : pas de vol de vie');
  A.clearAstralityEffects(subject);Damage.applyDamage(subject,20,enemy,magical,{magical:20});
  ok(!!Control.getControlState(subject,'silence'),'Contrôle témoin : le même Silence fonctionne hors Corps astral');
  await body();subject.stats.HP.current=50;
  Damage.applyDamage(subject,10,enemy,hit('magicalDamage',{magical:10},{combatFunction:'Support',attackTarget:['ally'],effets:['heal']}),{magical:10});
  ok(subject.stats.HP.current>50,'Un soin allié atteint toujours le Corps astral');
  await body();const before=subject.stats.HP.current;
  Damage.applyDamage(subject,10,enemy,hit('magicalDamage',{magical:10},{type:['alteration'],dotname:'Poison déjà posé'}),{magical:10});
  ok(subject.stats.HP.current<before,'Le dégât périodique déjà posé continue pendant Corps astral');
  reset(subject,{astrality:150,strength:0,fatalSurvival:99});subject.stats.HP.current=1;A.startAstralReturn(subject);
  const saved=structuredClone(A.getAstralityRuntime(subject).return);subject.baseStats.strength=150;E.recomputeEntityStats(subject,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
  ok(JSON.stringify(A.getAstralityRuntime(subject).return)===JSON.stringify(saved),'Un changement de Force ne réinitialise pas un Retour en cours');
  G.StopGame({preserveScene:true});return results;
 });
 await writeFile(resolve(output,'counter-checks.json'),JSON.stringify({checks,errors},null,2));assert.deepEqual(errors,[]);console.log(`${checks.length} contrôles des contres et statistiques autonomes réussis.`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
