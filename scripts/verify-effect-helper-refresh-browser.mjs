import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/effect-helper-refresh');
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
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  assert.equal(await page.locator('#admin-stop-combat').count(), 0);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const A = await import("/js/debug/admin.js");
    const UI = await import("/js/ui/application.js"), _UI = await import("/js/ui/codex/index.js");
    const N = await import("/js/app/worldMap.js");
    S.setAdminMode(true);
    window.levelRunning = 'worldmap';
    A.initializeAdminLevel(E.entitesNestUp);
    if (document.getElementById('admin-stop-combat')) throw Error('Admin mode outside the Admin level must not expose Stop');
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810, name: 'Saved army', side: 'A', level: 1,
      attacks: ['shot-p-r'], stats: {}, baseStats: { HP: 1000, shift: 10, speed: 10000, armor: 10 }, stuff: {}, resourceStocks: {} });
    S.saveToLocalStorage('selectedArmyA', [actor]); window.selectedArmyA = [actor];
    E.entites.splice(0, E.entites.length, actor);
    UI.createGameContainer(); UI.GameUi(); UI.initializeArmyConfig(); _UI.PlayerArmyCodex();
    N.rebuildWorldMapLevelButtons(); S.setCurrentLevel(UI.getOrCreateWorldMapID());
  });
  await page.evaluate(() => document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove()));
  await page.locator('.level-button.admin').first().click();
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => !document.querySelector('.loading-screen') && document.getElementById('startButton'));
  assert.equal(await page.locator('#admin-stop-combat').count(), 0, 'Stop is absent before launching');
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const G = await import("/js/app/state.js");
    const C = await import("/js/rendering/entities.js");
    document.querySelectorAll('#hexGrid .entite-box').forEach(node => node.remove());
    document.querySelectorAll('#hexGrid .hex').forEach(hex => hex.classList.remove('occupied'));
    E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (const [index, side] of ['A', 'B'].entries()) {
      const hex = document.querySelector(`#hexGrid .hex.Side${side}`);
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810 + index,
        name: `Stop combat ${side}`, side, role: 'gueux', type: 'sbire', position: hex.dataset.position, level: 1, awakening: 1,
        attacks: ['shot-p-r'], stuff: {}, stats: {}, modifierStats: {}, resourceStocks: {},
        baseStats: { HP: 1000, physicalDamage: 10, speed: 10000, shift: 10 } });
      actor.stats.speed = 10000; actor.statut = ['alive']; actor.isDEAD = false;
      E.entites.push(actor);
      const created = C.createEntiteInDOM(actor); hex.appendChild(created.element); await created.spriteReady;
    }
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [E.entites[1]] } } });
    (await import("/js/combat/loop.js")).initFightEntites();
    G.manageBattleActions({ mode: G.BATTLE_ACTION_MODE.START });
    window.__stops = 0; window.__resolutions = 0;
    window.addEventListener('battleStopped', () => window.__stops++);
    window.addEventListener('battleResolved', () => window.__resolutions++);
  });
  await page.locator('#Box_Entite_991810').dispatchEvent('click', { detail: 1 });
  await page.waitForFunction(() => window.__adminActiveLiveEntityId === '991810');
  await page.getByRole('button', { name: 'Attaques', exact: true }).click();
  await page.locator('.admin-attack-row .admin-attack-pick-button').first().click();
  assert.deepEqual(await page.locator('.admin-attack-editor-input--text').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label'))), ['Nom affiché']);
  assert.equal(await page.getByText('Identité', { exact: true }).count(), 0);
  await page.evaluate(async () => {
    (await import("/js/combat/clock.js")).freezeCombatClock();
    const UI = await import("/js/ui/attacks.js");
    const R = await import("/js/combat/attackResolution.js");
    const E = await import("/js/entities/runtime.js");
    const D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const P = await import("/js/combat/effectParameters.js");
    const Data = await import('/js/data/attackEffects.js');
    Object.assign(window, { __UI:UI, __R:R, __E:E, __D:D, __P:P, __Data:Data });
    const entity = E.entites[0];
    // Keep both the actual card and a real serialized hover open during admin changes.
    const fixture = document.createElement('div'); fixture.id='effect-check';
    fixture.style.cssText='position:fixed;left:10px;top:10px;width:500px;z-index:999999;background:#111;color:white;max-height:85vh;overflow:auto';
    const card = UI.createAttackLightDescription(R.readAttackDefinitionsForEntity(entity)[0],entity);
    card.id='effect-card'; fixture.append(card);
    fixture.append(UI.createEntityAttackDisplay(entity,{presentation:'combat'}));
    document.body.append(fixture);
    fixture.querySelector('.attack-light-thumbnail').style.cssText='position:fixed;top:10px;left:600px;width:60px;height:60px;z-index:999999';
    const other = UI.createAttackLightDescription(R.readAttackDefinitionsForEntity(E.entites[1])[0],E.entites[1]);
    other.id='other-effect-card';other.hidden=true;document.body.append(other);
    // The app normally dismisses combat helpers on outside clicks. Suppress only that
    // document-level dismissal so admin button handlers can exercise refresh in place.
    document.body.addEventListener('click',event=>event.stopPropagation());
  });
  await page.locator('#effect-check .attack-light-thumbnail').hover();
  await page.locator('.stat-hover.combat-attack-hover .attack-effects-list').waitFor({state:'attached'});
  await page.evaluate(() => { window.__openEffectHelper=document.querySelector('.stat-hover.combat-attack-hover');window.__otherHTML=document.querySelector('#other-effect-card').innerHTML; });
  // Dispatch admin controls without moving the pointer away from the live hover.
  const button = async name => page.getByRole('button',{name,exact:true}).evaluate(node=>node.click());
  const checkbox = async (name,checked) => page.locator(`input[data-attack-effect="${name}"]`).evaluate((node,value)=>{node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));},checked);
  const param = key => page.locator(`[data-effect-parameter="${key}"]`);
  const setValue = async (locator,value) => locator.evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));},value);
  let checks=0;
  const verify = async (name, expected, {self=false}={}) => {
    const result=await page.evaluate(({name,self})=>{
      const selector=`[data-effect-name="${name}"][data-effect-target="${self?'self':'target'}"]`;
      return {card:document.querySelector('#effect-card '+selector)?.textContent||'',helper:window.__openEffectHelper.querySelector(selector)?.textContent||'',connected:window.__openEffectHelper.isConnected,other:document.querySelector('#other-effect-card').innerHTML===window.__otherHTML};
    },{name,self});
    assert.equal(result.connected,true,'The original helper is still open');
    assert.equal(result.helper,result.card,'Open helper and attack card agree');
    assert.match(result.card,expected);
    assert.equal(result.other,true,'Another entity remains untouched');checks+=4;
  };
  await button('Modifier Effets');
  for (const name of ['gigantisme','bonus-HP','bonus-vision','malus-agility']) await checkbox(name,true);
  assert.equal(await page.locator('input[data-attack-effect="bonus-HP"]').count(),1,'HP has its own independently configurable modifier');
  await verify('gigantisme',/3 cases.*10 secondes.*aucune statistique/);
  await button('Réglages Gigantisme');
  await page.getByRole('combobox',{name:'Taille occupée',exact:true}).selectOption('6');
  await verify('gigantisme',/6 cases.*10 secondes/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await button('Réglages Bonus de Points de Vie');
  await page.getByRole('combobox',{name:'Unité du montant',exact:true}).selectOption('percent');
  await setValue(param('effectValue').getByRole('spinbutton',{name:'Montant — montant fixe',exact:true}),50);
  await verify('bonus-HP',/Points de Vie.*50 %.*10 secondes/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await button('Réglages Bonus de Vision');
  await setValue(param('effectValue').getByRole('combobox',{name:'Montant — mode',exact:true}),'ratios');
  await param('effectValue').getByRole('button',{name:'Ajouter un ratio',exact:true}).evaluate(node=>node.click());
  await setValue(param('effectValue').getByRole('spinbutton',{name:'Montant — coefficient 1',exact:true}),.2);
  await verify('bonus-vision',/Vision.*points pendant 10 secondes/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await checkbox('gigantisme',false);await verify('gigantisme',/^$/);
  await verify('bonus-HP',/50 %/);await checkbox('gigantisme',true);await verify('gigantisme',/6 cases/);
  await button('Réglages Malus de Agilité');
  await verify('malus-agility',/Agilité.*10 points/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  for (const name of ['silence','sommeil','confusion','grab','lourdeur','poison','brulure','bafouillage','lenteur','folie','insolence','immobilisation','stun','charme','effroi','interruption']) await checkbox(name,true);
  await verify('silence',/3 secondes/);
  await button('Réglages Silence');
  const duration=param('effectDuration');
  await setValue(duration.getByRole('spinbutton',{name:'Durée — montant fixe',exact:true}),7.25);
  await verify('silence',/7,25 secondes/);
  await setValue(duration.getByRole('spinbutton',{name:'Durée — montant fixe',exact:true}),0);
  await verify('silence',/0 secondes/);
  await duration.getByRole('button',{name:'Reprendre la valeur par défaut',exact:true}).evaluate(node=>node.click());
  await verify('silence',/3 secondes/);
  // Give the ratio a non-zero source, then exercise the actual admin formula editor.
  await page.evaluate(()=>{const draft=window.__adminActiveLiveEntityDraft;draft.baseStats.intelligence=50;window.__E.recomputeEntityStats(draft);window.__R.notifyAttackSelection(draft);});
  await setValue(duration.getByRole('combobox',{name:'Durée — mode',exact:true}),'ratios');
  await duration.getByRole('button',{name:'Ajouter un ratio',exact:true}).evaluate(node=>node.click());
  await setValue(duration.getByRole('spinbutton',{name:'Durée — coefficient 1',exact:true}),.2);
  const checkFormula = async () => {
    const expected=await page.evaluate(()=>{const e=window.__adminActiveLiveEntityDraft,a=window.__R.readAttackDefinitionsForEntity(e)[0];return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3}).format(window.__P.previewAttackEffects(a,window.__D.createAttackStatView(e,a)).find(f=>f.effectName==='silence').effectDuration);});
    await verify('silence',new RegExp(`${expected} secondes`));
    assert.ok((await duration.locator('output').textContent()).includes(`${expected} s`),'Admin preview matches card and helper');checks++;
  };
  await checkFormula();
  await setValue(duration.getByRole('combobox',{name:'Durée — courbe 1',exact:true}),'progressive');
  await checkFormula();
  // Changing the ratio's source stat also refreshes the open helper.
  await page.evaluate(()=>{const e=window.__adminActiveLiveEntityDraft;e.baseStats.intelligence=80;window.__E.recomputeEntityStats(e);window.dispatchEvent(new CustomEvent('selectedArmyAUpdated',{detail:{entite:e}}));});
  const changedSource=await page.evaluate(()=>{const e=window.__adminActiveLiveEntityDraft,a=window.__R.readAttackDefinitionsForEntity(e)[0];return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3}).format(window.__P.previewAttackEffects(a,window.__D.createAttackStatView(e,a)).find(f=>f.effectName==='silence').effectDuration);});
  await verify('silence',new RegExp(`${changedSource} secondes`));
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await checkbox('silence',false);await verify('silence',/^$/);
  await checkbox('silence',true);await verify('silence',new RegExp(`${changedSource} secondes`));
  await button('Réglages Sommeil');
  await setValue(param('effectDuration').getByRole('spinbutton',{name:'Durée — montant fixe',exact:true}),8);
  await setValue(param('effectWakeBase').getByRole('spinbutton',{name:'Chance de réveil de base — montant fixe',exact:true}),15);
  await setValue(param('effectWakeRatio').getByRole('spinbutton',{name:'Coefficient des HP perdus — montant fixe',exact:true}),2.5);
  await verify('sommeil',/8 secondes.*15 % \+ 2,5 ×/);
  await setValue(param('effectWakeMovement').getByRole('spinbutton',{name:'Chance de réveil ajoutée par déplacement subi — montant fixe',exact:true}),12);
  await verify('sommeil',/\+ 12 points par déplacement subi/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await button('Réglages Confusion');
  await setValue(param('effectMoveInterval').getByRole('spinbutton',{name:'Intervalle des déplacements — montant fixe',exact:true}),.75);
  await setValue(param('effectMovementRecoilPercent').getByRole('spinbutton',{name:'Déstabilisation du déplacement — montant fixe',exact:true}),35);
  await verify('confusion',/0,75 secondes.*5 secondes.*35 points/);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  for(const [name,expected] of [['poison',/5 secondes.*1 secondes.*Dégâts sur la durée :/],['brulure',/5 dégâts par tick.*5 apports.*1 secondes.*5 secondes/],['bafouillage',/25 %.*5 secondes/],['lenteur',/25 %.*5 secondes/],['grab',/5 cases.*20 points/],['lourdeur',/50 %.*30 secondes/],['folie',/Brouille le ciblage.*8 secondes/],['insolence',/une priorité ou une activation.*8 secondes.*1 à 3 secondes/],['immobilisation',/5 secondes/],['stun',/5 secondes/],['charme',/5 secondes/],['effroi',/5 secondes/],['interruption',/recommence à zéro/]]) await verify(name,expected);
  await button('Réglages Insolence');
  await setValue(param('effectMinInterval').getByRole('spinbutton',{name:'Espacement minimum des actions — montant fixe',exact:true}),.5);
  await setValue(param('effectMaxInterval').getByRole('spinbutton',{name:'Espacement maximum des actions — montant fixe',exact:true}),2);
  await verify('insolence',/0,5 à 2 secondes/);
  await page.getByLabel('Réapplication',{exact:true}).selectOption('refresh');
  assert.equal(await page.evaluate(()=>window.__R.readAttackDefinitionsForEntity(window.__adminActiveLiveEntityDraft)[0].resolvedEffects.find(f=>f.effectName==='insolence').applicationMode),'refresh');
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await button('Réglages Brûlure');
  await setValue(page.getByRole('spinbutton',{name:'Cycle commun d’entretien (s)',exact:true}),6);
  await verify('brulure',/entretient le feu pendant 6 secondes/);
  await setValue(page.getByRole('spinbutton',{name:'Cycle commun d’entretien (s)',exact:true}),5);
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await page.getByRole('button',{name:/^< Retour attaque /}).evaluate(node=>node.click());
  await button('Modifier Effets soi');await checkbox('silence',true);
  await button('Réglages Silence');
  await setValue(param('effectDuration').getByRole('spinbutton',{name:'Durée — montant fixe',exact:true}),1.5);
  await verify('silence',/1,5 secondes/,{self:true});
  await verify('silence',new RegExp(`${changedSource} secondes`));
  await page.getByRole('button',{name:/^< Retour effets/}).evaluate(node=>node.click());
  await page.getByRole('button',{name:/^< Retour attaque /}).evaluate(node=>node.click());
  await button('Valider');
  await verify('silence',new RegExp(`${changedSource} secondes`));
  await verify('silence',/1,5 secondes/,{self:true});
  await page.screenshot({path:resolve(output,'open-helper-after-admin-edit.png'),fullPage:true});
  // Fresh hover must agree too, without a page reload.
  await page.mouse.move(600,20);await page.waitForTimeout(250);
  await page.locator('#effect-check .attack-light-thumbnail').hover();
  await page.locator('.stat-hover.combat-attack-hover .attack-effects-list').waitFor({state:'attached'});
  await page.evaluate(()=>window.__openEffectHelper=document.querySelector('.stat-hover.combat-attack-hover'));
  await verify('sommeil',/8 secondes.*15 % \+ 2,5 ×/);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${checks} checks: actual admin edits, fixed values/zero/defaults, progressive ratios, source stats, effect toggles, self effects, open/fresh helpers and validation.`);
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
