import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/levelup-performance');
await mkdir(output, { recursive: true });
const probes = {
  "/js/entities/runtime.js": [['export function getStatSystemInputs(entity, { preview = true, combat = true } = {}) {', 'inputs']],
  "/js/entities/progression.js": [['export function ComputeStatPreview(entite) {', 'preview']],
  "/js/combat/statistics.js": [['export function calculateStatsDisplay(statKey, entite, statValue, options = {}) {', 'display']],
};
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    let content = await readFile(file);
    if (probes[pathname]) {
      content = content.toString();
      for (const [needle, name] of probes[pathname]) {
        assert.ok(content.includes(needle), 'Probe exists: ' + name);
        content = content.replace(needle, needle + `\nif (globalThis.__levelProbe) { globalThis.__levelProbe.${name} = (globalThis.__levelProbe.${name} || 0) + 1; ${name === 'display' ? "if (options.includeHelper !== false) globalThis.__levelProbe.helpers = (globalThis.__levelProbe.helpers || 0) + 1;" : ''} }\n`);
      }
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch (error) { res.writeHead(404).end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js"), G = await import("/js/app/state.js");
    const U = await Promise.all([import("/js/entities/progression.js"), import("/js/rendering/vitalFeedback.js"), import("/js/ui/codex/stats.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    window.levelRunning = 'worldmap'; G.setGameOver(false);
    const template = E.entitesNestUp.find(e => /mouche astic/i.test(e.name));
    const actor = structuredClone(template);
    Object.assign(actor, { id: 999769, side: 'A', level: { current: 1, max: 250 }, archetypeFrozen: true });
    Object.assign(actor.baseStats, { strength: 20, intelligence: 20, agility: 20,
      vigueur: 10, esprit: 10, finesse: 10, constitution: 10, integrite: 10, adresse: 10,
      vision: 10, criticalPower: 10, resilience: 10, vitality: 10, robustness: 10, haste: 10 });
    E.recomputeEntityStats(actor);
    E.entites.splice(0, E.entites.length, actor);
    S.saveToLocalStorage('selectedArmyA', [actor]); window.selectedArmyA = [actor];
    U.setPlayerExperience(1000000);
    UI.createGameContainer(); UI.GameUi();
    document.querySelectorAll('.entitylootContainer,#black-overlay').forEach(node => node.remove());
    S.saveToLocalStorage('CodexMenuIndex', 4);
    UI.EntityCodexDetails(actor.id);
    window.__levelFixture = { actor, UI, U, E, S };
    window.__levelSaveCount = 0;
    window.addEventListener('selectedArmyAUpdated', event => {
      if (event.detail?.source !== 'saveUpgradedEntity') return;
      window.__levelDraft = event.detail.entite;
      window.__levelSaveCount++;
    });
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const card = document.querySelector('.codex-entity-scan');
    card.querySelector('.codex-soul').parentElement.click();
    if (!card.querySelector('.axis-line .right-arrow')) throw Error('Missing level-up arrows');
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const results = [];
  for (const key of ['strength', 'agility', 'intelligence', 'strength', 'agility', 'intelligence']) {
    results.push(await page.evaluate(async key => {
      window.__levelProbe = {};
      const savesBefore = window.__levelSaveCount;
      const arrow = document.querySelector(`.axis-line[data-key="${key}"] .right-arrow`);
      const start = performance.now();
      arrow.click();
      const syncMs = performance.now() - start, counts = { ...window.__levelProbe };
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const frameMs = performance.now() - start;
      window.__levelProbe = null;
      return { key, syncMs, frameMs, counts, saves: window.__levelSaveCount - savesBefore };
    }, key));
  }
  const { profile } = await cdp.send('Profiler.stop');
  const checks = await page.evaluate(async () => {
    const { U, UI, S, actor } = window.__levelFixture;
    const D = await import("/js/ui/statistics/details.js");
    const checks = [], check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const form = document.querySelector('.level-up-section');
    const arrow = (key, direction) => form.querySelector(`.axis-line[data-key="${key}"] .${direction}-arrow`).click();
    const verifyPreview = () => {
      const draft = window.__levelDraft;
      const fresh = U.ComputeStatPreview(structuredClone(draft));
      for (const [key, value] of Object.entries(fresh)) {
        check(JSON.stringify(draft.modifierStats.preview.total[key]) === JSON.stringify(value), 'Fresh preview agrees: ' + key);
      }
      for (const key of ['strength', 'agility', 'intelligence']) {
        check(Number(form.querySelector(`.axis-line[data-key="${key}"] .axis-value-display`).textContent) === fresh[key], 'Visible attribute agrees: ' + key);
      }
      return draft;
    };
    let draft = verifyPreview();
    for (const key of ['strength', 'agility', 'intelligence']) check(draft.modifierStats.preview.total[key] === 22, 'Two points gained: ' + key);
    check(draft.level.current === 1, 'Preview does not confirm the level');
    const host = document.querySelector('.codex-entity-scan .umbra-submenu [data-stat="vigueur"].stat-container');
    check(!!host, 'Live Umbra helper host exists');
    const helperEntity = UI.getBoundHelperEntity(host);
    const expected = D.calculateStatsDisplay('vigueur', helperEntity);
    host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(done => setTimeout(done, 100));
    const helper = document.querySelector('.stat-hover[data-stat="vigueur"]');
    check(!!helper, 'Umbra helper still opens after spending points');
    check(helper._umbraCalculations?.generatedUmbraRatio?.value === expected.umbraHelperCalculations.generatedUmbraRatio.value,
      'Opened helper uses the current draft calculation');
    UI.closeOpenHelpers();
    arrow('intelligence', 'left');
    draft = verifyPreview();
    check(draft.modifierStats.preview.total.intelligence === 21, 'Undo restores the last attribute');
    form.querySelector('.confirm-button.clear').click();
    draft = verifyPreview();
    for (const key of ['strength', 'agility', 'intelligence']) check(draft.modifierStats.preview.total[key] === 20, 'Clear restores: ' + key);
    arrow('strength', 'right'); arrow('agility', 'right');
    draft = verifyPreview();
    const previewAttributes = Object.fromEntries(['strength', 'agility', 'intelligence'].map(key => [key, draft.modifierStats.preview.total[key]]));
    form.querySelector('.confirm-button.yes').click();
    const saved = S.loadFromLocalStorage('selectedArmyA', []).find(e => e.id === actor.id);
    check(saved.level.current === 3, 'Two confirmed points grant exactly two levels');
    for (const [key, value] of Object.entries(previewAttributes)) check(saved.stats[key] === value, 'Confirmation matches preview: ' + key);
    check(!Object.keys(saved.modifierStats.preview?.statLeveled || {}).length, 'Confirmed choices leave no pending points');
    return checks;
  });
  const weights = new Map();
  profile.samples.forEach((id, index) => weights.set(id, (weights.get(id) || 0) + profile.timeDeltas[index]));
  const hotspots = profile.nodes.map(n => ({ name: n.callFrame.functionName, file: n.callFrame.url.split('/').pop(),
    line: n.callFrame.lineNumber + 1, ms: (weights.get(n.id) || 0) / 1000 })).sort((a,b) => b.ms - a.ms).slice(0, 22);
  const label = process.env.REPORT_LABEL || 'report';
  await writeFile(resolve(output, label + '.json'), JSON.stringify({ results, hotspots, checks, errors }, null, 2));
  await writeFile(resolve(output, label + '.cpuprofile'), JSON.stringify(profile));
  console.log(JSON.stringify({ results, checks: checks.length, errors }, null, 2));
  assert.deepEqual(errors, []);
  for (const result of results) {
    assert.equal(result.saves, 1, 'One save notification per point');
    assert.ok(result.counts.preview <= 2, 'At most one preview per attribute/Umbra change');
    assert.equal(result.counts.helpers || 0, 0, 'Closed helpers are never generated during a point click');
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
