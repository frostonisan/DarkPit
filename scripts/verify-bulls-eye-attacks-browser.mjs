import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/bulls-eye-attacks');
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const checks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), UI = await import("/js/ui/codex/index.js"), D = await import("/js/combat/statistics.js");
    const S = await import("/js/storage/gameStorage.js"), R = await import("/js/combat/attackResolution.js"), G = await import("/js/app/state.js");
    const U = await import("/js/ui/statistics/components.js");
    window.levelRunning = 'worldmap'; G.setGameOver(false);
    const checks = [], check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const sample = E.entitesNestUp.find(entity => /mouche astic/i.test(entity.name));
    const e = { id: 994710, side: 'A', awakening: 3, type: 'sbire', name: 'Bull’s Eye audit',
      sprite: sample.sprite, portrait: sample.portrait, level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {} };
    e.baseStats = { HP: 1000, physicalDamage: 100, magicalDamage: 100, piercingDamage: 100, vision: 99, agility: 0 };
    E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const cases = [
      ['physical', ['red'], true], ['piercing', ['yellow'], true], ['kinetic', ['red', 'yellow'], true],
      ['hybrid', ['red', 'blue'], true], ['spectral', ['blue', 'yellow'], true], ['inert', [], true],
      ['magical', ['blue'], false], ['prismatic', ['red', 'blue', 'yellow'], false],
      ['melee', ['red'], false], ['support', ['red'], false], ['fast', ['red'], true],
    ];
    const template = structuredClone(e.attackDetails[0]);
    e.attackDetails = cases.map(([name, colors], index) => ({ ...structuredClone(template),
      functionName: `bullsEyeAudit${index}`, attackKey: `bullsEyeAudit${index}`, entityAttackId: `bullsEyeAudit${index}`, displayName: `Test ${name}`,
      attackRange: [name === 'melee' ? 'melee' : 'range'], combatFunction: name === 'support' ? 'Support' : 'Attaquant',
      attacknature: [], physicalRatio: .4, magicalRatio: .3, piercingRatio: .3,
      attackTarget: ['enemy'], deadTarget: ['no'], effets: [], selfEffects: [],
      preparationTime: 0, executionTime: name === 'fast' ? 0 : 10000, recoveryTime: 0, cooldown: 0,
      essenceSlots: colors.map((color, slot) => ({ slotId: `slot-${slot}`, kind: 'open', color, essenceSource: 'test' })),
    }));
    e.attacks = e.attackDetails.map(attack => attack.functionName); e.currentAttack = e.attackDetails[0];
    S.saveToLocalStorage('selectedArmyA', [e]); S.saveToLocalStorage('equippedItems', []);
    E.entites.splice(0, E.entites.length, e); window.selectedArmyA = [e];
    document.body.innerHTML = '<div class="Game-helper"></div><main class="Game-UI" style="position:fixed;inset:0;background:#180606"><div class="menu-map-container"></div></main>';
    const codex = UI.createCodexEntityScan(e, document.querySelector('.menu-map-container'), `codex-entity_${e.id}`);
    const attacks = R.readAttackDefinitionsForEntity(e);
    const inspect = (panel, index, surface) => {
      const [name, , expected] = cases[index];
      const bull = panel.querySelector('.stat-container[data-stat="bullsEye"]');
      check(Boolean(bull) === expected, `${surface}/${name}: Bull’s Eye eligibility (nature ${R.getAttackNatureRules(attacks[index]).key}, current ${panel.textContent})`);
      if (!expected) return;
      check(Number(bull.querySelector('.entite-stat').textContent.replace('%', '').trim()) === 50, `${surface}/${name}: applied passive percentage (${bull.textContent})`);
      check(bull.querySelector('.stat-name').textContent === 'Bull’s Eye :' && bull.querySelector('.picto-stat.bullsEye'), `${surface}/${name}: passive label and pictogram`);
      const penalty = bull.nextElementSibling;
      const expectedPenalty = name === 'fast' ? 12.5 : 25;
      check(penalty?.dataset.stat === 'rangeAttack' && parseFloat(penalty.querySelector('.entite-stat').textContent) === expectedPenalty, `${surface}/${name}: reduced penalty follows the passive`);
    };
    codex.querySelector('.codex-attacks').parentElement.click();
    for (let i = 0; i < attacks.length; i++) {
      const button = codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[i])}"]`);
      if (!button) throw Error(`Missing attack ${R.attackSelectionKey(attacks[i])}; available: ${[...codex.querySelectorAll('.attack-browser-thumb')].map(node => node.dataset.attackKey).join(',')}`);
      button.querySelector('.attack-image').click();
      inspect(codex.querySelector('.codex-attack-context .attack-submenu-infos'), i, 'Attack tab');
    }
    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-colomn-5 .picto-attack').click();
    for (let i = 0; i < attacks.length; i++) {
      codex.querySelector(`.attack-stats-choice[data-attack-key="${R.attackSelectionKey(attacks[i])}"]`).click();
      inspect(codex.querySelector('.attack-stats-detail .attack-submenu-infos'), i, 'Stats attack view');
    }
    codex.querySelector('.codex-attacks').parentElement.click();
    codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[0])}"] .attack-image`).click();
    const panel = codex.querySelector('.codex-attack-context .attack-submenu-infos');
    const oldStats = structuredClone(e.stats); e.baseStats.vision = 1;
    E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    S.saveToLocalStorage('selectedArmyA', [e]); U.syncDOMWithStats(oldStats, e.stats, e.id, e);
    check(parseFloat(panel.querySelector('[data-stat="bullsEye"] .entite-stat').textContent) === 1, 'Open attack properties update their Bull’s Eye percentage');
    const shownPenalty = parseFloat(panel.querySelector('[data-stat="rangeAttack"] .entite-stat').textContent);
    check(Math.abs(shownPenalty - D.calculateRangeRatio(e, attacks[0])) < .001, `Open attack properties update the remaining penalty (${shownPenalty})`);
    const changeStats = patch => {
      const previous = structuredClone(e.stats);
      Object.assign(e.baseStats, patch);
      E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      S.saveToLocalStorage('selectedArmyA', [e]);
      U.syncDOMWithStats(previous, e.stats, e.id, e);
    };
    changeStats({ vision: 0 });
    check(!panel.querySelector('[data-stat="bullsEye"]'), 'No passive row when Vision grants no Bull’s Eye');
    check(parseFloat(panel.querySelector('[data-stat="rangeAttack"] .entite-stat').textContent) === 50, 'Without Bull’s Eye the full penalty returns');
    changeStats({ vision: 99 });
    check(parseFloat(panel.querySelector('[data-stat="bullsEye"] .entite-stat').textContent) === 50, 'Gaining Bull’s Eye adds its row to an already open attack');
    const fastIndex = cases.findIndex(([name]) => name === 'fast');
    codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[fastIndex])}"] .attack-image`).click();
    const fastPanel = codex.querySelector('.codex-attack-context .attack-submenu-infos');
    changeStats({ vision: 1 });
    check(parseFloat(fastPanel.querySelector('[data-stat="rangeAttack"] .entite-stat').textContent) === 24.75,
      'Live penalty uses the displayed fast attack, not the entity’s active slow attack');
    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-colomn-5 .picto-attack').click();
    codex.querySelector(`.attack-stats-choice[data-attack-key="${R.attackSelectionKey(attacks[fastIndex])}"]`).click();
    changeStats({ vision: 99 });
    const statsPanel = codex.querySelector('.attack-stats-detail .attack-submenu-infos');
    check(parseFloat(statsPanel.querySelector('[data-stat="rangeAttack"] .entite-stat').textContent) === 12.5,
      'The open Stats attack view refreshes its displayed attack');
    changeStats({ vision: 1 });
    codex.querySelector('.codex-attacks').parentElement.click();
    codex.querySelector(`.section-content.attaques .attack-browser-thumb[data-attack-key="${R.attackSelectionKey(attacks[0])}"] .attack-image`).click();
    check(parseFloat(codex.querySelector('.codex-attack-context [data-stat="bullsEye"] .entite-stat').textContent) === 1,
      'Changing attacks retains the latest Vision value');
    return checks;
  });
  const row = page.locator('.codex-attack-context .stat-container[data-stat="bullsEye"]');
  await row.locator('.picto-stat').hover();
  const helper = page.locator('.Game-helper .stat-hover');
  await helper.waitFor({ state: 'visible' });
  assert.equal(await helper.locator('.umbra-description').innerText(), 'Passive exclusive de Vision : Bull’s Eye');
  assert.match(await helper.innerText(), /Réduction du malus à distance :\s*1 %/);
  await page.keyboard.press('Escape');
  await page.mouse.move(1430, 990);
  await helper.waitFor({ state: 'hidden' });
  await page.screenshot({ path: resolve(output, 'properties.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS: ${checks.length} attack property checks, Bull’s Eye helper and live values.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
