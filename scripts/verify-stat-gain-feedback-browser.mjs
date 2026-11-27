import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/stat-gain-feedback');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const report = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/display.js"), U = await import("/js/entities/progression.js"), _U = await import("/js/ui/codex/stats.js");
    const P = await import('/js/items/permanentItems.js'), I = await import('/js/items/itemEffectMecanics.js');
    const Rules = await import("/js/entities/rules.js"), State = await import("/js/app/state.js");
    const N = await import("/js/app/worldMap.js"), H = await import('/js/data/helpers.js');
    const Gear = await import('/js/items/equipement.js');
    const checks = [], check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const clear = () => document.querySelectorAll('.stat-gain-feedback').forEach(node => node.remove());
    const rows = () => [...document.querySelectorAll('[data-stat-gain]')];
    const create = (key, amount) => {
      const choices = P.getPermanentStatChoices();
      const random = [(choices.findIndex(row => row.key === key) + .5) / choices.length, (amount - .5) / 3];
      return P.createUmbraCrystal({ random: () => random.shift() });
    };
    const actor = id => ({ id, name: `Entite ${id}`, side: 'A', type: 'sbire', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 30, intelligence: 30, strength: 10, agility: 17, shift: 10, charge: 4, speed: 1000 } });
    S.saveToLocalStorage('equippedItems', []);
    S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], items: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    window.levelRunning = 'worldmap'; State.setGameOver(false); State.refreshStageAccess();
    E.entites.length = 0;
    const target = actor(981730); E.recomputeEntityStats(target); E.entites.push(target);
    S.saveToLocalStorage('selectedArmyA', [target]);
    check(!rows().length, 'Initial recomputation stays silent');
    await I.itemApplyEffect(target, 'itemPermanentStat', create('magicalPenPlus', 3));
    check(rows().length === 1 && rows()[0].dataset.statGain === 'magicalPen'
      && rows()[0].textContent === '+3 %', `Crystal announces its confirmed plus-stat gain once: ${JSON.stringify(rows().map(row => [row.dataset.statGain, row.textContent]))}`);
    check(rows()[0].querySelector('.picto-stat.magicalPen') && rows()[0].querySelector('.magicalPen.stat-gain-value'),
      'Message uses the stat pictogram and the stat-colored value');
    check(!rows()[0].querySelector('.stat-gain-value').dataset.statState, 'The acquired direct gain uses the canonical stat color');
    check(rows()[0].closest('.BattleText') && !rows()[0].closest('.game-popup-layer')
      && !document.querySelector('.stat-gain-host'), 'Consumption uses the existing floating message, without notification panel or extra host');
    E.recomputeEntityStats(target); E.recomputeEntityStats(target); U.ComputeStatPreview(target);
    check(rows().length === 1, 'Recomputation and preview never repeat the acquired gain');
    clear();
    const dead = { ...target, stats: { ...target.stats, HP: { current: 0, max: 30 } }, isDEAD: true };
    check(!(await I.itemApplyEffect(dead, 'itemPermanentStat', create('strength', 1))).ok && !rows().length,
      'Rejected consumption emits no stat gain');
    await I.itemApplyEffect(target, 'itemMovement', { effets: ['itemMovement'], MovementAmount: 5 });
    check(rows().length === 1 && rows()[0].textContent === '+5 ch. sup.', 'Movement consumable announces current charges, not max');
    clear();
    await I.itemApplyEffect(target, 'itemExtraLife', { effets: ['itemExtraLife'], ExtraLifeAmount: 2 });
    check(rows().length === 1 && rows()[0].dataset.statGain === 'fadedLife' && rows()[0].dataset.amount === '2',
      'Converted life consumable announces actual Faded Life');
    clear();
    Rules.entityBattleBooste(target, { stat: 'strength', value: 3, source: 'audit', stackable: false });
    check(rows().length === 1 && rows()[0].dataset.amount === '3', 'Applied effect announces its effective gain');
    Rules.entityBattleBooste(target, { stat: 'strength', value: 3, source: 'audit', stackable: false });
    check(rows().length === 1, 'Refreshing the same nonstacking buff is silent');
    Rules.entityBattleBooste(target, { stat: 'strength', value: 5, source: 'audit', stackable: false });
    check(rows().length === 2 && rows()[1].dataset.amount === '2', 'Replacing a buff announces only its net gain');
    Rules.entityBattleBooste(target, { stat: 'agility', value: -2, source: 'audit-malus' });
    check(rows().length === 2, 'Malus is not reported as a gain');
    clear();
    const other = actor(981731); E.recomputeEntityStats(other); E.entites.push(other);
    S.saveToLocalStorage('selectedArmyA', [target, other]);
    const gear = { serial: 'audit-gain', itemId: 'audit-gain-1', displayName: 'Test gain', itemType: ['stuff'],
      Stuffeffets: [{ type: 'stat-buff', stat: 'strength', value: 3 },
        { type: 'stat-buff', stat: 'shift', value: { max: 2, current: 1 } }] };
    S.saveToLocalStorage('IngameItems', [gear]);
    const save = S.loadFromLocalStorage('PlayerSave', {}); save.Playerinventory = [gear]; S.saveToLocalStorage('PlayerSave', save);
    const slot = document.createElement('div'); slot.id = `slot1-${target.id}`; slot.className = 'stuff-slot'; document.body.append(slot);
    check(Gear.equip({ item: gear, targetEntity: target, slotId: slot.id, slotElement: slot }), 'Equipment gain fixture equips successfully');
    check(rows().some(row => row.dataset.statGain === 'strength' && row.dataset.amount === '3'), 'Equipment announces the committed stat bonus');
    check(rows().some(row => row.dataset.statGain === 'shift' && row.textContent.includes('ch. max'))
      && rows().some(row => row.dataset.statGain === 'shift' && row.textContent.includes('ch. sup.')),
      'Mixed equipment announces maximum and supplementary movement separately');
    clear();
    const equipped = S.getEquippedItemById(target.stuff.slot1[0]);
    const slot2 = document.createElement('div'); slot2.id = `slot1-${other.id}`; slot2.className = 'stuff-slot'; document.body.append(slot2);
    check(Gear.equip({ item: equipped, sourceEntity: target, targetEntity: other, slotId: slot2.id, slotElement: slot2 }), 'Equipment can transfer to the second entity');
    check(rows().some(row => row.dataset.statGain === 'strength'
      && row.closest('.stat-gain-feedback').dataset.entityId === String(other.id)), 'New owner receives the gain announcement');
    check(!rows().some(row => row.dataset.statGain === 'strength'
      && row.closest('.stat-gain-feedback').dataset.entityId === String(target.id)), 'Old owner is not told it gained the transferred bonus');
    clear();
    const leveling = actor(981732); E.enrichEntityStats(leveling);
    S.saveToLocalStorage('selectedArmyA', [leveling]); U.setPlayerExperience(1000000);
    const form = _U.createLevelUpForm(leveling); document.body.appendChild(form);
    form.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
    check(!rows().length, 'Level-up preview stays silent');
    form.querySelector('.confirm-button.yes').click();
    check(rows().some(row => row.dataset.statGain === 'strength' && row.dataset.amount === '1'),
      'Confirmed level-up announces the actual attribute gain');
    clear(); form.remove();
    const levelHost = document.createElement('div'); levelHost.id = 'game-windows'; document.body.appendChild(levelHost);
    N.determineAndGenerateButtons(); N.initializeTooltips();
    const button = [...document.querySelectorAll('.level-button')].find(node => node.dataset.permanentReward === 'true');
    check(button && button.dataset.leveltype === 'scripted', 'Only scripted stage exposes the permanent reward');
    button.closest('.LevelButton').dispatchEvent(new MouseEvent('mouseenter'));
    check(document.querySelector('.fightInfos .level-permanent-reward')?.textContent === 'permanent-crystal',
      'Actual level hover displays permanent-crystal');
    check(document.querySelector('.fightInfos')?.textContent.includes('chest'), 'Crystal does not replace the chest in level description');
    check(!H.buildLevelHelper({ levelType: 'randomized', isAdminMode: () => false }).includes('permanent-crystal'),
      'Stages without crystal never advertise it');
    document.querySelectorAll('.fightInfos').forEach(node => node.remove());
    const anchor = document.createElement('div'); anchor.id = `PopDow_${other.id}`;
    anchor.style.cssText = 'position:fixed;left:300px;top:400px;width:30px;height:30px'; document.body.appendChild(anchor);
    UI.showStatGainFeedback(other, [{ stat: 'agility', amount: 2 }]);
    check(anchor.querySelector('.stat-gain-feedback'), 'Combat feedback is attached to the receiving entity');
    clear(); anchor.remove();
    return { checks };
  });
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => {
      const UI = await import("/js/ui/display.js");
      UI.showStatGainFeedback({ id: 981730 }, [{ stat: 'strength', amount: 2 }, { stat: 'magicalPenPlus', amount: 3 }, { stat: 'shift', amount: 5, unit: ' ch. sup.' }]);
    });
    assert.ok(await page.locator('.stat-gain-feedback--global').evaluate(node => {
      const box = node.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && getComputedStyle(node).pointerEvents === 'none';
    }));
    await page.screenshot({ path: resolve(output, `feedback-${width}.png`) });
    report.checks.push(`Feedback fits ${width}px viewport without blocking clicks`);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.stat-gain-feedback').count(), 0);

    const dynamics = await page.evaluate(async () => {
      const UI = await import("/js/ui/display.js"), FX = await import("/js/combat/effects.js");
      const entity = { id: 981740 };
      const anchor = document.createElement('div'); anchor.id = `PopDow_${entity.id}`;
      anchor.style.cssText = 'position:fixed;left:calc(50% - 50px);top:400px;width:100px;height:100px';
      document.body.append(anchor);
      FX.showHealingFeedback(entity, 5);
      FX.EffectMessage(entity, 'Déplacement !');
      const gain = UI.showStatGainFeedback(entity, [{ stat: 'magicalPenPlus', amount: 3 }]);
      const heal = anchor.querySelector('.healing-feedback');
      const move = anchor.querySelector('.move.BattleText');
      const style = node => {
        const css = getComputedStyle(node);
        return [css.animationName, css.animationDuration, css.animationTimingFunction, css.animationFillMode];
      };
      window.feedbackDynamics = { anchor, entity, gain, heal, move };
      return { gain: style(gain), heal: style(heal), move: style(move),
        sameHost: [gain, heal, move].every(node => node.parentElement === anchor),
        color: getComputedStyle(gain.querySelector('.stat-gain-value')).color };
    });
    assert.deepEqual(dynamics.gain, dynamics.heal);
    assert.equal(dynamics.gain[0], 'DotTextUp');
    assert.equal(dynamics.move[0], 'BattleTextDrop');
    assert.ok(dynamics.sameHost);
    assert.notEqual(dynamics.color, 'rgb(0, 255, 0)', 'Stat gain retains its own color, not the healing color');
    await page.screenshot({ path: resolve(output, `floating-${width}.png`) });
    report.checks.push(`Consumption shares heal animation and existing movement host at ${width}px, with stat color`);
    await page.clock.runFor(500);
    await page.evaluate(async () => {
      const UI = await import("/js/ui/display.js");
      window.feedbackDynamics.nextGain = UI.showStatGainFeedback(window.feedbackDynamics.entity, [{ stat: 'shift', amount: 2, unit: ' ch. sup.' }]);
    });
    await page.clock.runFor(500);
    assert.deepEqual(await page.evaluate(() => {
      const { gain, heal, move, nextGain } = window.feedbackDynamics;
      return [gain, heal, move, nextGain].map(node => node.isConnected);
    }), [false, false, false, true]);
    await page.clock.runFor(500);
    assert.equal(await page.locator('.stat-gain-feedback').count(), 0);
    await page.evaluate(() => window.feedbackDynamics.anchor.remove());
    report.checks.push('Heal, movement and consumption share the same lifetime; later gains keep their own timer');
  }
  const codex = await page.evaluate(async () => {
    const UI = await import("/js/ui/display.js");
    const hidden = document.createElement('div'); hidden.id = 'PopDow_981750'; hidden.style.display = 'none';
    const sprite = document.createElement('div'); sprite.id = 'codex-entity-sprite-container_981750';
    sprite.style.cssText = 'position:fixed;left:150px;top:300px;width:50px;height:100px';
    document.body.append(hidden, sprite);
    const gain = UI.showStatGainFeedback({ id: 981750 }, [{ stat: 'fadedLife', amount: 1 }]);
    const result = gain.parentElement === sprite && !hidden.childElementCount;
    sprite.remove(); hidden.remove();
    return result;
  });
  assert.ok(codex);
  report.checks.push('Map feedback targets the visible Codex sprite, not a hidden combat sprite');
  await page.clock.runFor(1000);
  assert.equal(await page.locator('.stat-gain-feedback, .stat-gain-host').count(), 0);
  report.checks.push('Feedback cleanup leaves no notification containers behind');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${report.checks.length} stat gain feedback checks`);
} finally { await browser.close(); server.close(); }
