import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/combat-attack-controls');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) { res.writeHead(403).end(); return; }
  if (path === root) path = resolve(root, 'index.html');
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});

await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const panel = await import("/js/ui/attacks.js");
    const selection = await import("/js/combat/attackResolution.js");
    const ui = await import("/js/ui/display.js");
    const { entites, entitesNestUp } = await import("/js/entities/runtime.js");
    const gameState = await import("/js/app/state.js");
    const { readAttackDefinitionsForEntity, updateEntityAttackDefinition } = await import("/js/combat/attackResolution.js");
    const { AttackDetailInfos } = await import("/js/ui/attacks.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { createLifeBars, CreateATBEntity } = await import("/js/rendering/entities.js");
    const { updateHealthBar } = await import("/js/rendering/vitalFeedback.js");
    const { updateTimerDisplay } = await import("/js/rendering/hud.js");
    const reports = [];
    const check = (condition, label) => { if (!condition) throw Error(label); reports.push(label); };
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    // Assert the values presented on screen after queued combat writes commit.
    const paint = async () => { await sleep(0); await new Promise(requestAnimationFrame); };

    const entity = structuredClone(entitesNestUp.find(candidate => candidate.name === 'Grouille-Doigt TEST 3A polyvalent'));
    entity.id = 984321;
    entity.side = 'A';
    const enemy = structuredClone(entity);
    enemy.id = 984322;
    enemy.side = 'B';
    enemy.name = 'Grouille-Doigt ennemi';
    entites.length = 0;
    entites.push(entity, enemy);
    window.selectedArmyA = [entity];
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));

    panel.showCombatAttackControlPanel(entity.id);
    check(!document.querySelector('.combat-attack-control-panel'),
      'Side-A selection cannot open attack controls outside battle');
    gameState.startGame();

    let gameContainer = document.getElementById('game-container');
    if (!gameContainer) {
      gameContainer = document.createElement('div');
      gameContainer.id = 'game-container';
      document.body.append(gameContainer);
    }
    document.getElementById('game-windows').style.opacity = '1';
    document.getElementById('game-windows').append(gameContainer);
    gameContainer.replaceChildren();
    gameContainer.style.cssText = 'position:absolute;inset:0;background:#17191c url(/media/decors/prison/ground.jpg) center/cover;overflow:hidden;';

    const boardHud = document.createElement('div');
    boardHud.id = `Box_Entite_${entity.id}`;
    entity.stats.HP = { current: 27, max: 96 };
    entity.stats.armor = { current: 238, max: 238 };
    boardHud.append(createLifeBars(entity), CreateATBEntity(entity));
    gameContainer.append(boardHud);

    panel.showCombatAttackControlPanel(entity.id);
    await paint();
    let root = document.querySelector('.combat-attack-control-panel');
    const surface = getComputedStyle(root);
    check(surface.borderTopWidth === '0px' && surface.borderRightWidth === '0px'
      && surface.borderBottomWidth === '0px' && surface.borderLeftWidth === '0px'
      && surface.boxShadow === 'none' && surface.backgroundImage.includes('linear-gradient')
      && surface.backgroundImage.includes('18%') && surface.backgroundImage.includes('82%'),
      'Combat controls use a borderless message-style backdrop fading on both sides');
    const cards = [...root.querySelectorAll('.combat-attack-control-card')];
    check(cards.length === 3 && root.querySelector('.combat-attack-control-title').textContent.includes('Grouille-Doigt'),
      'Selected side-A entity opens its complete combat attack kit');
    check(!root.querySelector('.combat-attack-control-name')
      && [...root.querySelectorAll('.combat-attack-control-toggle')].every(button => !button.textContent.trim())
      && root.querySelectorAll('.combat-attack-control-actions button').length === 3,
      'Compact panel exposes only attack images, priority circles, state dots and three portrait controls');
    check(root.querySelector('.combat-attack-control-level').parentElement.classList.contains('combat-attack-control-vitals')
      && getComputedStyle(root.querySelector('.combat-attack-control-level')).backgroundImage.includes('hexastone.png'),
      'Entity level sits in its hexagon at the end of the shared life bars');
    check(getComputedStyle(cards.find(card => card.classList.contains('is-support')).querySelector('.combat-attack-control-image-frame')).borderTopColor === 'rgb(0, 157, 255)'
      && getComputedStyle(cards.find(card => !card.classList.contains('is-support')).querySelector('.combat-attack-control-image-frame')).borderTopColor === 'rgb(255, 22, 22)',
      'Support and offensive attack frames keep their blue and red type colors');
    check(root.querySelector('.combat-attack-control-portrait-image')
      && root.querySelector('.combat-attack-control-level')?.textContent === String(entity.level?.current ?? entity.level ?? 1)
      && root.querySelector('.HP-counter')?.textContent.includes('HP :'),
      'Allied attack controls merge portrait, level and live combat resources');

    const vitals = root.querySelector('.combat-attack-control-vitals');
    const boardHP = boardHud.querySelector('.health-bar');
    const panelHP = vitals.querySelector('.health-bar');
    const boardArmor = boardHud.querySelector('.armor-bar');
    const panelArmor = vitals.querySelector('.armor-bar');
    check(Math.abs(parseFloat(panelHP.style.width) - 27 / 265 * 100) < .001
      && panelHP.style.width === boardHP.style.width && panelArmor.style.width === boardArmor.style.width
      && panelHP.parentElement === panelArmor.parentElement
      && panelHP.querySelector('.health-fill').style.backgroundColor === boardHP.querySelector('.health-fill').style.backgroundColor
      && panelHP.style.animation === boardHP.style.animation,
      '27/96 HP plus 238 armor use the board combined proportions, low-HP color and blink');
    for (const [hp, armor] of [[27, 0], [27, 12], [96, 0], [0, 0], [27, 238]]) {
      updateHealthBar(hp, 96, armor, 238, entity.id);
      await paint();
      check(panelHP.style.width === boardHP.style.width && panelArmor.style.width === boardArmor.style.width
        && panelArmor.style.display === boardArmor.style.display
        && vitals.querySelector('.HP-counter').textContent === boardHud.querySelector('.HP-counter').textContent,
        `Shared health updater keeps panel identical to board: HP=${hp}, armor=${armor}`);
    }
    const boardSpeed = boardHud.querySelector('.speed-interface');
    const boardATB = boardSpeed.querySelector('.atb-fill');
    const panelSpeed = vitals.querySelector('.speed-interface');
    const panelATB = panelSpeed.querySelector('.atb-fill');
    for (const phase of ['preparation', 'execution', 'recuperation']) {
      boardSpeed.className = `speed-interface ${phase}`;
      boardATB.style.width = '91.3684%';
      await paint();
      check(panelATB.style.cssText === boardATB.style.cssText
        && getComputedStyle(panelATB).backgroundColor === getComputedStyle(boardATB).backgroundColor,
        `ATB mirrors board width and phase color: ${phase}`);
    }
    boardHud.classList.add('entity-target-searching');
    boardATB.classList.add('target-search-pulse');
    entity.currentPhase = 'target-search';
    updateTimerDisplay(entity);
    await paint();
    check(panelATB.style.width === boardATB.style.width && panelATB.className === boardATB.className
      && panelSpeed.classList.contains('entity-target-searching')
      && getComputedStyle(panelATB).animationName === getComputedStyle(boardATB).animationName,
      'ATB search retains full bar and the shared blue pulse animation');
    boardHud.classList.remove('entity-target-searching');
    boardATB.classList.remove('target-search-pulse');
    entity.currentPhase = 'target-search-recovery';
    entity.recoveryTime = 250;
    entity.maxRecoveryTime = 1000;
    updateTimerDisplay(entity);
    await paint();
    check(panelATB.style.width === '25%' && panelSpeed.className === boardSpeed.className,
      'Search recovery drains the mirrored ATB through the existing timer updater');
    entity.currentPhase = '';
    check(document.querySelectorAll(`#atbFill_${entity.id}`).length === 1,
      'Mirrored ATB never duplicates the board identifiers');

    const helperHost = cards[0].querySelector('.combat-attack-control-image-frame');
    helperHost.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(40);
    const attackHelper = document.querySelector('.stat-hover.combat-attack-hover');
    const attackHelperText = attackHelper?.textContent.replace(/\s+/g, ' ').trim() || '';
    check(attackHelperText.includes('Rôle : Attaque')
      && attackHelperText.includes('Cible : Entité')
      && attackHelperText.includes('Portée : Corps à corps'),
      'Attack thumbnail exposes its simplified combat helper');
    helperHost.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

    for (const card of cards) {
      const host = card.querySelector('.combat-attack-control-image-frame');
      document.querySelectorAll('.stat-hover').forEach(helper => helper.remove());
      host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const helper = document.querySelector('.stat-hover.combat-attack-hover');
      const definition = readAttackDefinitionsForEntity(entity, attackDetails).find(attack => selection.attackSelectionKey(attack) === card.dataset.attackKey);
      const codexDescription = AttackDetailInfos(definition, entity, false, null, { showUmbraPanel: false, showProgression: false, showActivation: false });
      const roleLabel = definition.combatFunction === 'Support' ? 'Support' : 'Attaque';
      const helperText = helper?.textContent.replace(/\s+/g, ' ').trim() || '';
      // Open helpers enrich pictograms with nested-helper accessibility hooks.
      // Compare the content, retaining every icon, label and gameplay field.
      const contentMarkup = node => {
        const clone = node.cloneNode(true);
        clone.querySelectorAll('.picto-stat[data-helper-picto-stat]').forEach(icon => {
          for (const name of ['data-helper-picto-stat', 'tabindex', 'aria-label']) icon.removeAttribute(name);
        });
        return clone.outerHTML;
      };
      check(helperText.includes(`Rôle : ${roleLabel}`)
        && contentMarkup(helper.querySelector('.attack-nature')) === contentMarkup(codexDescription.querySelector('.attack-nature'))
        && contentMarkup(helper.querySelector('.attack-range')) === contentMarkup(codexDescription.querySelector('.attack-range'))
        && helper.querySelector('.attack-description').innerHTML === codexDescription.querySelector('.attack-description').innerHTML,
        `${definition.displayName}: helper shares the codex nature, range, icons and complete description`);
      check([...helper.querySelectorAll('.attack-nature .picto-stat, .attack-range .picto-stat')]
        .every(icon => icon.dataset.helperPictoStat && icon.tabIndex === 0 && icon.getAttribute('aria-label')),
        `${definition.displayName}: nature and range pictograms expose accessible nested helpers`);
      check(!helper.querySelector('.attack-essence-sockets, .attack-umbra-panel, .attack-mastery-gauge, .timers-detail, button'),
        `${definition.displayName}: combat helper stays compact and read-only`);
      host.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    }

    const firstKey = cards[0].dataset.attackKey;
    const originalAttack = readAttackDefinitionsForEntity(entity, attackDetails).find(attack => selection.attackSelectionKey(attack) === firstKey);
    updateEntityAttackDefinition(entity, firstKey, {
      attackDescription: 'Première phrase. Inflige [{baseDamage} + 3] points.',
      baseDamage: 17,
    }, attackDetails);
    document.querySelectorAll('.stat-hover').forEach(helper => helper.remove());
    helperHost.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const updatedHelper = document.querySelector('.stat-hover.combat-attack-hover');
    check(updatedHelper?.querySelector('.attack-description').textContent.includes('Première phrase. Inflige 20 points.')
      && root.contains(helperHost),
      'Reopening hover reads customized attack data and resolves its formulas without rebuilding the panel');
    helperHost.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    updateEntityAttackDefinition(entity, firstKey, originalAttack, attackDetails);
    document.querySelectorAll('.stat-hover').forEach(helper => helper.remove());

    const rankOne = cards.find(card => card.querySelector('.combat-attack-control-rank').textContent === '1');
    const rankOneKey = rankOne.dataset.attackKey;
    rankOne.querySelector('.combat-attack-control-rank').click();
    check(root.querySelector('.combat-attack-priority-value').options.length === 3,
      'Clicking a priority circle reveals arrows and every available rank');
    root.querySelector('.combat-attack-priority-down').click();
    check(entity.attackSelection.priorityMode === 'manual' && entity.attackSelection.priorities[rankOneKey] === 2
      && new Set(Object.values(entity.attackSelection.priorities)).size === 3,
      'Priority arrows swap unique ranks and persist manual mode');
    const manualRanks = JSON.stringify(entity.attackSelection.priorities);
    root.querySelector('.combat-attack-control-auto').click();
    check(entity.attackSelection.priorityMode === 'auto', 'Portrait circle activates automatic ordering');
    root.querySelector('.combat-attack-control-auto').click();
    check(entity.attackSelection.priorityMode === 'manual' && JSON.stringify(entity.attackSelection.priorities) === manualRanks,
      'Portrait circle restores the previous manual ranking');
    root.querySelector('.combat-attack-control-all').click();
    check(cards.every(card => card.classList.contains('is-disabled'))
      && Object.keys(entity.attackSelection.disabled).length === 3,
      'Portrait square disables the complete kit without resetting priorities');
    root.querySelector('.combat-attack-control-all').click();
    check(cards.every(card => !card.classList.contains('is-disabled')),
      'Portrait square reactivates all attacks');

    rankOne.querySelector('.combat-attack-control-toggle').click();
    check(entity.attackSelection.disabled[rankOneKey] === true && rankOne.classList.contains('is-disabled'),
      'Attack can be disabled and immediately reflects its state');
    check(getComputedStyle(rankOne.querySelector('.combat-attack-control-toggle')).color === 'rgb(255, 32, 32)'
      && getComputedStyle(rankOne.querySelector('.combat-attack-control-image')).filter.includes('brightness(0.38)'),
      'Disabled attack is darkened while its red toggle stays visible');
    rankOne.querySelector('.combat-attack-control-toggle').click();
    check(entity.attackSelection.disabled[rankOneKey] !== true && !rankOne.classList.contains('is-disabled'),
      'Disabled attack can be reactivated from the combat panel');

    const attack = readAttackDefinitionsForEntity(entity, attackDetails).find(candidate => selection.attackSelectionKey(candidate) === rankOneKey);
    selection.startAttackCooldown(entity, attack, 4800, Date.now());
    await sleep(180);
    const cooldownValue = rankOne.querySelector('.combat-attack-control-cooldown-value').textContent;
    check(rankOne.classList.contains('is-cooldown') && /^\d,\d$/.test(cooldownValue),
      'Cooldown updates live and displays tenths below five seconds');
    const countdown = rankOne.querySelector('.combat-attack-control-cooldown-value');
    const firstCount = countdown.textContent;
    let secondCount = firstCount;
    for (let attempt = 0; attempt < 10 && secondCount === firstCount; attempt += 1) {
      await sleep(100);
      secondCount = countdown.textContent;
    }
    check(firstCount !== secondCount && rankOne.querySelector('.combat-attack-control-cooldown-value') === countdown,
      'Cooldown tenths progress without recreating the image or countdown node');

    entity.currentAttackId = rankOneKey;
    entity.currentPhase = 'attack_1';
    selection.notifyAttackSelection(entity);
    for (let attempt = 0; attempt < 40 && !rankOne.classList.contains('is-current'); attempt++) await sleep(50);
    check(rankOne.classList.contains('is-current')
      && getComputedStyle(rankOne.querySelector('.combat-attack-control-image-frame')).filter.includes('drop-shadow'),
      'Casting attack receives its golden frame and glow');
    entity.currentPhase = 'attack_5';
    for (let attempt = 0; attempt < 40 && rankOne.classList.contains('is-current'); attempt++) await sleep(50);
    check(!rankOne.classList.contains('is-current'), 'Recovery does not retain the casting highlight');

    const sprite = document.createElement('div');
    sprite.id = `spriteContainer_${entity.id}`;
    gameContainer.append(sprite);
    const enemySprite = document.createElement('div');
    enemySprite.id = `spriteContainer_${enemy.id}`;
    gameContainer.append(enemySprite);
    panel.hideCombatAttackControlPanel();
    ui.toggleScanEntityListener();
    sprite.click();
    await sleep(260);
    root = document.querySelector('.combat-attack-control-panel');
    check(root && !document.getElementById(`headsup-container_${entity.id}`),
      'Allied battlefield click opens the fused controls without the legacy heads-up');
    check(sprite.classList.contains('focused'),
      'Simple battlefield click enables entity focus alongside attack controls');

    const holdPointerId = 51;
    sprite.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      pointerId: holdPointerId,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    }));
    await sleep(2050);
    check(sprite.classList.contains('focused'),
      'A two-second press and hold also enables entity focus');
    sprite.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      pointerId: holdPointerId,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    }));
    check(!sprite.classList.contains('focused'),
      'Hold focus disappears immediately when the pointer is released');

    enemySprite.click();
    await sleep(260);
    check(document.getElementById(`headsup-container_${enemy.id}`)
      && !document.querySelector('.combat-attack-control-panel'),
      'Enemy battlefield click keeps the legacy heads-up interface');

    await sleep(260);
    sprite.click();
    await sleep(260);
    root = document.querySelector('.combat-attack-control-panel');
    check(Boolean(root), 'Allied fused controls reopen after inspecting an enemy');

    return reports;
  });
  await page.evaluate(async () => {
    const { createBattleSatchelView } = await import("/js/ui/inventory.js");
    const { entites } = await import("/js/entities/runtime.js");
    const { notifyAttackSelection } = await import("/js/combat/attackResolution.js");
    document.querySelectorAll('.starter-selection, .game-starter, .board-ui').forEach(node => node.remove());
    entites[0].nickname = 'La Vigie';
    entites[0].role = 'tank';
    entites[0].level = 35;
    entites[0].currentPhase = 'attack_1';
    notifyAttackSelection(entites[0]);
    document.getElementById('game-container').append(createBattleSatchelView(true));
  });
  await page.screenshot({ path: resolve(output, 'desktop.png') });
  const hoverAttack = async () => {
    await page.locator('.combat-attack-control-image-frame').first().hover();
    await page.locator('.stat-hover.combat-attack-hover').waitFor({ state: 'visible' });
    await page.waitForTimeout(1100);
    const fits = await page.locator('.stat-hover.combat-attack-hover').evaluate(helper => {
      const rect = helper.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        && helper.scrollWidth <= helper.clientWidth;
    });
    if (!fits) throw Error('Combat attack helper overflows the viewport');
  };
  await hoverAttack();
  await page.screenshot({ path: resolve(output, 'desktop-helper.png') });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: resolve(output, 'mobile.png') });
  await hoverAttack();
  await page.screenshot({ path: resolve(output, 'mobile-helper.png') });
  reports.push('Attack helpers fit both desktop and mobile viewports');
  const priorityCircle = page.locator('.combat-attack-control-rank').first();
  await priorityCircle.click();
  await page.screenshot({ path: resolve(output, 'mobile-priority.png') });
  await page.keyboard.press('Escape');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const count of [1, 2, 6, 10]) {
      const result = await page.evaluate(async count => {
        const { setEntityAttackDefinitions } = await import("/js/combat/attackResolution.js");
        const { attackDetails } = await import('/js/data/attackList.js');
        const { entites } = await import("/js/entities/runtime.js");
        const { showCombatAttackControlPanel } = await import("/js/ui/attacks.js");
        setEntityAttackDefinitions(entites[0], attackDetails.slice(0, count), attackDetails);
        showCombatAttackControlPanel(entites[0].id);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panel = document.querySelector('.combat-attack-control-panel');
        const rect = panel.getBoundingClientRect();
        const bag = document.querySelector('.battle-satchel--combat').getBoundingClientRect();
        const image = new Image();
        image.src = '/media/assets/ui/sacoche-slot.png';
        await image.decode();
        return {
          fits: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          separate: rect.right <= bag.left || rect.left >= bag.right || rect.top >= bag.bottom || rect.bottom <= bag.top,
          count: panel.querySelectorAll('.combat-attack-control-card').length,
          imageLoaded: image.naturalWidth > 0 && getComputedStyle(document.querySelector('.battle-satchel-slot')).backgroundImage.includes('sacoche-slot.png'),
          title: panel.querySelector('.combat-attack-control-title').textContent,
        };
      }, count);
      if (!result.fits || !result.separate || result.count !== count || !result.imageLoaded || result.title !== 'La Vigie') {
        throw Error(`Invalid panel layout ${width}px/${count} attacks: ${JSON.stringify(result)}`);
      }
      await page.screenshot({ path: resolve(output, `${width}-${count}-attacks.png`) });
      reports.push(`${count} attacks at ${width}px: panel fits, bag stays separate, nickname and bag asset render`);
    }
  }
  const closeReport = await page.evaluate(() => {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !document.querySelector('.combat-attack-control-panel');
  });
  if (!closeReport) throw Error('Outside click did not close the combat attack controls');
  reports.push('Outside click closes heads-up attack controls');
  const stopReport = await page.evaluate(async () => {
    const panel = await import("/js/ui/attacks.js");
    const gameState = await import("/js/app/state.js");
    const { entites } = await import("/js/entities/runtime.js");
    panel.showCombatAttackControlPanel(entites[0]?.id);
    gameState.StopGame();
    return !document.querySelector('.combat-attack-control-panel');
  });
  if (!stopReport) throw Error('Stopping battle did not remove the combat attack controls');
  reports.push('Stopping the battle immediately removes the attack controls');
  const adminPage = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  adminPage.on('pageerror', error => errors.push(error.message));
  await adminPage.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const adminReports = await adminPage.evaluate(async () => {
    const Admin = await import("/js/debug/admin.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const C = await import("/js/rendering/entities.js");
    const Attack = await import("/js/combat/attacks.js");
    const reports = [];
    const check = (value, label) => { if (!value) throw Error(label); reports.push(label); };
    const wait = () => new Promise(done => setTimeout(done, 450));
    window.currentStageId = 'admin-side-fixture';
    window.levelRunning = 'admin';
    localStorage.setItem('GameStages', JSON.stringify({ stages: [{ id: window.currentStageId, level_type: 'admin' }] }));
    S.setAdminMode(true);
    const entity = structuredClone(E.entitesNestUp.find(candidate => candidate.name === 'Grouille-Doigt TEST 3A polyvalent'));
    Object.assign(entity, { id: 975201, side: 'A', position: 'hex_1' });
    const enemy = structuredClone(entity);
    Object.assign(enemy, { id: 975202, side: 'B', position: 'hex_2' });
    E.entites.splice(0, E.entites.length, entity, enemy);
    S.saveToLocalStorage('selectedArmyA', [entity]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [enemy] } } });
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div id="hexGrid"><div id="hex_1" class="hex SideA occupied" data-position="hex_1" data-role="gueux"></div><div id="hex_2" class="hex SideB occupied" data-position="hex_2" data-role="gueux"></div></div></div>';
    const firstBox = C.createEntiteInDOM(entity).element;
    const enemyBox = C.createEntiteInDOM(enemy).element;
    document.getElementById('hex_1').append(firstBox);
    document.getElementById('hex_2').append(enemyBox);
    C.createHeadUpInDom(entity.id);
    C.createEntiteScanInDOM(entity.id);
    Admin.initializeAdminLevel(E.entitesNestUp);
    firstBox.click();
    await wait();
    const select = document.querySelector('.admin-entity-side-select');
    check(!!select && select.value === 'A', 'Clicking an admin entity opens a Side field with its actual camp');
    check([...select.options].map(option => option.value).join(',') === 'A,B,neutral', 'Side editor offers A, B and Neutral');
    const hostileAttack = { attackTarget: ['enemy'], deadTarget: [] };
    check(Attack.acceptsSelectedTarget(entity, hostileAttack, enemy), 'Side A can target the opposing Side B entity');
    const selectSide = side => { select.value = side; select.dispatchEvent(new Event('change', { bubbles: true })); };
    selectSide('B');
    check(entity.side === 'A' && window.__adminActiveLiveEntityDraft.side === 'B', 'Side changes only the draft before validation');
    check(!Object.hasOwn(window.__adminActiveLiveEntityDraft.baseStats, 'side'), 'Side is an entity property, never a numerical stat');
    const id = entity.id;
    const hp = entity.stats.HP.current;
    const oldArmyB = JSON.stringify(S.loadFromLocalStorage('ArmyB'));
    document.querySelector('.admin-validate-live-entity-button').click();
    await wait();
    check(entity.side === 'B' && entity.id === id && E.entites.length === 2, 'Validating Side B changes the existing entity without respawning it');
    check(!Attack.acceptsSelectedTarget(entity, hostileAttack, enemy)
      && Attack.acceptsSelectedTarget(entity, { attackTarget: ['ally'], deadTarget: [] }, enemy),
    'Changing camp updates hostile and allied target eligibility');
    check(entity.position === 'hex_1' && firstBox.parentElement.id === 'hex_1' && entity.stats.HP.current === hp, 'Side change preserves the position and HP');
    check(firstBox.classList.contains('side-B') && !firstBox.querySelector('.side-A, .img-side-A, .A'), 'All board sprites and bars adopt the new side');
    check(document.getElementById(`headsup-container_${id}`).parentElement.classList.contains('side-B'), 'Heads-up moves to the new faction');
    check(document.querySelector(`#ScanEntity_${id} .entity-camp`).textContent === 'Camp B', 'Scan camp label reflects the edit');
    check(select.value === 'B' && !select.closest('.admin-entity-side-row').classList.contains('is-edited'), 'Validation retains the selected side and clears its edited marker');
    check(S.loadFromLocalStorage('selectedArmyA')[0].side === 'B' && JSON.stringify(S.loadFromLocalStorage('ArmyB')) === oldArmyB,
      'Admin test side is saved without transferring ownership or overwriting another army');
    selectSide('neutral');
    document.querySelector('.admin-validate-live-entity-button').click();
    await wait();
    check(entity.side === 'neutral' && firstBox.classList.contains('side-neutral'), 'Neutral side also applies to the live entity');
    check(document.getElementById(`headsup-container_${id}`).hidden, 'Neutral side does not remain in a faction heads-up');
    selectSide('A');
    document.querySelector('.admin-validate-live-entity-button').click();
    await wait();
    check(entity.side === 'A' && !document.getElementById(`headsup-container_${id}`).hidden, 'Returning to Side A restores the existing heads-up');
    check(Attack.acceptsSelectedTarget(entity, hostileAttack, enemy), 'Returning to Side A restores hostile target eligibility');
    selectSide('B');
    enemyBox.click();
    await wait();
    check(entity.side === 'A' && document.querySelector('.admin-entity-side-select').value === 'B', 'Selecting another entity discards unvalidated camp changes');
    firstBox.click();
    await wait();
    check(document.querySelector('.admin-entity-side-select').value === 'A', 'Reopening reads the last validated camp');
    return reports;
  });
  reports.push(...adminReports);
  await adminPage.locator('#admin-entity-form').screenshot({ path: resolve(output, 'admin-side-editor.png') });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  const sideFits = await adminPage.locator('.admin-entity-side-row').evaluate(row => {
    const bounds = row.getBoundingClientRect();
    const field = row.querySelector('select').getBoundingClientRect();
    return field.left >= bounds.left && field.right <= bounds.right && row.scrollWidth <= row.clientWidth;
  });
  if (!sideFits) throw Error('Admin side field overflows its row');
  await adminPage.locator('.admin-entity-side-row').scrollIntoViewIfNeeded();
  await adminPage.locator('.admin-entity-side-row').screenshot({ path: resolve(output, 'admin-side-editor-mobile.png') });
  reports.push('Admin side selector fits its editor row on mobile');
  for (const width of [1280, 390]) {
    await adminPage.setViewportSize({ width, height: 844 });
    const soulReports = await adminPage.evaluate(async () => {
      const C = await import("/js/rendering/entities.js");
      const reports = [];
      const check = (value, label) => { if (!value) throw Error(label); reports.push(label); };
      const settle = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const id = 975201;
      const getCodex = () => document.getElementById(`codex-entity_${id}`);
      const checkReset = label => {
        const codex = getCodex();
        const levelUp = codex?.querySelector('.level-up-section');
        const soul = levelUp?.closest('.section-content.soul');
        const tools = soul?.querySelector(':scope > .admin-soul-reset-tools');
        const button = tools?.querySelector('.admin-soul-reset-level');
        check(!!button && button.dataset.entityId === String(id)
          && button.textContent === 'Remise à zéro'
          && codex.querySelectorAll('.admin-soul-reset-tools').length === 1
          && codex.querySelectorAll('.admin-soul-reset-level').length === 1,
        label);
        check(button.getBoundingClientRect().width > 0 && !soul.hidden,
          'Admin reset remains visible in its Soul container');
      };
      const openSoul = async () => {
        C.createEntiteScanInDOM(id);
        await settle();
        const scanButton = document.getElementById(`adminSoulScan_${id}`);
        check(!!scanButton, 'Admin scan exposes the Soul action');
        scanButton.click();
        await settle();
        getCodex().querySelector('.codex-inner-menu:has(.codex-soul)').click();
        await settle();
        checkReset('Selecting Soul from the admin Codex shows exactly one reset button');
      };
      await openSoul();
      const initialButton = getCodex().querySelector('.admin-soul-reset-level');
      for (const mode of ['soul', 'progression', 'archetype', 'progression']) {
        getCodex().querySelector(`.codex-soul-tabs [data-mode="${mode}"]`).click();
        await settle();
        checkReset(`Soul ${mode} keeps a single reset button`);
        check(getCodex().querySelector('.admin-soul-reset-level') === initialButton,
          'Soul navigation reuses the reset button');
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        getCodex().querySelector('.codex-inner-menu:has(.codex-stat)').click();
        getCodex().querySelector('.codex-inner-menu:has(.codex-soul)').click();
        await settle();
        checkReset('Returning from Stats rebuilds Soul without duplicate tools');
      }
      await openSoul();
      getCodex().remove();
      await openSoul();
      getCodex().remove();
      return reports;
    });
    reports.push(...soulReports.map(report => `${width}px: ${report}`));
  }
  if (errors.length) throw Error(errors.join('\n'));
  for (const report of reports) console.log(report);
  console.log(`PASS: ${reports.length} combat attack control checks`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
