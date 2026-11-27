import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + '/') && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/html'); res.end(await readFile(path === root ? resolve(root, 'index.html') : path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('outputs/combat-tests', { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const { entites, enrichEntityStats, recomputeEntityStats } = await import("/js/entities/runtime.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const resolution = await import("/js/combat/attackResolution.js");
    const { setEntityAttackDefinitions: setKit, readAttackDefinitionsForEntity: readKit, readEntityCombatProfile: profile } = resolution;
    const { applyCombatProfileView } = await import("/js/rendering/hud.js");
    const { updateEntityAttackTargetDisplay: showTarget, getBattleTargetAttack } = await import("/js/rendering/hud.js"), { updateCombatantTargetZones } = await import("/js/board/deployment.js");
    const { selectAttackDecision, collectAttackTargetCandidates } = await import("/js/combat/loop.js");
    const { getAttackCastingVisual, animatePreparation, animateFinalPhase } = await import("/js/rendering/animations.js");
    const { showHealingFeedback, brulure } = await import("/js/combat/effects.js");
    const gameState = await import("/js/app/state.js");
    const { setGameOver, setOrderSide } = gameState;
    const { applyDamage } = await import("/js/combat/vitals.js");
    const check = (condition, message) => { if (!condition) throw Error(message); reports.push(message); };
    const reports = [];
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    setGameOver(false); setOrderSide(null); entites.length = 0;
    const host = document.createElement('div'); host.id = 'profile-fixture';
    host.innerHTML = `<style>
      #profile-fixture {position:fixed;inset:0;z-index:99999999;background:#130b0b;color:#eee;padding:20px;overflow:auto;box-sizing:border-box;}
      #profile-fixture .profile-panel {max-width:650px;margin:auto;}
      #profile-fixture .board-fixture {height:270px;position:relative;max-width:650px;margin:auto;}
      #profile-fixture .hex {position:absolute;top:90px;width:100px;height:100px;}
      #profile-fixture .effects-container {position:relative;top:20px;}
      #profile-fixture .entite-box {width:90px;height:90px;}
      #profile-fixture .target-role-img-container {position:relative;left:65px;top:20px;}
      #profile-fixture .target-role-img-container .role-img {position:relative;left:-20px;top:0;}
      #profile-fixture .Cast_Animation {position:relative;left:20px;top:30px;}
    </style><div class="board-fixture"></div><div class="profile-panel"></div>`;
    document.body.append(host);
    const board = host.querySelector('.board-fixture');
    const hexes = Array.from({ length: 5 }, (_, i) => {
      const hex = document.createElement('div'); hex.className = 'hex SideA'; hex.dataset.position = `hex_${700 + i}`;
      hex.style.left = `${i * 110}px`; hex.innerHTML = '<div class="socle neutre"></div>'; board.append(hex); return hex;
    });
    const boardState = (await import("/js/board/controller.js")).getHexes();
    boardState.hexesSideA.splice(0, boardState.hexesSideA.length, ...hexes);
    boardState.hexesSideB.length = 0;
    boardState.hexesNeutral.length = 0;
    const make = (id, side, index) => {
      const entity = { id, name: `Profile ${id}`, type: 'sbire', side, role: 'mage', level: 1, class: 'test',
        baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1 }, attacks: ['autoAttack'], position: hexes[index].dataset.position };
      enrichEntityStats(entity); entity.isDEAD = false; entity.statut = ['alive']; entity.role = 'mage';
      const box = document.createElement('div'); box.className = 'entite-box'; box.id = `Box_Entite_${id}`;
      box.innerHTML = `<div id="sbire_${id}"><div id="DragSprite_${id}"></div><div class="effects-container" id="effectsContainer_${id}"></div><div class="Cast_Animation" id="Cast_Animation_${id}"></div><div id="PopDow_${id}"></div><div id="TargetInfos_${id}" class="TargetInfos"></div><div id="TargetroleContainer_${id}" class="target-role-img-container"><div class="target-picto-hud"></div><div id="Targetrole-img_${id}" class="role-img"></div><div class="targetrole-img-hud"></div></div></div>`;
      hexes[index].append(box); hexes[index].classList.add('occupied'); entites.push(entity); return entity;
    };
    const actor = make(970001, 'A', 0), ally = make(970002, 'A', 1), enemy = make(970003, 'B', 2);
    setKit(actor, ['quickAttack', 'soin', 'resurrection', 'lancedejarret'], attackDetails);
    check(profile(actor).label === 'Sbire Nécro-invo-combattant Arbitre multi-portée', 'Whole owned kit determines the four independent axes');
    const panel = host.querySelector('.profile-panel');
    panel.innerHTML = '<div class="entite-role-type"></div><div class="entity-role-BadgeContainer"><div class="entity-role-container"><div class="entity-role-picto role-mage"></div><p class="entity-type-info entity-class"></p><strong><div class="entity-role-title">mage</div></strong></div><div class="RoleHexastone"></div></div>';
    for (const node of panel.querySelectorAll('div.entite-role-type, .entity-role-BadgeContainer, .entity-role-container, .entity-class, .RoleHexastone')) {
      applyCombatProfileView(node, actor, { text: node.matches('.entity-class, .entite-role-type'), helper: node.matches('.entity-class, .entite-role-type') });
    }
    const label = panel.querySelector('.entite-role-type');
    check(!label.textContent.includes('mage') && label.dataset.helperText.includes('Rôle sur le champ de bataille'), 'Out-of-battle designation excludes tactical role and supplies rich helper');
    check(panel.querySelectorAll('.entity-domain-picto').length === 3, 'All three domains have their own badge pictogram');
    const ownedSnapshot = JSON.stringify(actor.attackDetails);
    const ledgerSnapshot = JSON.stringify(actor.attackEssenceInventory);
    for (let i = 0; i < 10; i++) profile(actor);
    check(JSON.stringify(actor.attackDetails) === ownedSnapshot && JSON.stringify(actor.attackEssenceInventory) === ledgerSnapshot, 'Profile reads allocate no essence or socket and mutate no instance');
    const catalogEntry = attackDetails.find(attack => attack.functionName === 'quickAttack');
    const savedFunction = catalogEntry.combatFunction;
    catalogEntry.combatFunction = 'Support';
    check(readKit(actor).find(a => a.functionName === 'quickAttack').combatFunction === 'Attaquant', 'Owned attack never inherits later catalogue changes');
    catalogEntry.combatFunction = savedFunction;
    const clone = JSON.parse(JSON.stringify(actor));
    check(profile(clone).label === profile(actor).label, 'Serialized and reloaded instance retains combat profile');
    resolution.applyEntityAttackModifier(actor, 'quickAttack', { combatFunction: 'Support' }, attackDetails, { sourceId: 'temporary-function', durationMs: 180 });
    check(actor.classe === 'Support' && label.textContent.includes('Support') && !label.textContent.includes('Arbitre'), 'Temporary customization updates visible profile');
    recomputeEntityStats(actor);
    check(actor.attackDetails.find(a => a.functionName === 'quickAttack').combatFunction === 'Attaquant', 'Recomputation never bakes temporary function into owned base');
    await sleep(220);
    check(actor.classe === 'Arbitre' && label.textContent.includes('Arbitre'), 'Modifier expiry refreshes open profile without user interaction');
    const beforeEssenceModifier = JSON.stringify(actor.attackEssenceInventory);
    resolution.applyEntityAttackModifier(actor, 'quickAttack', { essenceSlots: [{ color: 'blue', kind: 'open' }] }, attackDetails, { sourceId: 'view-only-essence' });
    for (let i = 0; i < 5; i++) profile(actor);
    check(JSON.stringify(actor.attackEssenceInventory) === beforeEssenceModifier, 'Temporary essence projection never allocates a second owned essence');
    resolution.removeEntityAttackModifier(actor, 'view-only-essence');
    let rejected = false;
    try { resolution.applyEntityAttackModifier(actor, 'quickAttack', { combatFunction: 'bad' }, attackDetails, { sourceId: 'invalid' }); } catch { rejected = true; }
    check(rejected && !Object.values(actor.modifierAttacks).some(layer => layer.byId?.invalid), 'Invalid function is rejected before changing modifier data');
    const kit = readKit(actor); const named = name => kit.find(a => a.functionName === name);
    showTarget(actor);
    const initialHud = document.getElementById(`TargetroleContainer_${actor.id}`);
    check(initialHud.classList.contains('no-target') && !initialHud.dataset.attackKey
      && initialHud.querySelector('.role-img').classList.contains('role-none'),
    'Versatile entity starts with a neutral target HUD');
    const supportOnly = { ...actor, currentAttack: null, attackDetails: [named('soin'), named('resurrection')], attacks: ['soin', 'resurrection'] };
    const combatantOnly = { ...actor, currentAttack: null, attackDetails: [named('quickAttack'), named('soin')], attacks: ['quickAttack', 'soin'] };
    const invocationOnly = { ...actor, currentAttack: null, attackDetails: [named('lancedejarret')], attacks: ['lancedejarret'] };
    check(Boolean(getBattleTargetAttack(supportOnly)), 'Full support kit keeps an initial target HUD');
    check(Boolean(getBattleTargetAttack(combatantOnly)), 'Full combatant-domain kit keeps an initial target HUD');
    check(Boolean(getBattleTargetAttack(invocationOnly)), 'Full invocation kit keeps an initial target HUD');
    showTarget(actor, named('quickAttack'), enemy);
    const hud = document.getElementById(`TargetroleContainer_${actor.id}`);
    check(hud.classList.contains('Attaquant') && hud.querySelector('.role-img').classList.contains('role-mage'), 'Offensive selection displays tactical target and attacker pictogram');
    const beforeCandidate = hud.outerHTML;
    await selectAttackDecision(actor);
    check(hud.outerHTML === beforeCandidate, 'Candidate selection does not replace the last committed targeting HUD');
    showTarget(actor, named('lancedejarret'), hexes[4]);
    check(hud.classList.contains('sbire') && hud.classList.contains('domain-invocateur') && hud.querySelector('.role-img').classList.contains('role-Invocateur'), 'Invocation switches target pictogram while retaining Sbire frame');
    actor.currentAttack = named('quickAttack');
    updateCombatantTargetZones();
    check(hud.dataset.attackKey === 'lancedejarret', 'Unrelated refresh preserves last selected attack until next commitment');
    ally.isDEAD = true; ally.stats.HP.current = 0;
    showTarget(actor, named('resurrection'), ally);
    check(hud.classList.contains('Support') && hud.classList.contains('Necro') && !hud.classList.contains('domain-invocateur'), 'Resurrection replaces invocation with Necro Support HUD');
    ally.isDEAD = false; ally.stats.HP.current = 80;
    showTarget(actor, named('soin'), ally);
    check(!hud.classList.contains('Necro') && hud.classList.contains('Support'), 'Healing clears previous corpse targeting decoration');
    const multiDomainAttack = { ...named('soin'), attackTarget: ['ally', 'hexa'] };
    const candidates = collectAttackTargetCandidates(actor, multiDomainAttack);
    check(candidates.includes(ally) && candidates.includes(hexes[4]), 'A declared multi-domain attack exposes both living and tile candidates');
    actor.type = 'lord';
    check(profile(actor).label.startsWith('Lord Nécro-invo-combattant'), 'Lord rank accepts mixed living, corpse and tile kit');
    const priorHud = hud.outerHTML; showTarget(actor, named('quickAttack'), enemy);
    check(priorHud === hud.outerHTML, 'Sbire targeting-HUD update never overwrites Lord aggro HUD');
    actor.type = 'sbire';
    const withoutAsset = attack => ({ ...attack, castingAsset: '' });
    check(getAttackCastingVisual(withoutAsset(named('quickAttack'))).asset.endsWith('castingfx-base.gif'), 'Physical preparation gets default GIF');
    const magic = { ...withoutAsset(named('soin')), combatFunction: 'Attaquant' };
    check(getAttackCastingVisual(magic).className.includes('cast-tone-magical'), 'Magical preparation uses purple magic circle');
    check(getAttackCastingVisual({ ...magic, attackTarget: ['hexa'] }).className.includes('cast-tone-invocateur'), 'Magical tile preparation uses invocation tone');
    const hybrid = { ...magic, essenceSlots: [{ color: 'red' }, { color: 'blue' }], attacknature: ['hybridalDamage'] };
    check(getAttackCastingVisual(hybrid).className.includes('cast-tone-hybrid'), 'Hybrid preparation uses hybrid tone');
    check(getAttackCastingVisual(withoutAsset(named('soin'))).className.includes('cast-tone-support'), 'Magical support retains blue preparation tone');
    check(getAttackCastingVisual({ ...magic, castingAsset: '/custom.png' }).asset === '/custom.png', 'Explicit casting asset always wins');
    actor.preparationProgressRatio = 0.3;
    animatePreparation(actor, magic);
    const casting = document.getElementById(`cast_${actor.id}`);
    await new Promise(resolve => casting.complete ? resolve() : casting.addEventListener('load', resolve, { once: true }));
    check(casting.naturalWidth > 0 && casting.classList.contains('cast-tone-magical'), 'Actual casting node loads the fallback image and tone');
    check(getComputedStyle(casting).filter.includes('255deg'), 'Dynamic magical color overrides the old named support spell style');
    animateFinalPhase(casting);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const finalCastingFilter = getComputedStyle(casting).filter;
    check(finalCastingFilter.includes('255deg') && /brightness\([\d.]+\)$/.test(finalCastingFilter),
      `Preparation finale preserves the casting color while brightening: ${finalCastingFilter}`);
    const firstCount = document.querySelectorAll('.healing-feedback-vfx').length;
    showHealingFeedback(ally, 5); showHealingFeedback(ally, 6);
    const heals = [...document.querySelectorAll(`#effectsContainer_${ally.id} .healing-feedback-vfx`)];
    await Promise.all(heals.map(img => new Promise(resolve => img.complete && img.naturalWidth > 0 ? resolve() : img.addEventListener('load', resolve, { once: true }))));
    check(heals.length === 2 && new Set(heals.map(img => img.src)).size === 2 && heals.every(img => img.naturalWidth > 0), 'Repeated heals load distinct restarted animation resources');
    let fleeFactoryCalls = 0;
    gameState.configureBattleActionManager({
      createFleeButton: () => { fleeFactoryCalls += 1; return null; },
      isFleeLocked: () => true,
    });
    const lockedActions = gameState.manageBattleActions({ mode: gameState.BATTLE_ACTION_MODE.FLEE });
    check(lockedActions.mode === gameState.BATTLE_ACTION_MODE.HIDDEN && fleeFactoryCalls === 0,
      `Intentional flee lock hides battle actions without reporting a factory failure (${lockedActions.mode}/${fleeFactoryCalls})`);
    const effects = document.getElementById(`effectsContainer_${ally.id}`);
    const burnEffect = { effectStack: 1, effectDot: 1, effectDuration: 1 };
    ally.isDEAD = true;
    check(brulure(ally, burnEffect, actor) === false && !effects.querySelector('.burn'),
      'A dead target cannot acquire a new burn visual');
    ally.isDEAD = false;
    check(brulure(ally, burnEffect, actor) === true, 'A living target accepts burn');
    const burn = document.getElementById(`brulureVFX_${ally.id}`);
    check(burn && effects.contains(burn), 'Burn creates its own flame node');
    ally.isDEAD = true;
    const burnDeadline = performance.now() + 5000;
    while (burn.isConnected && performance.now() < burnDeadline) await sleep(25);
    ally.isDEAD = false;
    check(!burn.isConnected && !effects.querySelector('.burn'), 'Burn cleanup removes its flame when the target dies');
    check(document.querySelectorAll('.healing-feedback-vfx').length === firstCount, 'Each completed healing animation cleans its own node');
    showHealingFeedback(ally, 7);
    check(effects.querySelectorAll('.healing-feedback-vfx').length === 1, 'A later heal remains replayable after previous animations finish');
    const hp = enemy.stats.HP.current = 50;
    applyDamage(enemy, 5, actor, { ...named('soin'), attackTarget: ['enemy'], launchContextId: 'profile-heal' });
    check(enemy.stats.HP.current === hp + 5, 'Explicit support function heals despite enemy relation at impact');
    actor.stopPreparationAnimation?.();
    animatePreparation(actor, { ...magic, attackTarget: ['hexa'] });
    return reports;
  });
  console.log(reports.join('\n'));
  await page.screenshot({ path: 'outputs/combat-tests/combat-profile-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/combat-tests/combat-profile-mobile.png' });
  assert.equal(await page.locator('.profile-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth + 1), true, 'Profile fits mobile width');
  const spriteChecks = await page.evaluate(async () => {
    const { enrichEntityStats } = await import("/js/entities/runtime.js");
    const { createEntiteInDOM, getEntitySpriteSource } = await import("/js/rendering/entities.js");
    const sprite = new Image();
    await new Promise((resolve, reject) => {
      sprite.onload = resolve; sprite.onerror = reject;
      sprite.src = './media/sprites/grouille-doigt.png';
    });
    const reports = [];
    for (const id of [978801, 978802]) {
      const entity = { id, name: 'Preloaded sprite', type: 'sbire', side: 'A', class: 'grouille-doigt',
        sprite: './media/sprites/grouille-doigt.png', attacks: ['autoAttack'], level: 1,
        baseStats: { HP: 30, strength: 1, agility: 1, intelligence: 1 } };
      enrichEntityStats(entity);
      const result = createEntiteInDOM(entity, { spriteImage: sprite });
      const pixels = result.canvas.getContext('2d').getImageData(0, 0, result.canvas.width, result.canvas.height).data;
      if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw Error('Preloaded sprite is blank on creation');
      if ((await result.spriteReady).image !== sprite) throw Error('Loaded image was requested again');
      reports.push('Preloaded sprite reused and drawn synchronously: ' + id);
      result.element.remove();
      entity.isDEAD = true;
      if (!getEntitySpriteSource(entity).endsWith('0-dead.png')) throw Error('Dead entity preloads wrong sprite');
    }
    reports.push('Dead entity preloads the actual corpse sprite');
    return reports;
  });
  console.log(spriteChecks.join('\n'));
  assert.deepEqual(errors, []);
  console.log(`PASS: ${reports.length + spriteChecks.length + 1} combat profile, targeting HUD, casting, healing and sprite checks.`);
} finally { await browser.close(); server.close(); }
