import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/permanent-items');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  if (req.url === '/crystal-preview') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html></html>');
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const report = await page.evaluate(async () => {
    const P = await import('/js/items/permanentItems.js');
    const M = await import('/js/items/itemManager.js');
    const I = await import('/js/items/itemEffectMecanics.js');
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const State = await import("/js/app/state.js");
    const U = await import("/js/entities/progression.js");
    const R = await import('/js/items/resourceStocks.js');
    const G = await import("/js/app/stages.js");
    const UI = await import("/js/ui/application.js");
    const System = await import("/js/entities/statSystem.js");
    const Ground = await import("/js/combat/summons.js");
    const Loot = await import("/js/items/loot.js");
    const { PERMANENT_CRYSTAL_LEVELS } = await import('/js/data/permanentCrystalData.js');
    const { collectLevelResources } = await import('/js/data/loaderList.js');
    const checks = [];
    const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
    const wait = ms => new Promise(done => setTimeout(done, ms));
    const choices = P.getPermanentStatChoices();
    const resourceManifest = collectLevelResources();
    for (const level of PERMANENT_CRYSTAL_LEVELS) for (const asset of [level.front, level.back, ...level.parts]) {
      check(resourceManifest.has(new URL(asset, document.baseURI).href), `Preload includes ${asset}`);
    }
    check(new Set(choices.map(row => row.key)).size === choices.length, 'Every stat variant appears exactly once in the random pool');
    for (const key of ['strength', 'agility', 'intelligence', 'will', 'adresse', 'magicalPen', 'magicalPenPlus', 'criticalChance', 'criticalChancePlus']) {
      check(choices.some(choice => choice.key === key), `Random pool includes ${key}`);
    }
    const create = (key, amount) => P.createUmbraCrystal({statKey:key,amount,origin:'admin-spawn'});
    const fixture = id => ({ id, name: 'Crystal audit', side: 'A', type: 'sbire', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 30, intelligence: 30, agility: 17, shift: 10, charge: 4, speed: 1000 } });
    S.saveToLocalStorage('equippedItems', []);
    S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], items: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '6']) {
      let rejected = false;
      try { P.createUmbraCrystal({ statKey: 'strength', amount, origin: 'admin-spawn' }); }
      catch { rejected = true; }
      check(rejected && !S.loadFromLocalStorage('IngameItems', []).length,
        `Invalid explicit crystal amount is rejected before registration: ${amount}`);
    }
    S.savePlayerInfo({ battleSlotCount: 4 });
    E.entites.length = 0;
    window.levelRunning = 'worldmap';
    State.setGameOver(false);
    let nextId = 981100;
    for (const choice of choices) {
      const expectedLevel = ['strength', 'agility', 'intelligence', 'will'].includes(choice.key) ? 4
        : choice.isUmbra ? 3 : choice.key.endsWith('Plus') ? 2 : 1;
      check(choice.crystalLevel === expectedLevel, `Correct crystal hierarchy: ${choice.key}`);
      const target = fixture(++nextId);
      E.recomputeEntityStats(target);
      S.saveToLocalStorage('selectedArmyA', [target]);
      const before = Number(target.baseStats[choice.key] || 0);
      const crystal = P.createUmbraCrystal({ statKey: choice.key, amount: 6, origin: 'admin-spawn' });
      const icon = document.createElement('span'); icon.className = `picto-stat ${choice.icon}`;
      document.body.appendChild(icon);
      check(getComputedStyle(icon).backgroundImage !== 'none', `Stat sprite exists: ${choice.key}`);
      icon.remove();
      check(crystal.statIcon === choice.icon && P.getPermanentStatGrant(crystal)?.amount === 6, `Generated pictogram and custom amount: ${choice.key}`);
      const result = await I.itemApplyEffect(target, 'itemPermanentStat', crystal);
      check(result.ok && target.baseStats[choice.key] === before + 6, `Permanent gain applied: ${choice.key}`);
      check(target.baseStatSources.crystal[choice.key] === 6, `Crystal provenance recorded: ${choice.key}`);
      E.recomputeEntityStats(target);
      E.recomputeEntityStats(target);
      check(target.baseStats[choice.key] === before + 6, `Recompute never duplicates: ${choice.key}`);
      check(target.baseStatSources.crystal[choice.key] === 6, `Recompute preserves provenance: ${choice.key}`);
    }
    for (const [key, origin, attribute] of [['physicalDamage', 'vigueur', 'strength'],
      ['magicalDamage', 'esprit', 'intelligence'], ['piercingDamage', 'finesse', 'agility']]) {
      for (const [grant, expected] of [[key, 9], [`${key}Plus`, 14], [origin, 25]]) {
        const target = fixture(++nextId);
        target.baseStats[attribute] = 10;
        E.recomputeEntityStats(target);
        S.saveToLocalStorage('selectedArmyA', [target]);
        const crystal = P.createUmbraCrystal({ statKey: grant, amount: 9, origin: 'admin-spawn' });
        await I.itemApplyEffect(target, 'itemPermanentStat', crystal);
        check(target.stats[key] === expected, `${grant}: actual crystal grants the flat and only the appropriate ratios`);
        const reloaded = S.loadFromLocalStorage('selectedArmyA', [])[0];
        E.recomputeEntityStats(reloaded);
        check(reloaded.stats[key] === expected, `${grant}: crystal keeps its two layers after reloading without duplication`);
      }
    }
    const implicit = fixture(++nextId);
    delete implicit.baseStats.speed;
    E.recomputeEntityStats(implicit);
    S.saveToLocalStorage('selectedArmyA', [implicit]);
    const implicitSpeed = implicit.stats.speed;
    await I.itemApplyEffect(implicit, 'itemPermanentStat', create('speed', 2));
    check(implicit.baseStats.speed === implicitSpeed + 2 && implicit.stats.speed === implicitSpeed + 2,
      'Crystal adds to implicit base speed without replacing its default');
    const reserve = fixture(++nextId);
    reserve.baseStats.HP = { current: 15, max: 30 };
    reserve.baseStats.extraLife = { current: 0, max: 1 };
    E.recomputeEntityStats(reserve);
    S.saveToLocalStorage('selectedArmyA', [reserve]);
    await I.itemApplyEffect(reserve, 'itemPermanentStat', create('HP', 3));
    await I.itemApplyEffect(reserve, 'itemPermanentStat', create('extraLife', 2));
    check(reserve.baseStats.HP.max === 33 && reserve.baseStats.HP.current === 15,
      'Object-shaped base retains its explicit current and gains capacity');
    check(reserve.baseStats.extraLife.max === 3 && reserve.baseStats.extraLife.current === 0
      && reserve.extraLifeRegen['001'].currentRegen === 0,
      'Life crystal preserves depleted old life and its parallel recharge');
    const actor = fixture(++nextId);
    E.recomputeEntityStats(actor);
    E.entites.push(actor);
    S.saveToLocalStorage('selectedArmyA', [actor]);
    for (const [key, amount] of [['magicalPen', 2], ['magicalPenPlus', 3], ['magicalPenPlus', 1]]) {
      await I.itemApplyEffect(actor, 'itemPermanentStat', create(key, amount));
    }
    const expected = System.calculateStatSources({ magicalPen: 2, magicalPenPlus: 4, intelligence: 30 }, 'magicalPen');
    check(actor.stats.magicalPen === expected.value && System.getStatSystemResult(actor, 'magicalPen').state === '+', 'Normal and plus crystals pool their flat without inventing an Umbra');
    const saved = S.loadFromLocalStorage('selectedArmyA', [])[0];
    E.recomputeEntityStats(saved);
    check(saved.stats.magicalPen === expected.value, 'Saved entity retains permanent mixed stat after recomputation');
    check(saved.baseStatSources.crystal.magicalPen === 2 && saved.baseStatSources.crystal.magicalPenPlus === 4,
      'Saved entity retains distinct normal and improved crystal contributions');
    const crystalSources = System.getStatSystemSourceTotals(saved, 'magicalPen');
    check(crystalSources.reduce((sum,part)=>sum+part.value,0) === expected.value && crystalSources.every(part=>['fixed','plus'].includes(part.category)),
      'Normal and plus crystal gains are owned points without an extra Crystal mention');
    const reset = U.previewEntityReset(actor);
    check(reset.ok && reset.projection.baseStats.magicalPenPlus === 4 && reset.projection.stats.magicalPen === expected.value, 'Purification does not erase permanent gains');
    check(reset.projection.baseStatSources.crystal.magicalPenPlus === 4, 'Purification preserves crystal provenance');
    G.nextDay(1, { animate: false });
    check(S.loadFromLocalStorage('selectedArmyA', [])[0].baseStats.magicalPenPlus === 4, 'New day retains permanent gains');
    await I.itemApplyEffect(actor, 'itemPermanentStat', create('fadedLife', 2));
    check(R.consumeFadedLife(actor) && R.consumeFadedLife(actor), 'Permanent Faded Life grants consumable natural stock');
    E.recomputeEntityStats(actor);
    check(!actor.stats.fadedLife, 'Consumed Faded Life is never restored by permanent stat recalculation');

    // The day transition reloads the army; use the fixture instance for this scenario.
    E.entites.splice(0, E.entites.length, actor);
    UI.createGameContainer(); UI.GameUi();
    document.querySelectorAll('.entitylootContainer, #black-overlay, #hexGrid').forEach(node => node.remove());
    const grid = document.createElement('div');
    grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:fixed;left:100px;top:150px;display:grid;grid-template-columns:repeat(5,100px);gap:10px;transform:none;';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const hex = document.createElement('div');
      hex.id = `hex_${row * 5 + col + 1}`; hex.dataset.position = hex.id;
      hex.dataset.row = row; hex.dataset.col = col;
      hex.className = `hex ${col < 2 ? 'SideA' : col > 2 ? 'SideB' : 'Neutral'}`;
      hex.style.cssText = 'width:100px;height:100px;position:relative;transform:none;background:#20252a;';
      grid.appendChild(hex);
    }
    document.getElementById('game-container').appendChild(grid);
    window.levelRunning = 'scripted';
    State.refreshStageAccess();
    S.saveToLocalStorage('GameStages', { stages: [
      { id: 'crystal-none' }, { id: 'crystal-win', permanentReward: true },
      { id: 'crystal-expire', permanentReward: true }, { id: 'crystal-reload', permanentReward: true },
      { id: 'crystal-chest', reward: 'chest', permanentReward: true },
      { id: 'crystal-race', permanentReward: true },
    ] });
    const enter = id => { S.setCurrentLevel(id); window.currentStageId = id; localStorage.setItem('currentStageId', id); };
    enter('crystal-none');
    S.registerStageVictory('crystal-none');
    check(!M.getBattleInventoryState().battleGroundItems.length, 'Levels without permanentReward give no crystal');
    enter('crystal-win');
    check(!document.querySelector('.battle-ground-item'), 'No crystal before victory');
    S.registerStageVictory('crystal-win');
    let entries = M.getBattleInventoryState().battleGroundItems;
    check(entries.length === 1 && entries[0].position === 'hex_8', 'Victory automatically spawns one crystal at the center');
    const entry = entries[0];
    const item = M.getIngameItemById(entry.itemId);
    check(entry.expiresAt - Date.now() <= 20000 && entry.expiresAt - Date.now() > 18000, 'Crystal uses the ordinary 20-second ground deadline');
    S.registerStageVictory('crystal-win');
    check(M.getBattleInventoryState().battleGroundItems.length === 1, 'Repeated victory cannot generate a second reward');
    const sprite = document.querySelector('.battle-ground-item');
    const picto = sprite.querySelector('.umbra-crystal-picto');
    check(picto?.classList.contains(item.statIcon) && getComputedStyle(picto).backgroundImage !== 'none', 'Ground crystal contains the actual stat pictogram');
    const layers = [...sprite.querySelectorAll('.umbra-crystal-layer')];
    await Promise.all(layers.map(layer => layer.decode()));
    const level = item.permanentStat.crystalLevel;
    const visual = PERMANENT_CRYSTAL_LEVELS.find(entry => entry.level === level);
    check(layers.length === 2 && layers.every(layer => layer.naturalWidth > 0)
      && Number(sprite.dataset.crystalLevel) === level, 'Crystal loads the tier matching its permanent stat');
    check(layers[0].getAttribute('src') === visual.front
      && layers[1].getAttribute('src') === visual.back
      && getComputedStyle(layers[0]).zIndex === '7' && getComputedStyle(picto.parentElement).zIndex === '2'
      && getComputedStyle(layers[1]).zIndex === '1'
      && getComputedStyle(layers[0]).opacity === '0.4' && getComputedStyle(layers[1]).opacity === '0.6'
      && getComputedStyle(layers[0]).filter === 'grayscale(0.1)' && getComputedStyle(layers[1]).filter === 'grayscale(0.7)',
      'Crystal retains front 40% opacity / 10% grayscale and back 60% opacity / 70% grayscale');
    const aura = getComputedStyle(sprite.closest('[data-ground-summon]').querySelector('.ground-item-glitter'));
    const auraFootprint = [aura.width, aura.height, aura.left, aura.top];
    check(aura.width === `${[0, 75, 112, 128, 144][level]}px`
      && aura.height === `${[0, 90, 120, 150, 196][level]}px` && aura.overflow === 'hidden'
      && aura.maskImage.includes('24px') && aura.maskImage.includes('28px') && aura.maskComposite.includes('intersect'),
      'Crystal loot aura uses the shared intersecting mask with a broad fade on all four edges');
    const dimensions = [sprite.offsetWidth, sprite.offsetHeight];
    const core = sprite.querySelector('.umbra-crystal-core');
    const coreAnimation = core.getAnimations().find(animation => animation.animationName === 'umbraCrystalFloat');
    const coreTime = coreAnimation.currentTime;
    coreAnimation.pause();
    coreAnimation.currentTime = 0;
    const beforeTransform = getComputedStyle(core).transform;
    coreAnimation.currentTime = 1200;
    check(getComputedStyle(core).transform !== beforeTransform
      && layers.every(layer => layer.parentElement === core),
      'Crystal layers float together in exact synchronization');
    coreAnimation.currentTime = coreTime;
    coreAnimation.play();
    check(getComputedStyle(picto).animationDuration === '3.25s'
      && getComputedStyle(core).animationDuration === '4.8s', 'Stat pictogram has its own independent animation');
    check(sprite.offsetWidth === dimensions[0] && sprite.offsetHeight === dimensions[1]
      && Math.abs(dimensions[0] / dimensions[1] - [0, 314 / 443, 448 / 658, 448 / 658, 501 / 845][level]) < .01,
      'Animations keep a stable footprint and the configured aspect ratio');
    check(!M.recoverBattleItem(item.itemId, 0), 'Ground-only crystal cannot escape its deadline through the satchel');
    const card = M.createItemDescription(item, item.itemId, sprite);
    check(card.querySelector('.item-type').textContent === 'Objet permanent', 'Helper identifies the permanent item type');
    const row = card.querySelector('.stuff-stat-row');
    check(row && row.textContent.includes(item.permanentStat.name) && row.dataset.helperText.includes('définitivement'), 'Helper shows stat name, gain and permanent effect');
    const before = Number(actor.baseStats[item.permanentStat.key] || 0);
    const Board = await import('/js/board/controller.js');
    const box = document.createElement('div'); box.id = `Box_Entite_${actor.id}`; box.className = 'entite-box';
    grid.querySelector(`[data-position="${entry.position}"]`).appendChild(box);
    actor.position = entry.position;
    Board.rebuildBoardOccupancy(grid);
    await wait(120);
    check(actor.baseStats[item.permanentStat.key] === before + item.permanentStat.amount, 'Placing the entity on the crystal automatically grants its stat: ' + JSON.stringify({ actual: actor.baseStats[item.permanentStat.key], expected: before + item.permanentStat.amount, sameEntity: E.entites.find(e => e.id === actor.id) === actor, occupant: (await import('/js/board/targets.js')).getHexEntity(box.closest('.hex'), E.entites)?.id, ground: M.getBattleInventoryState().battleGroundItems.length }));
    const dispersedAura = document.querySelector('.ground-loot-remnant .ground-item-glitter');
    check(dispersedAura && ['width', 'height', 'left', 'top'].every((property, index) =>
      getComputedStyle(dispersedAura)[property] === auraFootprint[index]), 'Pickup keeps the tier-specific aura footprint during dispersal');
    check(!M.getBattleInventoryState().battleGroundItems.length && !M.getIngameItemById(entry.itemId), 'Consumed crystal is removed from both ground and registry');
    check(!(await M.useConsumableItem(entry.itemId, actor, { ground: true, silent: true })).ok, 'Spent crystal cannot be consumed twice');
    box.remove();
    Board.rebuildBoardOccupancy(grid);
    card.remove();

    enter('crystal-expire'); S.registerStageVictory('crystal-expire');
    const expiring = M.getBattleInventoryState().battleGroundItems[0];
    Ground.releaseGroundItem(expiring.itemId);
    const save = M.getBattleInventoryState();
    save.battleGroundItems[0].expiresAt = Date.now() + 100;
    S.saveToLocalStorage('PlayerSave', save);
    M.restoreBattleGroundItems();
    await wait(180);
    check(!M.getIngameItemById(expiring.itemId) && !document.querySelector('.battle-ground-item'), 'Expired crystal disappears without granting stats');
    enter('crystal-reload'); S.registerStageVictory('crystal-reload');
    const reloading = M.getBattleInventoryState().battleGroundItems[0];
    Ground.releaseGroundItem(reloading.itemId);
    M.restoreBattleGroundItems(); M.restoreBattleGroundItems();
    check(document.querySelectorAll('.battle-ground-item').length === 1
      && M.getBattleInventoryState().battleGroundItems[0].expiresAt === reloading.expiresAt, 'Post-victory restoration keeps one crystal and its original deadline');
    check(Number(document.querySelector('.umbra-crystal').dataset.crystalLevel)
      === P.getPermanentStatGrant(M.getIngameItemById(reloading.itemId)).crystalLevel,
      'Ground restoration retains the tier of the actual permanent grant');
    M.clearBattleGroundItems();
    check(!M.getIngameItemById(reloading.itemId), 'Leaving the level removes unconsumed crystals');
    enter('crystal-race'); S.registerStageVictory('crystal-race');
    const concurrent = M.getBattleInventoryState().battleGroundItems[0];
    const concurrentItem = M.getIngameItemById(concurrent.itemId);
    const previous = Number(actor.baseStats[concurrentItem.permanentStat.key] || 0);
    const results = await Promise.all([M.useConsumableItem(concurrent.itemId, actor, { ground: true, silent: true }),
      M.useConsumableItem(concurrent.itemId, actor, { ground: true, silent: true })]);
    check(results.filter(result => result.ok).length === 1
      && actor.baseStats[concurrentItem.permanentStat.key] === previous + concurrentItem.permanentStat.amount,
      'Concurrent consumption attempts grant the crystal once');
    M.clearBattleGroundItems();
    enter('crystal-chest');
    const stage = S.loadFromLocalStorage('GameStages').stages.find(stage => stage.id === 'crystal-chest');
    const chest = S.getOrCreateStageChest(stage);
    Loot.createChestLoot(chest, { stageId: stage.id });
    S.registerStageVictory(stage.id);
    await wait(3500);
    const crystalHex = document.querySelector('.battle-ground-item')?.closest('.hex');
    const chestHex = document.querySelector(`[data-chest-id="${chest.id}"]`)?.closest('.hex');
    check(crystalHex && chestHex && crystalHex !== chestHex, 'Crystal and unlocking victory chest never occupy the same hex');
    M.clearBattleGroundItems();
    const showcase = create('magicalPenPlus', 3);
    Ground.placeGroundItem(grid.querySelector('[data-position="hex_8"]'), showcase, {
      expiresAt: Date.now() + 20000, consume: () => ({ ok: false }),
    });
    M.createItemDescription(showcase, showcase.itemId, document.querySelector('.battle-ground-item'));
    return { checks, poolSize: choices.length, entityId: actor.id,
      savedBase: S.loadFromLocalStorage('selectedArmyA', [])[0].baseStats };
  });
  await page.evaluate(async () => {
    const grid = document.getElementById('hexGrid');
    grid.style.removeProperty('transform');
    await Promise.all(grid.getAnimations().map(animation => animation.finished));
  });
  await page.screenshot({ path: resolve(output, 'crystal-helper.png') });
  const visual = await page.evaluate(async () => {
    const P = await import('/js/items/permanentItems.js');
    const Ground = await import("/js/combat/summons.js");
    const entries = ['strength', 'adresse', 'magicalPenPlus', 'magicalPen'].map((statKey, index) => {
      const item = P.createUmbraCrystal({ statKey, random: () => .5 });
      Ground.placeGroundItem(document.getElementById(`hex_${index + 1}`), item, { infinite: true, consume: () => ({ ok: false }) });
      const node = document.querySelector(`[data-ground-summon][data-item-id="${item.itemId}"]`);
      return { level: item.permanentStat.crystalLevel, html: node.querySelector('.umbra-crystal').outerHTML,
        aura: node.querySelector('.ground-item-glitter').outerHTML };
    });
    return { entries, css: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href) };
  });
  const preview = await browser.newPage();
  await preview.goto(`http://127.0.0.1:${server.address().port}/crystal-preview`);
  await preview.setContent(`<base href="http://127.0.0.1:${server.address().port}/">
    ${visual.css.map(href => `<link rel="stylesheet" href="${href}">`).join('')}
    <style>body { margin:0; background:#171920; }
      #crystal-preview { position:fixed; inset:0; display:grid; grid-template-columns:repeat(4,180px); grid-auto-rows:210px;
        place-content:center; place-items:center; gap:24px; }
      @media(max-width:600px) { #crystal-preview { grid-template-columns:repeat(2,144px); } }
    </style><main id="crystal-preview">${visual.entries.map(entry =>
      `<div class="battle-ground-item-active">${entry.html}${entry.aura}</div>`).join('')}</main>`);
  await preview.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  assert.ok(await preview.locator('.umbra-crystal').evaluateAll(nodes => nodes.every(node => {
    const level = Number(node.dataset.crystalLevel);
    const parts = [...node.querySelectorAll('.umbra-crystal-part')];
    const images = [...node.querySelectorAll('img')];
    return parts.length === [0, 0, 0, 2, 4][level]
      && new Set(parts.map(part => getComputedStyle(part).animationDuration)).size === parts.length
      && parts.every(part => getComputedStyle(part).animationName === 'umbraCrystalPartFloat')
      && images.every(img => {
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0);
      });
  })));
  report.checks.push('All four assemblies load nonblank PNGs, with two/four independently animated fragments at levels 3/4');
  const partsBefore = await preview.locator('.umbra-crystal-part').evaluateAll(nodes => nodes.map(node => ({
    x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y,
  })));
  await preview.waitForTimeout(300);
  const partsAfter = await preview.locator('.umbra-crystal-part').evaluateAll(nodes => nodes.map(node => ({
    x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y,
  })));
  assert.ok(partsAfter.every((part, index) => part.x === partsBefore[index].x
    && Math.abs(part.y - partsBefore[index].y) > .001 && Math.abs(part.y - partsBefore[index].y) <= 4));
  report.checks.push('Fragments move gently vertically without orbiting or leaving their anchored positions');
  for (const [width, height] of [[1536, 900], [390, 844]]) {
    await preview.setViewportSize({ width, height });
    const framed = await preview.locator('.umbra-crystal').evaluateAll(nodes => nodes.every(node => {
      const rect = node.getBoundingClientRect();
      const picto = node.querySelector('.umbra-crystal-picto');
      const level = Number(node.dataset.crystalLevel);
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        && rect.width === [0, 45, 70, 84, 96][level]
        && Math.abs(rect.width / rect.height - [0, 314 / 443, 448 / 658, 448 / 658, 501 / 845][level]) < .01
        && [...node.querySelectorAll('.umbra-crystal-part')].every(part => {
          const bounds = part.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
        })
        && getComputedStyle(picto).backgroundImage !== 'none'
        && Math.abs(picto.offsetWidth / node.offsetWidth - .60) < .02;
    }));
    assert.ok(framed, `Crystal composition framed at ${width}px`);
    await preview.screenshot({ path: resolve(output, `crystal-sprites-${width}.png`) });
    report.checks.push(`Four crystal tiers retain their proportions, stat icons and all fragments at ${width}px`);
  }
  await preview.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await preview.locator('.umbra-crystal').evaluateAll(nodes => nodes.every(node =>
    [...node.querySelectorAll('.umbra-crystal-core, .umbra-crystal-part, .umbra-crystal-picto')]
      .every(layer => getComputedStyle(layer).animationName === 'none'))));
  report.checks.push('Reduced-motion preference stops decorative crystal animations');
  await preview.close();
  await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js');
    M.clearBattleGroundItems();
    document.body.innerHTML = '<div class="Game-helper"></div><div id="crystal-anchor"></div>';
    document.body.style.background = '#101214';
    document.getElementById('crystal-anchor').style.cssText = 'position:fixed;left:30px;top:300px;width:40px;height:40px';
  });
  for (const [width, height] of [[1536, 900], [390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const checks = await page.evaluate(async () => {
      const P = await import('/js/items/permanentItems.js');
      const M = await import('/js/items/itemManager.js');
      const { ItemDetails } = await import('/js/data/itemList.js');
      const checks = [];
      const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
      const anchor = document.getElementById('crystal-anchor');
      for (const choice of P.getPermanentStatChoices()) {
        const item = P.createUmbraCrystal({ statKey: choice.key, random: () => .5 });
        const before = JSON.stringify(item);
        const card = M.createItemDescription(item, item.itemId, anchor);
        const row = card.querySelector('.stuff-stat-row');
        const style = getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        const title = card.querySelector('.item-name');
        const name = row.querySelector('.stat-name');
        const value = row.querySelector('.entite-stat');
        const emblem = card.querySelector('.crystal-helper-emblem > .picto-stat');
        check(card.matches('.crystal-helper.permanent.consumable') && card.dataset.crystalStat === choice.key
          && emblem.classList.contains(choice.icon) && getComputedStyle(emblem).backgroundImage !== 'none',
          `${innerWidth}/${choice.key}: crystal-specific frame and actual stat emblem`);
        check(style.clipPath.startsWith('polygon(') && style.getPropertyValue('--stat-color').trim()
          && style.borderTopWidth === '1px' && getComputedStyle(card, '::before').borderTopWidth === '1px',
          `${innerWidth}/${choice.key}: cut corners and two stat-colored borders`);
        check(title.textContent === "Crystal d'Umbra" && name.textContent === choice.name
          && value.textContent.trim() === `+2${choice.unit}`.trim()
          && row.dataset.helperText.includes('définitivement') && card.querySelector('.item-quality > span'),
          `${innerWidth}/${choice.key}: stat name, gain, unit, rarity and descriptive sub-helper retained`);
        check(rect.left >= 9 && rect.right <= innerWidth - 9 && rect.top >= 9 && rect.bottom <= innerHeight - 9
          && card.scrollWidth <= card.clientWidth + 1 && name.scrollWidth <= name.clientWidth + 1
          && name.getBoundingClientRect().right <= value.getBoundingClientRect().left,
          `${innerWidth}/${choice.key}: framed with no text overflow or overlapping value`);
        check(JSON.stringify(item) === before, `${innerWidth}/${choice.key}: presentation leaves the grant unchanged`);
        card.remove();
      }
      for (const type of ['stuff', 'consumable']) {
        const item = structuredClone(ItemDetails.find(entry => entry.itemType.includes(type)));
        const card = M.createItemDescription(item, `ordinary-${type}`, anchor);
        check(!card.classList.contains('crystal-helper') && !card.querySelector('.crystal-helper-emblem')
          && card.querySelector('.item-name').textContent === item.displayName,
          `${innerWidth}/${type}: ordinary item presentation unchanged`);
        card.remove();
      }
      const item = P.createUmbraCrystal({ statKey: 'magicalPenPlus', random: () => .9 });
      M.createItemDescription(item, item.itemId, anchor);
      return checks;
    });
    report.checks.push(...checks);
    await page.screenshot({ path: resolve(output, `crystal-helper-${width}.png`) });
  }
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.evaluate(async () => {
    const P = await import('/js/items/permanentItems.js');
    const M = await import('/js/items/itemManager.js');
    M.removeItemDescription();
    for (const [index, statKey] of ['agility', 'strength', 'intelligence'].entries()) {
      const anchor = document.createElement('div');
      anchor.id = `crystal-anchor-${statKey}`;
      anchor.style.cssText = `position:fixed;left:${90 + index * 440}px;top:340px;width:40px;height:40px`;
      document.body.appendChild(anchor);
      const item = P.createUmbraCrystal({ statKey, random: () => .5 });
      M.bindPersistentDescription(anchor, item, item.itemId);
      M.createItemDescription(item, item.itemId, anchor);
    }
  });
  await page.screenshot({ path: resolve(output, 'crystal-helper-attributes.png') });
  await page.locator('#crystal-anchor-intelligence').click();
  await page.waitForSelector('.crystal-helper.persistent');
  const pinned = page.locator('.crystal-helper.persistent');
  await pinned.locator('.stuff-stat-row .stat-name').hover();
  await page.waitForSelector('.stat-hover[data-stat="intelligence"]');
  await page.waitForFunction(() => {
    const helper = document.querySelector('.stat-hover[data-stat="intelligence"]');
    return helper && Number(getComputedStyle(helper).opacity) >= .99;
  });
  assert.match(await page.locator('.stat-hover[data-stat="intelligence"]').innerText(), /définitivement/);
  assert.equal(await pinned.count(), 1);
  await page.screenshot({ path: resolve(output, 'crystal-helper-pinned.png') });
  report.checks.push('Click pinning and the existing stat sub-helper still work on the crystal frame');
  await page.reload({ waitUntil: 'load' });
  const reloaded = await page.evaluate(async id => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const entity = S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === id);
    E.recomputeEntityStats(entity);
    return entity?.baseStats;
  }, report.entityId);
  assert.deepEqual(reloaded, report.savedBase);
  report.checks.push('Actual page reload preserves all acquired base stats');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${report.checks.length} checks; ${report.poolSize} permanent stat variants`);
} finally { await browser.close(); server.close(); }
