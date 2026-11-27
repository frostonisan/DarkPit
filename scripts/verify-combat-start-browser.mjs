import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/combat-start');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const report = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const F = await import("/js/combat/loop.js");
    const G = await import("/js/app/state.js");
    const U = await import("/js/ui/application.js");
    const A = await import("/js/combat/vitals.js");
    const Events = await import("/js/events/runtime.js");
    const Selection = await import("/js/combat/attackResolution.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const checks = [], restarts = [], failures = [];
    const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    const until = async (predicate, message) => {
      const deadline = Date.now() + 2500;
      while (!predicate() && Date.now() < deadline) await sleep(25);
      check(predicate(), message);
    };
    const warn = console.warn, error = console.error;
    console.warn = (...args) => { if (String(args[0]).startsWith('[CombatTurnStart]')) restarts.push(args[1]); warn(...args); };
    console.error = (...args) => { if (String(args[0]).startsWith('[CombatTurnStart]')) failures.push(args[1]); error(...args); };
    window.levelRunning = 'scripted';
    U.createGameContainer(); U.GameUi();
    let nextId = 991500;
    const make = (side = 'A', type = 'sbire') => {
      const entity = E.enrichEntityStats({ id: ++nextId, name: `Startup ${nextId}`, type, side, role: 'gueux',
        level: 1, attacks: side === 'B' ? ['autoAttack'] : [], baseStats: { HP: 100, shift: 10, agility: 17, speed: 10000 }, stuff: {} });
      entity.isDEAD = false; entity.statut = ['alive']; entity.stats.speed = 10000;
      E.entites.push(entity);
      return entity;
    };
    const reset = () => {
      G.StopGame(); G.resetBattleResolution(); G.setOrderSide(null); Events.attackSurprise(null);
      E.entites.length = 0; restarts.length = 0; failures.length = 0;
    };
    const omitInitialLaunch = () => {
      let omitted;
      window.addEventListener('battleStarted', () => { omitted = E.entites.splice(0); }, { once: true });
      G.startGame();
      E.entites.push(...omitted);
    };

    reset();
    const timerEntity = make(); timerEntity.life = 0;
    check(await Promise.race([A.runPhaseTimer(timerEntity, 'preparationTime', 40).then(result => result !== false), sleep(300).then(() => false)]), 'Positive HP starts a timer even when the unused life field is zero');
    timerEntity.stats.HP.current = 0;
    check(await A.runPhaseTimer(timerEntity, 'speedTimer', 100) === false, 'Zero HP cannot run a phase');
    timerEntity.stats.HP.current = 100;
    let allowed = true;
    const cancelled = A.runPhaseTimer(timerEntity, 'speedTimer', 10000, { canContinue: () => allowed });
    allowed = false;
    check(await cancelled === false, 'Cancelled phase settles without waiting for resurrection');

    reset();
    let actor = make(), enemy = make('B', 'lord');
    actor.battleStopped = true; enemy.battleStopped = true;
    F.initFightEntites();
    check(!actor.battleStopped && !enemy.battleStopped, 'Loading a new battle clears the previous battle stop flags');
    G.startGame();
    await until(() => actor.turnCount === 1 && enemy.turnCount === 1, 'Initial turns start after the combat timeline dispatch');
    check(actor.turnCount === 1 && enemy.turnCount === 1, 'Normal startup launches both combatants and Lords');
    const initialMovement = actor.stats.shift.current;
    void F.entiteTurn(actor, [enemy]); void F.entiteTurn(actor, [enemy]);
    await sleep(650);
    check(actor.turnCount === 1 && enemy.turnCount === 1, 'Startup verification and duplicate calls do not start concurrent turns');
    check(actor.stats.shift.current === initialMovement && !restarts.length, 'Healthy slow ATB does not receive extra charges or fallback');

    reset(); actor = make(); enemy = make('B');
    const veteran = make('A', 'lord');
    G.startGame();
    await until(() => actor.turnCount === 1 && veteran.turnCount === 1, 'Both survivors participate in the first battle');
    enemy.isDEAD = true; enemy.statut = ['dead']; enemy.stats.HP.current = 0;
    G.checkGameOver();
    check(G.battleOutcome === 'victory' && actor.battleStopped && veteran.battleStopped,
      'Victory freezes the surviving army before the chest event');
    const recruit = make(), king = make('B'); king.serial = 666;
    const survivorHp = actor.stats.HP.current, survivorMovement = actor.stats.shift.current;
    await Events.forceBattle({ eventKey: 'cockRoachHunt' });
    await until(() => [actor, veteran, recruit, king].every(entity => entity.turnCount === 1 && entity.speedTimer > 0),
      'Cockroach event starts old survivors, new allies and the king together');
    check([actor, veteran, recruit, king].every(entity => !entity.battleStopped && entity.status === 'active'),
      'New event battle releases the previous battle stop flags');
    check(enemy.isDEAD && enemy.stats.HP.current === 0 && !enemy.turnCount,
      'Restart does not resurrect or start the old enemy corpse');
    check(actor.stats.HP.current === survivorHp && actor.stats.shift.current === survivorMovement + 1,
      'Restart preserves HP and grants exactly one normal first-turn movement refill');
    await Events.forceBattle({ eventKey: 'cockRoachHunt' });
    await sleep(650);
    check([actor, veteran, recruit, king].every(entity => entity.turnCount === 1) && !restarts.length,
      'Repeated event start does not duplicate turns or require startup recovery');

    G.StopGame({ preserveScene: true });
    check(actor.battleStopped && king.battleStopped, 'An explicit combat stop freezes both camps');
    G.startGame();
    await until(() => [actor, veteran, recruit, king].every(entity => entity.turnCount === 1 && entity.speedTimer > 0),
      'A new combat after StopGame also reactivates the surviving participants');

    reset(); actor = make(); enemy = make('B');
    const dead = make(); dead.isDEAD = true; dead.stats.HP.current = 0;
    const empty = make(); empty.stats.HP.current = 0;
    omitInitialLaunch();
    check(!actor.turnCount && !enemy.turnCount, 'Fixture reproduces omitted initial turns');
    await until(() => actor.turnCount === 1 && enemy.turnCount === 1, 'Automatic startup check recovers omitted turns in both camps');
    check(!dead.turnCount && !empty.turnCount, 'Fallback excludes corpses and zero-HP entities');
    check(restarts.length === 2, 'Missing starts produce one diagnostic each');
    await sleep(600);
    check(actor.turnCount === 1 && restarts.length === 2, 'Recovered startup is not repeated');

    reset(); actor = make(); enemy = make('B');
    let speedTimer = 0, throwOnce = true;
    Object.defineProperty(actor, 'speedTimer', { configurable: true, enumerable: true,
      get: () => speedTimer, set: value => { if (throwOnce) { throwOnce = false; throw Error('Injected initial timer failure'); } speedTimer = value; } });
    const before = actor.stats.shift.current;
    G.startGame();
    await until(() => restarts.length === 1 && actor.speedTimer > 0, 'A failed initial turn is resumed automatically');
    check(actor.turnCount === 1 && actor.stats.shift.current === before + 1, 'Resuming a failed startup does not double turn count or movement refill');
    check(restarts[0].error === 'Injected initial timer failure', 'Fallback diagnostic preserves the initial error');
    check(enemy.turnCount === 1 && enemy.speedTimer > 0, 'One failed startup does not stop the other entity timer');

    reset(); actor = make(); enemy = make('B');
    Object.defineProperty(actor, 'speedTimer', { configurable: true, get: () => 0, set: () => { throw Error('Injected persistent startup failure'); } });
    const beforePersistent = actor.stats.shift.current;
    G.startGame();
    await until(() => failures.length === 1, 'Persistent startup failure is diagnosed after bounded retries');
    check(restarts.length === 2 && actor.turnCount === 1 && actor.stats.shift.current === beforePersistent + 1, 'Persistent failure neither loops forever nor duplicates resource gains');
    delete actor.speedTimer;

    reset(); actor = make(); enemy = make('B');
    G.setOrderSide('A'); G.startGame();
    check(F.verifyCombatTurnStarts().some(entry => entry.entityId === actor.id && entry.status === 'order'), 'Order is identified as a legitimate startup blocker');
    await sleep(600);
    check(!actor.turnCount && !restarts.length, 'Fallback does not override an order');
    G.setOrderSide(null);
    await until(() => actor.turnCount === 1, 'Pending entity starts after its order is released');

    reset(); actor = make(); enemy = make('B');
    Events.attackSurprise('B'); G.startGame();
    check(F.verifyCombatTurnStarts().some(entry => entry.entityId === actor.id && entry.status === 'surprised'), 'Surprise is identified as a legitimate startup blocker');
    F.wakeSurprisedArmy(actor);
    await sleep(650);
    check(!actor.turnCount && !restarts.length, 'Fallback preserves the surprise wake-up animation delay');
    await until(() => actor.turnCount === 1, 'Surprised army starts once after its regular wake-up delay');
    check(!restarts.length, 'Normal surprise wake-up needs no fallback');

    reset(); actor = make(); enemy = make('B');
    window.addEventListener('battleStarted', () => { actor.battleStopped = true; }, { once: true });
    G.startGame();
    check(F.verifyCombatTurnStarts().some(entry => entry.entityId === actor.id && entry.status === 'stopped'), 'Explicit entity stop is respected');
    G.startGame();
    check(actor.battleStopped, 'Calling start on an already running battle preserves an explicit entity stop');
    await sleep(600); check(!actor.turnCount, 'Fallback never clears an explicit stop');

    reset(); actor = make(); enemy = make('B');
    actor.stats.speed = 20;
    Selection.setEntityAttackDefinitions(actor, ['quickAttack'], attackDetails);
    G.startGame();
    const attack = Selection.readAttackDefinitionsForEntity(actor, attackDetails)[0];
    Selection.startAttackCooldown(actor, attack, 60000);
    await until(() => actor.currentPhase === 'cooldown-wait', 'Entity reaches the real cooldown wait');
    await sleep(600);
    check(actor.turnCount === 1 && !restarts.length, 'A legitimate long cooldown is not force-restarted');

    reset(); actor = make(); enemy = make('B');
    actor.stats.speed = 600; G.startGame();
    await until(() => actor.currentPhase === 'target-search', 'Entity with no attacks enters the regular target search');
    check(!restarts.length && actor.turnCount === 1, 'No-target search is not mistaken for an unstarted turn');

    for (const eventName of ['stageInterfaceClosing', 'battleResolved', 'battleStopped']) {
      reset(); actor = make(); enemy = make('B');
      omitInitialLaunch();
      window.dispatchEvent(new Event(eventName));
      await sleep(650);
      check(!actor.turnCount && !enemy.turnCount && !restarts.length, `${eventName} cancels pending startup recovery`);
    }
    reset(); actor = make(); enemy = make('B');
    omitInitialLaunch(); E.entites.splice(E.entites.indexOf(actor), 1);
    await sleep(650);
    check(!actor.turnCount && !enemy.turnCount && !restarts.length, 'Removed entity and absence of opponents prevent startup recovery');
    reset();
    console.warn = warn; console.error = error;
    return { count: checks.length, checks };
  });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
