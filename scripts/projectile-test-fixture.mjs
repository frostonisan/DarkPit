import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { chromium } from 'playwright';

export async function createProjectileFixture(output) {
  const root = resolve('docs');
  await mkdir(output, { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const rel = relative(root, file);
    if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
    try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) { await new Promise(done => server.close(done)); throw error; }
  return {
    async open(options) {
      const context = await browser.newContext(options), page = await context.newPage();
      const errors = [], missing = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#game-container').waitFor({ state: 'attached' });
      await page.evaluate(async () => {
        window.renderer = await import('/js/rendering/animations.js');
        window.clock = await import('/js/combat/clock.js');
        document.getElementById('game-windows').style.display = 'none';
        const host = document.createElement('div');
        host.id = 'projectile-fixture';
        host.style.cssText = 'position:fixed;inset:0;pointer-events:none';
        host.innerHTML = [1, 2].map((id, i) => `<div id="sbire_99800${id}" style="position:absolute;left:${i ? 75 : 15}vw;top:45vh;width:24px;height:24px"></div>`).join('');
        document.body.append(host);
        window.actors = [{ id: 998001, type: 'sbire' }, { id: 998002, type: 'sbire' }];
        window.shots = [];
        window.launchShot = ({ duration = 1500, status = 'hit', nature = 'physicalDamage', scheduled = false } = {}) => {
          const shot = { id: `projectile-audit-${shots.length}`, hits: 0, logicalImpacts: 0 };
          shots.push(shot);
          const impact = scheduled ? new Promise(done => clock.setTimeout(() => {
            shot.logicalImpacts++; done(status);
          }, duration)) : null;
          shot.done = renderer.animationProjectile(actors[0], actors[1], () => {
            shot.hits++; return impact || status;
          }, { id: shot.id, executionTime: duration, attacknature: [nature], ...(impact ? { impactPromise: impact } : {}) })
            .then(result => { shot.result = result; return result; });
          return shot.id;
        };
        window.readShot = id => {
          const node = document.getElementById(id), child = node?.querySelector('.projectile');
          const rect = child?.getBoundingClientRect(), css = child && getComputedStyle(child);
          return { exists: Boolean(node?.isConnected), x: rect?.x, y: rect?.y, width: rect?.width, height: rect?.height,
            visibility: css?.visibility, opacity: css?.opacity, display: css?.display,
            transform: node?.style.transform, hits: shots.find(shot => shot.id === id)?.hits };
        };
      });
      return { page, context, errors, missing };
    },
    async close() { await browser.close(); await new Promise(done => server.close(done)); },
  };
}
