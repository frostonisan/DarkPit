import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/board-placement');
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const B = await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), E = await import("/js/entities/runtime.js");
    const U = await Promise.all([import("/js/ui/display.js"), import("/js/rendering/popups.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), S = await import("/js/storage/gameStorage.js");
    const L = await import('/js/board/deployment.js'), C = await import("/js/rendering/entities.js");
    window.levelRunning = 'placement-audit';
    E.entites.splice(0);
    document.body.innerHTML = '<div id="game-windows" style="opacity:1"><div id="game-container"><div class="Game-UI"></div><div class="Game-helper"></div></div></div>';
    document.dispatchEvent(new CustomEvent('biomeUpdated', { detail: 'prison' }));
    B.StageLoading();
    const grid = (rows, cols) => B.createHexGrid({ rows, cols, totalHexagons: rows * cols,
      hexWidth: 70, hexHeight: 80, staggeredRowHeight: 60, scale: 1 });
    grid(5, 10);
    U.toggleScanEntityListener();
    S.setVisibleHexes(false); U.HexButtonVisibility(false);
    const checks = [], check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const inspectVisibility = expected => {
      check(S.getVisibleHexes() === expected && U.soclesVisible === expected, 'Visibility preference and live state agree');
      check([...document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle')]
        .every(node => Math.abs(Number(getComputedStyle(node).opacity) - Number(expected)) < .01), 'Free hex visibility survives click bubbling and focus reset: ' + JSON.stringify({expected,values:[...new Set([...document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle')].map(n=>getComputedStyle(n).opacity))]}));
      check(document.getElementById(expected ? 'hide-hex' : 'see-hex').style.display === 'block', 'Correct visibility button is available');
    };
    window.__boardAudit = { B, E, U, S, L, C, grid, checks, check, inspectVisibility };
  });
  // Real bubbling clicks reproduce the global focus-reset regression.
  await page.locator('#see-hex').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle')]
    .every(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.evaluate(() => window.__boardAudit.inspectVisibility(true));
  await page.locator('#hide-hex').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle')]
    .every(node => Number(getComputedStyle(node).opacity) <= .01));
  await page.evaluate(() => window.__boardAudit.inspectVisibility(false));
  const report = await page.evaluate(async () => {
    const { E, U, S, L, C, grid, checks, check, inspectVisibility } = window.__boardAudit;
    const wait = async () => {
      // Visibility is animated; a fixed delay races the opacity transition.
      for (let attempt = 0; attempt < 100; attempt++) {
        const visible = Number(S.getVisibleHexes());
        if ([...document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle')].every(node => Math.abs(Number(getComputedStyle(node).opacity) - Number(node.style.opacity || visible)) < .01)) return;
        await new Promise(done => setTimeout(done, 50));
      }
      throw Error('Socle visibility did not settle within five seconds');
    };
    let changes = 0;
    window.addEventListener('visibleHexesChanged', () => changes++);
    for (let i = 0; i < 4; i++) U.LevelUi();
    document.getElementById('see-hex').click();
    await wait(); inspectVisibility(true);
    check(changes === 1, 'Repeated LevelUi initialization installs only one click handler');
    grid(7, 15); await wait(); inspectVisibility(true);
    document.body.click(); await wait(); inspectVisibility(true);
    document.getElementById('hide-hex').click(); await wait(); inspectVisibility(false);
    grid(5, 10); await wait(); inspectVisibility(false);
    const fixture = (side, position, role = ['tank']) => ({ id: 980000 + E.entites.length,
      name: 'Placement audit', type: 'sbire', side, position, role, stats: { HP: { current: 10, max: 10 } } });
    const add = (side, position, role) => {
      const entity = fixture(side, position, role);
      E.entites.push(entity);
      const box = document.createElement('div'); box.id = `Box_Entite_${entity.id}`;
      box.className = 'entite-box'; box.dataset.position = position || '';
      document.body.append(box);
      return { entity, box };
    };
    const verify = entries => {
      const occupied = new Set();
      for (const { entity, box } of entries) {
        const hex = box.closest('.hex');
        check(box.isConnected && Boolean(hex), `Entity ${entity.id} remains on the board`);
        check(hex.classList.contains(entity.side === 'neutral' ? 'Neutral' : `Side${entity.side}`), `Entity ${entity.id} stays in its camp`);
        check(entity.position === hex.dataset.position && box.dataset.position === entity.position, `Entity ${entity.id} model and DOM position agree`);
        check(hex.dataset.occupiedBy === String(entity.id) && hex.classList.contains('occupied'), `Entity ${entity.id} reserves its actual case`);
        check(!occupied.has(entity.position), 'No two entities share a case'); occupied.add(entity.position);
      }
    };
    const entries = [add('A', 'hex_1', ['mage']), add('A', 'hex_1', 'tank'),
      add('A', 'hex_10', ['fantassin']), add('A', 'hex_9999', 'unknown'),
      add('B', undefined, ['tank']), add('B', 'hex_2', 'mage'), add('neutral', undefined, 'gueux')];
    for (let i = 0; i < 9; i++) entries.push(add(i % 2 ? 'A' : 'B', undefined, i % 3 ? ['mage'] : 'tank'));
    L.positionnerEntites(); verify(entries);
    check(entries[0].entity.position === 'hex_1', 'Existing valid position is reserved before fallback allocation');
    check(entries[1].box.closest('.hex').dataset.role === 'tank', 'Duplicate position finds a free role case with string role');
    check(entries[2].box.closest('.hex').dataset.role === 'fantassin', 'Opposite-camp position finds a free role case');
    const same = entries.map(entry => entry.entity.position);
    L.positionnerEntites(); verify(entries);
    check(entries.every((entry, index) => entry.entity.position === same[index]), 'Repeated placement keeps valid positions');
    const originalNodes = entries.map(entry => entry.box);
    entries[0].box.classList.add('dead', 'focused');
    for (const [rows, cols] of [[7, 15], [5, 10], [6, 13], [7, 15], [5, 10]]) {
      grid(rows, cols); verify(entries);
      check(entries.every((entry, index) => document.getElementById(entry.box.id) === originalNodes[index]), 'Resize preserves the original entity nodes and listeners');
      check(entries[0].box.classList.contains('dead') && entries[0].box.classList.contains('focused'), 'Repositioning preserves unrelated combat state classes');
    }
    const beforeSpawn = entries.map(entry => entry.entity.position);
    const spawn = add('A', entries[0].entity.position, ['mage']);
    L.positionnerEntites(spawn.entity); verify([...entries, spawn]);
    check(entries.every((entry, index) => entry.entity.position === beforeSpawn[index]), 'Single-entity placement cannot move existing entities');
    // Nearest fallback uses old coordinates after renumbering, not only hex_N.
    E.entites.splice(0); [...entries, spawn].forEach(entry => entry.box.remove());
    grid(7, 15);
    const near = add('A', 'hex_96', 'unknown'); // row 6, col 5, lost on small board
    L.positionnerEntites(); near.entity.role = 'unknown'; grid(5, 10);
    check(near.entity.position === 'hex_44', 'Missing old case falls back to the nearest own-camp coordinate');
    // Real sprites retain canvas pixels, drag attributes and node identity.
    near.box.remove(); E.entites.splice(0);
    const real = structuredClone(E.entitesNestUp[0]);
    Object.assign(real, { id: 989991, side: 'A', position: 'hex_1', role: ['mage'] });
    E.entites.push(real);
    const created = C.createEntiteInDOM(real);
    const ready = await created.spriteReady;
    check(ready.loaded, 'Real entity sprite loads');
    L.positionnerEntites();
    const canvas = created.element.querySelector('canvas');
    const pixels = () => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    check(pixels(), 'Real sprite canvas contains visible pixels');
    let clicked = 0; created.element.addEventListener('click', () => clicked++);
    for (const size of [[7, 15], [5, 10]]) {
      grid(...size);
      check(created.element.querySelector('canvas') === canvas && pixels(), 'Resize preserves the rendered sprite canvas');
      created.element.click();
      check(created.element.querySelector('.sprite').draggable, 'Resize preserves entity drag behavior');
    }
    check(clicked === 2, 'Resize preserves entity event listeners');
    U.HexButtonVisibility(true); await wait();
    window.__boardAudit.real = real;
    return { count: checks.length, checks };
  });
  await page.screenshot({ path: resolve(output, 'resized-board.png') });
  report.levels = [];
  await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  for (const [label, opponents, savedPositions] of [
    ['small-to-large', 25, ['hex_13', 'hex_13', undefined]],
    ['large-to-small', 3, ['hex_105', 'hex_13', 'hex_13']],
  ]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    const level = await page.evaluate(async ({ label, opponents, savedPositions }) => {
      const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
      const { entitesNest } = await import("/js/data/entityTemplates.js");
      const G = await import("/js/app/stages.js");
      const template = entitesNest.find(entity => entity.serial === 900013);
      const actor = (index, side, position) => E.enrichEntityStats({ ...structuredClone(template),
        id: 991000 + index, side, level: 1, position, role: index % 2 ? 'mage' : ['tank'] });
      const allies = savedPositions.map((position, index) => actor(index, 'A', position));
      const enemies = Array.from({ length: opponents }, (_, index) => actor(100 + index, 'B', undefined));
      S.saveToLocalStorage('selectedArmyA', allies);
      S.saveToLocalStorage('ArmyB', { armies: { [`ArmyB_${label}`]: { entities: enemies, ArmyB_id: `ArmyB_${label}` } } });
      S.saveToLocalStorage('GameStages', { stages: [{ id: label, biome_serial: 'prison', difficulty: 1, level_type: 'scripted' }] });
      window.currentStageId = label; window.levelRunning = 'scripted';
      const loaded = await G.launchLevel({ biome: 'prison', difficulty: 1, levelId: label });
      if (!loaded) throw Error(`${label}: real level failed to load`);
      const positions = new Set();
      for (const entity of E.entites) {
        const box = document.getElementById(`Box_Entite_${entity.id}`), hex = box?.closest('.hex');
        if (!hex || !hex.classList.contains(`Side${entity.side}`)
          || entity.position !== hex.dataset.position || box.dataset.position !== entity.position
          || positions.has(entity.position)) throw Error(`${label}: invalid placement for ${entity.id}`);
        positions.add(entity.position);
      }
      if (E.entites.length !== allies.length + enemies.length) throw Error(`${label}: expected ${allies.length + enemies.length}, got ${E.entites.length}: ${E.entites.map(entity => `${entity.id}/${entity.side}`).join(', ')}`);
      return { label, loaded, entities: E.entites.length, positioned: positions.size,
        hexes: document.querySelectorAll('#hexGrid .hex').length };
    }, { label, opponents, savedPositions });
    report.levels.push(level);
    await page.locator('.loading-h2.loaded').click();
    await page.waitForFunction(() => !document.querySelector('.loading-screen')
      && document.querySelector('.hud-ingame')?.style.opacity === '1');
    await page.evaluate(() => {
      document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
      document.getElementById('game-windows').style.opacity = '1';
    });
    await page.screenshot({ path: resolve(output, `${label}.png`) });
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ count: report.count, last: report.checks.slice(-12), levels: report.levels, errors }));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
