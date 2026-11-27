import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/admin-attack-editor');
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
  const before = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    window.__untouchedAttack = JSON.stringify(E.entites[1].attackDetails);
    return structuredClone(E.entites[0].attackDetails[0]);
  });
  const choose = async (field, option) => {
    await page.getByRole('button', { name: `Modifier ${field}`, exact: true }).click();
    if (field === 'Effets' || field === 'Effets soi') {
      await page.locator(`input[data-attack-effect="${option}"]`).click();
      await page.getByRole('button', { name: /^< Retour attaque / }).click();
    } else await page.getByRole('button', { name: new RegExp(`^(?:✓ )?${option} ${field}$`) }).click();
  };
  await page.getByRole('textbox', { name: 'Nom affiché', exact: true }).fill('Attaque admin modifiée');
  await choose('Nature', 'physicalDamage');
  assert.deepEqual(await page.evaluate(() => window.__adminActiveLiveEntityDraft.attackDetails[0].attacknature), ['inerte']);
  await choose('Nature', 'magicalDamage');
  await choose('Portée', 'melee');
  await choose('Fonction', 'Support');
  await choose('Cible', 'ally');
  await choose('Cible', 'enemy');
  await page.getByRole('button', { name: 'Modifier Effets', exact: true }).click();
  const effectBox = name => page.locator(`input[data-attack-effect="${name}"]`);
  assert.equal(await effectBox('stun').count(), 1, 'Stun is available as an effect');
  assert.equal(await effectBox('sideration').count(), 0, 'Sideration removed from admin choices');
  assert.equal(await effectBox('destabilisation').count(), 0, 'Movement recoil is not an assignable effect');
  assert.equal(await effectBox('none').count(), 0, 'Empty selection represents no effects');
  const selectedEffects = ['poison', 'immobilisation', 'stun', 'silence'];
  for (const name of selectedEffects) await effectBox(name).check();
  for (const name of selectedEffects) assert.equal(await effectBox(name).isChecked(), true);
  await effectBox('silence').uncheck();
  assert.deepEqual(await page.evaluate(() => window.__adminActiveLiveEntityDraft.attackDetails[0].effets), selectedEffects.slice(0,3), 'Unchecking one effect preserves all others');
  for (const name of selectedEffects.slice(0,3)) await effectBox(name).uncheck();
  assert.deepEqual(await page.evaluate(() => window.__adminActiveLiveEntityDraft.attackDetails[0].effets), ['none'], 'All effects can be disabled');
  for (const name of selectedEffects) await effectBox(name).check();
  await page.screenshot({ path: resolve(output, 'effect-checkboxes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Réglages Silence', exact: true }).click();
  const parameter=page.locator('[data-effect-parameter="effectDuration"]');
  await parameter.getByRole('spinbutton', {name:'Durée — montant fixe',exact:true}).fill('0');
  await parameter.getByRole('spinbutton', {name:'Durée — montant fixe',exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>window.__adminActiveLiveEntityDraft.attackDetails[0].effectOverrides.silence.effectDuration),0,'Admin preserves explicit zero');
  await parameter.getByRole('button',{name:'Reprendre la valeur par défaut',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__adminActiveLiveEntityDraft.attackDetails[0].effectOverrides.silence.effectDuration),null,'Reset inherits effect default');
  await parameter.getByRole('combobox',{name:'Durée — mode',exact:true}).selectOption('ratios');
  await parameter.getByRole('button',{name:'Ajouter un ratio',exact:true}).click();
  await parameter.getByRole('spinbutton',{name:'Durée — coefficient 1',exact:true}).fill('0.02');
  await parameter.getByRole('spinbutton',{name:'Durée — coefficient 1',exact:true}).press('Tab');
  await parameter.getByRole('combobox',{name:'Durée — courbe 1',exact:true}).selectOption('progressive');
  assert.match(await parameter.locator('output').textContent(),/Valeur obtenue :/);
  await page.screenshot({path:resolve(output,'effect-parameters.png'),fullPage:true});
  await page.getByRole('button',{name:/^< Retour effets/}).click();
  assert.equal(await effectBox('silence').isChecked(),true,'Opening settings never toggles the effect');
  await effectBox('silence').uncheck();await effectBox('silence').check();
  assert.deepEqual(await page.evaluate(()=>window.__adminActiveLiveEntityDraft.attackDetails[0].effectOverrides.silence.effectDuration),{flat:3,ratios:[{stat:'intelligence',coefficient:.02,curve:'progressive'}]},'Toggle retains parameter formula');

  await page.getByRole('button', { name: /^< Retour attaque / }).click();
  await choose('Effets soi', 'heal');
  await choose('Cible morte', 'yes');
  await page.getByRole('spinbutton', { name: 'Ratio magique', exact: true }).fill('1.75');
  await page.getByRole('spinbutton', { name: 'Cooldown base', exact: true }).fill('1234');
  await page.getByRole('spinbutton', { name: 'Préparation base', exact: true }).fill('345');
  assert.deepEqual(await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites[0].attackDetails[0]), before,
    'Edits stay in the draft until validation');
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  const saved = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const R = await import("/js/combat/attackResolution.js");
    const S = await import("/js/storage/gameStorage.js");
    const L = await import("/js/items/essences.js");
    const entity = E.entites[0];
    for (let i = 0; i < 3; i++) E.recomputeEntityStats(entity);
    return { attack: R.readAttackDefinitionsForEntity(entity)[0], current: entity.currentAttack,
      ledger: L.validateEntityEssenceLedger(entity),
      stored: S.loadFromLocalStorage('selectedArmyA', [])[0].attackDetails[0],
      untouched: JSON.stringify(E.entites[1].attackDetails) === window.__untouchedAttack };
  });
  const expected = { displayName: 'Attaque admin modifiée', attacknature: ['magicalDamage'], attackRange: ['melee'],
    combatFunction: 'Support', attackTarget: ['ally'], effets: ['poison', 'immobilisation', 'stun', 'silence'], selfEffects: ['heal'], deadTarget: ['yes'],
    magicalRatio: 1.75, cooldown: 1234, preparationTime: 345,
    effectOverrides: {silence:{effectDuration:{flat:3,ratios:[{stat:'intelligence',coefficient:.02,curve:'progressive'}]}}} };
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(saved.attack[key], value, `Applied ${key}`);
    assert.deepEqual(saved.stored[key], value, `Stored ${key}`);
    assert.deepEqual(saved.current[key], value, `Current attack ${key}`);
  }
  assert.equal(saved.untouched, true, 'Other entity unchanged');
  assert.equal(saved.attack.entityAttackId, before.entityAttackId, 'Attack identity retained');
  assert.deepEqual(saved.attack.mastery, before.mastery, 'Mastery retained');
  assert.equal(saved.ledger.ok, true, JSON.stringify(saved.ledger));
  await page.locator('#Box_Entite_991811').dispatchEvent('click', { detail: 1 });
  await page.waitForFunction(() => window.__adminActiveLiveEntityId === '991811');
  await page.locator('#Box_Entite_991810').dispatchEvent('click', { detail: 1 });
  await page.waitForFunction(() => window.__adminActiveLiveEntityId === '991810');
  await page.getByRole('button', { name: 'Attaques', exact: true }).click();
  await page.locator('.admin-attack-row .admin-attack-pick-button').first().click();
  assert.equal(await page.getByRole('textbox', { name: 'Nom affiché', exact: true }).inputValue(), expected.displayName);
  await page.getByRole('button', { name: 'Modifier Effets', exact: true }).click();
  for (const name of selectedEffects) assert.equal(await effectBox(name).isChecked(), true, 'Selection survives save and reopening');
  await page.getByRole('button', { name: /^< Retour attaque / }).click();
  await page.screenshot({ path: resolve(output, 'attack-editor.png'), fullPage: true });
  await choose('Nature', 'hybridalDamage');
  await choose('Nature', 'piercingDamage');
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  const mixed = await page.evaluate(async () => {
    const entity = (await import("/js/entities/runtime.js")).entites[0];
    return { nature: entity.attackDetails[0].attacknature, ledger: (await import("/js/items/essences.js")).validateEntityEssenceLedger(entity) };
  });
  assert.deepEqual(mixed.nature, ['hybridalDamage', 'piercingDamage']);
  assert.equal(mixed.ledger.ok, true, JSON.stringify(mixed.ledger));
  await page.evaluate(async () => {
    const entity = window.__adminActiveLiveEntityDraft;
    const R = await import("/js/combat/attackResolution.js");
    const I = await import("/js/items/essenceInventory.js");
    const slots = Array.from({ length: R.ATTACK_ESSENCE_MAX_SLOTS }, (_, index) => {
      const item = I.createLinkedEssenceItem(entity.id, 'blue', { origin: 'admin-test' });
      entity.attackEssenceInventory.linkedItems.push(item);
      return { slotId: `full-${index}`, kind: 'open', color: 'blue', essenceId: item.id,
        essenceSource: 'linked', linkedColor: 'blue' };
    });
    R.updateEntityAttackDefinition(entity, entity.attackDetails[0], { essenceSlots: slots });
    (await import("/js/items/essences.js")).syncEntityLinkedEssenceInventory(entity);
  });
  await choose('Nature', 'hybridalDamage');
  await choose('Nature', 'piercingDamage');
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  const full = await page.evaluate(async () => {
    const entity = (await import("/js/entities/runtime.js")).entites[0];
    return { slots: entity.attackDetails[0].essenceSlots.length, nature: entity.attackDetails[0].attacknature,
      ledger: (await import("/js/items/essences.js")).validateEntityEssenceLedger(entity) };
  });
  assert.equal(full.slots, 10, 'Changing a full attack keeps the ten-socket limit');
  assert.deepEqual(full.nature, ['hybridalDamage', 'piercingDamage']);
  assert.equal(full.ledger.ok, true, JSON.stringify(full.ledger));
  assert.deepEqual(errors, []);
  console.log('PASS Admin attack editor: name-only identity, draft isolation, nature, range, function, targets, effects, timings, ratios, save/reopen, mastery and essence consistency.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
