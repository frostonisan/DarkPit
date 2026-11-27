import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('docs');
const output = resolve(process.env.HEX_ROLE_OUTPUT || 'outputs/hex-role-visibility');
await mkdir(output, { recursive: true });
const html = '<!doctype html><link rel="stylesheet" href="/css/combat.css"><link rel="stylesheet" href="/css/animation.css">'
  + '<style>body{margin:0;background:#171717}#hexGrid{position:absolute;left:80px;top:140px;width:800px;height:250px;--w:160px;--h:180px}'
  + '.hex .socle{opacity:1}.hex-details{color:white}</style><div id="hexGrid"></div><style id="reference"></style>';
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const safari = process.env.HEX_ROLE_ENGINE === 'webkit';
const browser = await (safari ? webkit : chromium).launch({ headless: true, ...(safari ? {} : { channel: 'chrome' }) });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 550 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const cases = [
    { name: 'hidden', state: 'hidden', time: 0 },
    { name: 'enter', state: 'enter', time: 450 },
    { name: 'visible', state: 'enter', time: 1500 },
    { name: 'leave', state: 'leave', time: 750 },
    { name: 'leave-end', state: 'leave', time: 1501 },
    { name: 'reverse', state: 'reverse', time: 120 },
  ];
  const report = [];
  for (const scenario of cases) {
    const current = await page.evaluate(scenario => {
      document.querySelector('#reference').textContent = '';
      const grid = document.querySelector('#hexGrid');
      grid.innerHTML = ['neutre', 'tank', 'fantassin', 'mage'].map((role, i) =>
        `<div class="hex" data-position="${i}" style="left:${i * 195}px;top:0"><div class="socle ${role}"><div class="image-role-hex-info"></div><div class="hex-details">${role}</div></div></div>`).join('');
      const icons = [...grid.querySelectorAll('.image-role-hex-info')];
      const flush = () => icons.map(icon => getComputedStyle(icon).opacity);
      const seek = time => { for (const icon of icons) for (const animation of icon.getAnimations()) {
        animation.pause(); animation.currentTime = animation.animationName === 'Pulsation' ? 1234 : time;
      } flush(); };
      flush(); seek(0);
      window.originalPulses = icons.map(icon => icon.getAnimations().find(a => a.animationName === 'Pulsation'));
      if (scenario.state !== 'hidden') {
        for (const hex of grid.children) hex.classList.add('hovered');
        flush(); seek(scenario.state === 'enter' ? scenario.time : 1500);
        if (scenario.state === 'leave' || scenario.state === 'reverse') {
          for (const hex of grid.children) hex.classList.remove('hovered');
          flush(); seek(scenario.state === 'leave' ? scenario.time : 300);
          if (scenario.state === 'reverse') {
            for (const hex of grid.children) hex.classList.add('hovered');
            flush(); seek(scenario.time);
          }
        }
      }
      window.sampleRoles = () => icons.map((icon, i) => {
        const css = getComputedStyle(icon), rect = icon.getBoundingClientRect();
        const pulse = icon.getAnimations().find(a => a.animationName === 'Pulsation');
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { opacity: css.opacity, visibility: css.visibility, transform: css.transform,
          rect: [rect.x, rect.y, rect.width, rect.height], image: css.backgroundImage,
          samePulse: pulse === originalPulses[i], pulseTime: pulse.currentTime,
          duration: pulse.effect.getTiming().duration, hitHex: hit?.closest('.hex')?.dataset.position || null };
      });
      return sampleRoles();
    }, scenario);
    await page.screenshot({ path: resolve(output, `${scenario.name}-current.png`) });
    const reference = await page.evaluate(() => {
      // The pre-change rule only had opacity and the uninterrupted Pulsation.
      document.querySelector('#reference').textContent = '.image-role-hex-info{visibility:visible;transition:opacity 1.5s ease-in-out}';
      return sampleRoles();
    });
    await page.screenshot({ path: resolve(output, `${scenario.name}-reference.png`) });
    for (let i = 0; i < current.length; i++) {
      const { visibility, ...after } = current[i];
      const { visibility: ignored, ...before } = reference[i];
      assert.deepEqual(after, before, `Unchanged pulse, opacity, geometry and pointer target: ${scenario.name}/${i}`);
      assert.equal(after.samePulse, true, 'The pulse must not restart');
      assert.equal(after.duration, 4000);
      assert.equal(visibility, ['hidden', 'leave-end'].includes(scenario.name) ? 'hidden' : 'visible');
      if (visibility === 'hidden') assert.equal(Number(after.opacity), 0, 'Only fully faded markers may be hidden');
    }
    report.push({ scenario, current, reference });
  }
  // A new board gets the default hidden state, and the invisible clock still runs.
  const clock = await page.evaluate(async () => {
    document.querySelector('#reference').textContent = '';
    const grid = document.querySelector('#hexGrid');
    grid.innerHTML = '<div class="hex"><div class="socle tank"><div class="image-role-hex-info"></div></div></div>';
    const icon = grid.querySelector('.image-role-hex-info');
    const pulse = icon.getAnimations().find(a => a.animationName === 'Pulsation');
    await pulse.ready; const start = pulse.currentTime;
    await new Promise(done => setTimeout(done, 150));
    return { elapsed: pulse.currentTime - start, visibility: getComputedStyle(icon).visibility, state: pulse.playState };
  });
  assert.ok(clock.elapsed > 0); assert.equal(clock.visibility, 'hidden'); assert.equal(clock.state, 'running');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ engine: safari ? 'webkit' : 'chrome', report, clock, errors }, null, 2));
  console.log('PASS hidden/reveal/fade/reversal/rebuild: same pulse phase, opacity, geometry and pointer targets for four roles');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
