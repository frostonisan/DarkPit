import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export async function createStatusAudit({ output, install, before = false }) {
  output = resolve(output); await mkdir(output, { recursive: true });
  const root = resolve('docs'), sources = new Map(), hashes = {};
  for (const name of await readdir(root, { recursive: true })) {
    if (!/\.(js|html|css)$/.test(name)) continue;
    const relativeName = name.replaceAll('\\', '/');
    const backup = before && ['js/combat/control.js', 'js/combat/effects.js'].includes(relativeName);
    const bytes = await readFile(backup ? resolve('outputs/status-sleep-audit/before/docs', name) : resolve(root, name));
    sources.set(resolve(root, name), bytes);
    hashes[relativeName] = createHash('sha256').update(bytes).digest('hex');
  }
  await writeFile(resolve(output, 'source-hashes.json'), JSON.stringify(hashes, null, 2));
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/__status-audit.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`export const install = ${install.toString()};`);
    const file = resolve(root, '.' + path), rel = relative(root, file);
    if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
    try {
      let data = sources.get(file) || await readFile(file);
      if (path === "/js/debug/simulationRuntime.js") {
        assert.ok(data.toString().includes('  G.startGame();'));
        data = data.toString().replace('  G.startGame();', `  G.startGame();\n  if (input.validationCase) await (await import('/__status-audit.js')).install(input.validationCase);`)
          .replace('return { seed: input.seed, durationMs: time,', 'return { audit: window.__statusAudit || null, seed: input.seed, durationMs: time,');
      }
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), errors = [];
  async function fixture(config) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
    await page.addInitScript(() => {
      const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
      window.setTimeout = (...args) => (window.__testTimers?.setTimeout || timeout)(...args);
      window.clearTimeout = (...args) => (window.__testTimers?.clearTimeout || clear)(...args);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.evaluate(async config => {
      const U = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js"), Create = await import("/js/rendering/entities.js");
      const S = await import("/js/storage/gameStorage.js"), G = await import("/js/app/state.js"), F = await import("/js/combat/loop.js");
      const Clock = await import("/js/combat/clock.js"), Timeline = await import("/js/combat/timeline.js"), Sim = await import("/js/debug/simulation.js");
      const { balanceData } = await import('/js/data/balanceData.js'); balanceData.brokenSpell.chance.basePercent = 0;
      U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
      G.configureBattleActionManager({ createStartButton: e => e, createFleeButton: e => e, createQuitButton: e => e });
      document.querySelector('.worldmap')?.remove(); E.entites.length = 0;
      const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
      grid.style.cssText = 'position:absolute;left:20px;top:80px;width:1200px;height:600px'; document.getElementById('game-container').append(grid);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) {
        const hex = document.createElement('div'); hex.className = 'hex Neutral';
        Object.assign(hex.dataset, { row, col, position: `hex_${row * 14 + col}` });
        hex.style.cssText = `position:absolute;left:${col * 75 + row % 2 * 37}px;top:${row * 90}px;width:70px;height:80px`;
        hex.innerHTML = '<div class="socle"></div>'; grid.append(hex);
      }
      const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
      for (const [i, actor] of config.actors.entries()) {
        const side = actor.side, row = Math.floor(i / 2), col = side === 'A' ? 1 : 12;
        const hex = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        hex.classList.remove('Neutral'); hex.classList.add(`Side${side}`, 'occupied');
        const attacks = (actor.attacks || [{}]).map((attack, n) => ({
          attackId: `audit-${i}-${n}`, functionName: `audit-${i}-${n}`, displayName: `Attaque ${i}-${n}`, combatFunction: 'Attaquant',
          attacknature: ['physicalDamage'], attackRange: ['range'], attackTarget: ['enemy'], deadTarget: ['no'], effets: [], selfEffects: [],
          preparationTime: 500, executionTime: 300, recoveryTime: 300, cooldown: 3000,
          physicalRatio: 1, magicalRatio: 0, piercingRatio: 0, ...attack,
        }));
        const e = E.enrichEntityStats({ ...structuredClone(template), id: 998500 + i, name: `Sujet ${i}`, nickname: '',
          side, type: 'sbire', role: 'gueux', position: hex.dataset.position, level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
          baseStats: { HP: 1000, armor: 0, strength: 0, intelligence: 0, agility: 0, physicalDamage: 30, magicalDamage: 30,
            velocity: 0, speed: 1000, ...actor.stats }, attacks });
        e.statut = ['alive']; e.isDEAD = false; if (actor.hp != null) e.stats.HP.current = actor.hp;
        E.entites.push(e); const dom = Create.createEntiteInDOM(e); hex.append(dom.element); await dom.spriteReady;
      }
      window.test = { E, G, F, Clock, Timeline, Sim, config, snapshot: Sim.captureSimulationBoard() };
    }, config);
    return page;
  }
  async function simulate(page, config, seed, trace = true) {
    return page.evaluate(async ({ config, seed, trace }) => {
      try {
        return await test.Sim.simulateTrial(test.snapshot, { seed, durationMs: config.durationMs, trace, validationCase: config });
      } catch (error) {
        throw new Error(`${error.message}\n${JSON.stringify({ code: error.code, elapsedMs: error.elapsedMs, progress: error.progress })}`);
      }
    }, { config, seed, trace });
  }
  async function game(page, config, seed = 193, realTime = false) {
    return page.evaluate(async ({ config, seed, realTime }) => {
      const { G, F, Clock, Timeline } = test, date = Date.now, random = Math.random;
      let now = Date.now(), sequence = 0, rng = seed >>> 0; const epoch = now, timers = new Map(), journal = [];
      const channel = new MessageChannel(), flush = () => new Promise(done => { channel.port1.onmessage = done; channel.port2.postMessage(null); });
      if (!realTime) {
        window.__testTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++sequence; timers.set(id, { at: now + ms, fn: () => fn(...args) }); return id; }, clearTimeout: id => timers.delete(id) };
        Date.now = () => now;
      }
      Math.random = () => { rng += 0x6D2B79F5; let t = rng; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const listen = ({ detail: { type, data } }) => {
        if (type === 'audit') journal.push({ timeMs: Clock.clockNow() - epoch, type, ...structuredClone(data) });
        if (type === 'damage_resolution') journal.push({ timeMs: Clock.clockNow() - epoch, type, damage: data.damage,
          attacker: { id: data.attacker.id }, target: { id: data.target.id }, effect: data.attack?.effectName, types: data.attack?.types });
      };
      window.addEventListener('combatLogEntry', listen);
      try {
        F.initFightEntites(); G.startGame(); await (await import('/__status-audit.js')).install(config);
        if (realTime) await new Promise(done => setTimeout(done, config.durationMs + 100));
        else {
          const end = now + config.durationMs; let steps = 0;
          while (true) {
            await flush(); await Timeline.settleCombatTimeline(); await flush();
            const due = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
            if (!due || G.isBattleFinished()) break;
            if (++steps > 2000000) throw Error('Timer loop');
            const [id, task] = due; now = Math.max(now, task.at); timers.delete(id); task.fn();
          }
        }
        return { journal, audit: window.__statusAudit || null, durationMs: Clock.clockNow() - epoch, end: G.battleOutcome || 'timeout' };
      } finally {
        G.StopGame({ preserveScene: true }); window.removeEventListener('combatLogEntry', listen);
        Date.now = date; Math.random = random; delete window.__testTimers; channel.port1.close(); channel.port2.close();
      }
    }, { config, seed, realTime });
  }
  const save = (name, data) => writeFile(resolve(output, name), JSON.stringify(data, null, 2));
  const close = async () => { await browser.close(); await new Promise(done => server.close(done)); };
  return { fixture, simulate, game, save, close, errors, output };
}
