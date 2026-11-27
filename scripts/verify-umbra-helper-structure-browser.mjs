import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/umbra-subhelper-colors-20261126/browser');
const release = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = release.gameVersion || release.version;
const coverage = [];
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(page);
  await page.waitForFunction(version => document.querySelector('#game-version')?.textContent.includes(version), expectedVersion);
  const keys = await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), G = await import('/js/storage/gameStorage.js');
    const C = await import('/js/ui/statistics/components.js'), H = await import('/js/ui/statistics/helpers.js');
    const D = await import('/js/ui/statistics/details.js'), { stats } = await import('/js/data/statsData.js');
    const umbras = stats.filter(stat => stat.nature === 'umbra');
    const e = { id: 996711, name: 'Helpers', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 1000, strength: 50, intelligence: 50, agility: 25, physicalDamage: 30,
        physicalDamagePlus: 10, armor: 20, criticalChance: 7,
        ...Object.fromEntries(umbras.map(stat => [stat.key, 50])) } };
    E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, e);
    G.saveToLocalStorage('equippedItems', []); G.saveToLocalStorage('selectedArmyA', [e]);
    G.setAdminMode(false); window.levelRunning = 'worldmap';
    const host = document.createElement('main');
    host.className = 'codex-entity-scan codex-attack-stat-block';
    host.style.cssText = 'position:fixed;inset:0;padding:60px;background:#080b10;overflow:auto';
    document.getElementById('game-shell').append(host);
    window.audit = { e, E, G, H, D, stats, host, show(key) {
      H.closeOpenHelpers(); host.replaceChildren();
      const stat = stats.find(stat => stat.key === key);
      C.createUmbraBlock(host, stat.name, () => e.stats[key], e, key);
      let row = host.querySelector('.stat-container');
      if (!row) {
        row = document.createElement('div'); row.className = 'stat-container';
        row.dataset.stat = key; row.dataset.hover = 'true'; row.textContent = stat.name;
        host.append(row);
      }
      if (stat.nature !== 'umbra') row.dataset.autonomousHelper = 'true';
      row.style.height = 'max-content';
      H.bindHelperEntity(row, e); row.click();
    } };
    const before = JSON.stringify(e);
    for (const stat of umbras) {
      const value = D.calculateStatsDisplay(stat.key, e);
      if (!value.umbraPresentation?.entries.length) throw Error('Missing presentation: ' + stat.key);
      if (value.umbraPresentation.entries.some(entry => entry.value != null && !Number.isFinite(entry.value))) throw Error('Invalid amount: ' + stat.key);
    }
    if (before !== JSON.stringify(e)) throw Error('Helper changed gameplay state');
    return umbras.map(stat => stat.key);
  });
  const card = page.locator('.stat-hover[data-umbra-pinned="true"]:not([data-umbra-detail])');
  const details = page.locator('[data-umbra-detail]');
  const checkSubhelperColor = async (detail, label, expectedAttribute = null) => {
    const colors = await detail.evaluate(node => {
      const attribute = node.dataset.helperAttribute;
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(node).getPropertyValue('--color-' + attribute).trim();
      return { attribute, expected: probe.style.color,
        separators: [...node.querySelectorAll('.separation-line')].map(line => getComputedStyle(line).backgroundImage) };
    });
    if (expectedAttribute) assert.equal(colors.attribute, expectedAttribute, label + ': uses the described attribute');
    assert.ok(colors.expected && colors.separators.length >= 2, label + ': attribute color and separators exist');
    assert.ok(colors.separators.every(color => color.includes(colors.expected)), label + ': all separators use the attribute color');
    assert.equal(new Set(colors.separators).size, 1, label + ': header and footer have the same gradient');
  };
  const checkSubhelperPosition = async (detail, label) => {
    await checkSubhelperColor(detail, label);
    assert.equal(await detail.locator('[data-helper-close], .helper-close-button').count(), 0, label + ': no close cross');
    const placement = await detail.evaluate(async node => {
      const { overlayRect, overlayBounds } = await import('/js/ui/viewport.js');
      const rect = overlayRect(node, node), anchor = overlayRect(node, node._sourceAnchor), bounds = overlayBounds(node);
      const style = getComputedStyle(node);
      return { rect, anchor, bounds, nested: node._parentHelper?.hasAttribute('data-umbra-detail'),
        overflowX: style.overflowX, overflowY: style.overflowY, clipped: node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1 };
    });
    const { rect, anchor, bounds } = placement;
    assert.ok(rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, label + ': stays inside the visible area');
    assert.equal(placement.clipped, false, label + ': complete content fits its helper');
    assert.equal(placement.overflowX, 'visible', label + ': no horizontal scroll box');
    assert.equal(placement.overflowY, 'visible', label + ': no vertical scroll box');
    if (anchor.top >= bounds.top + 8 && anchor.top + rect.height <= bounds.bottom - 8) {
      assert.ok(Math.abs(rect.top - anchor.top) < 1, label + ': top aligns with the calling statistic');
    } else if (rect.height <= bounds.bottom - bounds.top - 16 && anchor.top + rect.height > bounds.bottom - 8) {
      assert.ok(Math.abs(rect.bottom - (bounds.bottom - 8)) < 1, label + ': rises just enough to show the bottom');
    }
    return placement;
  };
  const checkStatisticLines = async label => {
    const invalid = await card.locator('.umbra-effect-heading, .umbra-passive-value:has([data-helper-value])').evaluateAll(rows => rows.flatMap(row => {
      const elements = [row.querySelector('.umbra-effect-name'), row.querySelector('.umbra-value-control, [data-helper-value]'), row.querySelector('[data-umbra-inline-detail]:not([hidden])')].filter(Boolean);
      if (elements.length < 2) return [];
      const rects = elements.map(node => node.getBoundingClientRect());
      const oneLine = Math.max(...rects.map(rect => rect.top)) < Math.min(...rects.map(rect => rect.bottom));
      return oneLine && row.scrollWidth <= row.clientWidth + 1 ? [] : [row.textContent];
    }));
    assert.deepEqual(invalid, [], label + ': name, value, triangle and calculation stay on one line');
  };
  const signedSamples = {
    vitality: ['vitalityBonus', 'HpRegenAmount'], haste: ['hastePreparation', 'hasteCDReduc', 'hasteProjectilSpeed'],
    transcendence: ['transcendenceExBonus'], weaponMastery: ['weaponMasteryChargeBonus', 'weaponOrfevreBonus'],
    hypercognition: ['hypercognitionBonus', 'hypercognitionEssences'], bloodFury: ['bloodFuryBloodThirstyBonus'],
    occultism: ['occultismCritChanceBonus', 'occultismDodgeBonus'], mysticism: ['mysticismDamageBonus'],
    movement: ['movementMaxCharges', 'movementMarathonChance', 'movementTrailerChance'],
  };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const key of keys) {
      await page.evaluate(key => audit.show(key), key);
      await card.waitFor({ state: 'visible' });
      assert.equal(await card.locator('[data-umbra-info-toggle]').count(), 1, key + ': calculations control is available to players');
      assert.ok((await card.locator('.umbra-role').innerText()).length > 15, key + ': explanatory introduction');
      assert.match(await card.locator('.umbra-description').innerText(), /^Umbra /);
      assert.match(await card.locator('[data-umbra-section="introduction"]').innerText(), /^Confère/);
      assert.ok(await card.locator('[data-umbra-detail-toggle]').count());
      assert.equal(await card.locator('[data-umbra-inline-detail]:not([hidden])').count(), 0);
      assert.ok(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 2), key + ': no horizontal overflow');
      assert.doesNotMatch(await card.innerText(), /Détail du calcul|Ratio|NaN|undefined/);
      for (const id of signedSamples[key] || []) assert.match(await card.locator(`[data-helper-value="${id}"]`).innerText(), /^\+\s*\d/, key + ': additive bonus has a plus sign');
      if (key === 'astrality') for (const id of ['fatalSurvivalTotal', 'astralCooldown', 'astralReturn', 'astralBodyDuration']) {
        assert.doesNotMatch(await card.locator(`[data-helper-value="${id}"]`).first().innerText(), /^\+/, id + ': final chance, healing or duration is not presented as an additional statistic');
      }
      await checkStatisticLines(key + ' player');
      const appearance = await card.evaluate(root => {
        const model = audit.D.calculateStatsDisplay(root.dataset.stat, audit.e).umbraPresentation;
        const failures = [];
        const color = key => {
          const probe = document.createElement('span');
          probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--color-' + key).trim();
          return probe.style.color;
        };
        for (const entry of model.entries) {
          if (!entry.gradient) continue;
          const title = root.querySelector(`[data-helper-entry="${entry.id}"].umbra-effect-name > [data-stat-state="X"]`);
          const number = root.querySelector(`[data-helper-value="${entry.id}"] .helper-figure > [data-stat-state="X"]`);
          for (const [kind, text] of [['title', title], ...(entry.value == null ? [] : [['number', number]])]) {
            if (!text) { failures.push(entry.id + ': missing gradient ' + kind); continue; }
            const css = getComputedStyle(text);
            for (const key of [...entry.gradient.from, entry.gradient.to]) {
              if (!color(key) || !css.backgroundImage.includes(color(key))) failures.push(entry.id + ': wrong ' + kind + ' color ' + key + ': ' + css.backgroundImage);
            }
            if (css.webkitTextFillColor !== 'rgba(0, 0, 0, 0)') failures.push(entry.id + ': gradient hidden by text fill');
          }
        }
        const expectedGifts = model.entries.filter(entry => entry.total?.system?.umbraFlat).map(entry => [entry.stat, entry.total.system.umbraFlat]);
        const knownOrigins = { vigueur: { physicalDamageUmbraGrant: 'strength' },
          astrality: { fatalSurvivalTotal: 'intelligence', astralCooldown: 'agility', astralReturn: 'strength', astralBodyUmbraGrant: 'intelligence' },
          vitality: { vitalityBonus: 'vitality', HpRegenAmount: 'vitality' },
          haste: { hastePreparation: 'intelligence', hasteExecutionReduc: 'strength', hasteRecupReduc: 'agility' } }[root.dataset.stat] || {};
        for (const [id, origin] of Object.entries(knownOrigins)) {
          const entry = model.entries.find(entry => entry.id === id);
          if (!entry?.gradient?.from.includes(origin)) failures.push(id + ': wrong ratio attribute, expected ' + origin);
        }
        const displayed = model.directGrants.map(gift => [gift.stat, gift.value]);
        for (const gift of model.directGrants) {
          if (!root.querySelector(`[data-umbra-section="introduction"] [data-helper-source="umbra-grant-${gift.stat}"] .picto-stat.${gift.stat}`)) failures.push('Missing direct gift ' + gift.stat);
        }
        return { failures, expectedGifts, displayed };
      });
      assert.deepEqual(appearance.failures, [], key + ': source-to-Umbra gradients and direct grants');
      assert.deepEqual(appearance.displayed, appearance.expectedGifts, key + ': Confère follows engine flat bonuses');
      const actual = await card.locator('[data-helper-value]').first().getAttribute('data-helper-value');
      await card.locator('[data-helper-value]').first().click();
      assert.ok((await details.last().innerText()).length > 10, key + ': value has a helper');
      assert.equal(await details.locator('[data-helper-technical]').count(), 0);
      await checkSubhelperPosition(details.last(), key);
      await page.keyboard.press('Escape');
      assert.ok(actual);
      const auditResult = await card.evaluate(root => {
        const selector = '[data-helper-entry], [data-helper-value], [data-helper-source], [data-helper-picto-stat], [data-helper-stat-value]';
        const anchors = [...root.querySelectorAll(selector)].filter(node => node.tabIndex >= 0 && node.getClientRects().length);
        const failed = [];
        for (const anchor of anchors) {
          anchor.focus();
          const detail = [...document.querySelectorAll('[data-umbra-detail]')].find(node => node._sourceAnchor === anchor);
          const text = detail?.querySelector('.stat-hover-body')?.textContent.trim();
          if (!detail?.isConnected || !text || /undefined|NaN/.test(text)) failed.push({ label: anchor.textContent, data: { ...anchor.dataset } });
          if (detail?.querySelector('[data-helper-technical]')) failed.push({ label: anchor.textContent, reason: 'Player technical leak' });
          if (detail?.querySelector('[data-helper-close], .helper-close-button')) failed.push({ label: anchor.textContent, reason: 'Unexpected close cross' });
          if (detail) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          anchor.blur();
        }
        return { count: anchors.length, failed };
      });
      assert.deepEqual(auditResult.failed, [], key + ': every key element opens its contextual helper');
      coverage.push({ key, width, anchors: auditResult.count });
      for (const id of ['umbra-category', 'umbra-rank', 'umbra-grant']) assert.equal(await card.locator('[data-helper-source="' + id + '"]').count(), 1);
      assert.equal(await card.locator('.umbra-passive-icon').count(), await card.locator('[data-umbra-passive]').count());
      assert.equal(await card.locator('.umbra-passive-value').count(), await card.locator('[data-umbra-passive]').count(), key + ': centered passive lines');

    }
    await page.evaluate(() => audit.show('vitality'));
    const baseline = await card.locator('[data-umbra-capacity="vitalityBonus"] .umbra-effect-sentence').evaluate(sentence => {
      const source = sentence.querySelector('[data-helper-source="umbra-hp-maximum"]');
      const measure = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().top; };
      return { prefix: measure(sentence.firstChild), link: measure(source.firstChild), display: getComputedStyle(source).display, align: getComputedStyle(source).verticalAlign };
    });
    assert.ok(Math.abs(baseline.prefix - baseline.link) < .5, 'Vitality prose and linked words share the same baseline');
    assert.equal(baseline.display, 'inline');
    assert.equal(baseline.align, 'baseline');
    await page.mouse.move(2, 2);
    await card.evaluate(node => new Promise(resolve => { const check = () => Number(getComputedStyle(node).opacity) >= .99 ? resolve() : requestAnimationFrame(check); check(); }));
    await card.screenshot({ path: resolve(output, `vitalite-player-${width}.png`) });
    await page.evaluate(() => audit.show('vigueur'));
    const directGrant = card.locator('[data-umbra-section="introduction"] [data-helper-source="umbra-grant-physicalDamage"]');
    assert.match(await directGrant.innerText(), /50/);
    await directGrant.locator('.picto-stat').click();
    assert.equal(await details.last().locator('[data-helper-technical], .helper-player-value').count(), 0, 'Confère pictogram describes its statistic');
    await page.keyboard.press('Escape');
    await directGrant.locator('.helper-figure > span:last-child').click();
    assert.match(await details.last().innerText(), /Puissance [Pp]hysique/);
    assert.doesNotMatch(await details.last().innerText(), /Bonus direct|Total de l’entité|50/);
    const directPosition = await checkSubhelperPosition(details.last(), 'PP direct bonus');
    assert.ok(directPosition.rect.top <= directPosition.anchor.top + 1, 'A low anchor can lift its helper without clipping it');
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) >= .99));
    await page.screenshot({ path: resolve(output, `vigueur-subhelper-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.evaluate(() => audit.show('astrality'));
    await page.mouse.move(2, 2);
    await card.evaluate(node => new Promise(resolve => { const check = () => Number(getComputedStyle(node).opacity) >= .99 ? resolve() : requestAnimationFrame(check); check(); }));
    await card.screenshot({ path: resolve(output, `astralite-player-${width}.png`) });
    await card.locator('[data-helper-entry="astralReturn"] .umbra-passive-icon').click();
    assert.match(await details.last().innerText(), /Passive exclusive d’Astralité/);
    assert.doesNotMatch(await details.last().innerText(), /Force|ratio|10 % vers/);
    await page.keyboard.press('Escape');
    await card.locator('[data-helper-value="astralReturn"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await details.last().innerText(), /35.19/);
    assert.equal(await details.locator('[data-helper-technical]').count(), 0);
    await page.keyboard.press('Escape');
    await card.locator('.umbra-title-content').click();
    assert.match(await details.last().innerText(), /Umbra : Astralité/);
    assert.equal(await details.locator('[data-umbra-layout="card"]').count(), 0, 'Umbra subhelper stays compact');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#game-version').isVisible());

    await page.evaluate(() => audit.G.setAdminMode(true));
    for (const key of keys) {
      await page.evaluate(key => audit.show(key), key);
      await card.locator('.umbra-effect-name').first().click();
      assert.equal(await details.last().locator('[data-helper-technical], .helper-player-value').count(), 0, key + ': name explains the statistic even in admin');
      await page.keyboard.press('Escape');
      await card.locator('[data-umbra-capacity] [data-helper-value]').first().click();
      assert.equal(await details.last().locator('[data-helper-technical]').count(), 1, key + ': number opens the calculation');
      assert.equal(await details.last().locator('.helper-player-description').count(), 0, key + ': number helper is dedicated to the calculation');
      assert.match(await details.last().innerText(), /Détail du calcul/);
      await checkSubhelperPosition(details.last(), key + ' admin value');
      await page.keyboard.press('Escape');
      const toggle = card.locator('[data-umbra-info-toggle]');
      const formulas = card.locator('[data-umbra-inline-detail]');
      assert.ok(await formulas.count(), key + ': calculation lines restored');
      assert.ok(await formulas.evaluateAll(nodes => nodes.every(node => node.hidden)), key + ': starts collapsed');
      const originalCard = await card.elementHandle();
      const originalBody = await card.locator('.stat-hover-body').elementHandle();
      const values = await card.locator('[data-helper-value]').allTextContents();
      const initialWidth = await card.evaluate(node => node.getBoundingClientRect().width);
      const initialLogicalWidth = await card.evaluate(node => parseFloat(getComputedStyle(node).width));
      await checkStatisticLines(key + ' collapsed');
      const headings = card.locator('[data-umbra-detail-toggle]');
      const local = card.locator('[data-umbra-capacity] [data-umbra-detail-toggle]').first();
      assert.equal(await card.locator('[data-umbra-section="introduction"] [data-umbra-detail-toggle], [data-umbra-section="introduction"] [data-umbra-inline-detail]').count(), 0, key + ': Confère has no calculation control or formula');
      const collapsedPositions = await card.locator('.umbra-effect-heading:has(> .umbra-value-calculation)').evaluateAll(rows => rows.map(row => {
        const label = row.querySelector('.umbra-effect-name').getBoundingClientRect();
        const group = row.querySelector('.umbra-value-calculation').getBoundingClientRect();
        const value = row.querySelector('[data-helper-value]').getBoundingClientRect();
        const bounds = row.getBoundingClientRect();
        return { label, group, value, bounds };
      }));
      for (const position of collapsedPositions) {
        assert.ok(Math.abs(position.label.left - position.bounds.left) < 1, key + ': statistic name stays left aligned');
        assert.ok(Math.abs(position.group.right - position.bounds.right) < 1, key + ': total and triangle stay right aligned');
      }
      if (['robustness', 'astrality'].includes(key)) {
        await page.mouse.move(2, 2);
        await card.screenshot({ path: resolve(output, `${key}-collapsed-${width}.png`) });
      }
      assert.equal(await headings.count(), await formulas.count());
      assert.ok(await headings.evaluateAll(nodes => nodes.every(node => node.textContent === '▶'
        && node.previousElementSibling?.matches('[data-helper-value]')
        && node.getBoundingClientRect().left >= node.previousElementSibling.getBoundingClientRect().right - 1)), key + ': triangles follow their number');
      assert.doesNotMatch(await card.innerText(), /Détail du calcul/);
      await local.click();
      assert.equal(await formulas.evaluateAll(nodes => nodes.filter(node => !node.hidden).length), 1, key + ': triangle opens only its own calculation');
      assert.equal(await details.count(), 0, key + ': triangle never opens a subhelper: ' + JSON.stringify(await details.evaluateAll(nodes => nodes.map(node => node._sourceAnchor?.outerHTML))));
      await local.focus();
      await page.keyboard.press('Enter');
      assert.ok(await formulas.evaluateAll(nodes => nodes.every(node => node.hidden)), key + ': keyboard closes the individual calculation');
      if (await formulas.count() > 1) await local.click();
      await toggle.click();
      assert.equal(await details.count(), 0, key + ': i never opens another helper: ' + JSON.stringify(await details.evaluateAll(nodes => nodes.map(node => node._sourceAnchor?.outerHTML))));
      assert.equal(await card.evaluate((node, original) => node === original, originalCard), true);
      assert.equal(await card.locator('.stat-hover-body').evaluate((node, original) => node === original, originalBody), true, 'Opening calculations reuses the existing body');
      assert.ok(await formulas.evaluateAll(nodes => nodes.every(node => !node.hidden && node.textContent.trim())), key + ': global control opens all formulas');
      assert.ok(await headings.evaluateAll(nodes => nodes.every(node => node.getClientRects().length && node.getAttribute('aria-expanded') === 'true')), 'Global control synchronizes every triangle');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await card.locator('[data-helper-value]').allTextContents(), values, 'Displayed effect values do not change');
      const expandedWidth = await card.evaluate(node => node.getBoundingClientRect().width);
      assert.ok(expandedWidth >= initialWidth - 1, key + ': opening calculations may widen the card');
      if (key === 'criticalPower') assert.ok(await card.evaluate(node => parseFloat(getComputedStyle(node).width)) > initialLogicalWidth + 1, 'Critical chance widens the card to keep its formula on the same line');
      await checkStatisticLines(key + ' expanded');
      assert.doesNotMatch(await card.innerText(), /undefined|NaN/);
      assert.ok(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 2), key + ': expanded card fits viewport');
      if (['vigueur', 'criticalPower'].includes(key)) {
        await page.mouse.move(2, 2);
        await card.screenshot({ path: resolve(output, `${key}-inline-expanded-${width}.png`) });
      }
      if (key === 'criticalPower') {
        await card.evaluate(async node => {
          const { overlayBounds, overlayRect } = await import('/js/ui/viewport.js');
          const bounds = overlayBounds(node), rect = overlayRect(node, node);
          node.style.top = `${Math.max(bounds.top + 8, bounds.bottom - rect.height - 8)}px`;
        });
        await card.locator('[data-helper-value="criticalDamageTotal"]').click();
        const placement = await checkSubhelperPosition(details.last(), 'Critical passive near bottom');
        assert.ok(placement.rect.top < placement.anchor.top - 10, 'Low critical passive helper is raised to remain readable');
        await page.mouse.move(2, 2);
        await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) >= .99));
        await page.screenshot({ path: resolve(output, `critical-passive-raised-${width}.png`) });
        await page.keyboard.press('Escape');
      }
      await toggle.click();
      assert.ok(await formulas.evaluateAll(nodes => nodes.every(node => node.hidden)), key + ': second click collapses all formulas');
      assert.ok(Math.abs(await card.evaluate(node => node.getBoundingClientRect().width) - initialWidth) < 1, key + ': closing calculations restores compact width');
      assert.ok(await headings.evaluateAll(nodes => nodes.every(node => node.getClientRects().length && node.getAttribute('aria-expanded') === 'false')), 'Individual controls stay available when calculations are hidden');
      assert.equal(await details.count(), 0);
      await toggle.focus();
      await page.keyboard.press('Enter');
      assert.ok(await formulas.evaluateAll(nodes => nodes.every(node => !node.hidden)), key + ': keyboard expands in place');
      assert.equal(await details.count(), 0);
      if (key === 'astrality') {
        assert.equal(await formulas.count(), 4);
        assert.equal(await card.locator('.umbra-effect-sentence [data-umbra-detail-toggle]').count(), 1, 'Only the main Return value has a triangle inside an explanatory sentence');
        assert.equal(await card.locator('.umbra-unique-passive .umbra-passive-icon').count(), 2);
        for (const attribute of ['strength', 'agility', 'intelligence']) {
          const attributeRatio = card.locator(`[data-helper-ratio][data-ratio-stat="${attribute}"]`).first();
          await attributeRatio.locator('.helper-figure > span:not(.picto-stat)').click();
          await checkSubhelperColor(details.last(), attribute + ' ratio', attribute);
          if (width === 1440) {
            await page.mouse.move(2, 2);
            await details.last().evaluate(node => new Promise(resolve => {
              const check = () => Number(getComputedStyle(node).opacity) >= .99 ? resolve() : requestAnimationFrame(check); check();
            }));
            await details.last().screenshot({ path: resolve(output, `${attribute}-ratio.png`) });
          }
          await page.keyboard.press('Escape');
        }
        const ratio = card.locator('[data-helper-ratio][data-ratio-stat="intelligence"]').first();
        await card.locator('[data-umbra-inline-detail] .picto-stat.intelligence').first().click();
        assert.equal(await details.last().locator('[data-helper-technical]').count(), 0, 'A ratio pictogram describes the attribute');
        assert.match(await details.last().innerText(), /Intelligence/);
        await page.keyboard.press('Escape');
        await ratio.locator('.helper-figure > span:not(.picto-stat)').click();
        assert.match(await details.last().innerText(), /Ratio|ratio/);
        await checkSubhelperPosition(details.last(), 'Ratio subhelper');
        assert.equal(await details.last().locator('.helper-score-total').count(), 0, 'A coefficient helper has no entity total');
        await page.keyboard.press('Escape');
        assert.equal(await details.count(), 0, 'Escape closes the only detail and keeps the card');
        await toggle.click();
        assert.equal(await details.count(), 0, 'Collapsing calculations closes their pinned subhelpers');
        await toggle.click();
        await card.evaluate(node => new Promise(resolve => { const check = () => Number(getComputedStyle(node).opacity) >= .99 ? resolve() : requestAnimationFrame(check); check(); }));
        await card.screenshot({ path: resolve(output, `astralite-admin-expanded-${width}.png`) });
      }
      await originalCard.dispose();
      await originalBody.dispose();
      await toggle.click();
    }
    // The UI keeps one Umbra card open at a time: the preference must follow
    // navigation to every other Umbra, rather than belong to that DOM node.
    await page.evaluate(() => audit.show('astrality'));
    await card.locator('[data-umbra-info-toggle]').click();
    await page.evaluate(() => audit.show('vigueur'));
    assert.ok(await card.locator('[data-umbra-info-toggle], [data-umbra-detail-toggle]').evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-expanded') === 'true')), 'Global activation synchronizes all controls on another Umbra');
    await page.evaluate(() => audit.show('adresse'));
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => !node.hidden)), 'Future cards inherit global activation');
    await card.locator('[data-umbra-detail-toggle]').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await card.locator('[data-umbra-calculation-details]').evaluateAll(nodes => nodes.filter(node => node.hidden).length), 1, 'A triangle closes one formula after global activation');
    assert.ok(await card.locator('[data-umbra-info-toggle]').evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-expanded') === 'false')));
    await page.evaluate(() => audit.show('esprit'));
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => !node.hidden)), 'Individual choices do not change the global preference for other cards');
    await card.locator('[data-umbra-info-toggle]').click();
    await page.evaluate(() => audit.show('adresse'));
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.every(node => node.hidden)), 'A new global command clears prior individual choices');
    await page.evaluate(() => audit.G.setAdminMode(false));
    assert.equal(await details.count(), 0, 'Player mode closes technical subhelpers');
    assert.equal(await card.locator('[data-umbra-info-toggle]').count(), 1, 'Player mode retains its global details control');
    assert.ok(await card.locator('[data-umbra-inline-detail]').count(), 'Player mode retains inline ratios');
  }

  await page.evaluate(() => audit.show('astrality'));
  await card.locator('[data-helper-value="fatalSurvivalHP"]').click();
  assert.match(await details.last().innerText(), /1 HP/);
  assert.doesNotMatch(await details.last().innerText(), /Valeur actuelle/);
  await page.keyboard.press('Escape');
  await card.locator('[data-helper-value="astralBodyCheck"]').click();
  assert.match(await details.last().innerText(), /Intervalle d’activation/);
  assert.match(await details.last().innerText(), /3 s/);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { audit.G.setAdminMode(true); audit.show('astrality'); });
  await card.locator('[data-umbra-info-toggle]').click();
  const cooldownToggle = card.locator('[data-umbra-detail-toggle="astralCooldown"]');
  const cooldownScope = await cooldownToggle.getAttribute('data-umbra-detail-toggle');
  await cooldownToggle.click();
  await card.locator('[data-helper-value="astralReturn"]').click();
  assert.equal(await details.last().locator('[data-helper-technical]').count(), 1);
  assert.match(await details.last().innerText(), /Soin :.*100.*98/);
  await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'astralite-admin-value.png') });
  const prior = await card.locator('[data-helper-value="astralReturn"]').innerText();
  await page.evaluate(() => {
    audit.e.baseStats.strength = 100;
    audit.E.recomputeEntityStats(audit.e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity: audit.e } }));
  });
  await page.waitForFunction(prior => document.querySelector('[data-helper-value="astralReturn"]').textContent !== prior, prior);
  assert.equal(await details.locator('[data-helper-technical]').count(), 1, 'Live refresh preserves pinned value helper');
  assert.equal(await card.locator('[data-umbra-info-toggle]').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.filter(node => node.hidden).map(node => node.dataset.umbraCalculationDetails)), [cooldownScope], 'Live refresh preserves the individual closed calculation and the other open calculations');
  await card.locator('[data-umbra-info-toggle]').click();
  assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length === 4 && nodes.every(node => !node.hidden)), 'Global activation replaces individual choices after refresh');
  await page.evaluate(() => audit.G.setAdminMode(false));
  assert.equal(await details.count(), 0, 'Turning admin off closes technical helpers immediately');
  await card.locator('[data-helper-value="astralReturn"]').click();
  assert.equal(await details.locator('[data-helper-technical]').count(), 0, 'Reopening in player mode cannot leak admin details');
  await page.evaluate(() => audit.show('vigueur'));
  assert.match(await card.innerText(), /Renforce grandement la puissance physique/);
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.umbra-helper-card')).opacity) >= .99);
  await card.screenshot({ path: resolve(output, 'vigueur-player.png') });
  // Preserve grant/total/conversion guarantees of the former card layout.
  for (const sample of [
    { key: 'esprit', inputs: { esprit: 1, intelligence: 6, magicalDamage: 6 }, grant: 5, total: 11 },
    { key: 'finesse', inputs: { finesse: 2, agility: 6, piercingDamage: 2 }, grant: 7, total: 9 },
    { key: 'integrite', inputs: { integrite: 3, intelligence: 6, magicalResistance: 50 }, grant: 9, total: 59, effect: '45.74' },
  ]) {
    await page.evaluate(sample => {
      audit.e.baseStats = { HP: 1000, ...sample.inputs };
      audit.E.recomputeEntityStats(audit.e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      audit.show(sample.key);
    }, sample);
    const value = card.locator('[data-umbra-capacity] [data-helper-value]').first();
    assert.equal(Number((await value.innerText()).replace(/[^\d.\-]/g, '')), sample.grant, sample.key + ': direct grant plus ratio contribution, excluding other sources');
    await value.click();
    assert.equal(Number((await details.last().locator('.helper-score-total .helper-figure').innerText()).replace(/[^\d.\-]/g, '')), sample.total, sample.key + ': entity total retains autonomous contributions');
    if (sample.effect) assert.ok((await details.last().locator('.helper-total-effect').innerText()).includes(sample.effect));
  }
  for (const points of [0, 33, 151, 2000, 123456789012345]) {
    const invalid = await page.evaluate(points => {
      const before = JSON.stringify(audit.e);
      const invalid = [];
      for (const stat of audit.stats.filter(stat => stat.nature === 'umbra')) {
        if (points > 2000 && !['esprit', 'integrite'].includes(stat.key)) continue;
        const e = { ...structuredClone(audit.e), baseStats: { HP: 1000, strength: 25, intelligence: 25, agility: 25, [stat.key]: points } };
        audit.E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
        const snapshot = JSON.stringify(e), result = audit.D.calculateStatsDisplay(stat.key, e);
        if (/NaN|undefined/.test(result.helpContent) || snapshot !== JSON.stringify(e)) invalid.push(stat.key);
      }
      if (before !== JSON.stringify(audit.e)) invalid.push('fixture mutated');
      return invalid;
    }, points);
    assert.deepEqual(invalid, [], 'Zero, threshold overflow and large values keep valid read-only helpers');
  }
  await page.evaluate(() => {
    audit.e.baseStats = { HP: 1000, robustness: 12, strength: 25 };
    audit.E.recomputeEntityStats(audit.e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const armor = audit.e.stats.armor; armor.stuffMax += 17; armor.totalMax += 17;
    audit.show('robustness');
  });
  await card.locator('[data-umbra-capacity] [data-helper-value]').first().click();
  assert.ok((await details.last().innerText()).includes(String(await page.evaluate(() => audit.e.stats.armor.totalMax))), 'Armor explanation retains the equipment pool');
  await page.evaluate(() => audit.show('haste'));
  assert.deepEqual(await card.locator('[data-umbra-capacity]').evaluateAll(nodes => nodes.map(node => node.dataset.umbraCapacity)), ['hastePreparation', 'hasteCDReduc', 'hasteExecutionReduc', 'hasteProjectilSpeed', 'hasteRecupReduc']);
  await page.evaluate(() => audit.show('vision'));
  assert.equal(await card.locator('[data-umbra-passive="bullsEye"]').count(), 1);
  assert.doesNotMatch(await card.innerText(), /Bull’s Eye X/);
  const statKeys = await page.evaluate(() => audit.stats.filter(stat => stat.nature === 'statistic').map(stat => stat.key));
  for (const key of statKeys) {
    await page.evaluate(key => audit.show(key), key);
    await card.waitFor({ state: 'visible' });
    assert.ok((await card.innerText()).length > 12, key + ': a player helper exists');
    assert.equal(await card.locator('[data-helper-technical], .helper-calculation-detail').count(), 0, key + ': no player formula');
  }
  await page.evaluate(() => audit.show('astrality'));
  await card.locator('[data-helper-value="astralReturn"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await details.count(), 0);
  assert.equal(await card.count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await card.count(), 0);
  await page.evaluate(() => { audit.show('astrality'); audit.host.remove(); });
  await page.waitForFunction(() => !document.querySelector('[data-umbra-pinned]'));
  await page.reload();
  await page.waitForFunction(version => document.querySelector('#game-version')?.textContent.includes(version), expectedVersion);
  assert.ok(await page.locator('#game-version').isVisible());
  await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), G = await import('/js/storage/gameStorage.js');
    const C = await import('/js/ui/statistics/components.js'), H = await import('/js/ui/statistics/helpers.js');
    const e = { id: 996712, name: 'Global calculation preference', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 1000, astrality: 50, strength: 50, intelligence: 50, agility: 25 } };
    E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const host = document.createElement('main'); host.className = 'codex-entity-scan codex-attack-stat-block';
    document.getElementById('game-shell').append(host);
    G.setAdminMode(true);
    C.createUmbraBlock(host, 'Astralité', () => e.stats.astrality, e, 'astrality');
    const row = host.querySelector('.stat-container'); H.bindHelperEntity(row, e); row.click();
  });
  assert.equal(await card.locator('[data-umbra-info-toggle]').getAttribute('aria-expanded'), 'true', 'Global preference survives reload and leaving player mode');
  assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length === 4 && nodes.every(node => !node.hidden)));
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'coverage.json'), JSON.stringify({ version: expectedVersion, coverage, errors }, null, 2));
  console.log(`${keys.length} Umbras on desktop/mobile; ${statKeys.length} statistic helpers; player/admin separation; keyboard; live refresh; mode downgrade; version reload.`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
