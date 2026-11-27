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
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('outputs/combat-tests', { recursive: true });
await page.exposeFunction('captureMultiAttack', name => page.screenshot({ path: `outputs/combat-tests/${name}.png` }));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const { entites, enrichEntityStats } = await import("/js/entities/runtime.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { setEntityAttackDefinitions, readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const selection = await import("/js/combat/attackResolution.js");
    const { selectAttackDecision, runAttackCooldownWait, entiteTurn } = await import("/js/combat/loop.js");
    const { MultiAttackDisplay } = await import("/js/ui/attacks.js");
    const { setGameOver, setOrderSide } = await import("/js/app/state.js");
    const reports = [];
    const check = (condition, message) => { if (!condition) throw Error(message); reports.push(message); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    setGameOver(false); setOrderSide(null); entites.length = 0;
    const host = document.createElement('div'); host.id = 'multi-fixture';
    host.innerHTML = `<style>
      #multi-fixture {position:fixed;inset:0;z-index:999999999;background:#151515;color:white;overflow:auto;padding:20px;box-sizing:border-box;}
      #multi-fixture .board-fixture {height:210px;position:relative;}
      #multi-fixture .hex {position:absolute;top:70px;width:120px;height:100px;}
      #multi-fixture .entite-box {width:100px;height:100px;position:relative;}
      #multi-fixture .effects-container {position:relative;}
      #multi-fixture .hud-ingame {position:relative;top:0;transform:none;}
      #multi-fixture .sprite-container {display:none;}
      #multi-fixture .attack-panel {max-width:600px;margin:auto;}
      #multi-fixture .atb-container {width:110px;height:12px;}
    </style><div class="board-fixture"></div><div class="attack-panel"></div>`;
    document.body.append(host);
    const board = host.querySelector('.board-fixture');
    const hexes = Array.from({ length: 6 }, (_, i) => {
      const hex = document.createElement('div');
      hex.className = 'hex SideA'; hex.dataset.position = `hex_${910 + i}`;
      hex.style.left = `${i * 150}px`; hex.innerHTML = '<div class="socle neutre"></div>'; board.append(hex); return hex;
    });
    let serial = 980000;
    const make = (side, i) => {
      const e = { id: ++serial, name: `Multi ${i}`, type: 'sbire', side, role: 'gueux', class: 'test', level: 1,
        attacks: ['autoAttack'], position: hexes[i].dataset.position, sprite: './media/sprites/mouche-asticoteuse.png',
        baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1, speed: 300, will: 0 } };
      enrichEntityStats(e); e.isDEAD = false; e.statut = ['alive']; e.role = 'gueux'; e.stats.speed = 300;
      const box = document.createElement('div'); box.id = `Box_Entite_${e.id}`; box.className = 'entite-box';
      box.innerHTML = `<div id="sbire_${e.id}"><div id="effectsContainer_${e.id}" class="effects-container"></div>
        <div id="spriteContainer_${e.id}" class="sprite-container"><div id="Animationsprite_${e.id}"><div id="DragSprite_${e.id}"><canvas id="spriteCanvas_${e.id}" width="80" height="80"></canvas></div></div><div id="Cast_Animation_${e.id}"></div></div><div id="PopDow_${e.id}"></div>
        <div class="hud-ingame"><div id="SpeedInterface_${e.id}"><div class="atb-container"><div id="atbFill_${e.id}" class="atb-fill"></div></div></div>
        <div class="attaque-timers"><div class="active-attack-visual"><img id="currentAttackImage_${e.id}" class="attack-image" src="./media/assets/spells/auto-attack-ld.jpg" alt="Auto-attaque"><div class="active-attack-timings"><div class="attack-bar-container"><div id="currentAttackBar_${e.id}" class="attack-bar-fill"></div><div id="battlePreparation_${e.id}"></div></div></div></div></div></div></div>`;
      hexes[i].append(box); hexes[i].classList.add('occupied'); entites.push(e); return e;
    };
    const actor = make('A', 0), enemy = make('B', 1), ally = make('A', 2), corpse = make('A', 3);
    corpse.isDEAD = true; corpse.stats.HP.current = 0;
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    setEntityAttackDefinitions(actor, ['quickAttack', 'soin', 'resurrection'], attackDetails);
    let attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.setAttackPriority(actor, attacks, 'soin', 1);
    let decision = await selectAttackDecision(actor);
    check(decision.key === 'soin' && decision.target === ally, 'Support is selectable while an enemy exists');
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      decision = await selectAttackDecision(actor); seen.add(decision.key);
      selection.commitAttackChoice(actor, decision.participants, decision.key);
    }
    check(seen.size === 3, 'Offense, heal and resurrection all participate without corpse priority bias');
    corpse.corpseDestroyed = true;
    decision = await selectAttackDecision(actor);
    check(!decision.participants.some(c => c.key === 'resurrection'), 'Destroyed corpse excludes resurrection');
    corpse.corpseDestroyed = false;
    const now = Date.now();
    attacks.forEach(a => selection.startAttackCooldown(actor, a, a.functionName === 'soin' ? 5150 : 9000, now));
    const originalAttack = actor.currentAttack;
    const wait = runAttackCooldownWait(actor);
    check(actor.currentPhase === 'cooldown-wait', 'No ready attack starts cooldown-wait');
    check(actor.currentAttack === originalAttack, 'Prediction never overwrites currentAttack');
    check(document.querySelector(`#Box_Entite_${actor.id} .cooldown-preview`)?.dataset.pendingAttackKey === 'soin', 'HUD forecasts earliest cooldown');
    check(document.querySelector('.attack-cooldown-countdown')?.textContent.match(/^5,[01]\d s$/), 'Countdown displays true remaining time to two decimals');
    check(document.getElementById(`atbFill_${actor.id}`).classList.contains('cooldown-wait-pulse'), 'Full ATB pulses gray');
    check(document.getElementById(`targetSearchIndicator_${actor.id}`).classList.contains('target-search-indicator--cooldown'), 'Hourglass appears in effects container');
    check(getComputedStyle(document.querySelector(`#Box_Entite_${actor.id} .attaque-timers`)).opacity === '1', 'Forecast stays visible even though attack bar is empty');
    const forecastImage = document.getElementById(`currentAttackImage_${actor.id}`);
    check(forecastImage.offsetWidth === 44 && forecastImage.offsetHeight === 44, 'Forecast thumbnail remains square without shrinking');
    await window.captureMultiAttack('multi-cooldown-wait');
    setEntityAttackDefinitions(actor, [...attacks, 'incineration'], attackDetails);
    check(await wait === true, 'A newly granted ready attack wakes the wait');
    decision = await selectAttackDecision(actor);
    check(decision.key === 'incineration', 'New temporary attack is selected while others cool down');
    check(!document.querySelector('.attack-cooldown-countdown') && !document.getElementById(`targetSearchIndicator_${actor.id}`), 'Wait cleans forecast and hourglass');
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.startAttackCooldown(actor, attacks.find(a => a.functionName === 'incineration'), 9000);
    const cancelled = runAttackCooldownWait(actor);
    setOrderSide('A');
    check(await cancelled === false, 'Order interrupts cooldown wait');
    setOrderSide(null); actor.hasResetOrderTimers = false;
    const deadWait = runAttackCooldownWait(actor);
    actor.isDEAD = true;
    check(await deadWait === false, 'Death interrupts wait');
    actor.isDEAD = false;
    const stopped = runAttackCooldownWait(actor);
    window.dispatchEvent(new Event('battleStopped'));
    check(await stopped === false, 'Battle stop immediately resolves pending waits');
    selection.resetAttackSelectionRuntime();
    setEntityAttackDefinitions(actor, ['quickAttack', 'soin', 'resurrection'], attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    localStorage.setItem('selectedArmyA', JSON.stringify([actor]));
    host.querySelector('.attack-panel').appendChild(MultiAttackDisplay(actor));
    await sleep(180);
    check(host.querySelectorAll('.attack-browser-thumb').length === 3, 'Existing multi browser renders three distinct attacks');
    check(host.querySelector('.attack-browser-thumb[data-attack-key="quickAttack"] .attack-loot-name')?.classList.contains('Attaquant')
      && host.querySelector('.attack-browser-thumb[data-attack-key="soin"] .attack-loot-name')?.classList.contains('Support'),
      'Attack names inherit their Attaquant or Support combat-function color class');
    check(!host.querySelector('.attack-browser-selector, .attack-browser-select'), 'No redundant attack dropdown is generated');
    host.querySelector('.attack-browser-thumb[data-attack-key="resurrection"] img.attack-image').click();
    check(host.querySelector('.attack-details-multi > .attack-details').dataset.attackKey === 'resurrection'
      && host.querySelector('.attack-details-multi [data-attack-essence-sockets]').dataset.attackIndex === '2',
    'Selecting an attack thumbnail switches detail and its original essence index');
    host.querySelector('.attack-browser-thumb[data-attack-key="soin"] img.attack-image').click();
    check(host.querySelector('.entite-attack-container.multi-attacks').dataset.focusedAttackKey === 'soin',
      'Thumbnail selection updates the focused attack');
    const toggleThumb = host.querySelector('.attack-browser-thumb[data-attack-key="quickAttack"] button.attack-activation-indicator');
    check(toggleThumb?.getAttribute('aria-pressed') === 'true', 'Multi-attack thumbnail exposes an accessible activation button');
    toggleThumb.click();
    await sleep(160);
    check(actor.attackSelection.disabled.quickAttack === true
      && toggleThumb.getAttribute('aria-pressed') === 'false'
      && host.querySelector('.entite-attack-container.multi-attacks').dataset.focusedAttackKey === 'soin'
      && JSON.parse(localStorage.getItem('selectedArmyA'))[0].attackSelection.disabled.quickAttack === true,
    'Thumbnail indicator disables and saves its attack without changing focus');
    toggleThumb.click();
    await sleep(160);
    check(actor.attackSelection.disabled.quickAttack !== true && toggleThumb.getAttribute('aria-pressed') === 'true',
      'Thumbnail indicator re-enables its attack');
    check(host.querySelector('.attack-imgs.multi-attacks').getBoundingClientRect().top
      < host.querySelector('.attack-details-multi').getBoundingClientRect().top,
    'Attack thumbnails appear before the detailed card');
    const sockets = JSON.stringify(actor.attackDetails.map(a => [a.attackKey, a.essenceSlots]));
    host.querySelector('.attack-priority-auto').click();
    check(actor.attackSelection.priorityMode === 'auto', 'Automatic priority button restores cooldown ordering');
    const dropdown = host.querySelector('.attack-priority-field select');
    const focused = host.querySelector('.entite-attack-container.multi-attacks').dataset.focusedAttackKey;
    dropdown.value = '3'; dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    check(actor.attackSelection.priorityMode === 'manual', 'Editing a rank switches priorities to manual mode');
    check(new Set(Object.values(actor.attackSelection.priorities)).size === 3, 'Priority swap never creates duplicate ranks');
    check(actor.attackSelection.priorities[focused] === 3, 'Card dropdown writes selected priority');
    const orderedThumbs = [...host.querySelectorAll('.attack-browser-thumb')]
      .sort((a, b) => Number(a.style.order) - Number(b.style.order));
    check(orderedThumbs.every((thumb, i) => actor.attackSelection.priorities[thumb.dataset.attackKey] === i + 1),
      'Attack thumbnails follow priority swaps');
    check(JSON.stringify(actor.attackDetails.map(a => [a.attackKey, a.essenceSlots])) === sockets, 'Sorting leaves attack and essence identities untouched');
    const stored = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    check(JSON.stringify(stored.attackSelection) === JSON.stringify(actor.attackSelection), 'Priority preferences persist');
    check(!('readyAt' in stored) && !('attackRuntime' in stored), 'Combat runtime is not serialized');
    await sleep(160);
    check([...host.querySelectorAll('.attack-browser-thumb img.attack-image')].every(img => img.complete && img.naturalWidth > 0), 'All attack thumbnails load valid assets');
    await window.captureMultiAttack('multi-priorities-desktop');
    window.multiFixture = { actor, enemy, ally, corpse, host };
    return reports;
  });
  console.log(reports.join('\n'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'outputs/combat-tests/multi-priorities-mobile.png' });
  const dimensions = await page.locator('#multi-fixture .attack-panel').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  const overflows = await page.locator('#multi-fixture .attack-panel').evaluate(el => [...el.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(n => [n.className, n.getBoundingClientRect().width]));
  assert.ok(dimensions.scroll <= dimensions.width + 2, `Multi attack panel overflows: ${JSON.stringify({ dimensions, overflows })}`);
  const mobileThumbs = await page.locator('.attack-imgs.multi-attacks').boundingBox();
  assert.ok(mobileThumbs && mobileThumbs.y + mobileThumbs.height < 844 && mobileThumbs.x + mobileThumbs.width <= 390,
    'Attack thumbnails are visible and fit the mobile viewport');
  const cycles = await page.evaluate(async () => {
    const { actor, enemy, ally, corpse, host } = window.multiFixture;
    const { entites } = await import("/js/entities/runtime.js");
    const { entiteTurn, selectAttackDecision, runAttackCooldownWait } = await import("/js/combat/loop.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { setEntityAttackDefinitions, readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const { getHexes } = await import("/js/board/controller.js");
    const selection = await import("/js/combat/attackResolution.js");
    const { setGameOver, setOrderSide } = await import("/js/app/state.js");
    const reports = [];
    const check = (ok, message) => { if (!ok) throw Error(message); reports.push(message); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async predicate => {
      const end = Date.now() + 4500;
      while (!predicate()) { if (Date.now() > end) throw Error(`Cycle timeout: ${actor.currentPhase}`); await sleep(10); }
    };
    const definitions = (keys, extra = {}) => keys.map(key => ({
      ...attackDetails.find(a => a.functionName === key),
      preparationTime: 50, executionTime: 900, recoveryTime: 50, cooldown: key === 'quickAttack' ? 4000 : 2000,
      ...extra,
    }));
    host.querySelector('.attack-panel').remove();
    host.querySelectorAll('.sprite-container').forEach(el => el.style.display = 'block');
    setGameOver(false); setOrderSide(null); selection.resetAttackSelectionRuntime();
    actor.stats.speed = 80; actor.baseStats.speed = 80; actor.battleStopped = false;
    actor.stats.ambidextry = 0; actor.stats.occultism = 0; actor.stats.mysticism = 0;
    enemy.stats.HP = { current: 3000, max: 3000 }; enemy.stats.dodge = 0;
    ally.stats.HP.current = 10;
    setEntityAttackDefinitions(actor, definitions(['quickAttack', 'soin'], { attackRange: ['range'] }), attackDetails);
    let attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.setAttackPrioritiesAutomatic(actor, attacks, attack => attack.cooldown);
    const completions = [];
    const completed = event => {
      if (event.detail.entityId !== actor.id) return;
      completions.push(actor.currentAttack.functionName);
      if (completions.length === 2) actor.battleStopped = true;
    };
    document.addEventListener('entityTurnCompleted', completed);
    enemy.speedTimer = 777;
    const startCount = actor.turnCount || 0;
    const first = entiteTurn(actor, [enemy]);
    const duplicate = entiteTurn(actor, [enemy]);
    check(actor.turnCount === startCount + 1 && enemy.speedTimer === 777, 'Duplicate turns and other entities timers remain isolated');
    await until(() => actor.currentPhase === 'attack_1');
    check(selection.getAttackRuntime(actor, attacks[0]).readyAt > Date.now()
      && selection.getAttackRuntime(actor, attacks[1]).readyAt === 0,
    'Only chosen attack starts cooldown at preparation entry');
    await Promise.all([first, duplicate]);
    await until(() => completions.length === 2);
    check(completions.join(',') === 'quickAttack,soin', 'Actual consecutive turns switch from offense to heal without waiting for first cooldown');
    check(document.querySelectorAll('.projectile-parent').length >= 2, 'Two different ranged attacks coexist in flight');
    await sleep(1400);
    check(enemy.stats.HP.current < 3000 && ally.stats.HP.current > 10, 'Concurrent flights retain their separate offensive and healing effects and targets');
    document.removeEventListener('entityTurnCompleted', completed);

    actor.battleStopped = false; selection.resetAttackSelectionRuntime();
    setEntityAttackDefinitions(actor, definitions(['quickAttack', 'soin'], { preparationTime: 600 }), attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    attacks.forEach(a => selection.startAttackCooldown(actor, a, 500));
    const waitingTurn = entiteTurn(actor, [enemy]);
    await sleep(30);
    check(actor.currentPhase === 'Entite Turn', 'Entity charges its normal turn before cooldown waiting');
    await until(() => actor.currentPhase === 'cooldown-wait');
    check(actor.isATBFull && actor.speedTimer === 0, 'Cooldown wait preserves fully charged turn');
    const countDuringWait = actor.turnCount;
    await until(() => actor.currentPhase === 'attack_1');
    check(actor.turnCount === countDuringWait, 'Availability launches preparation without charging another turn');
    const projectileCount = actor.projectiles.length;
    window.dispatchEvent(new Event('battleStopped'));
    check(await waitingTurn === false && actor.projectiles.length === projectileCount, 'Battle stop during preparation prevents projectile launch and stops turn');
    check(attacks.every(a => selection.getAttackRuntime(actor, a).readyAt === 0), 'Battle end clears all independent cooldowns');

    setEntityAttackDefinitions(actor, ['resurrection', 'profanation'], attackDetails);
    corpse.corpseDestroyed = true;
    const failed = entiteTurn(actor, [enemy]);
    await until(() => actor.currentPhase === 'target-search');
    check(Boolean(document.querySelector('.target-search-indicator--searching')),
      'Multi without a launchable attack enters target search');
    await until(() => actor.currentPhase === 'target-search-recovery');
    check(!document.querySelector('.target-search-indicator--searching') && actor.maxRecoveryTime === 80,
      'Exhausted multi search runs full-speed recovery');
    check(getComputedStyle(document.querySelector(`#Box_Entite_${actor.id} .attaque-timers`)).display === 'none',
      'Search recovery never displays an unlaunched attack thumbnail');
    const recoveryStart = parseFloat(document.getElementById(`atbFill_${actor.id}`).style.width);
    await sleep(55);
    check(parseFloat(document.getElementById(`atbFill_${actor.id}`).style.width) < recoveryStart,
      'Search recovery visibly drains the ATB');
    actor.battleStopped = true;
    await failed;
    // The short recovery can finish before the wall-clock probe above, and
    // entiteLoop may already have started its next turn at the old speed.
    // End that scenario before changing timings; otherwise entiteTurn reuses
    // the active 80 ms turn instead of starting the intended 600 ms one.
    window.dispatchEvent(new Event('battleStopped'));
    actor.battleStopped = false;

    actor.stats.speed = 600; actor.baseStats.speed = 600;
    setEntityAttackDefinitions(actor, definitions(['resurrection', 'quickAttack'], { preparationTime: 600 }), attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.startAttackCooldown(actor, attacks[1], 850);
    const beforeSearchTurn = actor.turnCount;
    const fastSearch = entiteTurn(actor, [enemy]);
    check(actor.turnCount === beforeSearchTurn + 1 && actor.currentPhase === 'Entite Turn'
      && actor._phaseTimer?.duration === 600,
      'Cooldown-search scenario starts its own 600 ms turn without reusing the previous loop');
    await until(() => actor.currentPhase === 'target-search');
    const searchStarted = Date.now(), searchTurn = actor.turnCount;
    check(getComputedStyle(document.querySelector(`#Box_Entite_${actor.id} .attaque-timers`)).display === 'none',
      'Active search hides the previous attack HUD');
    await until(() => actor.currentPhase === 'attack_1');
    check(actor.currentAttack.functionName === 'quickAttack' && actor.turnCount === searchTurn && Date.now() - searchStarted < 500,
      'Cooldown expiring during search launches the valid attack before the next regular probe');
    window.dispatchEvent(new Event('battleStopped'));
    await fastSearch;

    setEntityAttackDefinitions(actor, ['resurrection', 'profanation'], attackDetails);
    const changedKitSearch = entiteTurn(actor, [enemy]);
    await until(() => actor.currentPhase === 'target-search');
    const changedTurn = actor.turnCount;
    setEntityAttackDefinitions(actor, definitions(['resurrection', 'quickAttack'], { preparationTime: 600 }), attackDetails);
    await until(() => actor.currentPhase === 'attack_1');
    check(actor.currentAttack.functionName === 'quickAttack' && actor.turnCount === changedTurn,
      'Newly available attack wakes search without a recovery or a new turn');
    window.dispatchEvent(new Event('battleStopped'));
    await changedKitSearch;

    actor.stats.speed = 400; actor.baseStats.speed = 400;
    setEntityAttackDefinitions(actor, ['resurrection', 'profanation'], attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.startAttackCooldown(actor, attacks[1], 550);
    let searchRecoveryResult = null;
    const onSearchRecovered = event => {
      if (event.detail.entityId !== actor.id || event.detail.reason !== 'no-target') return;
      searchRecoveryResult = {
        remaining: actor.recoveryTime,
        fill: parseFloat(document.getElementById(`atbFill_${actor.id}`).style.width),
      };
      // Stop only after natural completion, before entiteTurn starts another turn.
      actor.battleStopped = true;
    };
    document.addEventListener('entityTurnCompleted', onSearchRecovered);
    const stillSearching = entiteTurn(actor, [enemy]);
    await until(() => actor.currentPhase === 'target-search');
    await sleep(230);
    check(actor.currentPhase === 'target-search' && selection.getAttackRuntime(actor, attacks[1]).readyAt <= Date.now(),
      'Expired cooldown without a valid target keeps the same search window open');
    await until(() => actor.currentPhase === 'target-search-recovery');
    const searchCompleted = await stillSearching;
    document.removeEventListener('entityTurnCompleted', onSearchRecovered);
    check(searchCompleted && searchRecoveryResult?.remaining === 0 && searchRecoveryResult?.fill === 0,
      'Search recovery finishes with an empty ATB');
    actor.battleStopped = false;

    const board = getHexes();
    const originalHexes = board.hexesSideA.slice();
    board.hexesSideA.splice(0, board.hexesSideA.length, ...host.querySelectorAll('.hex'));
    actor.type = 'sbire';
    setEntityAttackDefinitions(actor, ['lancedejarret', 'quickAttack'], attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.setAttackPriority(actor, attacks, 'lancedejarret', 1);
    let decision = await selectAttackDecision(actor);
    check(decision.key === 'lancedejarret' && decision.target.classList.contains('hex'), 'Hex invocation participates in the same multi-attack decision');
    board.hexesSideA.splice(0, board.hexesSideA.length, ...originalHexes);
    actor.type = 'sbire';

    setEntityAttackDefinitions(actor, ['quickAttack', 'soin'], attackDetails);
    attacks = readAttackDefinitionsForEntity(actor, attackDetails);
    selection.startAttackCooldown(actor, attacks[0], 3000);
    selection.startAttackCooldown(actor, attacks[1], 5000);
    const removedWait = runAttackCooldownWait(actor);
    setEntityAttackDefinitions(actor, [attacks[1]], attackDetails);
    await sleep(30);
    check(document.querySelector('.cooldown-preview')?.dataset.pendingAttackKey === 'soin', 'Removing predicted attack refreshes forecast without launching removed attack');
    selection.startAttackCooldown(actor, attacks[1], 0);
    check(await removedWait, 'Changing an active cooldown immediately wakes selection');
    window.dispatchEvent(new Event('battleStopped'));
    entites.length = 0;
    return reports;
  });
  console.log(cycles.join('\n'));
  const surprises = await page.evaluate(async () => {
    const { actor, enemy } = window.multiFixture;
    const { entites } = await import("/js/entities/runtime.js");
    const { entiteTurn, wakeSurprisedArmy } = await import("/js/combat/loop.js");
    const { attackSurprise, getSurprisedSide } = await import("/js/events/runtime.js");
    const { setEntityAttackDefinitions } = await import("/js/combat/attackResolution.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { setGameOver, setOrderSide } = await import("/js/app/state.js");
    const reports = [];
    const check = (ok, message) => { if (!ok) throw Error(message); reports.push(message); };
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    const until = async predicate => {
      const end = performance.now() + 4000;
      while (!predicate()) { if (performance.now() > end) throw Error('Surprise timeout'); await sleep(10); }
    };
    entites.push(actor, enemy);
    const prepare = () => {
      window.dispatchEvent(new Event('battleStopped'));
      setGameOver(false); setOrderSide(null);
      for (const entity of [actor, enemy]) {
        entity.battleStopped = false; entity.isDEAD = false; entity.hasFled = false;
        entity.statut = ['alive']; entity.currentPhase = ''; entity.turnCount = 0;
        entity.stats.HP = { current: 10000, max: 10000 };
        entity.stats.speed = 40; entity.baseStats.speed = 40;
        entity.stats.ambidextry = 0; entity.stats.occultism = 0; entity.stats.mysticism = 0;
        setEntityAttackDefinitions(entity, [{ ...attackDetails.find(attack => attack.functionName === 'quickAttack'),
          attackRange: ['range'], preparationTime: 40, executionTime: 40, recoveryTime: 40, cooldown: 100 }], attackDetails);
      }
    };
    for (const attackingSide of ['A', 'B']) {
      prepare();
      const attacker = attackingSide === 'A' ? actor : enemy;
      const victim = attackingSide === 'A' ? enemy : actor;
      const completions = [];
      const completed = event => { if (event.detail.entityId === attacker.id) completions.push(performance.now()); };
      document.addEventListener('entityTurnCompleted', completed);
      attackSurprise(`side${attackingSide}`);
      const first = entiteTurn(attacker, [victim]);
      await until(() => completions.length >= 2);
      check(victim.turnCount === 0 && getSurprisedSide() === null && completions[1] - completions[0] < 1500,
        `${attackingSide} ambush: attacker completes a second attack while the surprised camp is still reacting`);
      wakeSurprisedArmy(victim);
      await until(() => victim.turnCount > 0);
      check(performance.now() - completions[0] >= 1950 && victim.turnCount === 1,
        `${attackingSide} ambush: the surprised camp starts once after its own two-second reaction`);
      actor.battleStopped = true; enemy.battleStopped = true;
      window.dispatchEvent(new Event('battleStopped'));
      await first;
      document.removeEventListener('entityTurnCompleted', completed);
    }
    prepare();
    attackSurprise('sideA');
    wakeSurprisedArmy(enemy);
    window.dispatchEvent(new Event('stageInterfaceClosing'));
    await sleep(2100);
    check(enemy.turnCount === 0, 'Closing the level cancels a pending surprised-army wakeup');
    actor.battleStopped = true; enemy.battleStopped = true;
    attackSurprise(null);
    entites.length = 0;
    return reports;
  });
  console.log(surprises.join('\n'));
  const surfaces = await page.evaluate(async () => {
    const { entites, entitesNestUp } = await import("/js/entities/runtime.js");
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js"), { EntityNewGameStarter } = await import("/js/ui/application.js"), { createEntityAttackDisplay, createAttackLightDescription, AttackDetailInfos } = await import("/js/ui/attacks.js");
    const { readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const { createEntiteScanInDOM } = await import("/js/rendering/entities.js");
    const reports = [];
    const check = (condition, message) => { if (!condition) throw Error(message); reports.push(message); };
    const forbidden = '.attack-active-spark, .attack-active-orbit, .attack-umbra-panel, .attack-submenu-infos, .attack-mastery, .attack-essence-sockets, .attack-priority-control, .attack-activation-control, .timers-detail';
    const checkLight = (root, context) => {
      check(!root.querySelector(forbidden), `${context}: no full-view controls, bonuses, sockets, mastery or active effects generated`);
    };
    const checkSummary = (root, context) => {
      const attacks = [...(root?.querySelectorAll('.attack-details') || [])];
      if (attacks.length !== 2 || !attacks.some(node => node.dataset.attackKey === 'resurrection')) {
        throw Error(`${context}: missing two read-only attack summaries`);
      }
      if (root.querySelector('.attack-browser-selector, .attack-browser-select')) {
        throw Error(`${context}: redundant attack selector generated`);
      }
      reports.push(`${context}: Soin and Resurrection summaries visible`);
    };
    const entity = structuredClone(entitesNestUp.find(e => e.name === 'Grouille-Doigt TEST 2A support'));
    entity.side = 'A';
    entity.role = 'mage';
    entites.push(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const menu = document.createElement('div');
    menu.className = 'menu-map-container'; document.body.append(menu);
    const codex = createCodexEntityScan(entity, menu, `codex-entity_${entity.id}`);
    codex.querySelector('.codex-profil').parentElement.click();
    checkSummary(codex.querySelector('.section-content.profil'), 'Codex profile');
    codex.querySelector('.codex-stat').parentElement.click();
    check([...codex.querySelectorAll('.section-content.stats .stat-section-codex .titre')].every(title => {
      let node = title.nextElementSibling;
      while (node && !node.classList.contains('titre')) {
        if (node.classList.contains('stat-container')) return true;
        node = node.nextElementSibling;
      }
      return false;
    }), 'Codex stats omit subgroup headings without values');
    check([...codex.querySelectorAll('.section-content.stats .stat-section-codex')].every(section =>
      section.querySelector('.stat-container, .codex-stat-section-empty')),
    'Codex stats explain empty major sections');
    check(!codex.querySelector('.section-content.stats .codex-stat-section-empty:not(.no-stats)'),
      'Empty stat messages expose the no-stats class');
    codex.querySelector('.codex-picto-menu-entity.picto-attack').click();
    const statsOverview = codex.querySelector('.codex-colomn-5 .attack-readonly-overview--stats');
    check(statsOverview.querySelectorAll('.attack-stats-choice').length === 2
      && statsOverview.querySelectorAll('.attack-stats-detail').length === 1,
    'Codex attack submenu offers two choices and one lightweight detail');
    statsOverview.querySelector('.attack-stats-choice[data-attack-key="resurrection"]').click();
    check(statsOverview.querySelector('.attack-stats-choice[data-attack-key="resurrection"]').getAttribute('aria-pressed') === 'true'
      && statsOverview.querySelector('.attack-stats-detail .attack-loot-name').textContent.includes('Résurrection'),
    'Codex attack submenu switches the inspected attack');
    codex.querySelector('.codex-attacks').parentElement.click();
    check(codex.querySelector('.section-content.attaques .entite-attack-container.multi-attacks')?.dataset.focusedAttackKey === 'resurrection',
      'Main attack tab restores the attack focused in Stats');
    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-picto-menu-entity.picto-attack').click();
    check(codex.querySelector('.attack-readonly-overview--stats .attack-stats-choice[aria-pressed="true"]')?.dataset.attackKey === 'resurrection',
      'Stats attack submenu restores focus after leaving the section');
    codex.remove();
    const reopenedCodex = createCodexEntityScan(entity, menu, `codex-entity_${entity.id}`);
    reopenedCodex.querySelector('.codex-colomn-5 .codex-picto-menu-entity.picto-attack').click();
    check(reopenedCodex.querySelector('.attack-readonly-overview--stats .attack-stats-choice[aria-pressed="true"]')?.dataset.attackKey === 'resurrection',
      'Reopened Codex restores the focused attack for this entity');
    reopenedCodex.querySelector('.codex-profil').parentElement.click();
    reopenedCodex.querySelector('.section-content.profil .attack-details[data-attack-key="soin"] .codex-attack-detail-link').click();
    check(reopenedCodex.querySelector('.section-content.attaques .entite-attack-container.multi-attacks')?.dataset.focusedAttackKey === 'soin',
      'Opening a specific attack overrides the previously remembered focus');
    const hud = document.createElement('div'); hud.className = 'AllEntitiesHud'; document.body.append(hud);
    const atb = document.createElement('div'); atb.id = `atbFill_${entity.id}`; hud.append(atb);
    createEntiteScanInDOM(entity.id);
    const scan = document.getElementById(`ScanEntity_${entity.id}`);
    check(scan.querySelectorAll('.attack-light-thumbnail').length === 2, 'Battle scan: both attack thumbnails visible');
    check(!scan.querySelector('.attack-light-description'), 'Battle scan: descriptions only in hover, not inline');
    checkLight(scan, 'Battle scan');
    const thumb = scan.querySelector('.attack-light-thumbnail[data-attack-key="resurrection"]');
    thumb.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const attack = readAttackDefinitionsForEntity(entity).find(a => a.functionName === 'resurrection');
    check(thumb.dataset.helperText === createAttackLightDescription(attack, entity).outerHTML, 'Battle scan shares the light combat helper');
    const light = createAttackLightDescription(attack, entity);
    const full = AttackDetailInfos(attack, entity);
    check(light.querySelector('.attack-description-wrapper').innerHTML === full.querySelector('.attack-description-wrapper').innerHTML, 'Light description preserves original HTML and calculated values');
    check(light.querySelector('.attack-nature') && light.querySelector('.attack-range')
      && light.textContent.includes('Rôle : Support') && light.textContent.includes('Cible : Cadavre'),
    'Light description separates role, target domain, range and nature');
    checkLight(light, 'Light description');
    const single = structuredClone(entitesNestUp.find(e => e.attacks?.length === 1 && e.type === 'sbire'));
    const one = createEntityAttackDisplay(single, { presentation: 'starter' });
    check(one.querySelectorAll('.attack-light-thumbnail').length === 1 && one.querySelector('.attack-light-description'), 'Single-attack starter shows image and inline light description');
    check(!one.querySelector('button'), 'Single-attack starter has no redundant attack selector');
    checkLight(one, 'Single-attack starter');
    const starters = document.createElement('div'); starters.id = 'multi-starter-test'; document.body.append(starters);
    const template = entitesNestUp.find(e => e.id === entity.id);
    const originalTemplate = JSON.stringify(template);
    EntityNewGameStarter([entity.id, single.id], starters.id);
    const root = starters.querySelector('.entitylootContainer');
    const card = root.querySelector(`#entity-loot_${entity.id}`);
    const wrapper = card.closest('.entity-loot-colomne');
    const other = root.querySelector(`#entity-loot_${single.id}`);
    const selectButton = wrapper.querySelector('.starter-select-button');
    const attackThumb = wrapper.querySelector('.attack-light-thumbnail[data-attack-key="resurrection"]');
    const before = localStorage.getItem('selectedArmyA');
    check(root.querySelectorAll('.starter-select-button:not([hidden])').length === 0, 'Starter validation buttons hidden until a starter is selected');
    attackThumb.click();
    attackThumb.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    check(!root.querySelector('.is-selected') && root.isConnected && localStorage.getItem('selectedArmyA') === before, 'Attack thumbnail click and double click never select or validate a starter');
    check(wrapper.querySelector('.attack-light-description').dataset.attackKey === 'resurrection', 'Multi-attack starter switches its light description');
    checkLight(wrapper, 'Multi-attack starter');
    card.click();
    wrapper.dispatchEvent(new MouseEvent('mouseleave'));
    other.closest('.entity-loot-colomne').dispatchEvent(new MouseEvent('mouseenter'));
    check(wrapper.classList.contains('is-selected') && !selectButton.hidden, 'Single click pins starter description and shows Select');
    check(localStorage.getItem('selectedArmyA') === before && !document.getElementById('confirmation-modal'), 'Consulting a starter does not save or open a confirmation');
    other.click();
    check(!wrapper.classList.contains('is-selected') && selectButton.hidden && root.querySelectorAll('.is-selected').length === 1, 'Another click switches selection without validating');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(wrapper.classList.contains('is-selected'), 'Keyboard can pin a starter');
    check(JSON.stringify(template) === originalTemplate, 'Starter preview does not mutate the catalog entity');

    const write = Storage.prototype.setItem;
    const writes = [];
    Storage.prototype.setItem = function (key, value) { writes.push(key); return write.call(this, key, value); };
    try {
      selectButton.click();
      selectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const saved = JSON.parse(localStorage.getItem('selectedArmyA'));
      check(!root.isConnected && saved.length === 1 && saved[0].name === entity.name, 'Select button commits exactly the selected starter without a modal');
      check(writes.filter(key => key === 'selectedArmyA').length === 1 && writes.filter(key => key === 'armyAConfig').length === 1, 'Repeated button and double-click events cannot save a second starter');
      check(window.selectedArmyA[0].id === saved[0].id, 'Starter selection keeps memory and saved army synchronized');
      writes.length = 0;
      EntityNewGameStarter([single.id], starters.id);
      const nextCard = starters.querySelector('.entity-loot');
      nextCard.click();
      nextCard.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      nextCard.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      check(!starters.querySelector('.entitylootContainer') && JSON.parse(localStorage.getItem('selectedArmyA'))[0].name === single.name, 'Double click directly validates through the same selection flow');
      check(writes.filter(key => key === 'selectedArmyA').length === 1, 'Double-click validation is also locked against duplicates');
    } finally { Storage.prototype.setItem = write; }
    menu.remove(); hud.remove(); starters.remove(); entites.length = 0;
    return reports;
  });
  console.log(surfaces.join('\n'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const { EntityNewGameStarter } = await import("/js/ui/application.js");
    document.querySelectorAll('#multi-fixture, .entitylootContainer, #black-overlay, .stat-hover').forEach(node => node.remove());
    const fixture = document.createElement('div');
    fixture.id = 'starter-visual-fixture';
    fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111 url(/media/worldmap.jpg) center/cover;color:white;';
    document.body.append(fixture);
    const multi = entitesNestUp.find(e => e.name === 'Grouille-Doigt TEST 2A support');
    const single = entitesNestUp.find(e => e.serial === 11);
    EntityNewGameStarter([multi.id, single.id], fixture.id);
  });
  const starterCard = page.locator('#starter-visual-fixture .entity-loot').first();
  await starterCard.click();
  const firstStarter = page.locator('#starter-visual-fixture .entity-loot-colomne').first();
  await firstStarter.locator('.attack-light-thumbnail[data-attack-key="resurrection"]').click();
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => [...document.querySelectorAll('#starter-visual-fixture .attack-light-thumbnail img')].every(img => img.complete && img.naturalWidth > 0));
  await page.waitForTimeout(200);
  assert.equal(await firstStarter.locator('.entity-loot-detail').evaluate(node => getComputedStyle(node).opacity), '1', 'Pinned starter remains visible after pointer leaves');
  await page.screenshot({ path: 'outputs/combat-tests/starter-light-desktop.png' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await firstStarter.evaluate(node => {
      const card = node.getBoundingClientRect();
      const detail = node.querySelector('.entity-loot-detail');
      const button = node.querySelector('.starter-select-button').getBoundingClientRect();
      return { left: card.left, right: card.right, overflow: detail.scrollWidth - detail.clientWidth,
        buttonBelowDescription: button.top >= node.querySelector('.attack-light-description').getBoundingClientRect().bottom };
    });
    assert(geometry.left >= 0 && geometry.right <= width && geometry.overflow <= 1 && geometry.buttonBelowDescription, `Starter layout fits ${width}px without overlapping the validation button`);
  }
  await page.screenshot({ path: 'outputs/combat-tests/starter-light-mobile.png' });
  await page.locator('#starter-visual-fixture .starter-select-button:not([hidden])').click();
  assert.equal(await page.locator('#starter-visual-fixture .entitylootContainer').count(), 0, 'Real pointer click validates selected starter');
  await page.evaluate(async () => {
    const { EntityNewGameStarter } = await import("/js/ui/application.js");
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    EntityNewGameStarter([entitesNestUp.find(e => e.serial === 11).id], 'starter-visual-fixture');
  });
  await page.locator('#starter-visual-fixture .entity-loot').dblclick();
  assert.equal(await page.locator('#starter-visual-fixture .entitylootContainer').count(), 0, 'Real double click validates without a modal');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`PASS: ${reports.length + cycles.length + surprises.length + surfaces.length} multi-attack checks, desktop/mobile rendering`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
