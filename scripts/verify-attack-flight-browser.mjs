import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + '/') && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', mime[extname(path)] || 'text/html');
    res.end(await readFile(path === root ? resolve(root, 'index.html') : path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
await mkdir('outputs/combat-tests', { recursive: true });
await page.exposeFunction('captureCombatTest', name => page.screenshot({ path: `outputs/combat-tests/${name}.png` }));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.text().startsWith('FLIGHT ')) console.log(message.text()); });
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const { screenEffectRect } = await import('/js/ui/viewport.js');
    const { entites, enrichEntityStats, recomputeEntityStats } = await import("/js/entities/runtime.js");
    const { createAttackFlight, acceptsImpactTarget, acceptsSelectedTarget, getFlightMode } = await import("/js/combat/attacks.js");
    const { animationProjectile, finishMeleeCloneOnDeath, animationMelee, clearProjectileEffects } = await import("/js/rendering/animations.js");
    const { executeAttack, resolveAttackImpact } = await import("/js/combat/attacks.js");
    const { makeRoomForSummon, createEntityIngame } = await import("/js/entities/spawn.js");
    const { consommationSummon, summonEntite } = await import("/js/combat/summons.js");
    const { LifeandDeath, estimateCancelledAttackHp } = await import("/js/combat/vitals.js");
    const { getEntityCombatDetails, recordEntityCombatMovement } = await import("/js/storage/entityStorage.js");
    const { checkGameOver, setGameOver, configureBattleActionManager } = await import("/js/app/state.js");
    configureBattleActionManager({ createQuitButton: (await import("/js/app/stages.js")).createQuitButton });
    const { getAttackNatureRules, getAttackResolutionFlags, setEntityAttackDefinitions, splitAttackNatureAmount } = await import("/js/combat/attackResolution.js");
    const { getSafe } = await import("/js/entities/rules.js");
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { calculateProfanationSummonLevel, calculateLvlMaxEntiteWithWill } = await import("/js/combat/statistics.js");
    const { createAttackDescriptionContent, createAttackLightDescription } = await import("/js/ui/attacks.js"), { refreshCodexUmbraPanel } = await import("/js/ui/codex/stats.js");
    const { createCorpseLoot } = await import("/js/items/loot.js");
    const { entiteTurn, runTargetSearchWindow } = await import("/js/combat/loop.js");
    const { combatNow } = await import("/js/combat/timeline.js");
    const { rebuildBoardOccupancy, refreshHexOccupancy, invalidateFootprintGeometry } = await import("/js/board/controller.js");
    const reports = [];
    const check = (condition, message) => { if (!condition) throw Error(message); reports.push(message); if (reports.length % 10 === 0) console.log('FLIGHT ' + reports.length + ': ' + message); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitForVisual = async predicate => {
      for (let i = 0; i < 100 && !predicate(); i++) await sleep(5);
    };
    const host = document.createElement('div');
    host.id = 'combat-fixture';
    host.innerHTML = `<style>
      #combat-fixture { position: fixed; inset: 0; background: #222; z-index: 100; }
      #combat-fixture .hex { position: absolute; top: 260px; width: 100px; height: 100px; }
      #combat-fixture .entite-box, #combat-fixture .test-sprite { width: 70px; height: 70px; }
      #combat-fixture .entite-box { position: absolute; left: 15px; top: 15px; }
      #combat-fixture .sprite-container, #combat-fixture .test-sprite { position: relative; }
      #combat-fixture canvas { width: 70px; height: 70px; }
    </style>`;
    document.body.appendChild(host);
    const hexes = Array.from({ length: 6 }, (_, i) => {
      const hex = document.createElement('div');
      hex.className = 'hex Neutral'; hex.dataset.position = `hex_${800 + i}`;
      hex.style.left = `${100 + i * 170}px`; hex.innerHTML = '<div class="socle neutre"></div>';
      host.appendChild(hex); return hex;
    });
    let serial = 990000;
    const move = (entity, hex) => {
      const box = document.getElementById(`Box_Entite_${entity.id}`);
      box.closest('.hex')?.classList.remove('occupied');
      entity.position = hex.dataset.position; box.dataset.position = entity.position;
      hex.appendChild(box); hex.classList.add('occupied');
      // This fixture bypasses the game's movement API deliberately. Publish
      // its manual moves to the same registry used by real projectile impacts.
      rebuildBoardOccupancy(host);
    };
    const makeEntity = (hex, side = 'B') => {
      const entity = { id: ++serial, name: `Flight ${serial}`, type: 'sbire', side, class: 'test-flight', level: 1,
        baseStats: { HP: 200, strength: 1, agility: 1, intelligence: 1, physicalDamage: 30, magicalDamage: 30, will: 0 },
        attacks: ['autoAttack'], sprite: './media/sprites/mouche-asticoteuse.png', position: hex.dataset.position };
      enrichEntityStats(entity); entity.isDEAD = false; entity.statut = ['alive'];
      entity.stats.dodge = 0;
      entity.stats.criticalChance = 0;
      const box = document.createElement('div'); box.id = `Box_Entite_${entity.id}`; box.className = 'entite-box';
      box.innerHTML = `<div id="sbire_${entity.id}"><div id="spriteContainer_${entity.id}" class="sprite-container"><div id="Animationsprite_${entity.id}"><div id="DragSprite_${entity.id}" class="test-sprite"><canvas id="spriteCanvas_${entity.id}" width="70" height="70"></canvas></div></div><div id="Cast_Animation_${entity.id}"></div></div><div id="effectsContainer_${entity.id}"></div><div id="PopDow_${entity.id}"></div><div id="SpeedInterface_${entity.id}" class="speed-interface"><div class="atb-container"><div id="atbFill_${entity.id}" class="atb-fill"></div></div></div><div class="attack-bar-container"><div id="currentAttackBar_${entity.id}" class="attack-bar-fill empty"></div></div></div>`;
      host.appendChild(box); entites.push(entity); move(entity, hex);
      const ctx = box.querySelector('canvas').getContext('2d'); ctx.fillStyle = '#ddd'; ctx.fillRect(10, 10, 50, 50);
      return entity;
    };
    const attacker = makeEntity(hexes[0], 'A');
    const target = makeEntity(hexes[3]);
    const replacement = makeEntity(hexes[5], 'A');
    const attack = (natures, patch = {}) => ({ functionName: 'flight-test', displayName: 'Flight test', combatFunction: 'Attaquant',
      physicalRatio: 1, magicalRatio: 0, piercingRatio: 0,
      attacknature: natures, attackRange: ['range'], attackTarget: ['enemy'], deadTarget: ['no'],
      preparationTime: 30, executionTime: 400, recoveryTime: 30, cooldown: 40, effets: [], selfEffects: [], ...patch });
    const physical = attack(['physicalDamage']);
    const magical = attack(['magicalDamage']);
    const hybrid = attack(['hybridalDamage']);
    const kinetic = attack(['physicalDamage', 'piercingDamage']);
    const spectral = attack(['magicalDamage', 'piercingDamage']);
    const triple = attack(['hybridalDamage', 'piercingDamage']);
    const beforeAvoidance = getEntityCombatDetails(target).physicalProjectilesAvoided;
    const avoided = createAttackFlight(attacker, target, physical, { physical: 40 });
    move(target, hexes[4]);
    recordEntityCombatMovement(target);
    await resolveAttackImpact(avoided);
    avoided.recordManualAvoidance();
    check(getEntityCombatDetails(target).physicalProjectilesAvoided === beforeAvoidance + 1,
      'A physical projectile missing after manual movement credits exactly one avoided projectile');
    move(target, hexes[3]);
    const forcedMiss = createAttackFlight(attacker, target, physical, { physical: 40 });
    move(target, hexes[4]);
    recordEntityCombatMovement(target, { forced: true });
    await resolveAttackImpact(forcedMiss);
    check(getEntityCombatDetails(target).physicalProjectilesAvoided === beforeAvoidance + 1,
      'Forced movement never credits a manually avoided projectile');
    move(target, hexes[3]);
    const returned = createAttackFlight(attacker, target, physical, { physical: 40 });
    move(target, hexes[4]); recordEntityCombatMovement(target);
    move(target, hexes[3]); recordEntityCombatMovement(target);
    returned.recordManualAvoidance();
    const guided = createAttackFlight(attacker, target, magical, { magical: 40 });
    move(target, hexes[4]); recordEntityCombatMovement(target);
    guided.recordManualAvoidance();
    check(getEntityCombatDetails(target).physicalProjectilesAvoided === beforeAvoidance + 1,
      'Returning to the impact hex or moving against a guided spell grants no avoidance credit');
    move(target, hexes[3]);
    attacker.stats.runtimeCallback = () => 'event-runtime';
    const runtimeFlight = createAttackFlight(attacker, target,
      { ...hybrid, runtimeCallback: () => 'attack-runtime' }, { hybridalDamage: 30 });
    delete attacker.stats.runtimeCallback;
    check(runtimeFlight.attack.runtimeCallback === undefined
      && runtimeFlight.source.stats.runtimeCallback === undefined,
      'Runtime callbacks are excluded from serializable flight snapshots');
    check(getFlightMode(physical) === 'physical' && getFlightMode(magical) === 'magical'
      && getFlightMode(hybrid) === 'mixed' && getFlightMode(kinetic) === 'physical'
      && getFlightMode(spectral) === 'mixed' && getFlightMode(triple) === 'triple', 'Nature policies');
    const kineticFlags = getAttackResolutionFlags(kinetic);
    check(kineticFlags.hasPhysical && kineticFlags.hasPiercing
      && !kineticFlags.hasMagical && !kineticFlags.hasMagicalBehavior,
    'Cinétique contains physical and piercing contributions only');
    check(getAttackNatureRules(kinetic).label === 'Cinétique'
      && getAttackNatureRules(spectral).label === 'Spectrale',
    'Mixed piercing natures use their dedicated names');
    const kineticSplit = splitAttackNatureAmount(kinetic, 100);
    check(kineticSplit.physical === 50 && kineticSplit.piercingDamage === 50
      && kineticSplit.magical === 0 && kineticSplit.hybridalDamage === 0,
    'Cinétique splits damage between physical and piercing only');
    const spectralFlight = createAttackFlight(attacker, target, spectral, { magical: 30, piercingDamage: 20 });
    attacker.isDEAD = true;
    const spectralSources = spectralFlight.impactSources();
    check(spectralFlight.remnantNature === 'piercing' && spectralFlight.guidanceLost
      && spectralSources.magical === 0 && spectralSources.piercingDamage === 20
      && Number(spectralSources.physical || 0) === 0,
    'Spectrale loses magic and retains only its piercing contribution after caster death');
    attacker.isDEAD = false;
    check(!getAttackResolutionFlags(physical).canMissAccuracy, 'No physical ranged accuracy roll');
    check(getAttackResolutionFlags({ ...magical, combatFunction: 'Support', attackTarget: ['ally'] }).canAmbidextry, 'Allied spell ambidextry enabled');
    const dodgeRandom = Math.random;
    const beforeDodge = target.stats.HP.current;
    try {
      target.baseStats.dodge = 100;
      recomputeEntityStats(target);
      Math.random = () => 0;
      check(await resolveAttackImpact(createAttackFlight(attacker, target, magical, { magical: 40 })) === 'hit'
        && target.stats.HP.current < beforeDodge && !getEntityCombatDetails(target).procs.dodge,
        'Pure magical ranged impact is undodgeable');
      target.stats.HP.current = beforeDodge;
      const dodged = createAttackFlight(attacker, target, physical, { physical: 40 });
      const expectedPreserved = estimateCancelledAttackHp(dodged.source, target, physical, { physical: 40 });
      check(await resolveAttackImpact(dodged) === 'dodged' && target.stats.HP.current === beforeDodge,
        'Physical ranged impact is subject to the dodge roll');
      check(getEntityCombatDetails(target).defenseHp.dodge === expectedPreserved && expectedPreserved > 0
        && getEntityCombatDetails(target).procs.dodge === 1,
        'A real dodged projectile records preserved HP separately from its single dodge proc');
    } finally { target.baseStats.dodge = 0; recomputeEntityStats(target); Math.random = dodgeRandom; }
    const launch = (flight, callback = () => resolveAttackImpact(flight), duration = 400) => animationProjectile(attacker, flight.target, callback, {
      id: flight.id, attacknature: flight.attack.attacknature, executionTime: duration, flight,
    });

    let f = createAttackFlight(attacker, target, physical, { physical: 40 });
    const launchStrength = getSafe(f.source, 'strength');
    attacker.stats.strength += 100;
    check(getSafe(f.source, 'strength') === launchStrength, 'Attacker calculation stats remain fixed for the flight');
    attacker.stats.strength -= 100;
    const initialReplacementHP = replacement.stats.HP.current;
    let result = launch(f);
    check(JSON.stringify(attacker).includes(f.id), 'In-flight entity data stays JSON serializable');
    await sleep(80); move(target, hexes[4]); move(replacement, hexes[3]);
    attacker.currentAttack = magical;
    await result;
    check(replacement.stats.HP.current < initialReplacementHP && target.stats.HP.current === target.stats.HP.max,
      'Fixed shot hits new occupant, including ally, and retains original nature');
    move(replacement, hexes[5]); move(target, hexes[3]);
    f = createAttackFlight(attacker, target, physical, { physical: 40 });
    result = launch(f);
    await sleep(80); move(target, hexes[4]);
    check(await result === 'miss', 'Empty aimed hex produces a miss');
    move(target, hexes[3]);
    attacker.stats.bloodThirsty = 1000;
    f = createAttackFlight(attacker, target, { ...physical, selfEffects: ['lifesteal'] }, { physical: 40 });
    result = launch(f);
    await sleep(80); attacker.isDEAD = true; attacker.stats.HP.current = 0;
    check(await result === 'hit', 'Physical shot survives shooter death');
    check(attacker.stats.HP.current === 0, 'Posthumous shot lifesteal cannot revive its dead shooter');
    attacker.stats.bloodThirsty = 0;
    attacker.isDEAD = false; attacker.stats.HP.current = attacker.stats.HP.max;

    f = createAttackFlight(attacker, target, magical, { magical: 40 });
    let hitCount = 0;
    result = launch(f, () => { hitCount++; return 'hit'; });
    await sleep(80);
    const pureDispelStartedAt = performance.now();
    attacker.isDEAD = true;
    await waitForVisual(() => document.querySelector(`.magic-projectile-dispersion[data-projectile-id="${CSS.escape(f.id)}"]`));
    check(document.querySelectorAll(`.magic-projectile-dispersion[data-projectile-id="${CSS.escape(f.id)}"] .magic-projectile-dispel-particle`).length === 7,
      'Magical projectile disperses into forward particles when its caster dies');
    check(await result === 'dispelled' && hitCount === 0
      && performance.now() - pureDispelStartedAt < 250
      && Boolean(document.querySelector(`.magic-projectile-dispersion[data-projectile-id="${CSS.escape(f.id)}"]`)),
    'Magical shot resolves immediately while its detached dispersion continues');
    attacker.isDEAD = false;
    f = createAttackFlight(attacker, target, magical, { magical: 40 });
    result = launch(f, () => {
      const el = document.getElementById(f.id);
      const rect = screenEffectRect(document.getElementById(`sbire_${target.id}`).getBoundingClientRect());
      const transform = new DOMMatrix(getComputedStyle(el).transform);
      check(Math.abs(transform.m41 - rect.left - rect.width / 2) < 6, 'Magical homing reaches moved target');
      return 'hit';
    });
    await sleep(80); move(target, hexes[4]); await result;
    move(target, hexes[3]);

    f = createAttackFlight(attacker, target, spectral, { magical: 30, piercingDamage: 20 });
    result = launch(f, () => 'hit');
    await sleep(80);
    attacker.isDEAD = true;
    await waitForVisual(() => document.getElementById(f.id)?.classList.contains('mixed-piercing-remnant'));
    const spectralProjectile = document.getElementById(f.id);
    check(spectralProjectile?.classList.contains('mixed-piercing-remnant')
      && spectralProjectile.classList.contains('piercingDamage')
      && !spectralProjectile.classList.contains('physicalDamage'),
    'Spectrale visually becomes a piercing remnant, never a physical one');
    check(getComputedStyle(spectralProjectile.querySelector('.projectile')).backgroundColor === 'rgb(185, 154, 0)',
      'Spectrale piercing remnant visibly turns yellow');
    await result;
    attacker.isDEAD = false;

    for (const [moved, dead, expected] of [[false, false, 100], [true, false, 100], [false, true, 50], [true, true, 50]]) {
      f = createAttackFlight(attacker, target, hybrid, { hybridalDamage: 100 });
      if (moved) move(target, hexes[4]);
      attacker.isDEAD = dead;
      const values = f.impactSources();
      check(['physical', 'magical', 'hybridalDamage', 'piercingDamage'].reduce((n, k) => n + (values[k] || 0), 0) === expected,
        `Hybrid contribution moved=${moved}, dead=${dead}`);
      attacker.isDEAD = false; move(target, hexes[3]);
    }
    const originalLog = console.log;
    const originalRandom = Math.random;
    const resistanceInputs = [];
    const sourceStages = [];
    console.log = (...args) => {
      if (args[0] === '5) Résistances') resistanceInputs.push(structuredClone(args[1]));
      if (args[0] === '3) Sources') sourceStages.push(structuredClone(args[1]));
      originalLog(...args);
    };
    Math.random = () => 0.99;
    try {
      for (const moved of [false, true]) {
        target.stats.HP.current = target.stats.HP.max;
        if (target.stats.armor) target.stats.armor.current = 0;
        f = createAttackFlight(attacker, target, hybrid, { hybridalDamage: 30 });
        result = launch(f);
        if (moved) { await sleep(80); move(target, hexes[4]); }
        check(await result === 'hit', `Real hybrid impact moved=${moved}`);
        const base = sourceStages.at(-1)?.base;
        check(base && base.physical === 0 && base.piercingDamage === 0
          && base.magical === 0 && base.hybridalDamage === 30,
          `Real hybrid base sources moved=${moved}: ${JSON.stringify(base)}`);
        const before = resistanceInputs.at(-1)?.before;
        check(before && before.physical > 0 && before.piercingDamage === 0
          && before.magical > 0 && before.hybridalDamage === 0,
          `Real hybrid resistance input moved=${moved}: ${JSON.stringify(before)}`);
        move(target, hexes[3]);
      }
    } finally {
      console.log = originalLog;
      Math.random = originalRandom;
      target.stats.HP.current = target.stats.HP.max;
    }

    move(target, hexes[3]);
    move(replacement, hexes[5]);
    target.stats.HP.current = target.stats.HP.max;
    replacement.stats.HP.current = replacement.stats.HP.max;
    const replacementBeforeHybridRemnant = replacement.stats.HP.current;
    f = createAttackFlight(attacker, target, hybrid, { hybridalDamage: 40 });
    result = launch(f, undefined, 900);
    await sleep(80);
    move(target, hexes[4]);
    check(f.targetMoved === false && f.resolveTarget(entites) === target,
      'Living caster keeps hybrid projectile guided after target movement');
    attacker.isDEAD = true;
    await sleep(40);
    const hybridProjectile = document.getElementById(f.id);
    check(f.guidanceLost && f.lockedHex === hexes[4]
      && hybridProjectile?.classList.contains('hybrid-physical-remnant')
      && document.querySelectorAll(`.magic-projectile-dispersion[data-projectile-id="${CSS.escape(f.id)}"] .magic-projectile-dispel-particle`).length === 7,
    'Caster death disperses hybrid magic and turns the moving core into a physical remnant');
    check(getComputedStyle(hybridProjectile.querySelector('.projectile')).backgroundColor === 'rgb(176, 0, 0)',
      'Hybrid physical remnant visibly turns red');
    move(target, hexes[3]);
    move(replacement, hexes[4]);
    await sleep(100);
    await window.captureCombatTest('hybrid-magic-dispersion');
    check(await result === 'hit' && replacement.stats.HP.current < replacementBeforeHybridRemnant
      && target.stats.HP.current === target.stats.HP.max,
    'Hybrid physical remnant hits the new occupant of its locked hex');
    attacker.isDEAD = false;
    move(replacement, hexes[5]);
    move(target, hexes[3]);

    f = createAttackFlight(attacker, target, hybrid, { hybridalDamage: 40 });
    result = launch(f);
    await sleep(80);
    attacker.isDEAD = true;
    await sleep(35);
    move(target, hexes[4]);
    check(await result === 'miss',
      'Target dodges hybrid physical remnant by leaving its locked hex empty');
    attacker.isDEAD = false;
    move(target, hexes[3]);

    f = createAttackFlight(attacker, target, triple, { hybridalDamage: 100, piercingDamage: 20 });
    move(target, hexes[4]); attacker.isDEAD = true;
    check(!f.cancelled() && f.impactSources().hybridalDamage === 100 && f.impactSources().piercingDamage === 20,
      'Triple nature retains homing and all contributions after movement and death');
    attacker.isDEAD = false; move(target, hexes[3]);
    const rezAttack = attack(['magicalDamage'], { combatFunction: 'Support', attackTarget: ['ally'], deadTarget: ['yes'] });
    target.isDEAD = true; target.stats.HP.current = 0;
    check(acceptsImpactTarget(rezAttack, target), 'Resurrection accepts corpse after camp change');
    target.corpseConsumed = true;
    check(!acceptsImpactTarget(rezAttack, target), 'Consumed corpse rejected');
    target.corpseConsumed = false;
    target.corpseDestroyed = true;
    check(!acceptsImpactTarget(rezAttack, target), 'Destroyed corpse rejected');
    target.corpseDestroyed = false; target.isDEAD = false; target.stats.HP.current = 60;
    check(!acceptsImpactTarget(rezAttack, target), 'Resurrection rejects already living target');
    target.stats.magicalResistance = 99999;
    f = createAttackFlight(attacker, target, { ...magical, combatFunction: 'Support', attackTarget: ['ally'] }, { magical: 25 });
    await resolveAttackImpact(f);
    check(target.stats.HP.current === 85, 'Healing ignores camp at impact and all resistances');
    const healPopup = document.querySelector(`#PopDow_${target.id} .BattleText.healing-feedback`);
    check(healPopup?.textContent === '+25 HP'
      && Boolean(healPopup.querySelector('.healing-feedback-icon')),
    'Healing displays effective HP restored with its icon');
    check(getComputedStyle(healPopup).color === 'rgb(0, 255, 0)'
      && getComputedStyle(healPopup).textShadow === 'none'
      && getComputedStyle(healPopup).filter === 'none',
    'Healing popup uses plain #00ff00 without shadow or filter');
    check(Boolean(document.querySelector(`#effectsContainer_${target.id} img[data-effect-asset="heal-green.gif"]`)),
      'Healing plays heal-green.gif on target');

    const savedCombatEntities = [...entites];
    entites.length = 0;
    const searcher = makeEntity(hexes[0], 'A');
    const futureCorpse = makeEntity(hexes[5], 'B');
    setEntityAttackDefinitions(searcher, ['profanation'], attackDetails);
    searcher.role = 'gueux';
    futureCorpse.role = 'gueux';
    const searchPromise = runTargetSearchWindow(searcher, 500);
    await sleep(20);
    check(Boolean(document.querySelector(`#targetSearchIndicator_${searcher.id}.target-search-indicator--searching`))
      && document.getElementById(`Box_Entite_${searcher.id}`)?.classList.contains('entity-target-searching'),
    'Target search displays magnifier and keeps full ready state');
    futureCorpse.isDEAD = true;
    futureCorpse.statut = ['dead'];
    futureCorpse.stats.HP.current = 0;
    const searchResult = await searchPromise;
    check(searchResult.status === 'found' && searchResult.target === futureCorpse && searchResult.attempts === 1,
      'Target search acquires a newly valid target on its next probe');
    check(Boolean(document.getElementById(`atbFill_${searcher.id}`)?.classList.contains('target-search-pulse')),
      'Target search pulses ATB blue on each probe');
    check(!document.getElementById(`targetSearchIndicator_${searcher.id}`)
      && !document.getElementById(`Box_Entite_${searcher.id}`)?.classList.contains('entity-target-searching'),
    'Target search cleans its magnifier after acquisition');
    document.getElementById(`Box_Entite_${searcher.id}`)?.remove();
    document.getElementById(`Box_Entite_${futureCorpse.id}`)?.remove();
    entites.length = 0;
    entites.push(...savedCombatEntities);

    const savedEntitiesBeforeFailedSearch = [...entites];
    entites.length = 0;
    const waitingRez = makeEntity(hexes[0], 'A');
    const livingOpponent = makeEntity(hexes[5], 'B');
    setEntityAttackDefinitions(waitingRez, ['resurrection'], attackDetails);
    waitingRez.role = 'gueux';
    waitingRez.stats.speed = 300;
    waitingRez.baseStats.speed = 300;
    livingOpponent.role = 'gueux';
    const failedTurn = entiteTurn(waitingRez, [livingOpponent]);
    await sleep(680);
    const failedSearchVisualState = {
      unhappy: Boolean(document.querySelector(`#targetSearchIndicator_${waitingRez.id}.target-search-indicator--failed`)),
      phase: waitingRez.currentPhase,
      recoveryGif: Boolean(document.querySelector(`#effectsContainer_${waitingRez.id} .recoveryGif`)),
      speedRecovery: Boolean(document.getElementById(`SpeedInterface_${waitingRez.id}`)?.classList.contains('recuperation')),
      attackRecovery: Boolean(document.getElementById(`currentAttackBar_${waitingRez.id}`)?.classList.contains('recovery')),
    };
    check(failedSearchVisualState.unhappy
      && failedSearchVisualState.phase === 'target-search-recovery'
      && failedSearchVisualState.recoveryGif
      && failedSearchVisualState.speedRecovery
      && !failedSearchVisualState.attackRecovery,
    'Exhausted target search displays unhappy icon during full-speed recovery');
    await failedTurn;
    for(let i=0;i<100 && waitingRez.turnCount<2;i++) await sleep(10);
    check(waitingRez.turnCount >= 2 && !document.getElementById(`targetSearchIndicator_${waitingRez.id}`),
      'Failed search completes recovery then starts a fresh normal turn');
    waitingRez.isDEAD = true;
    waitingRez.stats.HP.current = 0;
    document.getElementById(`Box_Entite_${waitingRez.id}`)?.remove();
    document.getElementById(`Box_Entite_${livingOpponent.id}`)?.remove();
    entites.length = 0;
    entites.push(...savedEntitiesBeforeFailedSearch);
    target.stats.magicalResistance = 0;

    const jarret = { summonType: 'consommable', summonEffet: ['healConsommable'], summonDuration: 0.15 };
    const beforeJarretStats = getEntityCombatDetails(target);
    const addJarret = (hex, id) => { const node = document.createElement('div'); node.id = id; node.className = 'summon'; hex.appendChild(node); hex.classList.add('consommable-summoned'); };
    addJarret(hexes[3], 'jarret-test-1');
    consommationSummon(jarret, hexes[3], 'jarret-test-1', () => {});
    check(target.stats.HP.current === 90 && !document.getElementById('jarret-test-1'), 'Jarret consumed immediately on occupied landing');
    await sleep(180);
    check(hexes[3].classList.contains('occupied'), 'Consumable expiry never clears entity occupancy');
    addJarret(hexes[4], 'jarret-test-2');
    consommationSummon(jarret, hexes[4], 'jarret-test-2', () => {});
    move(target, hexes[4]); await sleep(30);
    check(target.stats.HP.current === 95, 'Preshoot consumable triggers on later arrival');
    check(getEntityCombatDetails(target).consumablesGround === beforeJarretStats.consumablesGround + 2
      && getEntityCombatDetails(target).consumablesSupport === beforeJarretStats.consumablesSupport + 2
      && getEntityCombatDetails(target).consumableHealingReceived === beforeJarretStats.consumableHealingReceived + 10,
      'Generated Jarrets record two ground consumptions and ten actual restored HP');
    await sleep(170);
    move(target, hexes[3]);
    const collisionJarret = { ...jarret, summonDuration: 0.12 };
    addJarret(hexes[1], 'jarret-displaced');
    consommationSummon(collisionJarret, hexes[1], 'jarret-displaced', () => {}, { attacker });
    addJarret(hexes[1], 'jarret-incoming');
    const collisionResult = consommationSummon(
      collisionJarret, hexes[1], 'jarret-incoming', () => {}, { attacker }
    );
    const displacedJarretHex = document.getElementById('jarret-displaced')?.closest('.hex');
    check(collisionResult.displaced?.status === 'displaced'
      && displacedJarretHex && displacedJarretHex !== hexes[1]
      && document.getElementById('jarret-incoming')?.closest('.hex') === hexes[1],
      'Incoming ground consumable keeps aimed hex and displaces previous consumable');
    await sleep(150);
    const addTemporaryBlockers = excluded => [...document.querySelectorAll('.hex[data-position]')]
      .filter(hex => !excluded.includes(hex))
      .map(hex => {
        const blocker = document.createElement('div');
        blocker.className = 'battle-element';
        blocker.dataset.position = hex.dataset.position;
        hex.appendChild(blocker);
        refreshHexOccupancy(hex);
        return blocker;
      });
    const originalZoneClasses = hexes.slice(1, 3).map(hex => hex.className);
    hexes[1].classList.remove('Neutral', 'SideB'); hexes[1].classList.add('SideA');
    hexes[2].classList.remove('Neutral', 'SideA'); hexes[2].classList.add('SideB');
    let groundSummonBlockers = addTemporaryBlockers([hexes[1], hexes[2]]);
    addJarret(hexes[1], 'jarret-enemy-fallback-old');
    consommationSummon(collisionJarret, hexes[1], 'jarret-enemy-fallback-old', () => {}, { attacker });
    addJarret(hexes[1], 'jarret-enemy-fallback-new');
    const enemyFallbackResult = consommationSummon(
      collisionJarret, hexes[1], 'jarret-enemy-fallback-new', () => {}, { attacker }
    );
    check(enemyFallbackResult.displaced?.position === hexes[2].dataset.position
      && document.getElementById('jarret-enemy-fallback-old')?.closest('.hex') === hexes[2],
      'Ground consumable uses enemy camp only after allied and neutral fallback fail');
    const removeBlocker = blocker => { const hex = blocker.closest('.hex'); blocker.remove(); refreshHexOccupancy(hex); };
    groundSummonBlockers.forEach(removeBlocker);
    await sleep(150);
    groundSummonBlockers = addTemporaryBlockers([hexes[1]]);
    addJarret(hexes[1], 'jarret-no-room-old');
    consommationSummon(collisionJarret, hexes[1], 'jarret-no-room-old', () => {}, { attacker });
    addJarret(hexes[1], 'jarret-no-room-new');
    const noRoomResult = consommationSummon(
      collisionJarret, hexes[1], 'jarret-no-room-new', () => {}, { attacker }
    );
    check(noRoomResult.displaced?.status === 'destroyed-no-room'
      && !document.getElementById('jarret-no-room-old')
      && document.getElementById('jarret-no-room-new')?.closest('.hex') === hexes[1],
      'Full board destroys displaced consumable and preserves incoming consumable');
    groundSummonBlockers.forEach(removeBlocker);
    hexes.slice(1, 3).forEach((hex, index) => { hex.className = originalZoneClasses[index]; });
    await sleep(150);
    const realJarretAttack = attackDetails.find(detail => detail.functionName === 'lancedejarret');
    const jarretRandom = Math.random;
    Math.random = () => 0.99;
    try {
      await executeAttack(attacker, hexes[1], {
        ...realJarretAttack,
        preparationTime: 30,
        executionTime: 150,
        recoveryTime: 30,
        cooldown: 40,
      });
      await sleep(260);
    } finally {
      Math.random = jarretRandom;
    }
    const landedJarret = hexes[1].querySelector('[data-ground-summon="true"]');
    check(landedJarret?.isConnected, 'Real Lance-Jarret projectile leaves consumable on empty aimed hex');
    move(target, hexes[1]);
    await sleep(30);
    check(!landedJarret.isConnected, 'Entity arriving after real Jarret landing consumes it immediately');
    move(target, hexes[3]);
    check(makeRoomForSummon(hexes[3]) && target.position === hexes[2].dataset.position,
      'Occupied summon destination displaces to nearest free hex with deterministic tie');
    move(target, hexes[3]);
    const blockers = [1, 2, 4].map(i => { const b = document.createElement('div'); b.className = 'battle-element'; hexes[i].appendChild(b); refreshHexOccupancy(hexes[i]); return b; });
    check(!makeRoomForSummon(hexes[3]) && target.position === hexes[3].dataset.position,
      'Full board preserves occupant and rejects summon');
    blockers.forEach(removeBlocker);

    const before = performance.now();
    await executeAttack(attacker, target, attack(['physicalDamage'], { executionTime: 900 }));
    const elapsed = performance.now() - before;
    check(elapsed < 600 && document.querySelector('.projectile-parent'), 'Recovery completes while physical projectile remains airborne');
    await sleep(1100);

    const interruptedPreparation = executeAttack(attacker, target,
      attack(['physicalDamage'], { preparationTime: 1000, executionTime: 300 }));
    await sleep(100);
    attacker.isDEAD = true;
    attacker.stats.HP.current = 0;
    await interruptedPreparation;
    const interruptedPreparationSprite = document.getElementById(`DragSprite_${attacker.id}`);
    check(interruptedPreparationSprite.style.transform === ''
      && attacker.stopPreparationAnimation == null,
      `Interrupted preparation restores neutral sprite pose: transform=${interruptedPreparationSprite.style.transform}`);
    attacker.isDEAD = false;
    attacker.stats.HP.current = attacker.stats.HP.max;

    const hpBeforeMelee = target.stats.HP.current;
    await executeAttack(attacker, target, attack(['physicalDamage'], { attackRange: ['melee'], executionTime: 350 }));
    check(target.stats.HP.current < hpBeforeMelee, 'Real melee cycle applies damage once at arrival');
    await sleep(250);
    target.stats.HP.current = target.stats.HP.max;
    const interrupted = executeAttack(attacker, target, attack(['physicalDamage'], { attackRange: ['melee'], executionTime: 1000 }));
    await sleep(600);
    attacker.isDEAD = true;
    await sleep(80);
    const interruptedClone = document.querySelector(`[id^="meleeClone_${attacker.id}_"].melee-clone-death`);
    check(!!interruptedClone, 'Live melee controller freezes clone on attacker death');
    await window.captureCombatTest('melee-death');
    const frozenRect = interruptedClone.getBoundingClientRect();
    await sleep(180);
    const laterRect = interruptedClone.getBoundingClientRect();
    check(Math.abs(laterRect.left - frozenRect.left) < 12, 'Interrupted clone stops its approach immediately');
    await interrupted;
    check(target.stats.HP.current === target.stats.HP.max, 'Interrupted melee never applies damage');
    await sleep(950);
    check(!interruptedClone.isConnected, 'Interrupted melee clone cleans up');
    attacker.isDEAD = false;

    const pending = createAttackFlight(attacker, target, physical, { physical: 10 });
    result = launch(pending);
    const pendingImpact = resolveAttackImpact(pending, { at: combatNow() + 1000 });
    attacker.isDEAD = true; replacement.isDEAD = true;
    const hpBeforeEnd = target.stats.HP.current;
    check(checkGameOver([attacker, target]) === true, 'Last dead ally ends combat immediately despite a released projectile');
    check(!document.querySelector('.projectile-parent'), 'Terminal combat outcome removes projectiles immediately');
    check(await resolveAttackImpact(pending) === 'miss' && target.stats.HP.current === hpBeforeEnd,
      'Late impact cannot damage a target after combat resolution');
    check(await pendingImpact === false, 'Defeat cancels the scheduled gameplay impact');
    setGameOver(false);
    entites.forEach(entity => { entity.battleStopped = false; });
    attacker.isDEAD = false; replacement.isDEAD = false;
    check(await resolveAttackImpact(pending) === 'miss' && target.stats.HP.current === hpBeforeEnd,
      'A discarded projectile cannot affect a newly started battle');

    const victoryFlight = createAttackFlight(attacker, target, physical, { physical: 10 });
    result = launch(victoryFlight);
    const victoryImpact = resolveAttackImpact(victoryFlight, { at: combatNow() + 1000 });
    target.isDEAD = true;
    let resolutionCount = 0;
    const countResolution = () => { resolutionCount++; };
    window.addEventListener('battleResolved', countResolution);
    check(checkGameOver([attacker, target]) === true && !document.querySelector('.projectile-parent'),
      'Last dead enemy triggers immediate victory and removes its outstanding projectiles');
    checkGameOver([attacker, target]);
    check(resolutionCount === 1, 'Repeated terminal checks resolve the battle only once');
    window.removeEventListener('battleResolved', countResolution);
    check(await victoryImpact === false, 'Victory cancels the scheduled gameplay impact');
    setGameOver(false);
    entites.forEach(entity => { entity.battleStopped = false; });
    target.isDEAD = false;

    const template = { name: 'Spawn fixture', type: 'sbire', class: 'test-spawn', level: 1,
      sprite: './media/sprites/mouche-asticoteuse.png', baseStats: { HP: 20, strength: 1, agility: 1, intelligence: 1 }, attacks: ['autoAttack'] };
    const summoned = await summonEntite(hexes[3], template, attacker, () => {}, 0);
    const summonedEntity = entites.find(e => e.id === summoned.summonId);
    check(summonedEntity?.position === hexes[3].dataset.position && target.position !== summonedEntity.position,
      'Real summon arrives on aimed hex and relocates previous occupant');
    check(hexes[3].querySelectorAll(':scope > .entite-box').length === 1, 'No stacked entities after summon');

    target.isDEAD = true; target.stats.HP.current = 0;
    f = createAttackFlight(attacker, target, { ...rezAttack, effets: ['rez'] }, { magical: 30 });
    check(await resolveAttackImpact(f) === 'hit' && !target.isDEAD && target.stats.HP.current > 0,
      'Real resurrection restores life despite target camp mismatch');
    check(await resolveAttackImpact(f) === 'miss', 'Second resurrection impact cannot resurrect twice');

    const previousRandom = Math.random;
    const martyr = entitesNest.find(e => e.class === 'pleureuse-transcandee');
    const healSpell = attackDetails.find(a => a.functionName === martyr?.attacks[0]);
    check(martyr?.level === 1 && martyr.baseStats.HP === 45 && martyr.baseStats.magicalDamage === 5
      && martyr.baseStats.speed === 2000 && healSpell?.attackTarget.includes('ally')
      && healSpell.castingAsset === './media/assets/effects/magic-circle.png',
      'Martyre Transcandee catalogue stats and healing attack');
    const mystic = entitesNest.find(e => e.class === 'precheur-eteint');
    const resurrectionSpell = attackDetails.find(a => a.functionName === mystic?.attacks[0]);
    check(mystic?.level === 14 && mystic.baseStats.HP === 5500 && mystic.baseStats.magicalDamage === 10
      && mystic.baseStats.speed === 3500 && resurrectionSpell?.attackTarget.includes('ally')
      && resurrectionSpell?.deadTarget.includes('yes'),
      'Mystique eteint catalogue stats and dead ally resurrection');
    const profaner = entitesNest.find(e => e.class === 'profanateur-engoulmort');
    const profanationSpell = attackDetails.find(a => a.functionName === profaner?.attacks[0]);
    check(profaner?.level === 1 && profaner.baseStats.HP === 45 && profaner.baseStats.speed === 1000
      && profanationSpell?.attackTarget.includes('enemy') && profanationSpell?.deadTarget.includes('yes'),
      'Profanateur EngoulMort catalogue stats and dead enemy profanation');
    check(profanationSpell.summonLevelIntelligenceRatio === 0.2,
      'Profanation declares its own intelligence coefficient, separate from damage ratios');
    const summonCases = [
      [10, 8, 16], [3, 7, 4], [1, 1, 1], [10, 0, 1], [10, -8, 1],
      [10, 40, 80], [50, 20, 200], [250, 100, 250], [10, 7.25, 14],
      [10, NaN, 1], [10, Infinity, 1], [NaN, 10, 2],
      [Number.MAX_VALUE, Number.MAX_VALUE, 250],
    ];
    for (const [level, intelligence, expected] of summonCases) {
      const fixture = { level: { current: level }, stats: { intelligence, magicalDamage: 99999 } };
      check(calculateProfanationSummonLevel(fixture, profanationSpell).level === expected,
        `Profanation level ${level} x 0.2 x intelligence ${intelligence} = ${expected}`);
    }
    check(calculateProfanationSummonLevel({ level: 3, baseStats: { intelligence: 7 } }, profanationSpell).level === 4,
      'Profanation supports numeric catalogue levels and base intelligence');
    check(calculateProfanationSummonLevel({ level: Number.MAX_VALUE, stats: { intelligence: Number.MAX_VALUE } },
      { ...profanationSpell, summonLevelIntelligenceRatio: 0 }).level === 1,
      'A zero summon coefficient cannot create NaN even with extreme finite stats');
    const boostedCaster = { level: { current: 10 }, stats: { intelligence: 5 }, battleBoosts: {
      intelligence: [{ value: 3, mode: 'flat' }, { value: 50, mode: 'percent' }],
    } };
    check(calculateProfanationSummonLevel(boostedCaster, profanationSpell).level === 24,
      'Profanation includes flat and percentage intelligence buffs exactly once');
    const frozenCaster = Object.freeze({ level: Object.freeze({ current: 10 }),
      stats: Object.freeze({ intelligence: 8, magicalDamage: 99999 }) });
    const savedRandom = Math.random;
    try {
      Math.random = () => { throw Error('Profanation preview must not roll a random archetype'); };
      const first = calculateProfanationSummonLevel(frozenCaster, profanationSpell);
      const second = calculateProfanationSummonLevel(frozenCaster, {
        ...profanationSpell, attacknature: ['physicalDamage'], magicalRatio: 0, piercingRatio: 3,
      });
      check(first.level === 16 && second.level === 16,
        'Profanation preview is pure and independent of damage powers, damage ratios and essence nature');
    } finally { Math.random = savedRandom; }
    check(calculateLvlMaxEntiteWithWill({ level: { current: 80 } }, 0) === 65,
      'Ordinary entities retain their will-based level cap');
    const savedCasterLevel = structuredClone(attacker.level);
    const savedCasterIntelligence = attacker.stats.intelligence;
    const savedCasterBaseIntelligence = attacker.baseStats.intelligence;
    attacker.level.current = 10;
    attacker.baseStats.intelligence = 40;
    recomputeEntityStats(attacker, { persistEquipment: false, skipReverseArchetype: true });
    const spellDescription = createAttackDescriptionContent(profanationSpell, attacker);
    const lightDescription = createAttackLightDescription(profanationSpell, attacker);
    host.append(spellDescription, lightDescription);
    check(spellDescription.querySelector('.attack-description .lvl')?.textContent === '80'
      && spellDescription.querySelector('.attack-power-calculation')?.textContent.includes('0,2')
      && spellDescription.querySelector('.picto-stat.intelligence')
      && !spellDescription.textContent.includes('{profanation'),
      'Profanation description shows the actual summon level, coefficient and intelligence icon');
    attacker.baseStats.intelligence = 50;
    recomputeEntityStats(attacker, { persistEquipment: false, skipReverseArchetype: true });
    refreshCodexUmbraPanel(attacker);
    check(spellDescription.querySelector('.attack-description .lvl')?.textContent === '100'
      && lightDescription.querySelector('.attack-description .lvl')?.textContent === '100'
      && !lightDescription.querySelector('.attack-power-calculation'),
      'Stat refresh updates both descriptions without expanding the compact combat helper');
    spellDescription.remove(); lightDescription.remove();
    attacker.level = savedCasterLevel;
    attacker.baseStats.intelligence = savedCasterBaseIntelligence;
    attacker.stats.intelligence = savedCasterIntelligence;
    const jarretThrower = entitesNest.find(e => e.class === 'lance-jarret');
    const jarretSpell = attackDetails.find(a => a.functionName === jarretThrower?.attacks[0]);
    check(jarretThrower?.id === 716 && jarretThrower.baseStats.HP === 45
      && jarretThrower.baseStats.speed === 1000 && jarretSpell?.attackTarget.includes('hexa'),
      'Lance-Jarret Gro-Gni catalogue stats and hex-target consumable attack');
    target.side = attacker.side;
    target.isDEAD = true;
    target.stats.HP.current = 0;
    attacker.stats.ambidextry = 0;
    check(acceptsSelectedTarget(attacker, resurrectionSpell, target),
      'Resurrection selects a dead ally');
    await executeAttack(attacker, target, {
      ...resurrectionSpell, preparationTime: 30, executionTime: 200, recoveryTime: 30, cooldown: 40,
    });
    await sleep(400);
    check(!target.isDEAD && target.stats.HP.current === 10,
      'Real resurrection cycle restores a dead ally with 10 HP');
    target.side = attacker.side;
    Math.random = () => 0;
    try {
      attacker.stats.ambidextry = 1000;
      // Blue support spells can borrow this offensive umbra only from equipment.
      attacker.modifierStats.durable.stuff.orfevre.effectiveById['test-ambidextry'] = { ambidextry: 1000 };
      const beforeIds = new Set(attacker.projectiles.map(p => p.id));
      const startHP = target.stats.HP.current;
      await executeAttack(attacker, target, { ...healSpell, magicalRatio: 1, physicalRatio: 0, piercingRatio: 0,
        preparationTime: 30, executionTime: 200, recoveryTime: 30, cooldown: 40 });
      await sleep(900);
      check(attacker.projectiles.filter(p => !beforeIds.has(p.id)).length === 2 && target.stats.HP.current > startHP,
        'Real allied spell cycle launches and resolves ambidextry');
      target.side = 'B';
      const nextIds = new Set(attacker.projectiles.map(p => p.id));
      await executeAttack(attacker, target, attack(['physicalDamage'], { executionTime: 300 }));
      attacker.isDEAD = true;
      await sleep(750);
      check(attacker.projectiles.filter(p => !nextIds.has(p.id)).length === 1, 'Death before delayed second launch prevents that launch');
      attacker.isDEAD = false; attacker.stats.ambidextry = 0;
      delete attacker.modifierStats.durable.stuff.orfevre.effectiveById['test-ambidextry'];
    } finally { Math.random = previousRandom; }

    target.side = 'B';
    target.isDEAD = true;
    target.stats.HP.current = 0;
    target.corpseConsumed = false;
    target.corpseDestroyed = false;
    const profanedBefore = entites.filter(entity => entity.class === 'aberration-profanee').length;
    attacker.level.current = 10;
    attacker.baseStats.intelligence = 40;
    attacker.stats.intelligence = 40;
    check(acceptsSelectedTarget(attacker, profanationSpell, target),
      'Profanation selects a dead enemy');
    const profanationFlight = createAttackFlight(attacker, target, {
      ...profanationSpell, preparationTime: 30, executionTime: 200, recoveryTime: 30, cooldown: 40,
    }, { magical: 0 });
    const profanationRandom = Math.random;
    Math.random = () => 0.99;
    try {
      await executeAttack(attacker, target, profanationFlight.attack);
      attacker.level.current = 2;
      attacker.baseStats.intelligence = 1;
      attacker.stats.intelligence = 1;
      await sleep(900);
    } finally {
      Math.random = profanationRandom;
    }
    check(target.corpseConsumed && !entites.includes(target)
      && entites.filter(entity => entity.class === 'aberration-profanee').length === profanedBefore + 1,
      'Real profanation cycle consumes enemy corpse and summons one aberration');
    const profanedSummon = entites.find(entity => entity.class === 'aberration-profanee'
      && entity.summonOrigin?.sourceCorpseId === target.id);
    const reloadedCorpse = JSON.parse(JSON.stringify(target));
    check(profanedSummon?.side === attacker.side && profanedSummon.isTemporarySummon === true
      && profanedSummon.summonLifetime === 'map-session',
      'Profaned summon belongs to caster and lasts for current map session');
    check(profanedSummon.level.current === 80 && profanedSummon.summonOrigin.generatedLevel === 80
      && calculateProfanationSummonLevel(profanationFlight.source).level === 80,
      'Profanation uses launch-time level and intelligence despite changes during projectile flight');
    check(profanedSummon.Archetype?.meta?.source === 'reverseArchetype'
      && profanedSummon.Archetype.meta.pointsSpent === 79
      && profanedSummon.stats.HP.max > profanedSummon.baseStats.HP,
      'Profaned aberration receives 79 real reverse-archetype steps and their generated stats');
    const generatedStats = JSON.stringify(profanedSummon.modifierStats.durable.archetype);
    recomputeEntityStats(profanedSummon, { persistEquipment: false });
    check(profanedSummon.level.current === 80
      && generatedStats === JSON.stringify(profanedSummon.modifierStats.durable.archetype)
      && profanedSummon.Archetype.meta.pointsSpent === 79,
      'Recomputation neither clamps the granted summon level nor duplicates archetype gains');
    check(reloadedCorpse.isDEAD && reloadedCorpse.corpseConsumed === undefined
      && reloadedCorpse.runtimeProfanation === undefined,
      'Profanation claim never persists on original corpse');
    check(await resolveAttackImpact(profanationFlight) === 'miss',
      'Second profanation cannot reuse consumed corpse');
    profanedSummon.stats.HP.current = 0;
    LifeandDeath(profanedSummon, attacker);
    check(profanedSummon.isDEAD && profanedSummon.side === attacker.side
      && entites.includes(profanedSummon)
      && document.getElementById(`Box_Entite_${profanedSummon.id}`)?.isConnected,
      'Dead profaned summon leaves its own caster-side corpse for current map session');
    check(createCorpseLoot(profanedSummon) === null
      && !document.getElementById(`Box_Entite_${profanedSummon.id}`)?.dataset.corpseLootId,
      'Summoned entity corpse never creates loot');
    attacker.level.current = 250;
    attacker.baseStats.intelligence = 100;
    attacker.stats.intelligence = 100;
    const cappedFlight = createAttackFlight(attacker, profanedSummon, profanationSpell);
    check(await resolveAttackImpact(cappedFlight) === 'hit', 'A profaned corpse can fuel another profanation');
    const cappedSummon = entites.find(entity => entity.summonOrigin?.sourceCorpseId === profanedSummon.id);
    check(cappedSummon?.level.current === 250 && cappedSummon.Archetype?.meta?.pointsSpent === 249,
      'A capped profanation really spawns level 250 with 249 archetype steps');
    recomputeEntityStats(cappedSummon, { persistEquipment: false });
    check(cappedSummon.level.current === 250 && cappedSummon.Archetype.meta.pointsSpent === 249,
      'The maximum summon level survives later stat recomputation');
    attacker.level = savedCasterLevel;
    attacker.baseStats.intelligence = savedCasterBaseIntelligence;
    attacker.stats.intelligence = savedCasterIntelligence;

    const clone = document.createElement('div'); clone.style.cssText = 'position:fixed;left:200px;top:180px;width:70px;height:70px;background:#ccc;transform:translate(40px,20px)';
    document.body.appendChild(clone);
    const deathVfx = finishMeleeCloneOnDeath(clone, getComputedStyle(clone).transform);
    await sleep(300);
    check(clone.isConnected && clone.classList.contains('melee-clone-death'), 'Death clone remains frozen and red during one-second shake');
    await deathVfx;
    check(!clone.isConnected && document.querySelector('.melee-clone-death-blood'), 'Death clone replaced by blood burst');
    check(!document.getElementById(`DragSprite_${attacker.id}`).classList.contains('melee-clone-death'), 'Real body never receives clone death tint');

    clearProjectileEffects(entites);
    const { startGame, StopGame } = await import("/js/app/state.js");
    const { RemoveEntite } = await import("/js/entities/runtime.js");
    const spawnHex = document.createElement('div');
    spawnHex.className = 'hex Neutral tank-role'; spawnHex.dataset.position = 'hex_1901';
    spawnHex.innerHTML = '<div class="socle tank"></div>'; host.appendChild(spawnHex);
    const opponentHex = document.createElement('div');
    opponentHex.className = 'hex SideB'; opponentHex.dataset.position = 'hex_1902';
    host.appendChild(opponentHex);
    invalidateFootprintGeometry(host);
    makeEntity(opponentHex, 'B');
    entites.forEach(entity => { entity.battleStopped = true; });
    configureBattleActionManager({ createFleeButton: container => {
      const button = document.createElement('button'); button.className = 'runaway-button';
      container.appendChild(button); return button;
    } });
    startGame();
    const lateArrival = await createEntityIngame(template, { side: 'A', position: spawnHex.dataset.position });
    check(lateArrival.battlesFought === 1 && String(lateArrival.role) === 'tank'
      && getEntityCombatDetails(lateArrival).roles.tank.battles === 1,
      'A new combat summon records participation in its actual board role');
    RemoveEntite(lateArrival);
    const timeOnRemoval = getEntityCombatDetails(lateArrival).roles.tank.durationMs;
    await sleep(30);
    check(getEntityCombatDetails(lateArrival).roles.tank.durationMs === timeOnRemoval,
      'Removing a summon stops its role duration immediately');
    await import("/js/board/interaction.js");
    window.levelRunning = 'scripted';
    const destination = document.createElement('div');
    destination.className = 'hex SideA'; destination.dataset.position = 'hex_1903';
    destination.innerHTML = '<div class="socle mage"></div>'; host.appendChild(destination);
    invalidateFootprintGeometry(host);
    const mover = makeEntity(spawnHex, 'A');
    mover.stats.movement = 10; mover.stats.shift = { current: 1, max: 10 };
    mover.stats.weight = 100; mover.stats.agility = 0;
    await sleep(0);
    const drop = hex => {
      const transfer = new DataTransfer(); transfer.setData('text', `Box_Entite_${mover.id}`);
      hex.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    };
    drop(destination);
    check(mover.position === 'hex_1903' && mover.stats.shift.current < 0
      && getEntityCombatDetails(mover).movements === 1 && getEntityCombatDetails(mover).negativeMovements === 1,
      'A real weighted manual drop records one movement that enters negative reserve');
    drop(spawnHex);
    check(mover.position === 'hex_1903' && getEntityCombatDetails(mover).blockedMovements === 1
      && getEntityCombatDetails(mover).movements === 1,
      'A real drop rejected for exhausted reserve records one failure and no performed movement');
    drop(destination);
    check(getEntityCombatDetails(mover).blockedMovements === 1,
      'Dropping back onto the same hex does not create a failed movement');
    mover.stats.occultism = 150;
    const slowBefore = getEntityCombatDetails(mover).procs.occultismSlow || 0;
    const slowRandom = Math.random;
    try {
      Math.random = () => 0;
      await executeAttack(mover, entites.find(entity => entity.position === 'hex_1902'),
        attack(['physicalDamage'], { preparationTime: 100, executionTime: 5, recoveryTime: 5 }));
    } finally { Math.random = slowRandom; }
    check(getEntityCombatDetails(mover).procs.occultismSlow === slowBefore + 1,
      'A real Occultism-slowed preparation is counted once, not once per timer tick');
    mover.stats.magicalResistance = 0; mover.stats.indestructibility = 0; mover.stats.resilience = 0;
    const poisonBefore = getEntityCombatDetails(mover);
    addJarret(destination, 'career-poison-jarret');
    consommationSummon({ ...jarret, summonEffet: ['poisonConsommable'], summonDuration: 15 },
      destination, 'career-poison-jarret', () => {});
    await sleep(2150);
    const poisonAfter = getEntityCombatDetails(mover);
    check(poisonAfter.consumablesGround === poisonBefore.consumablesGround + 1
      && poisonAfter.consumablesCombatGround === poisonBefore.consumablesCombatGround + 1
      && poisonAfter.consumablesHostile === poisonBefore.consumablesHostile + 1
      && poisonAfter.consumableDamageReceived > poisonBefore.consumableDamageReceived
      && poisonAfter.consumableDamageReceived - poisonBefore.consumableDamageReceived
        === poisonAfter.damageReceived - poisonBefore.damageReceived,
      'A rotten Jarret counts once while its actual periodic damage accumulates separately');
    (await import("/js/combat/summons.js")).clearGroundItems();
    StopGame();
    return reports;
  });
  console.log(reports.join('\n'));
  await page.evaluate(async () => {
    const { AttackDetailInfos } = await import("/js/ui/attacks.js");
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const { readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const owner = structuredClone(entitesNestUp.find(entity => entity.class === 'profanateur-engoulmort'));
    owner.level.current = 10;
    owner.stats.intelligence = 8;
    const spell = readAttackDefinitionsForEntity(owner).find(attack => attack.functionName === 'profanation');
    if (spell.summonLevelIntelligenceRatio !== 0.2) throw Error('Owned Profanation lost its summon coefficient');
    const host = document.createElement('div');
    host.id = 'profanation-preview-test';
    host.className = 'section-content attaques';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#130f10;z-index:999999';
    host.append(AttackDetailInfos(spell, owner, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    }));
    document.body.append(host);
  });
  for (const width of [1440, 760, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const layout = await page.locator('#profanation-preview-test').evaluate(async host => {
      const img = host.querySelector('.attack-image');
      await img.decode();
      const description = host.querySelector('.attack-description');
      const calculation = description.querySelector('.attack-power-calculation');
      return {
        level: description.querySelector('.lvl')?.textContent,
        text: description.textContent,
        width: description.clientWidth, scrollWidth: description.scrollWidth,
        calculationVisible: calculation.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        hasDpsOrHps: Boolean(host.querySelector('.attack-rate-preview')),
        imageLoaded: img.naturalWidth > 0,
      };
    });
    assert.ok(layout.level === '16' && layout.imageLoaded && !layout.hasDpsOrHps
      && layout.calculationVisible && layout.width > 0 && layout.scrollWidth <= layout.width + 1,
      `Profanation description at ${width}px: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: `outputs/combat-tests/profanation-${width}.png` });
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`PASS: ${reports.length} combat checks and responsive Profanation at 1440, 760 and 390px`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
