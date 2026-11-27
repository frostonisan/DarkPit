import { dismissStarterForFixture } from "./browser-test-fixture.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/adresse');
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
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const report = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/combat/statistics.js");
    const F = await import("/js/combat/attacks.js");
    const A = await import("/js/combat/attackResolution.js");
    const R = await import("/js/combat/vitals.js");
    const C = await import("/js/storage/entityStorage.js");
    const State = await import("/js/app/state.js");
    const G = await import("/js/storage/gameStorage.js");
    const P = await import('/js/items/permanentItems.js');
    const I = await import('/js/items/itemEffectMecanics.js');
    const checks = [];
    const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const eq = (a, b, label) => check(Math.abs(a - b) < 1e-8, `${label}: ${a} = ${b}`);
    window.levelRunning = 'worldmap'; State.setGameOver(false);
    G.saveToLocalStorage('ArmyB', { armies: {} });
    G.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    G.saveToLocalStorage('equippedItems', []);
    const host = document.createElement('main'); host.id = 'adresse-combat'; document.body.append(host);
    host.className = 'hex-grid';
    const board = await import('/js/board/controller.js');
    let id = 988500;
    const actor = (side, stats = {}) => {
      const entity = E.enrichEntityStats({ id: ++id, name: `Adresse ${id}`, side, type: 'sbire', level: 1,
        attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 1000, ...stats }, position: `hex_${id}` });
      entity.isDEAD = false; entity.statut = ['alive'];
      const hex = document.createElement('div'); hex.className = 'hex Neutral occupied'; hex.dataset.position = entity.position;
      hex.innerHTML = `<div id="Box_Entite_${id}" class="entite-box" data-position="${entity.position}"><div id="sbire_${id}"><div id="spriteContainer_${id}" class="sprite-container"><div id="Animationsprite_${id}"><div id="DragSprite_${id}"><canvas id="spriteCanvas_${id}" width="70" height="70"></canvas></div></div><div id="Cast_Animation_${id}"></div></div><div id="effectsContainer_${id}"></div><div id="PopDow_${id}"></div></div></div>`;
      host.append(hex); E.entites.push(entity);
      board.invalidateFootprintGeometry(host); board.rebuildBoardOccupancy(host);
      return entity;
    };
    const originalRandom = Math.random;
    try {
      const attacker = actor('A');
      const tiny = actor('B', { dodge: 1 });
      Math.random = () => .015;
      check(!D.attemptDodge(attacker, tiny), '1% chance is not raised to a 2% floor');
      Math.random = () => .005;
      check(D.attemptDodge(attacker, tiny), '1% chance succeeds below 1%');
      const accurate = actor('A', { precision: 150 });
      const chance = .01 * (1 - E.calculatePrecisionPercent(150) / 100);
      Math.random = () => chance + .0001;
      check(!D.attemptDodge(accurate, tiny), 'Precision reduces chance below 1% with no floor');
      Math.random = () => chance / 2;
      check(D.attemptDodge(accurate, tiny), 'The exact reduced chance remains usable');
      const zero = actor('B'); Math.random = () => 0;
      check(!D.attemptDodge(attacker, zero), 'Zero score never dodges even with a zero roll');
      const huge = actor('B', { dodge: 1e9 }); Math.random = () => .985;
      check(D.attemptDodge(accurate, huge) === (.985 < D.calculateTotalDodgeBonus(huge) * (1 - E.calculatePrecisionPercent(150) / 100) / 100), 'No precision floor changes the exact formula');
      check(D.attemptDodge(attacker, huge), 'No minimum hit floor caps a high dodge chance at 98%');
      const cases = [
        ['physical', ['physicalDamage'], { physical: 100 }, 0],
        ['piercing', ['piercingDamage'], { piercingDamage: 100 }, 0],
        ['inert', [], { physical: 100 }, 0],
        ['kinetic', ['physicalDamage','piercingDamage'], { physical: 60, piercingDamage: 40 }, 0],
        ['magical', ['magicalDamage'], { magical: 100 }, 100],
        ['hybrid', ['hybridalDamage'], { hybridalDamage: 100 }, 50],
        ['spectral', ['magicalDamage','piercingDamage'], { magical: 60, piercingDamage: 40 }, 60],
        ['prismatic', ['physicalDamage','magicalDamage','piercingDamage'], { physical: 20, magical: 30, piercingDamage: 50 }, 30],
      ];
      for (const range of ['melee','range']) for (const [label, natures, sources, expected] of cases) {
        const target = actor('B', { dodge: 98 });
        const attack = { functionName: `adresse-${label}`, displayName: label, combatFunction: 'Attaquant', attackTarget: ['enemy'], deadTarget: ['no'],
          attackRange: [range], attacknature: natures, effets: [], selfEffects: [], executionTime: 1, natureEffectSecondary: true };
        let rolls = 0; Math.random = () => { rolls++; return 0; };
        const flight = F.createAttackFlight(attacker, target, attack, sources);
        const expectedAvoided = label === 'magical' ? 0 : R.estimateCancelledAttackHp(attacker, target, attack, sources)
          - (expected ? R.estimateCancelledAttackHp(attacker, target, attack, { magical: expected }) : 0);
        const outcome = await F.resolveAttackImpact(flight);
        eq(1000 - target.stats.HP.current, expected, `${range}/${label}: only magic survives a successful dodge`);
        check(outcome === (expected ? 'hit' : 'dodged'), `${range}/${label}: impact outcome`);
        const details = C.getEntityCombatDetails(target, { elapsed: false });
        eq(details.defenseHp.dodge || 0, expectedAvoided, `${range}/${label}: avoided HP counts only the cancelled portion`);
        if (label === 'magical') check(!A.getAttackResolutionFlags(attack).canBeDodged, 'Pure magic never enters the dodge branch');
        if (!expected) eq(rolls, 1, `${range}/${label}: one dodge roll for an entire impact`);
      }
      const target = actor('B', { dodge: 98, magicalResistance: 70, armor: 20 });
      const hybrid = { functionName: 'adresse-reduced-hybrid', combatFunction: 'Attaquant', attackTarget: ['enemy'], deadTarget: ['no'],
        attackRange: ['range'], attacknature: ['hybridalDamage'], effets: [], selfEffects: [], natureEffectSecondary: true };
      const sources = { hybridalDamage: 100 };
      const expectedAvoided = R.estimateCancelledAttackHp(attacker, target, hybrid, sources)
        - R.estimateCancelledAttackHp(attacker, target, hybrid, { magical: 50 });
      Math.random = () => 0;
      await F.resolveAttackImpact(F.createAttackFlight(attacker, target, hybrid, sources));
      eq(1000 - target.stats.HP.current, 15, 'Remaining magic follows normal armor then RM reductions');
      eq(C.getEntityCombatDetails(target).defenseHp.dodge, expectedAvoided, 'Partial avoided HP accounts for shared armor once');
      const undodgeableTarget = actor('B', { dodge: 98 });
      await F.resolveAttackImpact(F.createAttackFlight(attacker, undodgeableTarget, { ...hybrid, attacknature: ['physicalDamage'], isUndodgeable: true }, { physical: 100 }));
      eq(1000 - undodgeableTarget.stats.HP.current, 75, 'Explicit undodgeable attack bypasses dodge and keeps the new duration-based range reduction');
      const lostCaster = actor('A'), remnantTarget = actor('B', { dodge: 98 });
      const remnant = F.createAttackFlight(lostCaster, remnantTarget, hybrid, { hybridalDamage: 100 });
      lostCaster.isDEAD = true;
      check(await F.resolveAttackImpact(remnant) === 'dodged', 'Physical remnant after caster death remains fully dodgeable');
      eq(remnantTarget.stats.HP.current, 1000, 'Dissipated magic does not return after a dodge');
    } finally { Math.random = originalRandom; }
    for (const stat of ['strength','intelligence','agility','vigueur','esprit','finesse','constitution','integrite','adresse']) {
      const entity = actor('A', { [stat]: 160 });
      G.saveToLocalStorage('selectedArmyA', [entity]);
      const before = Number(entity.stats[stat]);
      const crystal = P.createUmbraCrystal({ statKey: stat, amount: 20, origin: 'admin-spawn' });
      const result = await I.itemApplyEffect(entity, 'itemPermanentStat', crystal);
      check(result.ok, `${stat}: actual crystal consumption succeeds`);
      eq(entity.stats[stat] - before, 20, `${stat}: crystal retains 100% above the common limit`);
      const reload = JSON.parse(JSON.stringify(entity)); E.recomputeEntityStats(reload, { equippedItems: [], persistEquipment: false });
      eq(reload.stats[stat], entity.stats[stat], `${stat}: crystal gain survives save and recompute`);
    }
    host.remove(); E.entites.length = 0;
    return checks;
  });
  console.log(`Adresse combat and crystal checks: ${report.length} passed.`);
  const expectedParts = await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js"), E = await import("/js/entities/runtime.js"), S = await import("/js/entities/statSystem.js");
    const U = await import("/js/entities/progression.js"); U.setPlayerExperience(1000000);
    const entity = { id: 988141, name: 'Adresse', type: 'sbire', side: 'A', awakening: 1, level: { current: 1, max: 250 }, attacks: ['autoAttack'],
      stuff: {}, stats: {}, baseStats: { HP: 100, agility: 10, adresse: 10, dodge: 2, dodgePlus: 3 } };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const host = document.createElement('main'); host.id = 'adresse-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#001024;z-index:1'; document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const row = S.getStatSystemResult(entity, 'dodge');
    return [row.progression.source, row.bonuses[0]].map(p => ({ ratio: String(p.coefficient), raw: String(p.raw), retained: p.value }));
  });
  const helper = page.locator('[data-umbra-pinned="true"]');
  const waitHelper = async () => {
    await helper.waitFor({ state: 'visible' });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity) >= .99);
  };
  const dodge = page.locator('#adresse-test .stat-container[data-stat="dodge"]').first();
  assert.match(await dodge.innerText(), /24[.,]37\s*%/);
  await dodge.click(); await waitHelper();
  assert.match((await helper.innerText()).replace(/\s+/g, ' '), /Score d’esquive total : 32 points/);
  await page.screenshot({ path: resolve(output, 'dodge-score-helper.png') });
  await page.keyboard.press('Escape');
  await page.locator('#adresse-test .section-content.stats [data-mode="umbra"]').click();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.locator('#adresse-test .stat-container[data-stat="adresse"]').first().click(); await waitHelper();
    await page.mouse.move(viewport.width - 1, 1);
    const body = (await helper.innerText()).replace(/\s+/g, ' ');
    for (const part of expectedParts) assert.ok(body.replaceAll(',', '.').includes(`× ${Math.round(Number(part.ratio) * 10) / 10}`));
    assert.match(body, /Esquive accordée par l’Umbra\s*:\s*\+\s*27/);
    assert.ok(!/\+\s*32\s*%/.test(body), 'Score is not mislabeled as a percent');
    assert.ok(await helper.evaluate(el => el.scrollWidth - el.clientWidth) <= 1, 'Precise helper fits screen');
    await page.screenshot({ path: resolve(output, `adresse-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const itemChecks = await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js'), P = await import('/js/items/permanentItems.js');
    const item = { itemId: 'adresse-equipment-test', itemType: ['stuff'], itemName: 'Esquive', quality: 'common',
      Stuffeffets: [{ type: 'stat-buff', stat: 'dodge', value: 2 }, { type: 'stat-buff', stat: 'adresse', value: 2 }] };
    const anchor = document.createElement('button'); anchor.textContent = 'Test'; document.body.append(anchor);
    const card = M.createItemDescription(item, item.itemId, anchor);
    const row = card.querySelector('[data-stat="dodge"].stuff-stat-row');
    const result = { text: row?.innerText, hover: row?.dataset.helperText, footer: card.lastElementChild.textContent };
    const crystal = P.createUmbraCrystal({ statKey: 'adresse', amount: 2 });
    const crystalCard = M.createItemDescription(crystal, crystal.itemId, anchor);
    result.crystalFooter = crystalCard.lastElementChild.textContent;
    result.crystalHover = crystalCard.querySelector('.stuff-stat-row').dataset.helperText;
    card.remove(); crystalCard.remove(); anchor.remove(); return result;
  });
  assert.match(itemChecks.text, /\+2/); assert.ok(!itemChecks.text.includes('%'));
  assert.equal(itemChecks.hover, 'Améliore l’esquive.');
  assert.equal(itemChecks.footer, 'Amélioration'); assert.equal(itemChecks.crystalFooter, 'Amélioration intense');
  assert.match(itemChecks.crystalHover, /Amélioration intense/);
  await page.locator('#adresse-test .codex-inner-menu:has(.codex-soul)').click();
  const levelStat = page.locator('#adresse-test .level-up-section [data-attribute-helper][data-stat="agility"]').first();
  await levelStat.click(); await waitHelper();
  assert.match(await helper.innerText(), /Amélioration standard/);
  await page.keyboard.press('Escape');
  await page.goto(`http://127.0.0.1:${server.address().port}/index-14.html`);
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  await page.locator('[data-catalog="umbras"] summary').click();
  await page.locator('[data-add="umbra-adresse"]').click();
  await page.locator('input[data-group="attributes"][data-key="agility"]').fill('10');
  await page.locator('input[data-group="umbras"][data-key="adresse"]').fill('10');
  assert.match(await page.locator('[data-stat-total="dodge"]').innerText(), /21[.,]38\s*%/);
  assert.match(await page.locator('[data-ratio="umbra-adresse"]').innerText(), /99 × 27 \/ \(27 \+ 98\)/);
  assert.deepEqual(errors, [], 'No runtime browser errors');
  console.log('Adresse UI: Codex percentage, exact score/ratios, equipment score, three improvement labels, desktop/mobile and lab passed.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
