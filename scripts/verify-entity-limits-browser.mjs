import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('docs'), output = resolve('outputs/limits-2026-11-26/interface');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const initial = await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), S = await import('/js/entities/statSystem.js');
    const UI = await import('/js/ui/statistics/components.js'), H = await import('/js/data/helpers.js');
    const D = await import('/js/ui/statistics/details.js'), Combat = await import('/js/combat/statistics.js');
    const Store = await import('/js/storage/gameStorage.js');
    const e = { id: 988222, name: 'Limites', type: 'sbire', side: 'A', awakening: 3, seuilUmbra: 1500,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 1000, criticalChance: 98.999, fatalSurvival: 98.999, physicalDamage: 100000, strength: 300, vigueur: 300, physicalResistance: 1e12, precision: 1e12 } };
    const recompute = () => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    recompute(); E.entites.push(e);
    Store.saveToLocalStorage('entity-limits-browser', e);
    const saved = Store.loadFromLocalStorage('entity-limits-browser');
    const mount = document.body.appendChild(document.createElement('section'));
    mount.id = 'limits-audit'; mount.style.cssText = 'position:fixed;inset:30px;z-index:5000;background:#211b24;padding:25px;overflow:auto;color:white';
    mount.innerHTML = '<h2>Limites et plafonds</h2>';
    for (const [stat, label, value] of [['criticalChance', 'Chance de critique', '${value} %'], ['physicalDamage', 'Puissance physique', '${value}'], ['fatalSurvival', 'Survie fatale', '${value} %'], ['strength', 'Force', '${value}'], ['physicalResistance', 'Réduction physique', '${value} %'], ['precision', 'Précision', '${value} %']]) {
      mount.append(UI.createFullStatDom({ stat, label, value, entite: e, showZero: true, ...(stat === 'precision' ? { calculatorName: actor => S.getStatSystemResult(actor, 'precision').chancePercent } : {}) }));
    }
    const cards = mount.appendChild(document.createElement('div'));
    cards.id = 'limit-cards'; cards.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap';
    for (const key of ['vigueur', 'criticalPower']) {
      const card = cards.appendChild(document.createElement('div')); card.style.cssText = 'max-width:340px';
      card.innerHTML = D.calculateStatsDisplay(key, e).helpContent;
    }
    window.__limits = { e, E, UI, S, H, D, Combat, mount, recompute };
    return { storedLimit: saved.seuilUmbra, storedStrength: saved.baseStats.strength, ratio: S.getStatSystemResult(e, 'physicalDamage').progression.source.multiplier,
      realChance: S.getStatSystemResult(e, 'criticalChance').value };
  });
  assert.deepEqual(initial, { storedLimit: 1500, storedStrength: 300, ratio: 2.7, realChance: 98.999 });
  assert.match(await page.locator('#limits-audit .fatalSurvival-stat .entite-stat').innerText(), /99\s*%\s*MAX/);
  const chance = page.locator('#limits-audit .criticalChance-stat .entite-stat');
  assert.match(await chance.innerText(), /99\s*%\s*MAX/);
  assert.equal(await page.locator('#limits-audit .physicalDamage-stat .stat-maximum').count(), 0);
  checks.push('Owner limit, stored raw points, continued ratio and displayed MAX agree');
  await page.evaluate(() => {
    const { e, UI, recompute } = window.__limits, before = structuredClone(e.stats);
    e.baseStats.criticalChance = 50; e.baseStats.physicalResistance = 100; e.baseStats.precision = 20; recompute(); UI.syncDOMWithStats(before, e.stats, e.id, e);
  });
  assert.doesNotMatch(await chance.innerText(), /MAX/);
  assert.match(await page.locator('#limits-audit .physicalResistance-stat .entite-stat').innerText(), /58.24/);
  assert.equal(await page.locator('#limits-audit .precision-stat .stat-maximum').count(), 0);
  await page.evaluate(() => {
    const { e, UI, recompute } = window.__limits, before = structuredClone(e.stats);
    e.baseStats.criticalChance = 99; recompute(); UI.syncDOMWithStats(before, e.stats, e.id, e);
  });
  assert.match(await chance.innerText(), /MAX/);
  checks.push('Live updates remove and restore MAX without altering the chance');
  const qualifiers = await page.evaluate(() => {
    const { e, H, Combat, mount, recompute } = window.__limits;
    const source = mount.appendChild(document.createElement('div')); source.id = 'source-limits';
    const result = [];
    for (const loss of [-299, -300, -320]) {
      e.battleBoosts = { strength: [{ source: 'Malus de test', value: loss, mode: 'flat' }] }; recompute();
      source.innerHTML = H.buildStatisticOrigins({ compact: true, totals: [], modifiers: Combat.getStatContributions(e, 'strength') });
      const template = source.querySelector('[data-helper-source="malus"] template');
      result.push(template.content.textContent);
    }
    const template = source.querySelector('[data-helper-source="malus"] template');
    const detail = mount.appendChild(document.createElement('div')); detail.id = 'source-detail'; detail.append(template.content.cloneNode(true));
    return result;
  });
  assert.doesNotMatch(qualifiers[0], /Malus supérieur/);
  assert.doesNotMatch(qualifiers[1], /Malus supérieur/);
  assert.match(qualifiers[2], /Malus supérieur/);
  checks.push('Malus quality activates strictly below zero in the real DOM');
  await page.screenshot({ path: resolve(output, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#limits-audit .stat-maximum').first().isVisible());
  assert.ok(await page.locator('#source-detail').evaluate(node => node.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: resolve(output, 'portrait.png') });
  const version = await page.locator('#game-version').textContent();
  assert.ok(version.includes(JSON.parse(await readFile('package.json', 'utf8')).gameVersion));
  checks.push('Portrait layout and loaded version verified');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS: ${checks.length} entity limit UI scenarios.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
