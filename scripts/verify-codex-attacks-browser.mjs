import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) { res.writeHead(403).end(); return; }
  if (path === root) path = resolve(root, 'index.html');
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.locator('#game-windows .Game-UI').waitFor({ state: 'attached' });
  await page.evaluate(() => document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove()));
  const reports = await page.evaluate(async () => {
    const ui = await import("/js/ui/codex/index.js"), _ui = await import("/js/ui/attacks.js"), _ui2 = await import("/js/ui/inventory.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { entitesNestUp, entites } = await import("/js/entities/runtime.js");
    const { getAttackNatureRules, readAttackDefinitionsForEntity, isAttackSublime } = await import("/js/combat/attackResolution.js");
    const check = (ok, label) => { if (!ok) throw Error(label); reports.push(label); };
    const reports = [];
    const entity = structuredClone(entitesNestUp.find(e => e.name === 'Grouille-Doigt TEST 2A support'));
    entity.side = 'A'; entity.role = 'mage';
    entites.length = 0;
    entites.push(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    window.selectedArmyA = [entity];
    const host = document.querySelector('#game-windows .Game-UI');
    host.style.cssText = 'position:fixed;inset:0;z-index:2000000;display:block;background:#191414;';
    host.replaceChildren();
    const menu = document.createElement('div');
    menu.className = 'menu-map-container'; host.append(menu);
    let codex = ui.createCodexEntityScan(entity, menu, `codex-entity_${entity.id}`);
    const attackTab = codex.querySelector('.codex-attacks').parentElement;
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    check([...codex.querySelectorAll('.codex-inner-menu')].map(node => node.textContent).join('|') === 'Profil|Attaques|Stats|Soul|Informations', 'Attack tab appears immediately after Profile');

    codex.querySelector('.codex-profil').parentElement.click();
    let profileOverview = codex.querySelector('.section-content.profil .attack-readonly-overview');
    check(profileOverview?.querySelectorAll('.attack-details').length === 2
      && profileOverview.querySelectorAll('.attack-description-wrapper').length === 2
      && profileOverview.querySelectorAll('.attack-type-container').length === 2
      && profileOverview.querySelectorAll('.attack-range').length === 2
      && profileOverview.querySelectorAll('.timers-detail').length === 8
      && !profileOverview.querySelector('.attack-mastery-gauge, .attack-umbra-panel, .attack-submenu-infos, .attack-enabled-control, .attack-priority-field, .attack-active-spark'),
      'Profile retains the complete historical attack description and timings without editing controls');
    const profileTargetKey = profileOverview.querySelector('.attack-details').dataset.attackKey;
    profileOverview.querySelector('.codex-attack-detail-link').click();
    check(codex.classList.contains('section-attaques')
      && codex.querySelector('.section-content.attaques .attack-details').dataset.attackKey === profileTargetKey,
      'Profile Detail opens the matching attack in the dedicated tab');
    codex.querySelector('.codex-profil').parentElement.click();
    profileOverview = codex.querySelector('.section-content.profil .attack-readonly-overview');
    const profileSocket = profileOverview.querySelector('.attack-essence-socket');
    profileSocket.click();
    await nextFrame(); await nextFrame();
    check(codex.classList.contains('section-attaques') && document.querySelector('.attack-essence-popup'),
      'Profile essence opens its socket only after navigating to the dedicated attack tab');
    const popup = document.querySelector('.attack-essence-popup');
    check(popup.parentElement.matches('#game-shell > .Game-helper')
      && popup.previousElementSibling.classList.contains('attack-essence-popup-backdrop')
      && popup.querySelector('.attack-essence-popup-owner')?.textContent.includes(entity.name)
      && popup.querySelector('.attack-essence-popup-attack')?.textContent.includes(profileTargetKey === 'soin' ? 'Soin' : 'Résurrection')
      && getComputedStyle(popup).backgroundColor === 'rgba(8, 9, 15, 0.97)'
      && getComputedStyle(popup.previousElementSibling).backgroundColor === 'rgba(0, 0, 0, 0.38)',
      'Socket popup lives in Game-helper with its owner, attack and dimmed backdrop');
    document.querySelector('.attack-essence-popup-close').click();
    check(!document.querySelector('.attack-essence-popup-backdrop'), 'Closing the socket popup removes its backdrop');

    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-colomn-5 .codex-picto-menu-entity.picto-attack').click();
    const statsOverview = codex.querySelector('.codex-colomn-5 .attack-readonly-overview--stats');
    check(statsOverview && statsOverview.querySelector('.attack-submenu-infos')
      && !statsOverview.querySelector('.attack-umbra-panel')
      && !statsOverview.querySelector('.attack-enabled-control, .attack-priority-field, .attack-mastery-gauge')
      && statsOverview.querySelectorAll('.attack-stats-choice').length === 2
      && statsOverview.querySelectorAll('.attack-stats-detail').length === 1,
      'Stats attack summary shows one selected attack with essence bonuses');
    const statsTargetKey = statsOverview.querySelector('.attack-stats-choice[aria-pressed="true"]').dataset.attackKey;
    statsOverview.querySelector('.codex-attack-detail-link').click();
    check(codex.classList.contains('section-attaques')
      && codex.querySelector('.section-content.attaques .attack-details').dataset.attackKey === statsTargetKey,
      'Stats Umbras utilisées opens the matching attack in the dedicated tab');

    codex.querySelector('.codex-stat').parentElement.click();
    attackTab.click();
    check(codex.classList.contains('section-attaques') && !codex.classList.contains('section-stats'), 'New section clears previous section state');
    check(!codex.querySelector('.codex-colomn-3').classList.contains('stat'), 'Stats display modes do not leak into Attacks');
    const surface = codex.querySelector('.section-content.attaques');
    const supportCritical = codex.querySelector('.codex-attack-context .attack-critical-panel');
    check(supportCritical?.textContent.includes('soutien ne sont pas encore définis')
      && !supportCritical.querySelector('.attack-critical-bonus'),
      'Support attacks do not advertise offensive critical effects');
    check(surface.querySelectorAll('.attack-browser-thumb').length === 2, 'All owned attacks are listed');
    surface.querySelector('.attack-browser-thumb[data-attack-key="resurrection"] img.attack-image').click();
    check(surface.querySelector('.attack-details').dataset.attackKey === 'resurrection', 'Thumbnail opens the chosen attack');
    const attackAttributes = [...surface.querySelectorAll('.attack-details .attack-text-container > .attack-attribute-row')];
    check(attackAttributes.map(row => row.querySelector('.attack-info-type')?.textContent.trim()).join('|')
      === 'Rôle :|Cible :|Portée :|Nature :'
      && attackAttributes.map(row => row.textContent.replace(/\s+/g, ' ').trim()).join('|')
        .includes('Rôle : Support|Cible : Cadavre|Portée : À distance|Nature : Magique'),
    'Attack description separates role, target, range and nature in the expected order');
    const attributeHelperHosts = [
      attackAttributes[0]?.querySelector('.attack-role-value'),
      attackAttributes[1]?.querySelector('.attack-target-value'),
      attackAttributes[2]?.querySelector('.attack-range'),
      attackAttributes[3]?.querySelector('.attack-nature'),
    ];
    const attributeHelperTexts = attributeHelperHosts.map(node => node?.dataset.helperText || '');
    check(attributeHelperHosts.every(node => node?.dataset.hover === 'true')
      && attributeHelperTexts[0].includes('effet bénéfique')
      && attributeHelperTexts[1].includes('cible les cadavres')
      && attributeHelperTexts[2].includes('Projectile guidé')
      && !attributeHelperTexts[2].includes('Cinétique')
      && !attributeHelperTexts[2].includes('Prismatique')
      && attributeHelperTexts[3].includes('résistance magique'),
    'Role, target, range and nature expose helpers conditioned to the selected attack');
    attributeHelperHosts[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await nextFrame();
    check(document.querySelector('.Game-helper .stat-hover-body')?.textContent.includes('Projectile guidé')
      && !document.querySelector('.Game-helper .stat-hover-body')?.textContent.includes('Cinétique'),
    'Conditional range helper is rendered instead of the generic nature catalogue');
    document.querySelectorAll('.Game-helper .stat-hover').forEach(node => node.remove());

    const spectralDescription = _ui.createAttackDescriptionContent({
      entityAttackId: 'spectral-helper-test', functionName: 'spectral-helper-test', displayName: 'Spectrale test',
      combatFunction: 'Attaquant', attackTarget: ['enemy'], deadTarget: ['no'], attackRange: ['range'],
      attacknature: ['magicalDamage', 'piercingDamage'],
    }, entity);
    const spectralRangeHelper = spectralDescription.querySelector('.attack-range')?.dataset.helperText || '';
    const spectralNatureHelper = spectralDescription.querySelector('.attack-nature')?.dataset.helperText || '';
    check(spectralRangeHelper.includes('partie perçante poursuit sa trajectoire')
      && !spectralRangeHelper.includes('partie physique')
      && !spectralRangeHelper.includes('Prismatique')
      && spectralNatureHelper.includes('Spectrale')
      && spectralNatureHelper.includes('magique')
      && spectralNatureHelper.includes('perçant')
      && spectralNatureHelper.includes('Dissolution 1'),
    'Spectrale helpers describe only spectral transport, intake and signature');

    const kineticDescription = _ui.createAttackDescriptionContent({
      entityAttackId: 'kinetic-helper-test', functionName: 'kinetic-helper-test', displayName: 'Cinétique test',
      combatFunction: 'Attaquant', attackTarget: ['enemy'], deadTarget: ['no'], attackRange: ['range'],
      attacknature: ['physicalDamage', 'piercingDamage'],
    }, entity);
    const kineticRangeHelper = kineticDescription.querySelector('.attack-range')?.dataset.helperText || '';
    const kineticNatureHelper = kineticDescription.querySelector('.attack-nature')?.dataset.helperText || '';
    check(kineticRangeHelper.includes('sans composante magique')
      && !kineticRangeHelper.includes('se dissipe')
      && kineticNatureHelper.includes('Cinétique')
      && kineticNatureHelper.includes('physique')
      && kineticNatureHelper.includes('perçant')
      && kineticNatureHelper.includes('Rupture 1'),
    'Cinétique helpers contain no magical behavior and expose the physical-piercing split');
    const attributePictos = [
      attackAttributes[0]?.querySelector('.attack-role-picto'),
      attackAttributes[1]?.querySelector('.attack-target-picto'),
      attackAttributes[2]?.querySelector('.picto-stat'),
      attackAttributes[3]?.querySelector('.picto-stat'),
    ];
    check(attributePictos.every(picto => picto && getComputedStyle(picto).backgroundImage !== 'none')
      && attributePictos.every(picto => picto.tagName !== 'IMG'),
    'Every attack attribute uses a CSS pictogram before its value');
    const detailTitle = surface.querySelector('.attack-details .attack-loot-name');
    const attributeLabelColors = attackAttributes.map(row => getComputedStyle(row.querySelector('.attack-info-type')).color);
    check(attackAttributes.every(row => getComputedStyle(row.querySelector('.attack-info-type')).fontWeight === '400')
      && attributeLabelColors.every(color => color === 'rgb(232, 227, 216)')
      && getComputedStyle(surface.querySelector('.attack-details .attack-target-value')).color === 'rgb(255, 232, 157)'
      && getComputedStyle(surface.querySelector('.attack-details .attack-range-type')).color === 'rgb(255, 232, 157)'
      && getComputedStyle(surface.querySelector('.attack-details .attack-role-value')).color === getComputedStyle(detailTitle).color,
    'Attribute labels stay neutral while target and range qualifications use gold');
    const renderedAttackDefinitions = readAttackDefinitionsForEntity(entity);
    check([...surface.querySelectorAll('.attack-details--codex, .attack-browser-thumb')].every(container => {
      const attack = renderedAttackDefinitions.find(candidate => candidate.attackKey === container.dataset.attackKey);
      return container.querySelector('.attack-loot-name').textContent.includes('sublime') === isAttackSublime(attack);
    }), 'Detail and multi-attack titles share the current sublime classification');
    check([...surface.querySelectorAll('.attack-details--codex, .attack-browser-thumb')].every(container => {
        const attack = renderedAttackDefinitions.find(candidate => candidate.key === container.dataset.attackKey
          || candidate.attackKey === container.dataset.attackKey
          || candidate.id === container.dataset.attackKey);
        const image = container.querySelector('.attackElement-asset-spell');
        if (!image) return true;
        const expectedNature = getAttackNatureRules(attack).stat;
        return image.dataset.attackNature === expectedNature && image.classList.contains(expectedNature);
      })
      && [...surface.querySelectorAll('.attack-browser-thumb')].every(thumb => {
        const image = thumb.querySelector('.attackElement-asset-spell');
        return image.classList.contains('attack-nature-border') && getComputedStyle(image).borderTopColor !== 'rgb(208, 0, 0)';
      }),
    'Selected and thumbnail attack borders use their effective nature color');
    const necroTargetPicto = surface.querySelector('.attack-details .picto-target-attack-detail');
    check(necroTargetPicto?.classList.contains('Support')
      && necroTargetPicto.classList.contains('Necro')
      && necroTargetPicto.classList.contains('domain-necro'),
    'Codex target pictogram reuses the HUD combat function and domain classes');
    const targetLines = necroTargetPicto?.querySelector(':scope > .target-picto-hud.Support');
    check(targetLines && getComputedStyle(targetLines).backgroundImage.includes('picto-target-support.svg'),
      'Codex target pictogram reuses the matching HUD targeting lines');
    const targetPictoVariants = [
      ['Attaquant', 'domain-combattant', 'picto-targeted-entity-atk.svg'],
      ['Support', 'domain-combattant', 'picto-targeted-entity-sup.svg'],
      ['Attaquant', 'domain-invocateur', 'picto-targeted-hex-atk.svg'],
      ['Support', 'domain-invocateur', 'picto-targeted-hex-sup.svg'],
      ['Attaquant Necro', 'domain-necro', 'picto-targeted-necro-atk.svg'],
      ['Support Necro', 'domain-necro', 'picto-targeted-necro-sup.svg'],
    ];
    const targetPictoSamples = targetPictoVariants.map(([functionClasses, domainClass, asset]) => {
      const sample = document.createElement('div');
      sample.className = `picto-target-attack-detail ${functionClasses} ${domainClass}`;
      surface.append(sample);
      const matches = getComputedStyle(sample).backgroundImage.includes(asset);
      sample.remove();
      return matches;
    });
    check(targetPictoSamples.every(Boolean), 'All six Codex target pictogram variants resolve through CSS');
    const attackSide = codex.querySelector(':scope > .codex-colomn-1 .codex-attack-context');
    let sideInfos = attackSide?.querySelector('.attack-submenu-infos');
    let umbraBand = surface.querySelector('.attack-submenu-umbra');
    let umbras = umbraBand?.querySelector('.attack-umbra-panel');
    check(attackSide && !codex.querySelector(':scope > .codex-colomn-1 .codex-entity-view'), 'Attack tab replaces the entity thumbnail with its contextual panel');
    check(!attackSide.querySelector('.attack-nature-overview, .attack-umbra-panel')
      && sideInfos?.querySelector('.attack-context-section-title')?.textContent === "Compétences de l'attaque",
      'Left rail contains only the selected attack skills');
    const selectedDefinition = readAttackDefinitionsForEntity(entity).find(attack => attack.functionName === 'resurrection');
    let focusedCard = surface.querySelector('.attack-details');
    window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', {
      detail: { entityId: entity.id, entite: entity, attack: { ...selectedDefinition, essenceSlots: [{ color: 'red', active: true }] } },
    }));
    check(surface.querySelector('.attack-details') !== focusedCard
      && surface.querySelector('.attack-submenu-umbra .attack-umbra-panel') !== umbras
      && surface.querySelector('.attack-details')?.dataset.attackKey === 'resurrection',
      'Socket update rebuilds the attack card and its affinities without losing focus');
    window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', {
      detail: { entityId: entity.id, entite: entity, attack: selectedDefinition },
    }));
    focusedCard = surface.querySelector('.attack-details');
    sideInfos = attackSide.querySelector('.attack-submenu-infos');
    umbraBand = surface.querySelector('.attack-submenu-umbra');
    umbras = umbraBand.querySelector('.attack-umbra-panel');
    check(sideInfos && umbras && (focusedCard.compareDocumentPosition(umbraBand) & Node.DOCUMENT_POSITION_FOLLOWING),
      'Umbra affinities form a section beneath the attack card');
    check(attackSide.querySelector('.attack-context-title')?.textContent.includes('Résurrection')
      && sideInfos.querySelector('.attack-context-section-title')?.textContent === "Compétences de l'attaque",
      'Attack context separates its global title from attack skills');
    check(!umbras.querySelector('.attack-umbra-title')
      && !umbras.querySelector('.attack-umbra-heading')
      && umbras.querySelector('.attack-umbra-empty--all')?.textContent === "L'entité ne possède pas d'Umbra d'attaque.",
      'Empty Umbra affinity replaces every title with one direct message');
    check(!umbras.querySelector('.attack-umbra-entry small')
      && !/Essence de .*pure|Valeur utilisable/.test(umbras.textContent)
      && [...umbras.querySelectorAll('.attack-umbra-entry')].every(row => !/Valeur utilisable|Essence de .*pure/.test(row.dataset.helperText || '')),
      'Umbra rows omit repetitive essence summaries and obsolete compatibility helpers');
    check(focusedCard.querySelector('.attack-image-container > .attack-progression .attack-mastery-gauge')
      && focusedCard.querySelector('.attack-essence-socket')
      && focusedCard.querySelector('.attack-more-details > .attack-timing-settings-row > .attack-more-details-reveal .timers-detail')
      && focusedCard.querySelector('.attack-timing-settings-row > .attack-settings-panel > .attack-priority-field')
      && focusedCard.querySelector('.attack-timing-settings-row > .attack-settings-panel > .attack-enabled-control input[role="switch"]')
      && !focusedCard.querySelector('.attack-umbra-panel')
      && !surface.querySelector('.attack-submenu-infos'),
      'Mastery stays below artwork while timings and settings share one structural row');
    const detailActivationButton = focusedCard.querySelector('.attack-image-frame > button.attack-activation-indicator');
    check(detailActivationButton
      && !focusedCard.querySelector('.attack-active-spark, .attack-active-trail')
      && detailActivationButton.getAttribute('aria-pressed') === 'true',
      'Codex detail replaces the active spark with an image activation button');
    const supportActiveImage = focusedCard.querySelector('.attack-image-frame--active > .attack-image');
    const attackerGlowProbe = document.createElement('div');
    attackerGlowProbe.className = 'attack-details Attaquant';
    attackerGlowProbe.innerHTML = '<div class="attack-image-frame--active"><div class="attack-image"></div></div>';
    surface.append(attackerGlowProbe);
    check(getComputedStyle(supportActiveImage).animationName.includes('glowSlow')
      && getComputedStyle(supportActiveImage).getPropertyValue('--glow-slow-color').trim() === '#3f8cff7d'
      && getComputedStyle(attackerGlowProbe.querySelector('.attack-image')).getPropertyValue('--glow-slow-color').trim() === '#ff3b477d',
    'Active attack glow inherits the Support or Attaquant color');
    attackerGlowProbe.remove();
    const detailPriorityBadge = focusedCard.querySelector('.attack-image-frame > .attack-priority-badge--detail');
    check(detailPriorityBadge?.querySelector('.attack-priority-badge-value')
      && getComputedStyle(detailPriorityBadge).transform !== 'none'
      && getComputedStyle(detailPriorityBadge.querySelector('.attack-priority-badge-value')).transform !== 'none',
    'Selected attack displays a diamond priority badge with upright text');
    const enabledControl = focusedCard.querySelector('.attack-enabled-control');
    check(enabledControl.querySelector('input').checked
      && getComputedStyle(enabledControl.querySelector('span')).color === getComputedStyle(focusedCard.querySelector('.attack-loot-name')).color,
    'Enabled switch inherits the selected attack function color');
    check(enabledControl.dataset.helperText.includes('cible valide')
      && detailActivationButton.dataset.helperText.includes('cible valide'),
    'Activation switch and image indicator share the active-state helper');
    const timingCards = [...focusedCard.querySelectorAll('.attack-timing-settings-row .timers-detail')];
    check(timingCards.length === 4
      && timingCards.every(card => card.querySelector('.attack-timing-icon')
        && card.querySelector('.attack-timing-label')
        && card.querySelector('.attack-timing-values'))
      && timingCards.map(card => card.querySelector('.attack-timing-label').textContent).join('|')
        === 'Cooldown|Préparation|Vitesse projectile|Récupération'
      && focusedCard.querySelectorAll('.attack-timing-step').length === 3
      && focusedCard.querySelector('.attack-timing-separator')
      && timingCards[0].classList.contains('attack-timing-cooldown'),
      'Codex timings begin with cooldown before the three-phase flow');
    check([...umbras.querySelectorAll('.attack-umbra-entry > span')].every(node => !/\s[123]$/.test(node.textContent.trim())),
      'Umbra names omit their level suffix');
    const unavailableUmbra = umbras.querySelector('.attack-umbra-entry.is-unavailable');
    if (unavailableUmbra) check(getComputedStyle(unavailableUmbra.querySelector('span')).color === 'rgb(133, 133, 133)'
      && getComputedStyle(unavailableUmbra.querySelector('.picto-stat')).filter !== 'none', 'Unavailable umbras are greyed out');
    const otherThumb = [...surface.querySelectorAll('.attack-browser-thumb')]
      .find(node => node.dataset.attackKey !== 'resurrection');
    otherThumb.querySelector('img.attack-image').click();
    check(attackSide.querySelector('.attack-context-title')?.textContent.includes(otherThumb.dataset.attackKey === 'soin' ? 'Soin' : 'Résurrection')
      && umbras !== umbraBand.querySelector('.attack-umbra-panel'),
      'Changing the focused attack refreshes the skills and Umbra section');
    const supportToggle = surface.querySelector('.attack-details .attack-settings-panel input[role="switch"]');
    check(supportToggle.checked && supportToggle.getAttribute('aria-checked') === 'true',
      'Settings switch reflects the focused attack activation state');
    supportToggle.click();
    await new Promise(resolve => setTimeout(resolve, 120));
    surface.querySelector('.attack-browser-thumb[data-attack-key="resurrection"] img.attack-image').click();
    await new Promise(resolve => setTimeout(resolve, 180));
    const focusedThumb = surface.querySelector('.attack-browser-thumb.is-focused');
    const focusedStyle = focusedThumb ? getComputedStyle(focusedThumb, '::before') : null;
    const focusDebug = {
      count: surface.querySelectorAll('.attack-browser-thumb.is-focused').length,
      key: focusedThumb?.dataset.attackKey,
      border: focusedStyle?.borderTopColor,
      background: focusedStyle?.backgroundImage,
    };
    check(focusedThumb
      && surface.querySelectorAll('.attack-browser-thumb.is-focused').length === 1
      && focusedStyle.backgroundImage !== 'none',
      `Only the selected multi-attack receives the focused card treatment ${JSON.stringify(focusDebug)}`);
    const attackPilot = surface.querySelector('.attack-imgs.multi-attacks');
    const thumbRects = [...attackPilot.querySelectorAll('.attack-browser-thumb')].map(node => node.getBoundingClientRect());
    const selectedFrame = surface.querySelector('.attack-details--codex .attack-image-frame');
    const thumbFrame = surface.querySelector('.attack-browser-thumb .attack-image-frame');
    const pilotRect = attackPilot.getBoundingClientRect();
    const pilotParentRect = attackPilot.parentElement.getBoundingClientRect();
    const detailRect = surface.querySelector('.attack-details-multi').getBoundingClientRect();
    const pilotStyle = getComputedStyle(attackPilot);
    const multiHeader = attackPilot.closest('.multi-attack-header');
    const multiHeaderStyle = getComputedStyle(multiHeader);
    const pilotDebug = {
      position: pilotStyle.position,
      zIndex: multiHeaderStyle.zIndex,
      width: attackPilot.clientWidth,
      parentWidth: attackPilot.parentElement.clientWidth,
      centerDelta: Math.abs((pilotRect.left + pilotRect.width / 2) - (pilotParentRect.left + pilotParentRect.width / 2)),
      detailTop: detailRect.top,
      pilotBottom: pilotRect.bottom,
      thumbWidths: thumbRects.map(rect => rect.width),
      thumbTops: thumbRects.map(rect => rect.top),
    };
    check(pilotStyle.position === 'relative'
      && Number(multiHeaderStyle.zIndex) > 1
      && attackPilot.parentElement.classList.contains('attack-multi-header-center')
      && Math.abs((pilotRect.left + pilotRect.width / 2) - (pilotParentRect.left + pilotParentRect.width / 2)) <= 2
      && Math.abs(thumbRects[0].width - thumbRects[1].width) <= 1
      && Math.abs(thumbRects[0].top - thumbRects[1].top) <= 1
      && detailRect.top >= pilotRect.bottom
      && thumbFrame.getBoundingClientRect().width < selectedFrame.getBoundingClientRect().width,
      `Multi-attack selector belongs to the elevated centered header ${JSON.stringify(pilotDebug)}`);
    const headerBefore = getComputedStyle(attackPilot, '::before');
    const headerAfter = getComputedStyle(attackPilot, '::after');
    check(headerBefore.content !== 'none' && headerAfter.content !== 'none'
      && headerBefore.backgroundImage !== 'none' && headerAfter.backgroundImage !== 'none',
      'Multi-attack header frames its selector with top and bottom gold lines');
    const browserSocketLayer = attackPilot.querySelector('.attack-essence-sockets');
    const browserName = attackPilot.querySelector('.attack-browser-thumb .attack-loot-name');
    const compactDebug = {
      height: pilotRect.height,
      sockets: browserSocketLayer ? getComputedStyle(browserSocketLayer).display : 'absent',
      fontSize: getComputedStyle(browserName).fontSize,
    };
    check(pilotRect.height <= 132
      && browserSocketLayer && getComputedStyle(browserSocketLayer).display === 'contents'
      && [...attackPilot.querySelectorAll('.attack-essence-socket')].every(socket => getComputedStyle(socket).display === 'grid')
      && Number.parseFloat(getComputedStyle(browserName).fontSize) <= 13,
      `Floating selector stays compact and displays its essence sockets ${JSON.stringify(compactDebug)}`);
    check(surface.querySelector('.attack-priority-auto')?.dataset.helperText.includes('cooldown le plus long')
      && surface.querySelector('.attack-priority-label')?.dataset.helperText.includes('La priorité 1 est la plus forte')
      && surface.querySelector('.attack-priority-label')?.dataset.helperText.includes('échange les deux attaques'),
      'Automatic and manual priority controls explain their selection rules');
    const currentFocusedThumb = surface.querySelector('.attack-browser-thumb.is-focused');
    const currentOtherThumb = surface.querySelector(`.attack-browser-thumb[data-attack-key="${otherThumb.dataset.attackKey}"]`);
    const activeIndicator = currentFocusedThumb.querySelector('.attack-activation-indicator.is-active');
    const disabledIndicator = currentOtherThumb.querySelector('.attack-activation-indicator.is-disabled');
    check(activeIndicator && disabledIndicator
      && !surface.querySelector('.attack-browser-thumb .attack-active-spark, .attack-browser-thumb .attack-active-trail')
      && getComputedStyle(activeIndicator).backgroundColor === 'rgb(24, 227, 63)'
      && getComputedStyle(disabledIndicator).backgroundColor === 'rgb(217, 39, 39)',
      'Attack thumbnails use minimal green and red activation indicators');
    const focusedBeforeToggle = surface.querySelector('.entite-attack-container.multi-attacks').dataset.focusedAttackKey;
    activeIndicator.click();
    check(activeIndicator.getAttribute('aria-pressed') === 'false'
      && surface.querySelector('.entite-attack-container.multi-attacks').dataset.focusedAttackKey === focusedBeforeToggle,
      'Codex thumbnail indicator disables its attack without changing focus');
    activeIndicator.click();
    check(activeIndicator.getAttribute('aria-pressed') === 'true',
      'Codex thumbnail indicator re-enables its attack');
    const disabledVisualState = {
      indicator: Boolean(disabledIndicator),
      overlay: Boolean(currentOtherThumb.querySelector('.attack-disabled-overlay')),
      overlayColor: getComputedStyle(currentOtherThumb.querySelector('.attack-disabled-overlay')).backgroundColor,
      imageOpacity: getComputedStyle(currentOtherThumb.querySelector('.attack-image')).opacity,
      completeOpacity: getComputedStyle(currentOtherThumb.querySelector('.attack-img-complete')).opacity,
      label: currentOtherThumb.querySelector('.attack-disabled-label')?.textContent || '',
      key: currentOtherThumb.dataset.attackKey,
      disabled: entity.attackSelection?.disabled?.[currentOtherThumb.dataset.attackKey] === true,
    };
    check(disabledVisualState.indicator && disabledVisualState.overlay
      && disabledVisualState.overlayColor !== 'rgba(0, 0, 0, 0)'
      && disabledVisualState.label === 'Désactivée'
      && getComputedStyle(currentOtherThumb.querySelector('.attack-disabled-label')).display === 'inline',
      `Disabled attack combines its red indicator with the dark overlay and title status ${JSON.stringify(disabledVisualState)}`);
    surface.querySelector('.attack-priority-auto').click();
    const priority = surface.querySelector('.attack-priority-field select');
    priority.value = '1'; priority.dispatchEvent(new Event('change', { bubbles: true }));
    const manualPriorities = { ...entity.attackSelection.priorities };
    check(surface.querySelector('.attack-priority-auto').textContent === 'Priorité personnalisée',
      'Manual priority mode is named Priorité personnalisée');
    surface.querySelector('.attack-priority-auto').click();
    check(entity.attackSelection.priorityMode === 'auto'
      && surface.querySelector('.attack-priority-auto').textContent === 'Priorité auto',
      'Priority control enables automatic ordering');
    surface.querySelector('.attack-priority-auto').click();
    check(entity.attackSelection.priorityMode === 'manual'
      && JSON.stringify(entity.attackSelection.priorities) === JSON.stringify(manualPriorities),
      'Leaving automatic mode restores the last player priority order');
    surface.querySelector('.attack-enabled-control input').click();
    const saved = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    check(saved.attackSelection.priorityMode === 'manual' && saved.attackSelection.priorities.resurrection === 1
      && saved.attackSelection.disabled.resurrection === true, 'Priority and enablement changes persist from the new tab');
    check(getComputedStyle(surface.querySelector('.attack-enabled-control > span')).color === 'rgb(200, 200, 200)',
      'Disabled switch label returns to light grey');
    surface.querySelector('.attack-details .attack-essence-socket').click();
    check(document.querySelector('.attack-essence-popup'), 'Socket card opens in the new tab');
    codex.querySelector('.codex-profil').parentElement.click();
    check(!document.querySelector('.attack-essence-popup'), 'Leaving the tab closes its socket popup');
    codex.querySelector('.codex-attacks').parentElement.click();
    codex.remove();
    codex = ui.createCodexEntityScan(saved, menu, `codex-entity_${entity.id}`);
    check(codex.classList.contains('section-attaques'), 'The attack tab is restored on reopening');
    codex.querySelector('.codex-profil').parentElement.click();
    const noActiveProfile = codex.querySelector('.section-content.profil .attack-active-empty');
    check(noActiveProfile?.textContent === 'Aucune attaque active sur 2 disponibles.'
      && !codex.querySelector('.section-content.profil .attack-details'),
      'Profile reports zero active attacks with the available attack count');
    noActiveProfile.click();
    check(codex.classList.contains('section-attaques'), 'Profile zero-active message opens attack management');
    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-colomn-5 .codex-picto-menu-entity.picto-attack').click();
    const disabledStats = codex.querySelector('.codex-colomn-5 .attack-readonly-overview--stats');
    const manageAttacks = disabledStats.querySelector('.codex-attack-detail-link');
    check(disabledStats.querySelectorAll('.attack-stats-choice.is-attack-disabled').length === 2
      && disabledStats.querySelector('.attack-stats-detail.is-attack-disabled')
      && manageAttacks?.textContent === 'Gérer cette attaque', 'Stats keeps disabled attacks inspectable and exposes management');
    manageAttacks.click();
    check(codex.classList.contains('section-attaques'), 'Stats management link opens the dedicated attack tab');
    const single = structuredClone(saved);
    single.id += 1000000;
    single.attackDetails = [single.attackDetails[0]];
    single.attacks = [single.attackDetails[0].functionName];
    const singleCodex = ui.createCodexEntityScan(single, menu, `codex-entity_${single.id}`);
    singleCodex.querySelector('.codex-attacks').parentElement.click();
    check(!singleCodex.querySelector('.attack-browser-select') && singleCodex.querySelector('.attack-mastery-gauge')
      && singleCodex.querySelectorAll('.codex-attack-context .attack-submenu-infos').length === 1
      && singleCodex.querySelectorAll('.attack-submenu-umbra .attack-umbra-panel').length === 1,
      'Single attack has all controls and one Umbra section without a redundant selector');
    singleCodex.remove();
    const ratioEntity = structuredClone(single);
    ratioEntity.id += 2000000;
    delete ratioEntity.attackEssenceInventory;
    delete ratioEntity.nativeAttacks;
    ratioEntity.attackDetails = [structuredClone(attackDetails.find(attack => attack.functionName === 'quickAttack'))];
    ratioEntity.attacks = ['quickAttack'];
    ratioEntity.attackDetails[0].essenceSlots = [{ color: 'red', active: true }];
    Object.assign(ratioEntity.attackDetails[0], { physicalRatio: 0, magicalRatio: 0, piercingRatio: 1 });
    const ratioCodex = ui.createCodexEntityScan(ratioEntity, menu, `codex-entity_${ratioEntity.id}`);
    ratioCodex.querySelector('.codex-attacks').parentElement.click();
    const fracassRow = ratioCodex.querySelector('.codex-attack-context [data-stat="fracass"]');
    check(fracassRow?.classList.contains('attack-ratio-inactive')
      && fracassRow.dataset.helperSuffix.includes('puissance physique'),
      'Fracassante is dimmed and explains that the attack has no physical-power ratio');
    const previousRatioCard = ratioCodex.querySelector('.attack-details');
    const changedRatioEntity = structuredClone(ratioEntity);
    changedRatioEntity.attackDetails[0].essenceSlots[0].color = 'blue';
    changedRatioEntity.attackDetails[0].attacknature = ['magicalDamage'];
    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail: {
      source: 'essenceur', entityId: ratioEntity.id, entite: changedRatioEntity,
      attack: changedRatioEntity.attackDetails[0],
    } }));
    const nextRatioCard = ratioCodex.querySelector('.attack-details');
    const compactDescription = document.createElement('div');
    compactDescription.innerHTML = _ui.generateAttackDescription({ ...changedRatioEntity.attackDetails[0],
      attackDescription: 'Inflige {$totalDamage} à la cible.' }, changedRatioEntity);
    check(compactDescription.querySelector('.attack-damage-summary .picto-stat.magicalDamage')
      && /^\d+(?:[.,]\d+)?$/.test(compactDescription.querySelector('.attack-damage-summary').textContent.trim())
      && compactDescription.querySelector('.attack-power-calculation [data-power-source="piercingDamage"]')
      && !/[a-zà-ÿ]/i.test(compactDescription.querySelector('.attack-power-calculation').textContent)
      && !compactDescription.querySelector('.attack-power-ratio, .attack-damage-nature'),
      'Damage prose shows only the effective-nature icon and amount, retaining fixed power details without x1');
    const psionicRow = ratioCodex.querySelector('.codex-attack-context [data-stat="psionic"]');
    check(nextRatioCard && nextRatioCard !== previousRatioCard
      && nextRatioCard.querySelector('.attack-nature')?.textContent.includes('Magique')
      && psionicRow?.classList.contains('attack-ratio-inactive')
      && psionicRow.dataset.helperSuffix.includes('puissance magique'),
      'A live essence change rebuilds the single attack and dims unused Psionique');
    check(!nextRatioCard.querySelector('.attack-loot-name').textContent.includes('sublime'),
      'Magical nature with a piercing-only ratio is not sublime');
    const matchingEntity = structuredClone(changedRatioEntity);
    matchingEntity.attackDetails[0].essenceSlots[0].color = 'yellow';
    matchingEntity.attackDetails[0].attacknature = ['piercingDamage'];
    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail: {
      source: 'essenceur', entityId: ratioEntity.id, entite: matchingEntity, attack: matchingEntity.attackDetails[0],
    } }));
    check(ratioCodex.querySelector('.attack-details .attack-loot-name').textContent === 'Quick Attack sublime'
      && ratioCodex.querySelector('.attack-context-title').textContent === 'Propriétés · Quick Attack sublime',
      'Matching essence immediately adds sublime to the detail and context titles');
    check(_ui.createAttackLightDescription(matchingEntity.attackDetails[0], matchingEntity)
      .querySelector('.combat-attack-helper-name').textContent === 'Quick Attack sublime',
      'The compact combat helper shares the sublime title');
    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail: {
      source: 'essenceur', entityId: ratioEntity.id, entite: changedRatioEntity, attack: changedRatioEntity.attackDetails[0],
    } }));
    check(ratioCodex.querySelector('.attack-details .attack-loot-name').textContent === 'Quick Attack'
      && !ratioCodex.querySelector('.attack-context-title').textContent.includes('sublime'),
      'A mismatched essence immediately removes sublime');
    const spectralAttack = { ...matchingEntity.attackDetails[0],
      essenceSlots: [{ color: 'blue' }, { color: 'yellow' }],
      physicalRatio: 0, magicalRatio: 0.8, piercingRatio: 0.2, mastery: { points: 100, level: 2 },
    };
    const spectralTitle = _ui.AttackDetailInfos(spectralAttack, matchingEntity, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    }).querySelector('.attack-loot-name');
    check(spectralTitle.textContent === 'Quick Attack 2 sublime',
      'A spectral attack with both matching ratios places sublime after the title and mastery');
    check(spectralAttack.displayName === 'Quick Attack' && spectralAttack.magicalRatio === 0.8
      && spectralAttack.piercingRatio === 0.2 && matchingEntity.attackDetails[0].displayName === 'Quick Attack',
      'The suffix does not alter stored names or ratios');
    for (const [colors, key, label, asset, expected] of [
      [['red'], 'red', 'physique', 'physic', 'Précision'],
      [['blue'], 'blue', 'magique', 'magic', 'Chaque explosion peut critiquer à partir de ses propres dégâts'],
      [['yellow'], 'yellow', 'perçant', 'piercing', 'Exploite la résistance physique'],
      [['red', 'red', 'red', 'blue'], 'hybrid', 'hybride', 'hybrid', '50 % physique'],
      [['red', 'red', 'red', 'yellow'], 'physical-piercing', 'cinétique', 'cinetic', 'Exaust'],
      [['blue', 'blue', 'blue', 'yellow'], 'magical-piercing', 'spectral', 'spectral', 'sans rattrapage'],
      [['red', 'blue', 'yellow'], 'prism', 'prismatique', 'prismatic', 'Les dégâts normaux de l’attaque sont conservés'],
      [[], 'none', 'inerte', 'power', 'soumis à toutes les résistances'],
    ]) {
      const owner = structuredClone(ratioEntity);
      const attack = owner.attackDetails[0];
      attack.essenceSlots = colors.map(color => ({ color, active: true }));
      attack.attacknature = [];
      window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail: {
        source: 'essenceur', entityId: owner.id, entite: owner, attack,
      } }));
      const panel = ratioCodex.querySelector('.codex-attack-context .attack-critical-panel');
      check(ratioCodex.querySelectorAll('.attack-critical-panel').length === 1
        && panel?.dataset.criticalNature === key
        && panel.querySelector('strong').textContent === `Coup critique ${label}`
        && panel.textContent.includes(expected)
        && !panel.textContent.includes('NaN')
        && getComputedStyle(panel.querySelector('.criticalHit')).backgroundImage.includes(`picto-crit-${asset}.svg`),
        `${label}: live essence changes refresh the unique left critical panel and its icon`);
      if (key === 'magical-piercing') {
        check(panel.textContent.includes('sur les ticks') && panel.textContent.includes('projectiles en vol sont inchangés')
          && panel.textContent.includes('La jauge devient verte pendant le temps ajouté')
          && panel.textContent.includes('Dissolution') && !panel.textContent.includes('Vol de vie'),
          'Spectral helper explains burn recoil, permanent delay, temporary green and excluded timings');
        window.__criticalHelperFixture = owner;
      }
      if (key === 'prism') check(panel.textContent.includes('20 s') && panel.textContent.includes('sans soin'),
        'Prismatic helper keeps the alteration duration and capacity-only recovery');
      check(panel.scrollWidth <= panel.clientWidth + 1, `${label}: critical panel has no horizontal overflow`);
    }
    ratioCodex.remove();
    const disabled = structuredClone(saved);
    disabled.id = single.id + 1;
    disabled.attackSelection.disabled = Object.fromEntries(disabled.attacks.map(key => [key, true]));
    const disabledCodex = ui.createCodexEntityScan(disabled, menu, `codex-entity_${disabled.id}`);
    disabledCodex.querySelector('.codex-attacks').parentElement.click();
    check(disabledCodex.querySelectorAll('.attack-browser-thumb').length === 2
      && !disabledCodex.querySelector('.attack-enabled-control input').checked, 'Fully disabled kits remain visible and editable');
    disabledCodex.remove();
    check(readAttackDefinitionsForEntity(entity).length === 2, 'Navigation leaves the attack kit unchanged');
    _ui2.createInventory();
    const inventory = document.querySelector('.inventory-interface');
    inventory.querySelector('[data-inventory-tab="essences"]').click();
    const used = inventory.querySelector('[data-inventory-show-used="true"]');
    if (!used.checked) used.click();
    const socketed = inventory.querySelector('.inventory-item--socketed');
    check(socketed, 'Equipped essence is visible in inventory');
    window.__codexAttackEntityId = entity.id;
    socketed.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return reports;
  });
  await page.waitForSelector('.section-attaques .section-content.attaques .attack-details');
  await page.waitForSelector('.attack-essence-popup');
  assert.equal(await page.locator('.inventory-interface').count(), 0, 'Inventory jump closes inventory');
  assert.equal(await page.locator('.section-attaques').count(), 1, 'Inventory jump targets the dedicated attack tab');
  await mkdir('outputs/codex-attacks-tests', { recursive: true });
  await page.screenshot({ path: 'outputs/codex-attacks-tests/essence-popup.png' });
  await page.evaluate(async () => {
    const { showGamePopupMessage } = await import("/js/ui/display.js");
    window.__essenceOverlayConfirmation = showGamePopupMessage({
      mode: 'manual', title: 'Confirmer', message: 'Essence universelle',
      actions: [{ label: 'Annuler', value: false }, { label: 'Continuer', value: true, primary: true }],
    });
  });
  await page.locator('.game-popup-layer--manual button.primary').click();
  assert.equal(await page.evaluate(() => window.__essenceOverlayConfirmation), true,
    'Universal essence confirmation remains clickable above the socket popup');
  await page.locator('.attack-essence-popup-backdrop').click({ position: { x: 5, y: 5 } });
  assert.equal(await page.locator('.attack-essence-popup, .attack-essence-popup-backdrop').count(), 0,
    'Clicking outside closes the socket popup and removes its backdrop');
  // The multi-attack screen also stays inside the shared landscape frame.
  await page.screenshot({ path: 'outputs/codex-attacks-tests/multi-attack-desktop.png' });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: 'outputs/codex-attacks-tests/multi-attack-mobile.png' });
  const multiMobile = await page.locator('.section-content.attaques .attack-imgs.multi-attacks').evaluate(node => {
    const submenu = node.closest('.attack-submenu');
    return {
      overflow: node.scrollWidth - node.clientWidth,
      thumbsInside: [...node.querySelectorAll('.attack-browser-thumb')].every(thumb => {
      const parent = node.getBoundingClientRect();
      const rect = thumb.getBoundingClientRect();
      return rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
      }),
      logicalColumns: getComputedStyle(submenu.querySelector('.attack-details--codex .attack-details-colomne')).gridTemplateColumns,
    };
  });
  assert.ok(multiMobile.overflow <= 1 && multiMobile.thumbsInside,
  JSON.stringify(multiMobile));
  await page.setViewportSize({ width: 1280, height: 900 });
  const visual = await page.evaluate(async () => {
    const ui = await import("/js/ui/codex/index.js");
    const { entitesNestUp, entites } = await import("/js/entities/runtime.js");
    const sample = structuredClone(entitesNestUp.find(entity => entity.name === 'Mouche asticoteuse'));
    sample.id = 777001;
    sample.side = 'A';
    sample.role = 'tank';
    entites.length = 0;
    entites.push(sample);
    localStorage.setItem('selectedArmyA', JSON.stringify([sample]));
    document.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
    const menu = document.querySelector('.menu-map-container');
    const codex = ui.createCodexEntityScan(sample, menu, `codex-entity_${sample.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    return {
      umbras: codex.querySelectorAll('.attack-umbra-entry.is-available').length,
      leftSkills: !!codex.querySelector('.codex-attack-context .attack-submenu-infos'),
      availableInk: getComputedStyle(codex.querySelector('.attack-umbra-entry.is-available > span')).color,
      unavailableInk: getComputedStyle(codex.querySelector('.attack-umbra-entry.is-unavailable > span')).color,
    };
  });
  assert.ok(visual.umbras > 0 && visual.leftSkills && visual.availableInk !== visual.unavailableInk,
    `Representative attack has skills and colored Umbras: ${JSON.stringify(visual)}`);
  const emptyUmbraPanel = await page.evaluate(async () => {
    const ui = await import("/js/ui/codex/index.js");
    const { enrichEntityStats } = await import("/js/entities/runtime.js");
    const sample = enrichEntityStats({id:777002,name:'Sans Umbra',type:'sbire',side:'A',level:1,awakening:1,attacks:['autoAttack'],baseStats:{HP:100},stuff:{}});
    sample.id = 777002;
    [
      'vigueur', 'constitution', 'vitality', 'brutality', 'robustness', 'resilience', 'bloodFury',
      'indestructibility', 'weaponMastery', 'esprit', 'integrite', 'haste', 'inflexion', 'astrality',
      'equilibre', 'hypercognition', 'transcendence', 'mysticism', 'finesse', 'adresse', 'precision',
      'criticalPower', 'esoterism', 'vivacite', 'ambidextry', 'occultism', 'movement',
    ].forEach(key => { sample.stats[key] = 0; });
    const mount = document.createElement('div');
    document.body.append(mount);
    const codex = ui.createCodexEntityScan(sample, mount, `codex-entity_${sample.id}`);
    codex.querySelector('.codex-stat').parentElement.click();
    codex.querySelector('.codex-substat-tab--umbra').click();
    const empty = codex.querySelector('.codex-umbra-empty');
    const result = {
      text: empty?.textContent,
      alignment: empty ? getComputedStyle(empty).textAlign : '',
      strayStats: codex.querySelectorAll('.codex-substat-panel--umbra .stat-container').length,
    };
    mount.remove();
    return result;
  });
  assert.deepEqual(emptyUmbraPanel, {
    text: "L'entité ne sait pas ce qu'est une Umbra.",
    alignment: 'center',
    strayStats: 0,
  }, 'Entity without Umbras receives one centered explanatory message');
  // Keep the Codex inside the real game window: it shares the game's one scale.
  await page.screenshot({ path: 'outputs/codex-attacks-tests/desktop.png' });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.screenshot({ path: 'outputs/codex-attacks-tests/wide-desktop.png' });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: 'outputs/codex-attacks-tests/mobile.png' });
  await page.locator('.section-attaques').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await page.screenshot({ path: 'outputs/codex-attacks-tests/mobile-affinities.png' });
  const layout = await page.evaluate(() => {
    const root = document.querySelector('.section-attaques');
    const rect = root.getBoundingClientRect();
    const panel = root.querySelector('.codex-colomn-3');
    const close = root.querySelector('.close-button').getBoundingClientRect();
    const side = root.querySelector('.codex-attack-context').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth, overflow: panel.scrollWidth - panel.clientWidth,
      sideReachable: side.top < innerHeight && side.bottom > 0,
      closeClear: [...root.querySelectorAll('.codex-inner-menu')].every(node => {
        const r = node.getBoundingClientRect();
        return r.right <= close.left || r.left >= close.right || r.top >= close.bottom || r.bottom <= close.top;
      }),
      menus: [...root.querySelectorAll('.codex-inner-menu')].every(node => node.scrollWidth <= node.clientWidth + 1) };
  });
  assert.ok(layout.left >= -1 && layout.right <= layout.width + 1 && layout.overflow <= 1
    && layout.menus && layout.closeClear && layout.sideReachable, JSON.stringify(layout));
  for (const width of [390, 844, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['profil', 'attacks', 'stat', 'soul', 'lore']) {
      await page.locator('.codex-entity-scan .codex-inner-menu').filter({ has: page.locator(`.codex-${section}`) }).click();
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const frame = await page.locator('.codex-entity-scan').evaluate(root => {
        const nav = root.querySelector('.codex-colomn-2');
        const frame = root.getBoundingClientRect();
        const menu = nav.getBoundingClientRect();
        const game = document.getElementById('game-windows');
        const scale = game.getBoundingClientRect().width / game.offsetWidth;
        return {
          display: getComputedStyle(root).display,
          columnDisplay: getComputedStyle(root.querySelector('.codex-colomn-4')).display,
          sideOrder: getComputedStyle(root.querySelector('.codex-colomn-1')).order,
          top: (menu.top - frame.top) / scale, right: (frame.right - menu.right) / scale,
          width: menu.width / scale, height: menu.height / scale,
          anchoredToRoot: nav.parentElement === root,
          spacerHeight: root.querySelector('.codex-menu-spacer').getBoundingClientRect().height / scale,
          buttons: [...nav.children].map(node => ({ width: node.getBoundingClientRect().width / scale,
            height: node.getBoundingClientRect().height / scale, fits: node.scrollWidth <= node.clientWidth + 1 })),
        };
      });
      assert.equal(frame.display, 'flex', `${width}px/${section}: the original Codex container is restored`);
      assert.notEqual(frame.columnDisplay, 'contents', 'Content columns keep their original boxes');
      if (section === 'soul') assert.equal(frame.sideOrder, '2', 'Soul keeps its original right-hand Umbra column');
      assert.ok(frame.anchoredToRoot && Math.abs(frame.top - 24) < 1 && Math.abs(frame.right - 50) < 1,
        `${width}px/${section}: only the menu uses a shared anchor ${JSON.stringify(frame)}`);
      assert.ok(Math.abs(frame.height - 36) < .01);
      assert.ok(Math.abs(frame.spacerHeight - 36) < .01, 'The original menu space above the content is retained');
      assert.ok(Math.abs(frame.width - 680) < .01, 'All devices share the same logical menu width');
      assert.ok(frame.buttons.length === 5 && frame.buttons.every(button => button.fits && Math.abs(button.height - 36) < .01
        && Math.abs(button.width - frame.buttons[0].width) < 1),
      'Five readable buttons with the same layout on every device');
      await page.screenshot({ path: `outputs/codex-attacks-tests/frame-${width}-${section}.png` });
    }
  }
  console.log('PASS: one logical menu layout on five sections at 390, 844, 1280 and 1920px');
  await page.evaluate(async () => {
    const { createCodexEntityScan } = await import('/js/ui/codex/index.js');
    document.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
    const host = document.querySelector('#game-windows .Game-UI .menu-map-container');
    const entity = window.__criticalHelperFixture;
    const codex = createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
  });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const panel = page.locator('.codex-attack-context .attack-critical-panel');
    await panel.scrollIntoViewIfNeeded();
    assert.equal(await panel.getAttribute('data-critical-nature'), 'magical-piercing');
    assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.screenshot({ path: `outputs/codex-attacks-tests/critical-spectral-${viewport.width}.png` });
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(reports.join('\n'));
  console.log('PASS: codex attack tab, settings, single/disabled states, inventory deep link and desktop/mobile layout');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
