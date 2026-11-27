import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname, relative, sep, posix } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const modules = (await readdir(resolve(root, 'js/ui'), { recursive: true }))
  .filter(file => file.endsWith('.js')).map(file => `js/ui/${file.replaceAll('\\', '/')}`);
const graph = new Map();
for (const file of modules) {
  const source = await readFile(resolve(root, file), 'utf8');
  assert.doesNotMatch(source, /from\s*['"][^'"]*(?:GameInit\.js|app\/startup\.js)/, `${file} must not depend on the bootstrap`);
  const imports = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]
    .map(([, ref]) => posix.normalize(posix.join(posix.dirname(file), ref)));
  graph.set(file, imports.filter(ref => modules.includes(ref)));
}
function visit(file, ancestors = []) {
  assert.ok(!ancestors.includes(file), `UI import cycle: ${[...ancestors, file].join(' -> ')}`);
  for (const child of graph.get(file) || []) visit(child, [...ancestors, file]);
}
for (const file of modules) visit(file);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/module-fixture.html') return res.end('<!doctype html><html><head><title>Module fixture</title></head><body></body></html>');
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = `http://127.0.0.1:${server.address().port}`;
try {
  // Import each public subsystem first in a fresh module graph. No bootstrap
  // ordering may be required to initialize its shared constants or registries.
  const independentFailures = [];
  const entriesToCheck = [...new Set(["entities/runtime", "combat/attackResolution", "combat/statistics", "entities/rules",
    "entities/statSystem", "entities/archetypes", "rendering/hud", "storage/gameStorage", "combat/vitals",
    "app/state", "combat/loop", "items/essenceInventory", "items/essences", 'items/resourceStocks',
    'items/itemManager', "entities/progression", "storage/entityStorage", 'procedural/proc-bareme',
    'data/loaderList', "debug/simulation", "combat/pause",
    ...modules.map(file => file.slice(3, -3))])];
  for (const entry of entriesToCheck) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/module-fixture.html');
    console.log(`Checking independent entry: ${entry}`);
    try {
      const catalogue = await page.evaluate(async name => {
        // No warm-up import: the selected subsystem must initialize first.
        const first = await import(`/js/${name}.js`);
        const runtime = await import('/js/entities/runtime.js');
        const { entitesNest } = await import('/js/data/entityTemplates.js');
        const entities = runtime.entitesNestUp;
        const references = entities.slice();
        const second = await import(`/js/${name}.js`);
        return {
          count: entities.length, expected: entitesNest.length,
          ready: entities.every(entity => Number.isFinite(entity.stats?.HP?.max)
            && Number.isFinite(entity.stats?.HP?.current) && Array.isArray(entity.attackDetails)),
          shared: first === second && entities === window.entitesNestUp
            && references.every((entity, index) => entity === runtime.entitesNestUp[index]),
        };
      }, entry);
      assert.ok(catalogue.count > 0, `Nonempty catalogue after importing ${entry}`);
      assert.equal(catalogue.count, catalogue.expected, `Complete catalogue after importing ${entry}`);
      assert.equal(catalogue.ready, true, `Enriched catalogue after importing ${entry}`);
      assert.equal(catalogue.shared, true, `Reimports preserve catalogue and module identity: ${entry}`);
      assert.deepEqual(errors, [], `Independent import: ${entry}`);
    } catch (error) {
      const failure = { entry, message: error.message.split('\n')[0] };
      independentFailures.push(failure);
      console.error('Independent import failed:', JSON.stringify(failure));
    } finally { await context.close(); }
  }
  // Parallel imports must also work without a preferred subsystem loading first.
  for (const entries of [entriesToCheck, [...entriesToCheck].reverse()]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '/module-fixture.html');
      await page.evaluate(async names => { await Promise.all(names.map(name => import(`/js/${name}.js`))); }, entries);
      assert.deepEqual(errors, [], 'Concurrent imports initialize without errors');
    } finally { await context.close(); }
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], requests = [], consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) consoleErrors.push(message.text());
  });
  page.on('request', request => requests.push(new URL(request.url()).pathname + new URL(request.url()).search));
  await page.addInitScript(() => {
    window.__uiRegistrations = 0;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(...args) { window.__uiRegistrations++; return add.apply(this, args); };
  });
  await page.goto(base + '/index.html');
  await page.locator('.Game-UI').waitFor({ state: 'attached' });
  const result = await page.evaluate(async () => {
    const game = await Promise.all([import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/inventory.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.assign({}, ...parts));
    const entries = await Promise.all([
      import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"),
      import("/js/ui/codex/stats.js"), import("/js/ui/codex/profile.js"), import('/js/ui/inventory.js'),
      import("/js/ui/application.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/helpers.js"),
    ]);
    const before = window.__uiRegistrations;
    for (let i = 0; i < 3; i++) for (const module of entries) {
      for (const [name, fn] of Object.entries(module)) if (/^initialize(?:AttackInterface|Codex|CodexProfile|CodexStats|Equipment|Inventory|PlayerMenus|PowerViews|StatHelpers)$/.test(name)) fn();
    }
    const attack = entries[0], codex = entries[1], inventory = entries[5], helpers = entries[8];
    const catalogue = await import('/js/data/attackList.js');
    const resolution = await import("/js/combat/attackResolution.js");
    return { before, after: window.__uiRegistrations,
      shared: game.MultiAttackDisplay === attack.MultiAttackDisplay && game.createCodexEntityScan === codex.createCodexEntityScan
        && game.createInventory === inventory.createInventory && game.helperEntityByRoot === helpers.helperEntityByRoot,
      constants: catalogue.ATTACK_ESSENCE_COLORS === resolution.ATTACK_ESSENCE_COLORS
        && catalogue.ATTACK_ESSENCE_MAX_SLOTS === resolution.ATTACK_ESSENCE_MAX_SLOTS,
      gameContainers: document.querySelectorAll('#game-container').length };
  });
  assert.equal(result.after, result.before, 'Repeated UI initialization adds no handlers');
  assert.equal(result.shared, true, 'Entry exports and direct module imports share functions and helper state');
  assert.equal(result.constants, true, 'Essence constants have a single catalogue owner');
  assert.equal(result.gameContainers, 1);
  assert.deepEqual(requests.filter(url => /^\/js\/debug\/admin\.js(?:\?|$)/.test(url)), ["/js/debug/admin.js"], 'One canonical admin module');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, [], 'Bootstrap and UI initialization emit no errors');
  await context.close();
  console.log(`PASS: ${modules.length} acyclic UI modules; one admin; shared exports and idempotent listeners.`);
  assert.deepEqual(independentFailures, [], 'All public subsystems initialize independently');
  console.log(`PASS: ${entriesToCheck.length} independent entries with complete catalogues; concurrent imports in both orders.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
