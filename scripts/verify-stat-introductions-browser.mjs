import { dismissStarterForFixture } from "./browser-test-fixture.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/stat-introductions');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const setup = async (view, preview) => page.evaluate(async ({ view, preview }) => {
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), E = await import("/js/entities/runtime.js");
    const U = await Promise.all([import("/js/entities/progression.js"), import("/js/rendering/vitalFeedback.js"), import("/js/ui/codex/stats.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const { stats } = await import('/js/data/statsData.js');
    const { STAT_HELPER_DESCRIPTIONS } = await import('/js/data/helpers.js');
    UI.closeOpenHelpers(); document.getElementById('intro-audit')?.remove();
    const keys = stats.filter(stat => stat.nature === 'umbra').map(stat => stat.key);
    const entity = { id: 971902, name: 'Introduction audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 100, strength: 20, agility: 30, intelligence: 40,
        ...Object.fromEntries(keys.map(key => [key, 15])) } };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    U.setPlayerExperience(1000000);
    const host = document.createElement('main'); host.id = 'intro-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:1';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector(`.codex-inner-menu:has(.codex-${view === 'Stats' ? 'stat' : 'soul'})`).click();
    if (view === 'Stats') host.querySelector('.section-content.stats [data-mode="umbra"]').click();
    const active = view === 'Stats' ? entity : UI.helperEntityByRoot.get(host.querySelector('.level-up-section'));
    const committed = JSON.stringify(active.stats);
    const previewPoints = Object.fromEntries(keys.map(key => [key, 5]));
    if (preview) {
      active.modifierStats.preview = { statLeveled: previewPoints };
      U.refreshActiveStatPreview(active, host);
    }
    window.__introAudit = { UI, U, active, host, committed, previewPoints, descriptions: STAT_HELPER_DESCRIPTIONS };
    return keys;
  }, { view, preview });
  const helper = page.locator('[data-umbra-pinned="true"]');
  const verify = async (key, label) => checks.push(...await helper.evaluate(async (node, { key, label }) => {
    const { descriptions } = window.__introAudit;
    const passed = [];
    const check = (ok, text) => { if (!ok) throw Error(`${label}: ${text}`); passed.push(`${label}: ${text}`); };
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const reference = node.cloneNode(true);
    const D = await import("/js/ui/statistics/details.js");
    const model = document.createElement('template');
    model.innerHTML = D.calculateStatsDisplay(key, window.__introAudit.active).helpContent;
    reference.querySelector('.short-descri').replaceWith(model.content.querySelector('.short-descri').cloneNode(true));node.parentElement.append(reference);
    const descriptionText = normalize(reference.querySelector('.short-descri').textContent);
    const normalizeIntroduction = normalize;
    const introductions = node.querySelectorAll('.short-descri');
    check(introductions.length === 1, 'exactly one introduction');
    const introduction = introductions[0];
    check(introduction.dataset.statDescription === key && normalizeIntroduction(introduction.textContent) === descriptionText, 'shared description retains its live value');
    check(node.querySelector('.stat-hover-body .short-descri') === introduction && !introduction.closest('[data-umbra-section=capacity]'), 'introduction precedes effects and calculations');
    check(normalizeIntroduction(node.querySelector('.stat-hover-body').textContent).split(descriptionText).length === 2, 'no old hardcoded copy remains');
    const paint = element => {
      const style = getComputedStyle(element);
      return ['color', 'backgroundImage', 'webkitTextFillColor', 'filter'].map(key => style[key]);
    };
    for (const selector of ['[data-helper-effect]', '.picto-stat']) {
      const actual = [...introduction.querySelectorAll(selector)], expected = [...reference.querySelector('.short-descri').querySelectorAll(selector)];
      check(actual.length === expected.length, `${selector}: same terms and pictograms as the definition`);
      for (let i = 0; i < actual.length; i++) {
        check(actual[i].className === expected[i].className, `${selector}/${i}: correct stat identity`);
        check(JSON.stringify(paint(actual[i])) === JSON.stringify(paint(expected[i])), `${selector}/${i}: correct computed colors and artwork`);
        if (selector === '.picto-stat') {
          const urls = [...getComputedStyle(actual[i]).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
          check(urls.length > 0, `${selector}/${i}: icon has an image`);
          for (const src of urls) {
            const image = new Image(); image.src = src; await image.decode();
            check(image.naturalWidth > 0, `${selector}/${i}: artwork loads`);
          }
        }
      }
    }
    reference.remove();
    const anchors = [...node.querySelectorAll('[data-umbra-part], [data-umbra-summary], [data-autonomous-calculation], [data-helper-source], [data-helper-picto-stat]')];
    let details = 0;
    for (const anchor of anchors) {
      anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const detail = document.querySelector('[data-umbra-detail]');
      if (detail?._sourceAnchor === anchor) {
        details++;
        check(!detail.querySelector('[data-stat-description="'+key+'"]'), 'nested stat descriptions do not repeat the parent Umbra introduction');
        check(!normalize(detail.textContent).includes(descriptionText), 'nested helper does not repeat the parent introduction');
        check(detail.querySelector('.stat-hover-body').textContent.trim().length > 0, 'nested effect, calculation or source remains available');
      }
      anchor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: node }));
    }
    check(details > 0, 'calculation and pictogram sub-helpers were exercised');
    check(JSON.stringify(window.__introAudit.active.stats) === window.__introAudit.committed, 'preview leaves committed stats unchanged');
    return passed;
  }, { key, label }));

  for (const view of ['Stats', 'Level up']) for (const preview of [false, true]) {
    const keys = await setup(view, preview);
    assert.equal(keys.length, 27);
    for (const key of keys) {
      await page.keyboard.press('Escape');
      const scope = view === 'Stats' ? '.codex-substat-panel--umbra' : '.umbra-submenu';
      await page.locator(`#intro-audit ${scope} .stat-container[data-stat="${key}"]`).first().click();
      await helper.waitFor({ state: 'visible' });
      await verify(key, `${view}/${preview ? 'preview' : 'current'}/${key}`);
      if (preview && key === 'adresse') {
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
        await helper.screenshot({ path: resolve(output, `${view === 'Stats' ? 'stats' : 'level-up'}-preview.png`) });
      }
    }
    if (!preview) {
      await page.evaluate(() => {
        const { U, active, host, previewPoints } = window.__introAudit;
        window.__introAudit.openHelper = document.querySelector('[data-umbra-pinned]');
        active.modifierStats.preview = { statLeveled: previewPoints }; U.refreshActiveStatPreview(active, host);
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await helper.evaluate(node => node === window.__introAudit.openHelper), 'Live preview keeps the same pinned helper');
      await verify(keys.at(-1), `${view}/live-preview`);
    }
  }
  for (const view of ['Stats', 'Level up']) {
    await page.setViewportSize({ width: 390, height: 900 });
    await setup(view, true);
    const scope = view === 'Stats' ? '.codex-substat-panel--umbra' : '.umbra-submenu';
    // The existing Codex layout is unchanged; exercise its real row without imposing a new mobile layout.
    await page.locator(`#intro-audit ${scope} .stat-container[data-stat="mysticism"]`).first().dispatchEvent('click');
    await helper.waitFor({ state: 'visible' });
    await verify('mysticism', `${view}/mobile-preview`);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
    const box = await helper.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 391, 'Helper stays inside mobile viewport');
    await helper.screenshot({ path: resolve(output, `${view === 'Stats' ? 'stats' : 'level-up'}-mobile.png`) });
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, count: checks.length, errors }, null, 2));
  console.log(JSON.stringify({ count: checks.length, umbras: 27, views: ['Stats', 'Level up'], previews: true, errors }));
} catch (error) {
  await writeFile(resolve(output, 'failure.txt'), String(error));
  throw error;
} finally {
  await browser?.close(); await new Promise(done => server.close(done));
}
