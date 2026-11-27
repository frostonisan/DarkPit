import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
const root = resolve('docs'), output = resolve('outputs/fureur-progressive-20261126/browser');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const release = JSON.parse(await readFile('package.json', 'utf8'));
  await page.waitForFunction(version => document.querySelector('#game-version')?.textContent.includes(version), release.gameVersion);
  const fixture = await readFile('scripts/verify-umbra-helper-structure-browser.mjs', 'utf8');
  const start = fixture.indexOf('const keys = await page.evaluate(async () => {');
  const end = fixture.indexOf('  const card = page.locator', start);
  assert.ok(start >= 0 && end > start);
  await new (Object.getPrototypeOf(async function(){}).constructor)('page', fixture.slice(start, end))(page);
  const card = page.locator('.stat-hover[data-umbra-pinned="true"]:not([data-umbra-detail])');
  const detail = page.locator('[data-umbra-detail]').last();
  const ids = ['bloodFuryBloodThirstyBonus', 'bloodFuryExecutionBonus', 'bloodFuryExecChanceBonus', 'bloodFuryExecDamage'];
  for (const width of [1440, 390]) for (const admin of [false, true]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(admin => {
      audit.G.setAdminMode(admin);
      audit.e.baseStats = { HP: 1000, bloodFury: 150, strength: 150, physicalDamage: 100 };
      audit.e.modifierStats = {}; audit.e.seuilUmbra = 150;
      audit.E.recomputeEntityStats(audit.e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      audit.show('bloodFury');
    }, admin);
    await card.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#game-version').isVisible(), true);
    assert.equal(await card.locator('.umbra-passive-icon').count(), 3, 'Three framed abilities');
    assert.equal(await card.locator('.umbra-unique-passive [data-umbra-capacity]').count(), 6, 'Execution has three attached parameters');
    assert.equal(await card.locator('[data-umbra-capacity="bloodFuryBloodThirstyBonus"] .umbra-passive-icon').count(), 0);
    assert.equal(await card.locator('[data-umbra-section="introduction"] [data-umbra-detail-toggle]').count(), 0);
    const layout = await card.evaluate(node => { const body=node.querySelector('.stat-hover-body'), r=node.getBoundingClientRect(); return { overflow:getComputedStyle(body).overflowY, scroll:body.scrollHeight>body.clientHeight+2, top:r.top,bottom:r.bottom }; });
    assert.equal(layout.overflow, 'visible'); assert.equal(layout.scroll, false);
    assert.ok(layout.top>=-1 && layout.bottom<=(width===390?845:1001));
    const params = card.locator('.umbra-unique-passive .umbra-effect-heading');
    assert.equal(await params.count(), 3, 'Parameters are ordinary rows within the exclusive frame');
    assert.equal(await card.locator('[data-umbra-detail-toggle]').count(), admin ? 4 : 0);
    await card.locator('.umbra-role [data-helper-picto-stat]').click();
    assert.equal(await detail.locator('[data-helper-entry="bloodExecution"]').count(), 1);
    assert.equal(await detail.locator('[data-helper-entry="bloodCrazy"]').count(), 1);
    assert.equal(await detail.locator('[data-helper-entry="bloodGlutony"]').count(), 1);
    assert.equal(await detail.locator('[data-helper-entry="bloodFuryExecutionBonus"]').count(), 0, 'Execution parameters are not separate abilities');
    await card.locator('.umbra-card-ambiance').click();
    for (const id of ids) {
      await card.locator(`[data-helper-value="${id}"]`).first().click();
      await detail.waitFor({ state: 'visible' });
      assert.equal(await detail.locator('[data-helper-technical]').count(), admin ? 1 : 0);
      if (admin) assert.match(await detail.innerText(), /Score|Renforcement/);
      else assert.doesNotMatch(await detail.innerText(), /Score :|courbe de Force|arrondis au supérieur/);
      const box = await detail.evaluate(node => {
        const r = node.getBoundingClientRect();
        return { top: r.top, left: r.left, bottom: r.bottom, right: r.right,
          clipped: node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2,
          overflow: getComputedStyle(node).overflowY };
      });
      assert.equal(box.overflow, 'visible'); assert.equal(box.clipped, false);
      assert.ok(box.top >= -1 && box.left >= -1 && box.right <= width + 1 && box.bottom <= (width === 390 ? 845 : 1001), 'Helper remains visible');
    }
    for (const id of ['bloodExecution', 'bloodCrazy', 'bloodGlutony']) {
      await card.locator(`[data-helper-entry="${id}"]`).first().click();
      assert.match(await detail.locator('.stat-hover-header').innerText(), /Passive exclusive/);
    }
    await card.locator('.umbra-card-ambiance').click();
    if (admin) {
      if (await card.locator('[data-umbra-info-toggle]').getAttribute('aria-expanded') === 'true') await card.locator('[data-umbra-info-toggle]').click();
      await card.locator('[data-umbra-info-toggle]').click();
      assert.equal(await card.locator('[data-umbra-detail-toggle][aria-expanded="true"]').count(), 4, 'Global i opens every calculation');
      await card.locator('[data-umbra-detail-toggle]').first().click();
      assert.equal(await card.locator('[data-umbra-detail-toggle][aria-expanded="true"]').count(), 3, 'Individual triangle closes only one');
      await card.locator('[data-umbra-info-toggle]').click();
      assert.equal(await card.locator('[data-umbra-detail-toggle][aria-expanded="true"]').count(), 4);
      const expanded = await card.evaluate(node => {
        const body = node.querySelector('.stat-hover-body'), box = node.getBoundingClientRect();
        return { clipped: body.scrollHeight > body.clientHeight + 2, top: box.top, bottom: box.bottom };
      });
      assert.equal(expanded.clipped, false);
      assert.ok(expanded.top >= -1 && expanded.bottom <= (width === 390 ? 845 : 1001));
      await card.screenshot({ path: resolve(output, `calculations-${width}.png`) });
      await card.locator('[data-umbra-info-toggle]').click();
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned]')].every(node => Number(getComputedStyle(node).opacity) >= .99));
    await card.screenshot({ path: resolve(output, `card-${width}-${admin ? 'admin' : 'player'}.png`) });
    checks.push(`${width}: ${admin ? 'admin' : 'player'} card, helpers, calculations, framing and viewport`);
  }
  const high = await page.evaluate(() => {
    audit.G.setAdminMode(false); audit.e.seuilUmbra = 1500;
    audit.e.baseStats.bloodFury = audit.e.baseStats.strength = 1500;
    audit.E.recomputeEntityStats(audit.e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    audit.show('bloodFury');
    return audit.D.calculateStatsDisplay('bloodFury', audit.e).umbraPresentation.entries.filter(entry => entry.value != null).map(entry => entry.value);
  });
  assert.deepEqual(high.map(value => Math.round(value * 100) / 100), [98.55, 97.66, 49.46, 595]);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
  await card.screenshot({ path: resolve(output, 'limit-1500.png') });
  checks.push('1500-point entity and helpers agree with the accepted figures');
  checks.push(...await page.evaluate(async () => {
    audit.H.closeOpenHelpers();
    const D = await import('/js/combat/statistics.js'), V = await import('/js/combat/vitals.js');
    const E = audit.E;
    const reports = [];
    const check = (condition, label) => { if (!condition) throw Error(label); reports.push(label); };
    let nextId = 989800;
    const actor = (baseStats = {}, side = 'A') => {
      const e = E.enrichEntityStats({ id: ++nextId, name: `Fureur ${nextId}`, type: 'sbire', side, awakening: 3,
        role: ['gueux'], level: 1, seuilUmbra: 150, attacks: ['autoAttack'], stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 1000, physicalDamage: 100, strength: 0, agility: 0, intelligence: 0,
          physicalResistance: 0, magicalResistance: 0, criticalChance: 0, armor: 0, ...baseStats } });
      e.isDEAD = false; e.statut = ['alive']; E.entites.push(e); return e;
    };
    const attacker = actor({ bloodFury: 150, strength: 150 });
    const attack = { functionName: 'fureur-regression', launchContextId: 'fureur-regression', combatFunction: 'Attaquant',
      attackRange: ['melee'], attacknature: ['physicalDamage'], attackTarget: ['enemy'], deadTarget: ['no'],
      essenceSlots: [{ color: 'red' }], essences: ['red'], effets: [], selfEffects: [], physicalRatio: 1 };
    const random = Math.random;
    const logs = [];
    const listen = event => { if (event.detail.type === 'damage_resolution') logs.push(event.detail.data); };
    window.addEventListener('combatLogEntry', listen);
    try {
      Math.random = () => 0;
      const above = actor({}, 'B'); above.stats.HP.current = 500;
      check(D.attemptBloodFuryExec(attacker, above) === 0, 'Target above threshold cannot be executed');
      check(D.attemptBloodFuryExec(attacker, above, { ignoreHpThreshold: true }) === 435, 'Dementia bypasses threshold');
      Math.random = () => .99;
      check(D.attemptBloodFuryExec(attacker, above, { ignoreHpThreshold: true }) === 0, 'Dementia still requires successful roll');
      Math.random = () => 0;
      const victim = actor({}, 'B'); victim.stats.HP.current = 100; attacker.stats.HP.current = 100;
      V.applyDamage(victim, 10, attacker, attack, { physical: 10 });
      check(victim.stats.HP.current === 0, 'Execution extra damage reaches the real impact');
      check(attacker.flags.bloodCrazyNextExecution, 'Execution kill grants Dementia');
      check(attacker.stats.HP.current === attacker.stats.HP.max, 'Execution overkill restores all HP');
      const healthy = actor({}, 'B');
      V.applyDamage(healthy, 10, attacker, attack, { physical: 10 });
      check(healthy.stats.HP.current === 555, 'Next attack can execute a full-health target');
      check(!attacker.flags.bloodCrazyNextExecution, 'Dementia consumed once');
      attacker.flags.bloodCrazyNextExecution = true;
      const ranged = actor({}, 'B');
      V.applyDamage(ranged, 10, attacker, { ...attack, attackRange: ['range'] }, { physical: 10 });
      check(ranged.stats.HP.current > 900 && ranged.stats.HP.current < 1000 && !attacker.flags.bloodCrazyNextExecution
        && logs.at(-1)?.modifiers?.execution === false, 'Ranged attack consumes Dementia without executing');
      delete attacker.baseStats.bloodFury; attacker.baseStats.bloodThirsty = 20;
      E.recomputeEntityStats(attacker, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      attacker.flags.bloodCrazyNextExecution = true; attacker.stats.HP.current = 100;
      const autonomous = actor({}, 'B'); autonomous.stats.HP.current = 100;
      V.applyDamage(autonomous, 10, attacker, attack, { physical: 10 });
      check(autonomous.stats.HP.current === 90, 'No execution after withdrawing Umbra');
      check(attacker.stats.HP.current === 102, 'Autonomous Soif still heals after withdrawing Umbra');
      check(!attacker.flags.bloodCrazyNextExecution, 'Stale Dementia cleared without Umbra');
      check(logs.length >= 4, 'Real impacts produce combat journal entries');
    } finally { Math.random = random; window.removeEventListener('combatLogEntry', listen); }
    return reports;
  }));
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'coverage.json'), JSON.stringify(checks, null, 2));
  console.log(`Fureur browser: ${checks.length} scenarios passed.`);
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
