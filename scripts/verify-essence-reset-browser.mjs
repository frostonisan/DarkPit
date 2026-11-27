import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = resolve("docs");
const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (path !== root && !path.startsWith(root + "/") && !path.startsWith(root + "\\")) { res.writeHead(403).end(); return; }
  try {
    const target = path === root ? resolve(root, "index.html") : path;
    res.setHeader("Content-Type", mime[extname(target)] || "application/octet-stream");
    res.end(await readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  const resetChecks = await page.evaluate(async () =>
    (await import("/js/entities/reset.browser.test.js")).runEntityResetBrowserChecks());
  const curseChecks = await page.evaluate(async () => {
    const stats = await import("/js/entities/runtime.js");
    const ui = await import("/js/ui/codex/index.js");
    const { equip, unequip } = await import('/js/items/equipement.js');
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    const target = structuredClone(entitesNest[0]);
    Object.assign(target, { id: 900010, side: 'A', level: { current: 1, max: 100 }, reverseArchetype: undefined,
      baseStats: { HP: 100, will: 20, charge: 3, strength: 3, agility: 0, intelligence: 0, physicalResistance: 2 } });
    stats.enrichEntityStats(target);
    const items = [{ vitality: 1 }, { vitality: 2 }, { charge: -5, strength: -3, physicalResistance: -5 }]
      .map((delta, i) => ({ serial: 'i36', itemId: `i36-${900010 + i}`, itemType: ['stuff'],
        displayName: `Test malediction ${i}`, itemAsset: './media/assets/items/petite-dague.png', quality: 1,
        Stuffeffets: Object.entries(delta).map(([stat, value]) => ({ type: 'stat-buff', stat, value })) }));
    for (const key of ['PlayerSave', 'IngameItemsData']) localStorage.setItem(key, JSON.stringify({ Playerinventory: items, items, equippedItems: [] }));
    localStorage.setItem('IngameItems', JSON.stringify(items));
    localStorage.setItem('equippedItems', '[]');
    localStorage.setItem('selectedArmyA', JSON.stringify([target]));
    window.selectedArmyA = [target];
    const host = document.createElement('main');
    host.id = 'curse-test-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#140400;overflow:auto;';
    document.body.appendChild(host);
    ui.createCodexEntityScan(target, host, `codex-entity_${target.id}`);
    host.querySelector('.codex-stat').click();
    host.querySelector('.picto-equipment').click();
    for (let i = 0; i < items.length; i++) equip({ item: items[i], targetEntity: target, slotId: `slot${i + 1}-${target.id}` });
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(target.stats.charge === -2, 'Real equip lost charge debt');
    check(Object.keys(target.stuff).join() === 'slot3', 'Real equip removed protected source');
    check(host.querySelectorAll('.stuff-slot').length === 1, 'DOM still exposes deleted slots');
    const strength = host.querySelector('.strength-stat .entite-stat:not(.preview)');
    check(strength?.textContent.trim() === '0', `Zero strength disappeared: ${strength?.outerHTML}`);
    for (const key of ['charge', 'strength', 'physicalResistance']) {
      const row = host.querySelector(`.stat-container[data-stat="${key}"]`);
      check(row && row.dataset.statCursed === 'true' && row.querySelector('.stat-curse-marker'), `Missing curse marker: ${key}`);
      check(getComputedStyle(row).display !== 'none', `Hidden cursed stat: ${key}`);
    }
    check(host.querySelector('.stat-curse-marker').title.includes('Test malediction 2'), 'Curse source missing');
    check(host.querySelector('.agility-stat .entite-stat')?.textContent.trim() === '0', 'Zero agility hidden');
    check(host.querySelector('.intelligence-stat .entite-stat')?.textContent.trim() === '0', 'Zero intelligence hidden');
    // A fresh codex must retain the equipment tab even with negative capacity.
    host.replaceChildren();
    ui.createCodexEntityScan(target, host, `codex-entity_${target.id}`);
    host.querySelector('.codex-stat').click();
    check(host.querySelector('.picto-equipment'), 'Equipment menu vanished at negative charge');
    host.querySelector('.picto-equipment').click();
    check(host.querySelector(`#slot3-${target.id} .inventory-item-icon`), 'Protected item not accessible after reopening');
    for (const key of ['charge', 'physicalResistance', 'strength']) {
      check(host.querySelector(`.stat-container[data-stat="${key}"] .stat-curse-marker`), `Curse disappeared on reopen: ${key}`);
    }
    check(host.querySelector('.charge-stat .entite-stat')?.textContent.trim() === '-2', 'Charge debt not displayed numerically');
    const saved = JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === target.id);
    check(saved.stats.charge === -2 && saved.stuff.slot3?.length === 1, 'Protected source not persisted');
    window.__curseTest = { target, items, unequip, check };
    return { charge: target.stats.charge, strength: target.stats.strength, resistance: target.stats.physicalResistance };
  });
  await mkdir('outputs', { recursive: true });
  await page.screenshot({ path: 'outputs/curse-stats-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/curse-stats-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const { target, items, unequip, check } = window.__curseTest;
    unequip({ targetEntity: target, slotId: `slot3-${target.id}` });
    check(target.stats.charge === 3 && target.stats.strength === 3, 'Manual removal did not restore stats');
    check(document.querySelectorAll('#curse-test-host .stat-curse-marker').length === 0, 'Curse marker remained after removal');
    const inventory = JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory;
    for (const item of items) check(inventory.filter(i => i.itemId === item.itemId).length === 1, 'Item lost or duplicated during removal');
    document.getElementById('curse-test-host').remove();
    delete window.__curseTest;
  });
  console.log('Browser equipment and curse checks:', curseChecks);
  const debtChecks = await page.evaluate(async () => {
    const stats = await import("/js/entities/runtime.js");
    const { getSafe } = await import("/js/entities/rules.js");
    const ui = await import("/js/ui/statistics/components.js");
    const levels = await import("/js/entities/progression.js"), _levels = await import("/js/ui/codex/stats.js");
    const { equip, unequip } = await import('/js/items/equipement.js');
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const results = [];
    for (const source of ['equipment', 'curse']) {
      const entity = { id: source === 'equipment' ? 900040 : 900041, name: 'Test dette', side: 'A', type: 'sbire', level: 1,
        baseStats: { strength: 5, agility: 1, intelligence: 1, HP: 100, will: 40, charge: 2 }, attacks: [] };
      stats.enrichEntityStats(entity);
      const item = { serial: 'i36', itemId: `i36-debt-${source}`, itemType: ['stuff'], displayName: 'Dette de Force',
        itemAsset: './media/assets/items/petite-dague.png', quality: 1, Stuffeffets: [{ type: 'stat-buff', stat: 'strength', value: -10 }] };
      for (const key of ['PlayerSave', 'IngameItemsData']) localStorage.setItem(key, JSON.stringify({ Playerinventory: [item], items: [item], equippedItems: [] }));
      localStorage.setItem('IngameItems', JSON.stringify([item]));
      localStorage.setItem('equippedItems', '[]');
      localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
      localStorage.setItem('ArmyA', JSON.stringify({ entities: [entity] }));
      window.selectedArmyA = [entity];
      const host = document.createElement('main');
      document.body.appendChild(host);
      const slot = document.createElement('div');
      slot.className = 'stuff-slot';
      slot.id = `slot1-${entity.id}`;
      host.appendChild(slot);
      if (source === 'equipment') equip({ item, targetEntity: entity, slotId: `slot1-${entity.id}` });
      else {
        entity.battleBoosts = { strength: [{ id: 'curse-force', source: 'Malediction', mode: 'flat', value: -10 }] };
        stats.recomputeEntityStats(entity);
      }
      check(getSafe(entity, 'strength') === -5, `${source}: initial debt ${getSafe(entity, 'strength')}`);
      levels.setPlayerExperience(1000000);
      ui.createUmbraBlock(host, 'Force', () => entity.stats.strength, entity, 'strength');
      const form = _levels.createLevelUpForm(entity);
      host.appendChild(form);
      const statRow = host.querySelector('.stat-container[data-stat="strength"]');
      const redBackground = getComputedStyle(statRow).backgroundImage;
      check(redBackground.includes('150, 20, 35'), 'Missing red curse background');
      for (let i = 1; i <= 6; i++) {
        form.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
        check(getSafe(entity, 'strength') === -5 + i, `${source}: preview debt lost at point ${i}`);
        check(form.querySelector('.axis-line[data-key="strength"] .axis-value-display').textContent === String(-5 + i), 'Level up attribute ignores debt');
      }
      form.querySelector('.confirm-button.yes').click();
      check(getSafe(entity, 'strength') === 1, `${source}: confirmed debt ${getSafe(entity, 'strength')}`);
      check(entity.modifierStats.durable.statLeveled.strength === 6, 'Investments were not preserved');
      check(entity.level.current === 7 && entity.Archetype.current.step === 6, 'Debt investment did not progress level/archetype');
      ui.syncStatCurseMarker(statRow, entity, 'strength');
      check(statRow.dataset.statCursed === 'true' && getComputedStyle(statRow).backgroundImage === redBackground, 'Positive total removed curse background');
      const saved = JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === entity.id);
      stats.recomputeEntityStats(saved);
      check(getSafe(saved, 'strength') === 1, 'Reload lost debt or manual investment');
      if (source === 'equipment') unequip({ targetEntity: entity, slotId: `slot1-${entity.id}` });
      else { delete entity.battleBoosts.strength; stats.recomputeEntityStats(entity); }
      check(entity.stats.strength === 11, `${source}: removal failed: ${entity.stats.strength}`);
      ui.syncStatCurseMarker(statRow, entity, 'strength');
      check(statRow.dataset.statCursed === 'false' && !statRow.querySelector('.stat-curse-marker'), 'Removed curse remains marked');
      check(getComputedStyle(statRow).backgroundImage !== redBackground, 'Red background survived source removal');
      host.remove();
      results.push({ source, recoveredStrength: entity.stats.strength });
    }
    const active = stats.calculateWeaponOrfevreActivePercentFromStats({ weaponOrfevre: 17, weaponMastery: 40, strength: 50 });
    const bonus = stats.buildWeaponOrfevreStuffModifier({ strength: 10 }, active);
    const penalty = stats.buildWeaponOrfevreStuffModifier({ strength: -10 }, active);
    check(Math.abs(penalty.details.strength.exactBonus - bonus.details.strength.exactBonus) < 0.00001, 'Orfevre uses a different malus calculation');
    check(penalty.effective.strength === Math.round(-10 + bonus.details.strength.exactBonus), 'Malus rounding differs from equipment rules');
    for (const stat of ['strength', 'speed', 'weight']) {
      const harmful = stat === 'strength' ? -10 : 10;
      check(!stats.buildWeaponOrfevreStuffModifier({ [stat]: harmful }, 150).effective[stat], 'Orfevre turned a penalty into a bonus');
      const adjusted = stats.buildWeaponOrfevreStuffModifier({ [stat]: harmful }, active);
      check(Math.abs(adjusted.effective[stat]) < 10, `Orfevre worsened ${stat}`);
    }
    const shaped = stats.buildWeaponOrfevreStuffModifier({ HP: { current: -10, max: -10 }, strength: { flat: -10, percent: -10 } }, active);
    check(shaped.effective.HP.max === penalty.effective.strength && shaped.effective.strength.flat === penalty.effective.strength, 'Structured modifiers are inconsistent');
    const cursed = { id: 900042, level: 1, baseStats: { strength: 5, HP: 100, will: 40, weaponOrfevre: 100 }, attacks: [],
      battleBoosts: { strength: [{ id: 'independent-curse', value: -10, mode: 'flat' }] } };
    stats.enrichEntityStats(cursed);
    check(getSafe(cursed, 'strength') === -5, 'Orfevre altered a non-equipment curse');
    return { debt: results, orfevreActive: active, equipmentMalus: penalty.effective.strength };
  });
  console.log('Debt and Orfevre checks:', debtChecks);
  await page.evaluate(async () => {
    const { enrichEntityStats, rescaleHPCurrent } = await import("/js/entities/runtime.js");
    const { ComputeStatPreview } = await import("/js/entities/progression.js");
    const entity = { id: 900002, level: 1, baseStats: { HP: 100, vitality: 30, will: 20 }, attacks: [] };
    enrichEntityStats(entity);
    entity.stats.HP.current = Math.floor(entity.stats.HP.max / 2);
    const before = structuredClone(entity.stats.HP);
    const values = [];
    for (const vitality of [20, -20, 0, 20, -20, 0]) {
      entity.modifierStats.preview = { statLeveled: { vitality } };
      const hp = ComputeStatPreview(entity).HP;
      if (hp.current !== rescaleHPCurrent(before, hp.max)) throw new Error('Preview HP percentage changed');
      if (JSON.stringify(entity.stats.HP) !== JSON.stringify(before)) throw new Error('Preview mutated actual health');
      values.push(hp);
    }
    if (!(values[0].max > before.max && values[1].max < before.max)) throw new Error('Missing up/down preview coverage');
    if (JSON.stringify(values[2]) !== JSON.stringify(before)) throw new Error('Preview cancellation lost HP');
    entity.stats.HP.current = 0;
    entity.modifierStats.preview = { statLeveled: { vitality: 20 } };
    if (ComputeStatPreview(entity).HP.current !== 0) throw new Error('Preview resurrected entity');
  });
  const result = await page.evaluate(async () => {
    const { enrichEntityStats } = await import("/js/entities/runtime.js");
    const { createLevelUpForm } = await import("/js/ui/codex/stats.js");
    const { syncEntityLinkedEssenceInventory } = await import("/js/items/essences.js");
    const entity = {
      id: 900001, name: "Test Anima", side: "A", type: "sbire", class: "TestReset",
      level: { current: 30, max: 99 }, statut: ["alive"],
      baseStats: { strength: 50, agility: 1, intelligence: 1, will: 10, HP: 40, extraLife: 2 },
      attacks: [{ functionName: "autoAttack", attacknature: ["physicalDamage"], attackRange: ["melee"] }],
      modifierStats: { durable: { statLeveled: { strength: 29 } } },
      Archetype: {
        current: { key: "golgoth", level: 1, step: 24, uid: "test-cycle", milestone: Array(24).fill("force") },
        inProgress: [{ key: "golgoth", level: 1, step: 24, uid: "test-cycle", milestone: Array(24).fill("force") }],
        achieve: [{ key: "egare", level: 1, step: 5, uid: "test-awakening", milestone: Array(5).fill("force") }],
      },
    };
    // Manual progression owns its history and XP; enrichment must not reverse-generate it.
    entity.experience = (await import("/js/entities/runtime.js")).levelDetails.find(row => row.level === 30).totalExperience;
    enrichEntityStats(entity);
    syncEntityLinkedEssenceInventory(entity);
    entity.stats.HP.current = Math.floor(entity.stats.HP.max / 2);
    localStorage.setItem("selectedArmyA", JSON.stringify([entity]));
    localStorage.setItem("ArmyA", JSON.stringify({ entities: [entity] }));
    window.__resetTestEntity = entity;
    const host = document.createElement("main");
    host.id = "reset-test-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#140400;padding:40px;overflow:auto;";
    host.appendChild(createLevelUpForm(entity));
    document.body.appendChild(host);
    return { archetype: entity.Archetype.current, milestones: host.querySelectorAll(".milestone").length, rewards: host.querySelectorAll(".milestone-essence").length, neutral: host.querySelectorAll(".neutral-essence").length };
  });
  assert.ok(result.rewards > 0, JSON.stringify(result));
  assert.ok(result.neutral > 0, JSON.stringify(result));
  const beforeLevelUp = await page.evaluate(async () => ({
    xp: (await import("/js/entities/progression.js")).playerExperience,
    entityXP: window.__resetTestEntity.experience,
    essences: window.__resetTestEntity.attackEssenceInventory.linkedItems.length,
  }));
  await page.evaluate(async () => {
    window.__essenceAnimationState = [...document.querySelectorAll('#reset-test-host .milestone-essence')]
      .map(orb => ({ orb, images: [...orb.querySelectorAll('img')], animations: orb.getAnimations({ subtree: true }) }));
    await Promise.all(window.__essenceAnimationState.flatMap(state => state.animations.map(a => a.ready)));
    window.__essenceAnimationState.forEach(state => { state.startTimes = state.animations.map(a => a.startTime); });
  });
  const assertContinuousEssences = async () => {
    const continuous = await page.evaluate(() => window.__essenceAnimationState.map(state => {
      const currentAnimations = state.orb.getAnimations({ subtree: true });
      return {
        sameNodes: state.orb.isConnected && state.images.every(img => img.isConnected && state.orb.contains(img)),
        uninterrupted: state.images.length === 1 && new URL(state.images[0].getAttribute('src'), document.baseURI).pathname.endsWith('-02-min.png') && state.animations.length === 3 && state.animations.every((animation, index) =>
          currentAnimations.includes(animation) && animation.startTime === state.startTimes[index] && animation.playState === 'running'),
      };
    }));
    assert.ok(continuous.every(state => state.sameNodes && state.uninterrupted), JSON.stringify(continuous));
  };
  // The existing arrow loops a transform animation, so it never becomes geometrically stable.
  await page.locator('#reset-test-host .axis-line[data-key="strength"] .right-arrow').click({ force: true });
  await assertContinuousEssences();
  assert.equal(await page.locator('#reset-test-host .neutral-essence').count(), result.neutral - 1);
  await page.locator('#reset-test-host .axis-line[data-key="strength"] .left-arrow').click({ force: true });
  await assertContinuousEssences();
  assert.equal(await page.locator('#reset-test-host .neutral-essence').count(), result.neutral);
  await page.locator('#reset-test-host .axis-line[data-key="strength"] .right-arrow').click({ force: true });
  await assertContinuousEssences();
  assert.equal(await page.evaluate(() => window.__resetTestEntity.attackEssenceInventory.linkedItems.length), beforeLevelUp.essences,
    'Preview must not award an essence');
  await page.waitForFunction(() => [...document.querySelectorAll('#reset-test-host .milestone-essence img')]
    .every(img => img.complete && img.naturalWidth > 0));
  const sprites = await page.locator("#reset-test-host .milestone-essence img").evaluateAll(imgs => imgs.map(i => ({ loaded: i.complete && i.naturalWidth > 0, src: i.src })));
  assert.ok(sprites.every(s => s.loaded), JSON.stringify(sprites));
  const essenceVisuals = await page.evaluate(() => {
    return [...document.querySelectorAll('#reset-test-host .milestone-essence')].map(orb => {
      const reference = document.createElement('div');
      const color = ['red', 'blue', 'yellow'].find(name => orb.classList.contains(name));
      reference.className = `inventory-essence-item essence-item-card linked ${color}`;
      reference.style.cssText = 'position:fixed;left:-9999px;top:0;';
      reference.appendChild(orb.querySelector('.essence-item-sprite').cloneNode(true));
      document.body.appendChild(reference);
      const actual = getComputedStyle(orb.querySelector('.essence-item-sprite'));
      const expected = getComputedStyle(reference.firstElementChild);
      const matching = ['backgroundImage', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderRadius', 'boxShadow']
        .every(property => actual[property] === expected[property]);
      reference.remove();
      const motion = orb.getAnimations().find(animation => animation.animationName === 'milestoneEssenceFloat');
      const time = motion?.currentTime;
      if (motion) motion.currentTime = 0;
      const start = getComputedStyle(orb).transform;
      if (motion) motion.currentTime = motion.effect.getTiming().duration / 2;
      const end = getComputedStyle(orb).transform;
      if (motion) motion.currentTime = time;
      return { matching, floating: !!motion && start !== end,
        size: getComputedStyle(orb).width,
        duration: motion?.effect.getTiming().duration,
        delay: motion?.effect.getTiming().delay,
        spriteMotion: [...orb.querySelectorAll('img')].map(img => {
          const style = getComputedStyle(img);
          return `${style.animationDuration}|${style.animationDelay}`;
        }),
        layers: orb.querySelectorAll('img').length,
        visibleMilestone: getComputedStyle(orb.parentElement).backgroundImage.includes('stat-slot-'),
        neutral: !orb.classList.contains('neutral-essence') || getComputedStyle(orb).filter === 'grayscale(1)' };
    });
  });
  assert.ok(essenceVisuals.every(v => v.matching && v.floating && v.layers === 1 && v.visibleMilestone && v.neutral && v.size === '24px' && v.duration >= 5500 && v.duration <= 8000 && v.delay < 0), JSON.stringify(essenceVisuals));
  assert.equal(new Set(essenceVisuals.map(v => v.duration)).size, essenceVisuals.length);
  assert.equal(new Set(essenceVisuals.flatMap(v => v.spriteMotion)).size, essenceVisuals.length);
  await mkdir("outputs", { recursive: true });
  await page.screenshot({ path: "outputs/essence-milestones-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "outputs/essence-milestones-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  // The visual probe above intentionally seeks the timeline; reset that test baseline only.
  await page.evaluate(() => window.__essenceAnimationState.forEach(state => {
    state.startTimes = state.animations.map(a => a.startTime);
  }));
  const expectedConfirmedHP = await page.evaluate(async () => {
    const entity = window.__resetTestEntity;
    entity.modifierStats.preview.statLeveled.vitality = 20;
    const hp = (await import("/js/entities/progression.js")).ComputeStatPreview(entity).HP;
    if (hp.max <= entity.stats.HP.max) throw new Error('Confirmation must increase max HP');
    return hp;
  });
  await page.locator('#reset-test-host .confirm-button.yes.level').click();
  await assertContinuousEssences();
  const confirmed = await page.evaluate(async () => ({
    xp: (await import("/js/entities/progression.js")).playerExperience,
    saved: JSON.parse(localStorage.getItem('selectedArmyA')).find(entity => entity.id === 900001),
  }));
  assert.equal(confirmed.saved.level.current, 31);
  assert.deepEqual(confirmed.saved.stats.HP, expectedConfirmedHP, 'Confirmed HP must match the proportional preview without a second heal');
  assert.equal(confirmed.saved.experience, beforeLevelUp.entityXP + beforeLevelUp.xp - confirmed.xp);
  assert.equal(confirmed.saved.experience, await page.evaluate(async () =>
    (await import("/js/entities/runtime.js")).levelDetails.find(row => row.level === 31).totalExperience));
  assert.equal(confirmed.saved.attackEssenceInventory.linkedItems.length, beforeLevelUp.essences + 1,
    'Confirmation awards exactly one linked essence');
  const anima = await page.evaluate(async () => {
    document.querySelector('#reset-test-host').style.zIndex = '1000';
    if (!document.querySelector('#reset-test-host .level-purify-button').hidden) throw new Error('Purification visible without Anima');
    const { acquireItem } = await import('/js/items/itemManager.js');
    window.__unusedPotionId = acquireItem({ serial: 'i0' }, 'browser-test').itemId;
    const item = acquireItem({ serial: 'i45' }, 'browser-test');
    window.__animaId = item.itemId;
    const entity = JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === 900001);
    window.__animaTarget = entity;
    const preview = (await import("/js/entities/progression.js")).previewEntityReset(entity);
    return { quality: item.itemQuality, refund: preview.refundXP, percent: preview.refundPercent };
  });
  assert.equal(anima.quality, 7);
  await page.locator('#reset-test-host .level-purify-button').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const api = await import("/js/entities/progression.js"), _api = await import("/js/ui/codex/stats.js");
    window.__actionTestXP = api.playerExperience;
    api.setPlayerExperience(1000000);
    document.getElementById('reset-test-host').replaceChildren(_api.createLevelUpForm(window.__resetTestEntity));
  });
  await page.locator('#reset-test-host .axis-line[data-key="strength"] .right-arrow').click({ force: true });
  await page.locator('#reset-test-host .axis-line[data-key="strength"] .right-arrow').click({ force: true });
  const actionSelectors = ['.level-purify-button', '.confirm-button.yes.level', '.confirm-button.clear'];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = [];
    for (const selector of actionSelectors) {
      const button = page.locator(`#reset-test-host ${selector}`);
      await button.waitFor({ state: 'visible' });
      assert.equal(await button.evaluate(el => el.classList.contains('is-hidden')), false);
      bounds.push(await button.boundingBox());
    }
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
        'Purify, confirm and reset must not overlap');
    }
    await page.locator('#reset-test-host .level-purify-button').hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#reset-test-host .level-purify-button')).filter.includes('185, 255, 243'));
    await page.screenshot({ path: `outputs/level-actions-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#reset-test-host .confirm-button.clear').click();
  assert.equal(await page.locator('#reset-test-host .level-purify-button').isVisible(), true);
  await page.evaluate(async () => {
    const api = await import("/js/entities/progression.js"), _api2 = await import("/js/ui/codex/stats.js");
    api.setPlayerExperience(window.__actionTestXP);
    document.getElementById('reset-test-host').replaceChildren(_api2.createLevelUpForm(window.__resetTestEntity));
  });
  await page.locator('#reset-test-host .level-purify-button').click();
  await page.locator('.anima-reset-confirm').waitFor({ state: 'visible' });
  assert.ok((await page.locator('.anima-reset-confirm').textContent()).includes('Purifier'));
  await page.locator('.anima-reset-confirm button', { hasText: 'Annuler' }).click();
  await page.waitForFunction(() => !document.querySelector('#reset-test-host .level-purify-button').disabled);
  const startAnima = async () => page.evaluate(async () => {
    const { useConsumableItem } = await import('/js/items/itemManager.js');
    window.__animaUse = useConsumableItem(window.__animaId, window.__animaTarget);
  });
  await startAnima();
  await page.locator('.anima-reset-confirm').waitFor({ state: 'visible' });
  assert.ok((await page.locator('.anima-reset-confirm').textContent()).includes(`${anima.refund} points`));
  assert.equal(await page.locator('.anima-reset-confirm br').count(), 3);
  assert.equal(await page.locator('.anima-reset-confirm [data-purification-entity]').textContent(), 'Test Anima');
  assert.ok((await page.locator('.anima-reset-confirm').textContent()).includes('Voulez-vous continuer cet acte charitable ?'));
  assert.equal(await page.locator('.anima-reset-item .quality-divine').evaluate(node => getComputedStyle(node).color), 'rgb(185, 255, 243)');
  await page.waitForFunction(() => {
    const image = document.querySelector('.anima-reset-item-icon');
    return image?.complete && image.naturalWidth > 0;
  });
  const duplicate = await page.evaluate(async () => (await import('/js/items/itemManager.js'))
    .useConsumableItem(window.__animaId, window.__animaTarget));
  assert.equal(duplicate.busy, true);
  await page.locator('.anima-reset-confirm button', { hasText: 'Annuler' }).click();
  assert.equal((await page.evaluate(() => window.__animaUse)).cancelled, true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory.some(i => i.itemId === window.__animaId)), true);
  await page.locator('#reset-test-host .level-purify-button').click();
  await page.locator('.anima-reset-confirm').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.anima-reset-confirm')).opacity) > 0.99);
  await page.screenshot({ path: 'outputs/anima-confirm-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/anima-confirm-mobile.png' });
  const popupBounds = await page.locator('.anima-reset-confirm').boundingBox();
  assert.ok(popupBounds.x >= 0 && popupBounds.x + popupBounds.width <= 391);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.anima-reset-confirm button.primary').click();
  await page.waitForFunction(() => document.querySelector('#reset-test-host .level-current')?.textContent === '1');
  await page.locator('#reset-test-host .level-purify-button').waitFor({ state: 'hidden' });
  const afterAnima = await page.evaluate(async () => ({
    xp: (await import("/js/entities/progression.js")).playerExperience,
    saved: JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === 900001),
    inInventory: JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory.some(i => i.itemId === window.__animaId),
    unusedPotion: JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory.some(i => i.itemId === window.__unusedPotionId),
  }));
  assert.equal(afterAnima.xp, confirmed.xp + anima.refund);
  assert.equal(afterAnima.saved.level.current, 1);
  assert.equal(afterAnima.saved.stats.HP.current, afterAnima.saved.stats.HP.max);
  assert.equal(afterAnima.saved.attackEssenceInventory.linkedItems.length, beforeLevelUp.essences);
  assert.equal(afterAnima.inInventory, false);
  assert.equal(afterAnima.unusedPotion, true);
  await page.evaluate(async () => {
    const { acquireItem, DropInventorytoCodex } = await import('/js/items/itemManager.js');
    const { createLevelUpForm } = await import("/js/ui/codex/stats.js");
    const item = acquireItem({ serial: 'i45' }, 'pure-entity-test');
    window.__pureAnimaId = item.itemId;
    const target = JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === 900001);
    if (target.level.current !== 1) throw new Error('Expected purified level 1');
    document.getElementById('reset-test-host').replaceChildren(createLevelUpForm(target));
    if (!document.querySelector('#reset-test-host .level-purify-button').hidden) throw new Error('Level 1 can see purification with an Anima');
    for (const level of [2, 1, 0]) {
      target.level.current = level;
      localStorage.setItem('selectedArmyA', JSON.stringify([target]));
      window.dispatchEvent(new CustomEvent('selectedArmyAUpdated'));
      const hidden = document.querySelector('#reset-test-host .level-purify-button').hidden;
      if (hidden !== (level <= 1)) throw new Error(`Wrong purification visibility at level ${level}`);
    }
    target.level.current = 1;
    localStorage.setItem('selectedArmyA', JSON.stringify([target]));
    window.__pureEntityBefore = JSON.stringify(target);
    const entry = document.createElement('div');
    entry.id = 'CodexEntityList_900001';
    document.body.appendChild(entry);
    DropInventorytoCodex(entry, target.id);
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', item.itemId);
    entry.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  const pureFailure = page.locator('[data-popup-key="consumable-failure"]');
  await pureFailure.waitFor({ state: 'visible' });
  assert.equal(await pureFailure.locator('.inventory-transfer-confirm-text').textContent(),
    'Votre entité est déjà pure. Impossible de la purifier.');
  assert.equal(await pureFailure.locator('button').count(), 0);
  assert.equal(await page.locator('.anima-reset-confirm').count(), 0);
  await pureFailure.waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const target = JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === 900001);
    if (JSON.stringify(target) !== window.__pureEntityBefore) throw new Error('Rejected drop mutated pure entity');
    if (!JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory.some(i => i.itemId === window.__pureAnimaId)) throw new Error('Rejected drop consumed Anima');
    const { useConsumableItem } = await import('/js/items/itemManager.js');
    const staleTarget = structuredClone(target);
    staleTarget.level.current = 50;
    target.level.current = 0;
    localStorage.setItem('selectedArmyA', JSON.stringify([target]));
    const result = await useConsumableItem(window.__pureAnimaId, staleTarget);
    if (result.ok || result.reason !== 'already-pure') throw new Error('Stale higher-level target bypassed stored level 0');
    target.level.current = 1;
    localStorage.setItem('selectedArmyA', JSON.stringify([target]));
    document.getElementById('CodexEntityList_900001').remove();
  });
  console.log('Purification: level gating, inventory refresh, real drop rejection, automatic popup removal and retained Anima verified.');
  const rejectedDead = await page.evaluate(async () => {
    const { acquireItem, useConsumableItem } = await import('/js/items/itemManager.js');
    const item = acquireItem({ serial: 'i45' }, 'browser-test');
    const dead = structuredClone(window.__animaTarget);
    dead.stats.HP.current = 0;
    const result = await useConsumableItem(item.itemId, dead);
    return { ok: result.ok, hp: dead.stats.HP.current,
      retained: JSON.parse(localStorage.getItem('PlayerSave')).Playerinventory.some(i => i.itemId === item.itemId) };
  });
  assert.deepEqual(rejectedDead, { ok: false, hp: 0, retained: true });
  const popupStyle = await page.evaluate(async () => {
    const { showGamePopupMessage } = await import("/js/ui/display.js");
    const panel = showGamePopupMessage({ key: 'backdrop-test', message: 'Test', duration: 30, fadeMs: 30 });
    const backdrop = panel.closest('.game-popup-layer').querySelector('.game-popup-backdrop');
    const bounds = backdrop.getBoundingClientRect();
    return { animation: getComputedStyle(panel).animationDuration,
      background: getComputedStyle(backdrop).backgroundColor,
      coversViewport: bounds.width === innerWidth && bounds.height === innerHeight };
  });
  assert.deepEqual(popupStyle, { animation: '0.25s', background: 'rgba(0, 0, 0, 0.42)', coversViewport: true });
  await page.waitForFunction(() => !document.querySelector('.game-popup-layer:has([data-popup-key="backdrop-test"])'));
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')).find(e => e.id === 900001).level.current), 1);
  const purificationPlacement = await page.evaluate(async () => {
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js");
    const { createLevelUpForm } = await import("/js/ui/codex/stats.js");
    const army = JSON.parse(localStorage.getItem('selectedArmyA'));
    const entity = structuredClone(army.find(e => e.id === 900001));
    entity.id = 900030;
    entity.level.current = 2;
    localStorage.setItem('selectedArmyA', JSON.stringify([...army, entity]));
    const host = document.createElement('main');
    host.id = 'purification-placement-test';
    host.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#140400;overflow:auto';
    document.body.appendChild(host);
    createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
    const section = host.querySelector('.section-content.soul');
    const oldForm = section.querySelector('.level-up-section');
    const progression = oldForm.parentElement;
    oldForm.replaceWith(createLevelUpForm(entity, { purificationHost: progression }));
    const button = progression.querySelector(':scope > .level-purify-button');
    const style = getComputedStyle(button);
    return { count: section.querySelectorAll('.level-purify-button').length,
      first: progression.firstElementChild === button, inline: button.hasAttribute('style'), hidden: button.hidden,
      inForm: !!section.querySelector('.level-up-section .level-purify-button'),
      position: style.position, right: style.right, top: style.top, zIndex: style.zIndex };
  });
  assert.deepEqual(purificationPlacement, { count: 1, first: true, inline: false, hidden: false,
    inForm: false, position: 'absolute', right: '0px', top: '0px', zIndex: '9999999' });
  await page.screenshot({ path: 'outputs/purification-placement-desktop.png' });
  await page.evaluate(async () => {
    const graph = document.querySelector('#soul-section-900030 .attribut-graph-container');
    graph.classList.remove('stray');
    if (!getComputedStyle(graph).backgroundImage.includes('cadre-soul-entite.png')) throw new Error('Normal frame missing');
    window.__awakeningFrameStart = performance.now();
    (await import("/js/rendering/animations.js")).playAwakeningExtasis({ id: 900030 });
    if (getComputedStyle(graph).backgroundImage !== 'none') throw new Error('Awakening frame appeared immediately');
    if (!document.querySelector('#soul-section-900030 .extasis.intro')) throw new Error('Frame delay blocked awakening GIF');
  });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#soul-section-900030 .attribut-graph-container').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#soul-section-900030 .attribut-graph-container')).backgroundImage.includes('cadre-soul-entite.png'));
  assert.ok(await page.evaluate(() => performance.now() - window.__awakeningFrameStart >= 3900));
  assert.equal(await page.locator('#soul-section-900030 .awakening-animation-container').count(), 1, 'Other awakening animation continues');
  await page.evaluate(() => document.getElementById('purification-placement-test').remove());
  const essenceUiGuards = await page.evaluate(async () => {
    const host = document.createElement('button');
    host.dataset.stat = 'attackEssenceRed';
    host.dataset.hover = 'true';
    host.dataset.helperText = '<div>Essence test</div>';
    host.dataset.helperClass = 'essence-linked-hover red';
    document.body.appendChild(host);
    host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const appeared = Boolean(document.querySelector('.stat-hover.essence-linked-hover'));
    host.remove();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const removedWithHost = !document.querySelector('.stat-hover.essence-linked-hover');

    const popup = document.createElement('div');
    popup.className = 'attack-essence-popup';
    popup.innerHTML = '<div class="attack-essence-popup-container"></div>';
    document.body.appendChild(popup);
    const style = getComputedStyle(popup);
    const fixedHeight = popup.getBoundingClientRect().height;
    const gutter = style.scrollbarGutter;
    popup.remove();
    return { appeared, removedWithHost, fixedHeight, gutter };
  });
  assert.equal(essenceUiGuards.appeared, true, 'Essence helper appears on its host');
  assert.equal(essenceUiGuards.removedWithHost, true, 'Essence helper disappears with its host');
  assert.ok(essenceUiGuards.fixedHeight > 500, `Essence popup has a stable height: ${essenceUiGuards.fixedHeight}`);
  assert.match(essenceUiGuards.gutter, /stable/);
  if (process.argv[2]) {
    const army = JSON.parse(await readFile(process.argv[2], 'utf8')).entities;
    const availableId = await page.evaluate(async army => {
      const { AttackDetailInfos } = await import("/js/ui/attacks.js");
      const { calculateEntityLinkedEssenceAvailability, grantEssencesToInventory } = await import("/js/items/essences.js");
      localStorage.setItem('selectedArmyA', JSON.stringify(army));
      window.selectedArmyA = army;
      window.__socketTestEntity = army[0];
      grantEssencesToInventory({ red: 1 }, { origin: 'shop-purchase' });
      const host = document.createElement('main');
      host.id = 'socket-test-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:1000;padding:40px;background:#140400;overflow:auto;';
      host.appendChild(AttackDetailInfos(army[0].attackDetails[0], army[0]));
      document.body.appendChild(host);
      return calculateEntityLinkedEssenceAvailability(army[0]).availableItems[0].id;
    }, army);
    await page.locator('#socket-test-host .attack-essence-socket[data-slot-index="1"]').click();
    await page.locator(`.attack-essence-popup-token[data-essence-id="${availableId}"]`).click();
    await page.waitForFunction(() => document.querySelector('[data-essence-popup-status]')?.textContent === 'Essence sertie.');
    assert.equal(await page.locator('.attack-essence-popup').count(), 1, 'Socket card stays open after equipping');
    const linkedResult = await page.evaluate(async () => {
      const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
      return { audit: (await import("/js/items/essences.js")).validateEntityEssenceLedger(entity),
        id: entity.attackDetails[0].essenceSlots[1].essenceId, count: entity.attackEssenceInventory.linkedItems.length,
        sockets: entity.attackDetails[0].essenceSlots.map(s => s.socketId) };
    });
    assert.equal(linkedResult.audit.ok, true, JSON.stringify(linkedResult));
    assert.equal(linkedResult.id, availableId);
    assert.equal(linkedResult.count, army[0].attackEssenceInventory.linkedItems.length);
    await page.locator('.attack-essence-popup-token.universal.red').click();
    await page.locator('.essence-bind-confirm button.primary').click();
    await page.waitForFunction(() => document.querySelector('.attack-essence-popup-equipped')?.classList.contains('red'));
    await page.waitForFunction(() => {
      const equipped = document.querySelector('.attack-essence-popup-equipped');
      const sprite = equipped?.querySelector('.essence-item-sprite');
      return equipped?.dataset.hover == null && sprite?.dataset.hover === 'true' && Boolean(sprite.dataset.helperText);
    });
    await page.locator('.attack-essence-popup-action[data-essence-popup-action="clear"]').click();
    await page.waitForFunction(() => document.querySelector('.attack-essence-popup-equipped')?.classList.contains('is-empty'));
    assert.equal(await page.locator('.attack-essence-popup').count(), 1, 'Socket card stays open after clearing');
    const final = await page.evaluate(async () => {
      const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
      const api = await import("/js/items/essences.js");
      return { audit: api.validateEntityEssenceLedger(entity), available: api.calculateEntityLinkedEssenceAvailability(entity).availableItems.map(i => i.id),
        items: entity.attackEssenceInventory.linkedItems.length, sockets: entity.attackDetails[0].essenceSlots.map(s => s.socketId) };
    });
    assert.equal(final.audit.ok, true, JSON.stringify(final));
    assert.ok(final.available.includes(availableId), 'Swapped linked essence returns unchanged');
    assert.equal(final.items, linkedResult.count + 1, 'Exactly one new linked essence from universal binding');
    assert.deepEqual(final.sockets, linkedResult.sockets);
    console.log('Supplied army: linked equip, universal swap, clear, persisted IDs and open card verified.');
  }
  console.log(JSON.stringify({ resetChecks, milestones: result, anima, checked: ['preview', 'confirm-level-up', 'cancel-anima', 'duplicate-use', 'consume-anima', 'reload'], errors }));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
