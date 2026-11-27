import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const profiles = {
  grouille: { strength: 20, agility: 1, intelligence: 1, will: 10, HP: 20 },
  porc: { strength: 1, agility: 3, intelligence: 5, will: 25, HP: 56,
    vitality: 58, physicalDamage: 10, magicalDamage: 10, physicalResistance: 5, magicalResistance: 5 },
};
try {
  for (const [profile, baseStats] of Object.entries(profiles)) {
  for (const mode of ['close', 'tab', 'refresh', 'finish']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    const triggered = await page.evaluate(async ({ mode, baseStats }) => {
      const { enrichEntityStats, levelDetails } = await import("/js/entities/runtime.js");
      const { createCodexEntityScan } = await import("/js/ui/codex/index.js");
      const { setPlayerExperience, getCycleForKey } = await import("/js/entities/progression.js");
      const { STAT_INDEX } = await import("/js/entities/rules.js");
      const entity = { id: 930001, name: 'Test Eveil', side: 'A', type: 'sbire', class: 'TestReset', level: 1,
        baseStats,
        attacks: [{ functionName: 'autoAttack', attacknature: ['physicalDamage'], attackRange: ['melee'] }] };
      enrichEntityStats(entity);
      setPlayerExperience(1000000);
      localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
      localStorage.setItem('ArmyA', JSON.stringify({ entities: [entity] }));
      const host = document.createElement('main');
      host.id = 'awakening-test-host';
      document.body.appendChild(host);
      localStorage.setItem('CodexSoulMode', JSON.stringify('archetype'));
      createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
      host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
      const assertProgression = () => {
        const tabs = host.querySelector('.codex-soul-tabs');
        if (tabs.querySelectorAll('.active').length !== 1
          || tabs.querySelector('.active').dataset.mode !== 'progression'
          || tabs.querySelector('.active').getAttribute('aria-selected') !== 'true'
          || host.querySelector('.section-content.soul .codex-substat-panel--progression').hidden) {
          throw Error('Soul must always open on the visible Level up panel');
        }
      };
      assertProgression();
      localStorage.removeItem('CodexSoulMode');
      const cycle = getCycleForKey('egare', entity);
      const initialLevel = entity.level.current;
      const initialExperience = entity.experience || 0;
      const initialStage = entity.Archetype?.current?.step || 0;
      const steps = cycle.length - initialStage;
      const expectedMilestones = [...(entity.Archetype?.current?.milestone || []), ...Array(steps).fill('force')];
      const expectedModifiers = { ...entity.modifierStats.durable.statLeveled };
      expectedModifiers.strength = (expectedModifiers.strength || 0) + steps;
      for (const stage of cycle.slice(initialStage)) {
        const key = STAT_INDEX.typeToKey?.egare?.[stage] || STAT_INDEX.typeToKey?.force?.[stage];
        if (key) expectedModifiers[key] = (expectedModifiers[key] || 0) + 1;
      }
      const originalConfirm = window.confirm;
      let confirmations = 0;
      window.__awakeningFrames = [];
      const graph = host.querySelector('.attribut-graph-container');
      const readPresentation = () => ({
        title: host.querySelector('.archetype-title')?.textContent,
        description: host.querySelector('.archetype-description')?.textContent,
        gauge: host.querySelector('.archetype-level-fill')?.style.width,
        milestones: [...host.querySelectorAll('.milestone')].map(el => ({
          index: el.dataset.index, classes: [...el.classList].filter(c => c !== 'last').sort(), left: el.style.left,
        })),
      });
      const recordFrame = () => {
        if (!host.contains(graph)) return;
        const gif = !!host.querySelector('.awakening-animation-container');
        if (gif && !window.__awakeningGifStarted) window.__awakeningGifStarted = performance.now();
        const arrow = host.querySelector('.axis-line[data-key="strength"] .right-arrow');
        window.__awakeningFrames.push({ time: performance.now(), gif, visible: getComputedStyle(graph).backgroundImage !== 'none', presentation: readPresentation(), arrows: getComputedStyle(arrow).opacity !== '0' && getComputedStyle(arrow).pointerEvents !== 'none' });
        requestAnimationFrame(recordFrame);
      };
      recordFrame();
      window.confirm = () => { confirmations++; return true; };
      try {
        for (let i = 0; i < steps; i++) {
          host.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
          if (mode === 'tab' && i === Math.floor(steps / 2)) host.querySelector('.confirm-button.yes').click();
        }
      } finally { window.confirm = originalConfirm; }
      window.__awakeningWaitingPresentation = readPresentation();
      // This read and interruption happen in the same JS task, before any animation timer.
      const saved = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
      const xp = Number(localStorage.getItem('playerExperience'));
      const cost = levelDetails.filter(row => row.level > initialLevel && row.level <= initialLevel + steps).reduce((sum, row) => sum + row.cost, 0);
      if (mode === 'close') {
        host.querySelector('.codex-soul-tabs [data-mode="archetype"]').click();
        host.replaceChildren();
        createCodexEntityScan(saved, host, `codex-entity_${entity.id}`);
        host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
        assertProgression();
      } else if (mode === 'tab') {
        host.querySelector('.codex-soul-tabs [data-mode="soul"]').click();
        host.querySelector('.codex-soul-tabs [data-mode="archetype"]').click();
        host.querySelector('.codex-soul-tabs [data-mode="progression"]').click();
        if (host.querySelectorAll('.attribut-graph-container').length !== 1) throw Error('Soul sub-tabs duplicated the progression graph');
        for (const subMode of ['soul', 'archetype']) {
          host.querySelector(`.codex-soul-tabs [data-mode="${subMode}"]`).click();
          if (host.querySelector('.codex-soul-tabs .active').dataset.mode !== subMode) {
            throw Error('Soul sub-tabs must still switch while the section stays open');
          }
          host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
          host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
          assertProgression();
        }
      }
      if (localStorage.getItem('CodexSoulMode') !== null) throw Error('Soul must not persist a submenu choice');
      return { saved, xp, cost, confirmations, expectedModifiers, steps, initialLevel, initialExperience, expectedMilestones, cycleLength: cycle.length };
    }, { mode, baseStats });
    assert.equal(triggered.confirmations, 1);
    assert.equal(triggered.saved.level.current, triggered.initialLevel + triggered.steps);
    assert.notEqual(triggered.saved.Archetype.current.key, 'egare', 'Awakening must be committed synchronously');
    assert.equal(triggered.saved.Archetype.current.step, 0);
    assert.equal(triggered.saved.Archetype.inProgress.some(a => a.key === 'egare'), false);
    const achieved = triggered.saved.Archetype.achieve.filter(a => a.key === 'egare');
    assert.equal(achieved.length, 1);
    assert.equal(achieved[0].step, triggered.cycleLength);
    assert.deepEqual(achieved[0].milestone, triggered.expectedMilestones);
    assert.equal(triggered.xp, 1000000 - triggered.cost);
    assert.equal(triggered.saved.experience, triggered.initialExperience + triggered.cost);
    assert.equal(triggered.saved.combatDetails.lifetime.experienceSpent, triggered.cost, 'Only committed XP is accumulated');
    assert.equal(triggered.saved.combatDetails.lifetime.maxLevelReached, triggered.saved.level.current);
    assert.equal(triggered.saved.combatDetails.lifetime.archetypesCompleted, 1, 'Awakening records one completed archetype');
    assert.deepEqual(triggered.saved.modifierStats.durable.archetype, {}, 'Reverse generation must not duplicate manually invested points');
    assert.equal(triggered.saved.stats.strength, baseStats.strength + triggered.steps);
    assert.equal(triggered.saved.stats.agility, baseStats.agility);
    assert.equal(triggered.saved.stats.intelligence, baseStats.intelligence);
    for (const [key, value] of Object.entries(triggered.expectedModifiers)) {
      assert.equal(triggered.saved.modifierStats.durable.statLeveled[key], value, `Missing committed final sub-stat ${key}`);
    }
    if (mode === 'refresh') {
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(async () => {
        const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
        const host = document.createElement('main');
        host.id = 'awakening-test-host';
        document.body.appendChild(host);
        (await import("/js/ui/codex/index.js")).createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
        host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
      });
    }
    if (mode !== 'finish') {
      assert.equal(await page.locator('#awakening-test-host .attribut-graph-container.stray').count(), 0);
      // The new form must work immediately, even while the old timer is pending.
      await page.locator('#awakening-test-host .axis-line[data-key="strength"] .right-arrow').evaluate(el => el.click());
      assert.equal(await page.locator('#awakening-test-host .level-future').textContent(), String(triggered.saved.level.current + 1));
      await page.locator('#awakening-test-host .axis-line[data-key="strength"] .left-arrow').evaluate(el => el.click());
    }
    await page.waitForTimeout(mode === 'finish' ? 10500 : 2500);
    const after = await page.evaluate(() => ({ entity: JSON.parse(localStorage.getItem('selectedArmyA'))[0], xp: Number(localStorage.getItem('playerExperience')) }));
    assert.equal(after.xp, triggered.xp, 'Old animation must not spend XP again');
    assert.equal(after.entity.experience, triggered.initialExperience + triggered.cost);
    assert.deepEqual(after.entity.combatDetails.lifetime, triggered.saved.combatDetails.lifetime,
      'Preview undo, reopened tabs and old animation timers cannot inflate career progression');
    assert.deepEqual(after.entity.Archetype, triggered.saved.Archetype, 'Old animation must not overwrite reopened progression');
    assert.deepEqual(after.entity.attackEssenceInventory, triggered.saved.attackEssenceInventory);
    assert.equal(await page.locator('#awakening-test-host .attribut-graph-container.stray').count(), 0);
    if (mode === 'finish') {
      const motion = await page.evaluate(() => ({ frames: window.__awakeningFrames, start: window.__awakeningGifStarted, waiting: window.__awakeningWaitingPresentation }));
      assert.ok(motion.start, 'Awakening GIF never started');
      assert.ok(motion.frames.filter(frame => frame.time < motion.start + 3900).every(frame => !frame.visible), 'Frame flashed before its delay');
      assert.ok(motion.frames.some(frame => frame.visible), 'Frame never returned');
      assert.equal(motion.waiting.gauge, '100%', 'The completed awakening bar must remain visible');
      const waitingFrames = motion.frames.slice(1).filter(frame => frame.time < motion.start + 5900);
      for (const frame of waitingFrames) assert.deepEqual(frame.presentation, motion.waiting, 'The first archetype changed before its reveal');
      const frameOnly = motion.frames.find(frame => frame.visible);
      assert.deepEqual(frameOnly.presentation, motion.waiting, 'Frame must precede the archetype interface');
      const revealed = motion.frames.find(frame => frame.time >= motion.start && frame.presentation.title !== motion.waiting.title);
      assert.ok(revealed);
      assert.notEqual(revealed.presentation.title, motion.waiting.title);
      assert.equal(revealed.presentation.gauge, '0%', 'The new archetype bar appears with its title');
      assert.equal(revealed.arrows, false);
      const enabled = motion.frames.find(frame => frame.time > revealed.time && frame.arrows);
      assert.ok(enabled, 'Level up arrows never returned');
      assert.ok(Math.abs(enabled.time - revealed.time - 2000) < 250, 'Archetype must appear two seconds before arrows');
      await page.locator('#awakening-test-host .axis-line[data-key="strength"] .right-arrow').evaluate(el => el.click());
      assert.equal(await page.locator('#awakening-test-host .level-future').textContent(), String(triggered.saved.level.current + 1));
      await page.locator('#awakening-test-host .confirm-button.yes').evaluate(el => el.click());
      const next = await page.evaluate(async () => {
        const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
        (await import("/js/entities/runtime.js")).recomputeEntityStats(entity);
        return entity;
      });
      assert.equal(next.level.current, triggered.saved.level.current + 1);
      assert.equal(next.stats.strength, triggered.saved.stats.strength + 1);
      assert.deepEqual(next.modifierStats.durable.archetype, {});
      assert.equal(next.Archetype.current.step, 1);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${profile} awakening ${mode}: Force ${triggered.saved.stats.strength}, immediate commit, XP once, delayed presentation, next level available.`);
    await page.close();
  }
  }
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const generatedProgression = await page.evaluate(async () => {
    const { enrichEntityStats, recomputeEntityStats, levelDetails } = await import("/js/entities/runtime.js");
    const { createLevelUpForm } = await import("/js/ui/codex/stats.js"), { setPlayerExperience } = await import("/js/entities/progression.js");
    const entity = { id: 930002, name: 'Generated level 30', side: 'A', type: 'sbire', level: 30,
      baseStats: { strength: 20, agility: 1, intelligence: 1, will: 25, HP: 100 },
      attacks: [{ functionName: 'autoAttack', attacknature: ['physicalDamage'], attackRange: ['melee'] }] };
    enrichEntityStats(entity);
    const before = structuredClone(entity);
    setPlayerExperience(1000000);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    localStorage.setItem('ArmyA', JSON.stringify({ entities: [entity] }));
    const form = createLevelUpForm(entity);
    document.body.appendChild(form);
    form.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
    const preview = structuredClone(entity.modifierStats.preview.total);
    form.querySelector('.confirm-button.yes').click();
    const saved = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    const reloaded = structuredClone(saved);
    recomputeEntityStats(reloaded);
    return { before, preview, saved, reloaded, cost: levelDetails.find(row => row.level === 31).cost };
  });
  assert.equal(generatedProgression.before.modifierStats.durable.archetypeMeta.source, 'reverseArchetype');
  assert.equal(generatedProgression.preview.strength, generatedProgression.before.stats.strength + 1);
  for (const entity of [generatedProgression.saved, generatedProgression.reloaded]) {
    assert.equal(entity.level.current, 31);
    assert.equal(entity.stats.strength, generatedProgression.before.stats.strength + 1);
    assert.equal(entity.experience, generatedProgression.before.experience + generatedProgression.cost);
    assert.deepEqual(entity.modifierStats.durable.archetype, generatedProgression.before.modifierStats.durable.archetype);
    assert.deepEqual(entity.modifierStats.durable.archetypeMeta, generatedProgression.before.modifierStats.durable.archetypeMeta);
  }
  console.log('PASS generated level 30 -> manual level 31: generation baseline unchanged, preview/confirmation/reload add exactly one point.');
  await page.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
