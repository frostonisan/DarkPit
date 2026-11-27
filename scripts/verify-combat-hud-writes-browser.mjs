import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const output=resolve(process.env.HUD_WRITES_OUTPUT||'outputs/combat-hud-writes');
const baseline=process.env.HUD_WRITES_BASELINE&&resolve(process.env.HUD_WRITES_BASELINE);
let root=resolve('docs');
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true}),results={};
try{
  for(const previous of baseline?[true,false]:[false]){
    root=previous?baseline:resolve('docs');const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#game-container').waitFor({state:'attached'});
    const result=await page.evaluate(async()=>{
      const E=await import('/js/entities/runtime.js'),A=await import('/js/combat/attackResolution.js'),H=await import('/js/rendering/hud.js'),V=await import('/js/combat/vitals.js');
      const Clock=await import('/js/combat/clock.js'),L=await import('/js/data/loaderList.js'),{attackDetails}=await import('/js/data/attackList.js');
      Clock.freezeCombatClock();
      const entity={id:991122,type:'sbire',name:'HUD reference',side:'A',role:'gueux',attacks:[],stats:{},baseStats:{HP:100,strength:1,intelligence:1,agility:1}};
      E.enrichEntityStats(entity);E.entites.length=0;E.entites.push(entity);
      const target={id:991123,type:'sbire',side:'B',role:'mage',stats:{},statut:['alive'],isDEAD:false};E.entites.push(target);
      const host=document.createElement('section');host.id='hud-writes-probe';document.body.append(host);
      const markup=()=>`<div id="Box_Entite_${entity.id}" class="entite-box side-A role-gueux"><div id="sbire_${entity.id}" class="entitesContainer A"></div></div>
      <div id="TargetroleContainer_${entity.id}" class="target-role-img-container"><span class="target-picto-hud"></span><span class="role-img"></span><span class="targetrole-img-hud"></span></div>
      <div id="TargetInfos_${entity.id}" class="TargetInfos persistent"></div>
      <div class="active-attack-visual persistent"><img id="currentAttackImage_${entity.id}"></div>
      <div id="ScanEntity_${entity.id}"><p class="target-zone-role-display"></p></div>
      <div id="profile-label" class="profile persistent"></div><div id="profile-badge" class="entity-role-BadgeContainer persistent"></div>`;
      const build=()=>{host.innerHTML=markup();};build();
      const base={...structuredClone(attackDetails[0]),attackAsset:'./media/assets/spells/auto-attack',attackRange:['range'],effets:[],selfEffects:[],type:[],preparationTime:100,executionTime:100,recoveryTime:100};
      const definitions=[
        {...base,functionName:'writes-enemy',attackId:'writes-enemy',entityAttackId:'writes-enemy',displayName:'Attaque <b>directe</b>',combatFunction:'Attaquant',attackTarget:['enemy'],deadTarget:['no']},
        {...base,functionName:'writes-heal',attackId:'writes-heal',entityAttackId:'writes-heal',displayName:'Soin',combatFunction:'Support',attackTarget:['ally'],deadTarget:['no']},
        {...base,functionName:'writes-necro',attackId:'writes-necro',entityAttackId:'writes-necro',displayName:'Réanimation',combatFunction:'Support',attackTarget:['ally'],deadTarget:['yes']},
        {...base,functionName:'writes-hex',attackId:'writes-hex',entityAttackId:'writes-hex',displayName:'Invocation',combatFunction:'Support',attackTarget:['hexa'],deadTarget:['no']}
      ];
      A.setEntityAttackDefinitions(entity,definitions,attackDetails);
      const actions=A.readAttackDefinitionsForEntity(entity,attackDetails);
      const render=(attack,targetValue)=>{
        if(attack){entity.currentAttack=attack;entity.currentAttackId=attack.entityAttackId||attack.attackKey||attack.functionName;}
        H.updateEntityAttackTargetDisplay(entity,attack,targetValue);V.updateCurrentAttackDisplay(entity);
        H.applyCombatProfileView(host.querySelector('#profile-label'),entity,{text:true,helper:true});
        H.applyCombatProfileView(host.querySelector('#profile-badge'),entity);
      };
      const capture=name=>{
        const css=[...host.querySelectorAll('*')].map(n=>{const c=getComputedStyle(n);return {tag:n.tagName,id:n.id,display:c.display,color:c.color,backgroundImage:c.backgroundImage,fontSize:c.fontSize};});
        return {name,html:L.persistentMediaMarkup(host.innerHTML),css,targetZone:entity.targetZone,selection:H.getBattleTargetAttack(entity)?.functionName};
      };
      const views=[];const check=(name,attack,targetValue=target)=>{render(attack,targetValue);views.push(capture(name));};
      const find=name=>actions.find(a=>a.functionName===name);
      const enemy=find('writes-enemy'),heal=find('writes-heal'),necro=find('writes-necro'),hex=find('writes-hex');
      if(!enemy||!heal||!necro||!hex)throw Error('Missing attack definitions');
      check('enemy',enemy);check('same-enemy',enemy);
      entity.side='B';check('changed-side',enemy);
      target.role='tank';check('changed-role',enemy);
      check('heal',heal);target.type='lord';check('lord-target',heal);target.type='sbire';check('necro',necro);
      const cell=document.createElement('div');cell.className='hex SideA';cell.dataset.position='1';host.append(cell);check('hex-target',hex,cell);
      check('back-to-enemy',enemy);
      A.setEntityAttackDefinitions(entity,[heal],attackDetails);H.clearBattleTargetDisplays([entity]);check('support-profile',heal);
      A.setEntityAttackDefinitions(entity,[enemy],attackDetails);H.clearBattleTargetDisplays([entity]);check('attack-profile',enemy);
      A.setEntityAttackDefinitions(entity,definitions,attackDetails);H.clearBattleTargetDisplays([entity]);check('mixed-profile',enemy);
      build();check('rebuilt',enemy);
      const label=host.querySelector('#profile-label'),nested=document.createElement('b');nested.textContent=label.textContent;label.replaceChildren(nested);
      host.querySelector('#profile-badge .entity-domain-icons').firstElementChild.style.color='red';
      host.querySelector('.active-attack-visual').className='active-attack-visual persistent wrong-extra Support';
      host.querySelector(`#currentAttackImage_${entity.id}`).alt='wrong';check('edited-dom',enemy);
      // Repeating equal presentation must not recreate icons, reset image URLs,
      // or emit class/attribute mutations that invalidate style and wake observers.
      render(enemy,target);const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,attributes:true,childList:true,characterData:true});
      const start=performance.now();for(let i=0;i<100;i++)render(enemy,target);
      const repeated={mutations:observer.takeRecords().length,ms:performance.now()-start};observer.disconnect();
      views.push(capture('after-repeated'));
      // No cross-frame cache: a replaced image and a changed source are repaired immediately.
      const old=host.querySelector(`#currentAttackImage_${entity.id}`),replacement=old.cloneNode(false);replacement.setAttribute('src','data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');old.replaceWith(replacement);
      check('replaced-image',enemy);
      entity.type='lord';host.querySelector(`#sbire_${entity.id}`).id=`lord_${entity.id}`;check('lord-source',enemy);
      entity.type='sbire';host.querySelector(`#lord_${entity.id}`).id=`sbire_${entity.id}`;
      H.clearBattleTargetDisplays([entity]);check('neutral-mixed-profile',null,null);
      if(entity.targetZone!=='none')throw Error('Expected an uncommitted mixed-profile target');
      check('same-neutral-profile',null,null);
      host.remove();Clock.resumeCombatClock();return {views,repeated};
    });
    assert.deepEqual(errors,[]);results[previous?'before':'after']=result;await page.close();
  }
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
  assert.equal(results.after.repeated.mutations,0,'Identical HUD values must not mutate the DOM');
  if(baseline){assert.deepEqual(results.after.views,results.before.views,'Same classes, image URL, HTML, computed styles and target selection');assert.ok(results.before.repeated.mutations>1000);}
  console.log(JSON.stringify({states:results.after.views.length,referenceCompared:Boolean(baseline),before:results.before?.repeated,after:results.after.repeated}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
