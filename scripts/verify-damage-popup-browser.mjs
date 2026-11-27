import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/damage-popup');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.addStyleTag({ content: 'body{background:#15191d!important} #popup-audit{position:fixed;inset:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;overflow:auto;color:white} .popup-case{background:#252a2f;padding:8px;text-align:center;font:13px Arial} .popup-case > [id^="PopUp_"]{position:relative;width:100%;height:56px} #popup-audit .combat-popup-flight{left:50%;bottom:50%} #popup-audit .damage-popup{position:relative;animation:none!important;transform:none!important;opacity:1;margin:8px 0}' });
  const failures = await page.evaluate(async () => {
    const { PopUpDamages } = await import("/js/rendering/hud.js");
    document.body.innerHTML = '<main id="popup-audit"></main>';
    const natures = ['physicalDamage', 'magicalDamage', 'transpiercingDamage', 'hybridalDamage',
      'physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage', 'inerte'];
    const criticalAssets = ['physic', 'magic', 'piercing', 'hybrid', 'cinetic', 'spectral', 'prismatic', 'power'];
    await Promise.all(criticalAssets.map(kind => {
      const image = new Image(); image.src = `/media/assets/ui/picto-crit-${kind}.svg`; return image.decode();
    }));
    const { freezeCombatClock } = await import('/js/combat/clock.js');
    freezeCombatClock();
    const cases = natures.flatMap(nature => ['normal', 'critical', 'execution-critical'].map(kind => ({ nature, kind, hp: 23, armor: 0 })));
    cases.push({ nature: 'magicalDamage', kind: 'normal', hp: 0, armor: 9 },
      { nature: 'hybridalPiercingDamage', kind: 'normal', hp: 12, armor: 3 },
      { nature: 'physicalDamage', kind: 'critical', hp: 12, armor: 3 },
      { nature: 'inerte', kind: 'critical', hp: 0, armor: 0 },
      { nature: 'physicalDamage', kind: 'execution-critical', hp: 17, armor: 0 },
      { nature: '', expected: 'hybridalPiercingDamage', kind: 'normal', hp: 7, armor: 0 });
    const failures = [];
    for (const [index, test] of cases.entries()) {
      const card = document.createElement('section'); card.className = 'popup-case';
      card.textContent = `${test.expected || test.nature} · ${test.kind}`;
      const container = document.createElement('div'); container.id = `PopUp_${index}`;
      const status = document.createElement('div'); status.id = `PopDow_${index}`; status.className = 'combat-popup-status';
      card.append(container, status); document.getElementById('popup-audit').append(card);
      const target = { id: index, stats: { HP: { current: 50, max: 100 }, armor: { current: 0, max: 9 } } };
      const before = JSON.stringify(target);
      PopUpDamages(target, test.hp, [], '', { physical: 100, magical: 200, piercingDamage: 300 }, test.kind, test.armor, test.nature);
      const popup = container.querySelector('.damage-popup--nature');
      const nature = test.expected || test.nature;
      const icon = popup?.firstElementChild, value = popup?.querySelector('.damage-popup-value');
      const critical = test.kind === 'critical' || test.kind === 'execution-critical';
      const criticalIcon = `criticalHit.${nature}`;
      const criticalAsset = `picto-crit-${criticalAssets[natures.indexOf(nature)]}.svg`;
      const colorReference = document.createElement('span');
      colorReference.className = nature;
      card.appendChild(colorReference);
      if (!icon?.matches(`.picto-stat.${critical ? criticalIcon : nature}`) || !value?.matches(`.damage-popup-value.${nature}`)
        || value.textContent !== `−${test.hp + test.armor}` || popup.children.length !== (critical ? 3 : 2)
        || (critical && popup.querySelector('.combat-popup-critical-suffix')?.textContent !== '!!!')
        || getComputedStyle(icon).backgroundImage === 'none'
        || (critical && !getComputedStyle(icon).backgroundImage.includes(criticalAsset))
        || popup.classList.contains('damage-popup--execution-critical') !== (test.kind === 'execution-critical')
        || Number.parseFloat(getComputedStyle(value).fontSize) !== (test.kind === 'execution-critical' ? 40 : critical ? 32 : 24)
        || getComputedStyle(value).color !== getComputedStyle(colorReference).color
        || !getComputedStyle(value).getPropertyValue('--stat-color').trim()
        || getComputedStyle(value).color === 'rgb(255, 255, 255)'
        || container.querySelector('.damage-popup.detail') || JSON.stringify(target) !== before) failures.push(test);
      if (test.armor > 0 && !status.querySelector('.damage-popup--armor-destroyed')) failures.push({ missingArmorNotice: index });
      for (const animation of container.getAnimations({ subtree: true })) {
        animation.pause(); animation.currentTime = 200;
      }
    }
    return failures;
  });
  assert.deepEqual(failures, []);
  await page.screenshot({ path: resolve(output, 'nature-and-totals.png') });
  assert.deepEqual(errors, []);
  console.log('PASS damage popups: eight nature colors, critical icons and !!!, size tiers, execution criticals, zero damage, armor + HP totals, separate armor notice and unchanged gameplay data.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
