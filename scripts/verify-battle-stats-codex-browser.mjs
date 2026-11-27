import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + '/') && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/html'); res.end(await readFile(path === root ? resolve(root, 'index.html') : path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const { entitesNestUp, entites } = await import("/js/entities/runtime.js");
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js"), { createCodexCombatRecord } = await import("/js/ui/codex/profile.js");
    const { calculateStatsDisplay } = await import("/js/ui/statistics/details.js");
    const { createAttackNatureSignature } = await import("/js/ui/attacks.js");
    const { recordEntityCombatProc } = await import("/js/storage/entityStorage.js");
    const check = (condition, label) => { if (!condition) throw Error(label); return label; };
    const entity = structuredClone(entitesNestUp.find(entry => entry.name === 'Grouille-Doigt TEST 2A support'));
    entity.side = 'A'; entity.role = 'mage'; entity.type = 'sbire';
    entity.stats.bloodFury = 10;
    entity.combatDetails = {
      damageByNature: {
        physicalDamage: { total: 10, physical: 10, magical: 0, piercing: 0 },
        hybridalDamage: { total: 20, physical: 10, magical: 10, piercing: 0 },
        physicalPiercingDamage: { total: 100, physical: 30, magical: 0, piercing: 70 },
        magicalPiercingDamage: { total: 84, physical: 0, magical: 34, piercing: 50 },
        hybridalPiercingDamage: { total: 30, physical: 10, magical: 10, piercing: 10 },
      },
      criticalDamage: 40, criticalBonusDamage: 7,
      executionDamage: 20, ambidextryDamage: 18, ambidextryHealing: 6, lifeStealHealed: 12,
      damageByRange: { melee: 120, ranged: 124, other: 0 },
      healingByRange: { melee: 10, ranged: 15, other: 0 },
      damageReceived: 65, armorDamageReceived: 15, healingReceived: 22,
      movements: 9, marathonMovements: 2, forcedMovements: 1,
      hpDamageDealt: 200, armorDamageDealt: 44, hpDamageReceived: 50,
      battleHpRegenerated: 14, dailyHpRecovered: 8,
      defenseHp: { astrality: 49, dodge: 18 },
      livesUsed: { extraLife: 1, fadedLife: 2, eternalLife: 3 },
      fleeAttempts: 3, fleeSuccesses: 1, fleeFailures: 2,
      blockedMovements: 3, negativeMovements: 2, physicalProjectilesAvoided: 4,
      consumablesUsed: 8, consumablesGround: 2, consumablesPouch: 5, consumablesInventory: 1,
      consumablesHostile: 2, consumablesSupport: 6, consumableDamageReceived: 7, consumableHealingReceived: 20,
      lifetime: { experienceSpent: 540, maxLevelReached: 12, archetypesCompleted: 2,
        daysAlive: 7, daysDead: 3, longestAliveStreak: 5, longestDeadStreak: 2 },
      roles: { mage: { battles: 4, damageDealt: 200, damageReceived: 50, durationMs: 15000 },
        tank: { battles: 1, damageDealt: 44, damageReceived: 15, durationMs: 10000 } },
      procs: { critical: 2, ambidextry: 3, lifesteal: 2, bloodCrazy: 1, bloodGlutony: 1, trailer: 1 },
    };
    entity.totalDamage = 244; entity.totalHeal = 25; entity.kills = 3; entity.battlesFought = 4;
    entity.acquisition = { source: 'quest', gameDay: 3 };
    localStorage.setItem('gameDay', '13');
    entites.length = 0; entites.push(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    localStorage.removeItem('CodexInformationMode');
    window.selectedArmyA = [entity];
    let host = document.querySelector('.Game-UI');
    if (!host) { host = document.createElement('div'); host.className = 'Game-UI'; document.body.append(host); }
    document.body.append(host);
    host.style.cssText = 'position:fixed;inset:0;z-index:2000000;display:block;background:#191414;';
    host.replaceChildren();
    const menu = document.createElement('div'); menu.className = 'menu-map-container'; host.append(menu);
    const codex = createCodexEntityScan(entity, menu, `codex-entity_${entity.id}`);
    const reports = [];
    codex.querySelector('.codex-profil').parentElement.click();
    reports.push(check(!codex.querySelector('.section-content.profil .codex-combat-record')
      && codex.querySelector('.section-content.profil .codex-profile-battle-stat.damageReceived-profile-stat'),
      'Profile keeps the compact received-damage summary without the long record'));
    reports.push(check(!codex.querySelector('.ScanEntity .codex-combat-record'),
      'ScanEntity does not acquire the long record'));
    codex.querySelector('.codex-stat').parentElement.click();
    const bloodFuryIcons = [
      ['bloodFuryExecutionChance', 'picto-bloodFury-chance.svg'],
      ['bloodFuryExecutionDamage', 'picto-bloodFury-damage.svg'],
      ['bloodFuryTargetThreshold', 'picto-bloodFury-hp.svg'],
    ];
    reports.push(check(bloodFuryIcons.every(([stat, asset]) => {
      const icon = codex.querySelector(`.section-content.stats .stat-container[data-stat="${stat}"] .picto-stat.${stat}`);
      const helper = calculateStatsDisplay(stat, entity).helpContent;
      return icon && getComputedStyle(icon).backgroundImage.includes(asset)
        && helper.includes(`picto-stat ${stat}`);
    }) && bloodFuryIcons.every(([stat]) =>
      calculateStatsDisplay('bloodFury', entity).helpContent.includes(`picto-stat ${stat}`)),
    'Blood Fury stats and their helpers use the three dedicated SVG pictograms'));
    const statsToggle = codex.querySelector('.section-content.stats .codex-substat-toggle');
    const statsToggleDisplay = getComputedStyle(statsToggle).display;
    const statsTabMargin = getComputedStyle(statsToggle.querySelector('.codex-substat-tab')).marginBottom;
    reports.push(check(statsToggle.children.length === 2
      && !codex.querySelector('.section-content.stats .codex-substat-tab--soul, .section-content.stats .codex-substat-tab--archetype'),
      'Stats now contains only its stat and Umbra tabs'));
    codex.querySelector('.codex-colomn-2 .codex-soul').parentElement.click();
    const soul = codex.querySelector('.section-content.soul');
    const soulTabs = soul.querySelector('.codex-soul-tabs');
    reports.push(check(soulTabs.children.length === 3
      && getComputedStyle(soulTabs).display === statsToggleDisplay
      && getComputedStyle(soulTabs.firstElementChild).marginBottom === statsTabMargin
      && soul.querySelector('.codex-substat-panel--progression:not([hidden]) .level-up-section'),
      'Soul preserves the progression form and uses the same three-tab layout'));
    soulTabs.querySelector('[data-mode="archetype"]').click();
    reports.push(check(soul.querySelector('.codex-substat-panel--archetype:not([hidden])')?.childElementCount > 0
      && soul.querySelector('.codex-substat-panel--progression[hidden]'), 'Archetypes opens under Soul'));
    soulTabs.querySelector('[data-mode="soul"]').click();
    reports.push(check(soul.querySelector('.codex-substat-panel--soul:not([hidden])')?.childElementCount > 0,
      'The Soul graph builds in its own active panel'));
    const sharedGraph = soul.querySelector('.codex-substat-panel--soul .attribut-graph-container');
    const graphId = sharedGraph.id;
    reports.push(check(soul.querySelectorAll('.attribut-graph-container').length === 1
      && document.querySelectorAll(`[id="${graphId}"]`).length === 1,
      'Soul reuses the progression graph without duplicate identifiers or level-up forms'));
    soulTabs.querySelector('[data-mode="progression"]').click();
    reports.push(check(soul.querySelector('.codex-substat-panel--progression .attribut-graph-container') === sharedGraph,
      'Returning to Progression restores the same live graph in its original position'));
    soulTabs.querySelector('[data-mode="soul"]').click();
    codex.querySelector('.codex-profil').parentElement.click();
    codex.querySelector('.codex-colomn-2 .codex-soul').parentElement.click();
    reports.push(check(codex.querySelector('.section-content.soul .codex-substat-tab--progression.active')
      && codex.querySelector('.section-content.soul .codex-substat-panel--progression:not([hidden])')
      && localStorage.getItem('CodexSoulMode') === null,
      'Soul always returns to Level up without persisting a submenu choice'));
    codex.querySelector('.codex-lore').parentElement.click();
    const info = codex.querySelector('.section-content.informations');
    const infoToggle = info.querySelector('.codex-information-tabs');
    const [historyButton, combatButton] = infoToggle.querySelectorAll('.codex-substat-tab');
    reports.push(check(getComputedStyle(infoToggle).display === statsToggleDisplay
      && getComputedStyle(historyButton).marginBottom === statsTabMargin
      && combatButton.getBoundingClientRect().top >= historyButton.getBoundingClientRect().bottom,
      'Information tabs inherit the same vertical layout and spacing as Stats tabs'));
    reports.push(check(info.querySelector('.codex-information-history:not([hidden])')
      && info.querySelector('.codex-information-battle[hidden]'), 'Information starts on History'));
    info.querySelector('.codex-substat-tab--combat').click();
    const battle = info.querySelector('.codex-information-battle');
    reports.push(check(!battle.hidden && info.querySelector('.codex-information-history').hidden
      && info.querySelector('.codex-substat-tab--combat.active')
      && localStorage.getItem('CodexInformationMode') === null,
      'Combat statistics becomes active without changing the default for another Codex'));
    const otherEntity = structuredClone(entity);
    otherEntity.id = 998731;
    const otherCodex = createCodexEntityScan(otherEntity, menu, `codex-entity_${otherEntity.id}`);
    otherCodex.querySelector('.codex-lore').parentElement.click();
    reports.push(check(otherCodex.querySelector('.codex-information-history:not([hidden]) .entity-lore-text')
      && otherCodex.querySelector('.codex-information-battle[hidden]')
      && otherCodex.querySelector('.codex-substat-tab--history[aria-selected="true"]')
      && !otherCodex.classList.contains('battle-stats-view'),
      'A newly opened Codex starts on Lore even after Combat was selected in another Codex'));
    otherCodex.querySelector('.codex-substat-tab--combat').click();
    otherCodex.remove();
    const reopenedCodex = createCodexEntityScan(otherEntity, menu, `codex-entity_${otherEntity.id}`);
    reopenedCodex.querySelector('.codex-lore').parentElement.click();
    reports.push(check(reopenedCodex.querySelector('.codex-information-history:not([hidden])')
      && reopenedCodex.querySelector('.codex-information-battle[hidden]'),
      'Closing and reopening the Codex restores the Lore default'));
    reopenedCodex.remove();
    const record = battle.querySelector('.codex-combat-record');
    reports.push(check(record.querySelector('.codex-combat-theme--attack')
      && record.querySelector('.codex-combat-theme--defense')
      && record.querySelector('.codex-combat-theme--utility'),
      'Battle performance is grouped as Attack, Defense and Utility'));
    const overview = record.querySelector('.codex-combat-overview');
    const summaryRect = overview.querySelector('.codex-combat-theme--attack').getBoundingClientRect();
    const rangeRect = overview.querySelector('.codex-combat-group--range').getBoundingClientRect();
    const defenseRect = overview.querySelector('.codex-combat-theme--defense').getBoundingClientRect();
    const utilityRect = overview.querySelector('.codex-combat-theme--utility').getBoundingClientRect();
    const distribution = record.querySelector('.codex-combat-group--distribution');
    const distributionColumns = [...distribution.querySelector('.codex-combat-breakdown').children];
    const offense = record.querySelector('.codex-combat-group--offense');
    reports.push(check(rangeRect.left === summaryRect.left && rangeRect.bottom <= summaryRect.bottom
      && Math.abs(defenseRect.top - summaryRect.top) < 1 && Math.abs(utilityRect.top - summaryRect.top) < 1
      && defenseRect.left > summaryRect.right && utilityRect.left > defenseRect.right
      && distribution.querySelector(':scope > h3').textContent === 'Répartition des dégâts'
      && distributionColumns.length === 1
      && distributionColumns[0].querySelector('h4').textContent === 'Par nature'
      && distributionColumns.every(node => getComputedStyle(node.querySelector('.codex-combat-columns'))
        .gridTemplateColumns.split(' ').length === 3)
      && Math.abs(distribution.getBoundingClientRect().width - record.clientWidth) < 1
      && Math.abs(offense.getBoundingClientRect().width - record.clientWidth) < 1
      && offense.querySelector('.codex-combat-offense-columns').childElementCount === 1
      && !record.querySelector('.codex-combat-group .codex-combat-group'),
      'Three-column summaries and damage breakdowns retain independent offensive points/counts'));
    const mainValue = overview.querySelector('.codex-combat-row > :last-child');
    const detailValue = record.querySelector('.codex-combat-row--sub > :last-child');
    reports.push(check(getComputedStyle(mainValue).color === 'rgb(240, 241, 242)'
      && getComputedStyle(detailValue).color === 'rgb(169, 176, 180)'
      && record.querySelector('.codex-combat-header h2').textContent === 'Statistiques de combat',
      'Neutral totals and muted indented details retain a readable hierarchy'));
    reports.push(check(!record.querySelector('.codex-combat-subtitle')
      && [...record.querySelectorAll('.codex-combat-row, .codex-combat-group, h4')].every(node => {
        const style = getComputedStyle(node);
        return style.borderTopWidth === '0px' && style.borderBottomWidth === '0px';
      }) && [...record.querySelectorAll('.codex-combat-group > h3')].every(node =>
        getComputedStyle(node).borderBottomWidth === '1px'
        && getComputedStyle(node).borderBottomColor === 'rgba(214, 196, 158, 0.22)')
      && getComputedStyle(distributionColumns[0]).borderTopWidth === '0px'
      && [...record.querySelectorAll('.codex-combat-subgroup > h4')].every(heading => {
        const divider = getComputedStyle(heading, '::after');
        return getComputedStyle(heading).color === 'rgb(235, 222, 193)'
          && divider.content === '""' && divider.height === '1px' && divider.flexGrow === '1';
      })
      && getComputedStyle(mainValue.parentElement).marginLeft === '20px'
      && mainValue.parentElement.getBoundingClientRect().height <= 26,
      'Warm subsection headings, light trailing dividers and indented rows match the reference hierarchy'));
    const subgroupTitles = group => [...group.querySelectorAll(':scope > .codex-combat-subgroup > h4')]
      .map(heading => heading.textContent).join('|');
    reports.push(check(subgroupTitles(overview.querySelector('.codex-combat-theme--attack'))
        === 'Corps à corps|À distance|Autres sources'
      && overview.nextElementSibling.classList.contains('codex-summons-record')
      && subgroupTitles(overview.querySelector('.codex-combat-theme--defense')) === 'HP préservés'
      && subgroupTitles(overview.querySelector('.codex-combat-theme--utility')) === 'Mouvement|Fuite',
      'Utility groups movement and escape while Attack and Defense retain their own subgroups'));
    reports.push(check(!record.querySelector('.codex-combat-role-transitions')
      && !record.textContent.includes('Changements de rôle')
      && record.querySelector('.codex-combat-counts--defense').textContent.includes('Occultismes0')
      && !record.querySelector('.codex-combat-counts--utility').textContent.includes('Occultismes')
      && record.querySelector('.codex-combat-counts--utility').textContent.includes('Transes mystiques0')
      && record.querySelector('.codex-combat-group--penalties').textContent.includes('Fragilités des ombres subies0')
      && record.querySelector('.codex-combat-group--feats').textContent.includes('Éliminations3'),
      'Stat categories follow statsData, penalties and war deeds are separate, role transitions are absent'));
    reports.push(check(!record.querySelector('img, .picto-stat, .codex-profile-panel--battle')
      && !record.textContent.includes('PV actuels') && !record.textContent.includes('Vitesse'),
      'The full battle record has no entity image, pictograms or live HP/stat panel'));
    reports.push(check(battle.querySelector(':scope > .entity-lore-ambiance.codex img')
      && Number(getComputedStyle(battle.querySelector('.entity-lore-ambiance')).opacity) > 0
      && Number(getComputedStyle(battle.querySelector('.entity-lore-ambiance')).opacity) <= 0.2
      && getComputedStyle(record).opacity === '1', 'Lore is a dimmed background without dimming the statistics'));
    const physical = record.querySelector('.codex-combat-component--physical');
    const magical = record.querySelector('.codex-combat-component--magical');
    const piercing = record.querySelector('.codex-combat-component--piercing');
    reports.push(check(physical?.querySelector('.codex-combat-row--total')?.textContent === 'Physique60'
      && physical.textContent.includes('Seule10')
      && physical.textContent.includes('Via Cinétique30')
      && !physical.textContent.includes('Spectrale')
      && magical?.querySelector('.codex-combat-row--total')?.textContent === 'Magique54'
      && piercing?.querySelector('.codex-combat-row--total')?.textContent === 'Perçant130',
      'Component totals reconcile with pure, mixed and prism damage without giving Spectral a physical part'));
    const natureGrid = distributionColumns[0].querySelector('.codex-combat-columns');
    const natureBlocks = [...natureGrid.querySelectorAll(':scope > .codex-combat-breakdown-block')];
    reports.push(check(natureBlocks.length === 8
      && [physical, magical, piercing].every(block => block.parentElement === natureGrid)
      && !distribution.textContent.includes('Par composante')
      && natureBlocks.map(block => block.querySelector('.codex-combat-row--total > :first-child').textContent)
        .join('|') === 'Physique|Magique|Perçant|Hybride|Cinétique|Spectrale|Prismatique|Inerte'
      && natureBlocks.every(block => {
        if (block.classList.contains('codex-combat-nature--inerte')) return true;
        const total = Number(block.querySelector('.codex-combat-row--total > :last-child').textContent);
        const parts = [...block.querySelectorAll('.codex-combat-row--sub > :last-child')];
        return parts.reduce((sum, value) => sum + Number(value.textContent), 0) === total;
      })
      && [physical, magical, piercing].reduce((sum, block) =>
        sum + Number(block.querySelector('.codex-combat-row--total > :last-child').textContent), 0) === entity.totalDamage,
      'A single nature grid merges component details under their totals without duplicate pure-nature blocks'));
    reports.push(check(record.querySelector('.codex-combat-nature--magicalPiercingDamage')?.textContent.includes('Spectrale84Part magique34Part perçante50')
      && record.querySelector('.codex-combat-nature--physicalPiercingDamage')?.textContent.includes('Cinétique100Part physique30Part perçante70'),
      'Mixed natures show their own total and exact real-damage components'));
    reports.push(check(record.textContent.includes("Dégâts d'ambidextrie18")
      && record.querySelector('[data-range="melee"]').textContent === 'Corps à corpsDégâts120Soins10'
      && record.querySelector('[data-range="ranged"]').textContent === 'À distanceDégâts124Soins15'
      && record.querySelector('[data-range="other"]').textContent === 'Autres sourcesDégâts0Soins0',
      'Short damage/healing labels keep their range context and do not mislabel other sources as DoTs/HoTs'));
    const offensiveResults = record.querySelector('.codex-combat-group--offense .codex-combat-subgroup');
    reports.push(check(offensiveResults?.querySelector('h4')?.textContent === 'Dégâts (points)'
      && record.textContent.includes('Dont PV supplémentaires dus au critique7')
      && !record.textContent.includes('Dont dégâts aussi critiques')
      && !record.textContent.includes('critique sur second coup')
      && record.querySelector('.codex-combat-theme--utility').textContent.includes("Soins d'ambidextrie6")
      && record.querySelector('.codex-combat-convention')?.textContent
        === 'Ces sous-totaux sont déjà compris dans les dégâts infligés et peuvent se recouper.',
      'Ambidextry exposes just second-hit damage and healing without critical cross-breakdowns'));
    reports.push(check(record.textContent.includes('Seconds coups lancés3')
      && record.textContent.includes('Restaurations par vol de vie2')
      && record.textContent.includes('Exécutions par Démence sanguinaire1')
      && record.textContent.includes('Voracités déclenchées1')
      && record.querySelector('.codex-combat-movement').textContent.includes('Trailer1')
      && !record.textContent.includes('Remorquages')
      && !record.textContent.includes('Fureurs sanguinaires'),
      'Proc labels describe the events actually counted'));
    const zeroCase = structuredClone(entity);
    zeroCase.combatDetails = {
      criticalDamage: 25, ambidextryDamage: 8, lifeStealHealed: 0,
      procs: { critical: 5, ambidextry: 4, lifesteal: 0, bloodCrazy: 0, bloodGlutony: 0 },
    };
    const zeroRecord = createCodexCombatRecord(zeroCase);
    const zeroOffense = zeroRecord.querySelector('.codex-combat-group--offense');
    const zeroGroups = [zeroOffense.querySelector('.codex-combat-subgroup'), zeroRecord.querySelector('.codex-combat-counts--offense')];
    reports.push(check(zeroGroups[0]?.querySelector('h4')?.textContent === 'Dégâts (points)'
      && zeroGroups[1]?.querySelector('h3')?.textContent === 'Déclenchements offensifs'
      && zeroGroups[0].textContent.includes('Dégâts des coups critiques25')
      && zeroGroups[0].textContent.includes("Dégâts d'ambidextrie8")
      && zeroGroups[1].textContent.includes('Impacts critiques avec dégâts5')
      && zeroGroups[1].textContent.includes('Seconds coups lancés4')
      && zeroRecord.querySelector('.codex-combat-theme--utility').textContent.includes('PV restaurés par vol de vie0')
      && zeroRecord.querySelector('.codex-combat-theme--utility').textContent.includes("Soins d'ambidextrie0")
      && zeroGroups[1].textContent.includes('Restaurations par vol de vie0')
      && zeroGroups[1].textContent.includes('Exécutions par Démence sanguinaire0')
      && zeroGroups[1].textContent.includes('Voracités déclenchées0')
      && !zeroOffense.textContent.includes('Dont dégâts aussi critiques'),
      'Development statistics separate points from counts while retaining zero events'));
    const temporaryStat = structuredClone(entity);
    temporaryStat.stats = { ...temporaryStat.stats, indestructibility: 0 };
    temporaryStat.combatDetails.procs = { ...temporaryStat.combatDetails.procs, indestructible: 2 };
    const temporaryRecord = createCodexCombatRecord(temporaryStat);
    reports.push(check(temporaryRecord.textContent.includes('Indestructibilités2')
      && temporaryRecord.textContent.includes('Ésotérismes0'),
      'Previously triggered temporary stats and unused absent stats are both visible'));
    const legacyAttack = structuredClone(entity);
    legacyAttack.attacks = [];
    legacyAttack.attackDetails = [{ functionName: 'legacy-mixed-test', combatFunction: 'Attaquant',
      attacknature: ['physicalDamage', 'magicalDamage'], attackTarget: ['enemy'],
      attackRange: ['melee'], essenceSlots: [] }];
    legacyAttack.combatDetails = {};
    legacyAttack.totalDamage = 0;
    const legacyRecord = createCodexCombatRecord(legacyAttack);
    reports.push(check(legacyRecord.querySelector('.codex-combat-nature--hybridalDamage')
      && legacyRecord.querySelector('.codex-combat-nature--physicalDamage'),
      'All damage natures remain visible regardless of the owned attack nature'));
    const emptyEntity = { id: 'combat-display-empty', type: 'sbire', stats: {}, attacks: [], attackDetails: [] };
    const beforeDisplay = JSON.stringify(emptyEntity);
    const emptyRecord = createCodexCombatRecord(emptyEntity);
    const rowsOf = node => [...node.querySelectorAll('.codex-combat-row')];
    const labelsOf = node => rowsOf(node).map(row => row.firstElementChild.textContent);
    const emptyLabels = labelsOf(emptyRecord);
    reports.push(check(rowsOf(emptyRecord).every(row => ['0', '0 (0%)', '', '1', 'Aucune', 'Non renseigné', 'Non renseignée'].includes(row.lastElementChild.textContent))
      && JSON.stringify(emptyLabels) === JSON.stringify(labelsOf(record))
      && new Set(emptyLabels).size === new Set(labelsOf(record)).size
      && emptyRecord.querySelectorAll('[class*="codex-combat-component--"]').length === 3
      && emptyRecord.querySelectorAll('[class*="codex-combat-nature--"]').length === 8
      && emptyRecord.querySelector('.codex-combat-counts--offense').querySelectorAll('.codex-combat-row').length === 7
      && emptyRecord.querySelector('.codex-combat-counts--defense').querySelectorAll('.codex-combat-row').length === 9
      && emptyRecord.querySelector('.codex-combat-movement').parentElement.classList.contains('codex-combat-theme--utility')
      && emptyRecord.querySelector('[data-range="other"]').textContent === 'Autres sourcesDégâts0Soins0'
      && emptyRecord.textContent.includes('Non ventilés0')
      && JSON.stringify(emptyEntity) === beforeDisplay,
      'An entity without skills, attacks or history shows every counter at zero without mutating its data'));
    for (const template of entitesNestUp) {
      const specimen = structuredClone(template);
      delete specimen.combatDetails;
      specimen.type = 'sbire';
      const specimenRecord = createCodexCombatRecord(specimen);
      check(JSON.stringify(labelsOf(specimenRecord)) === JSON.stringify(emptyLabels),
        `Development counter coverage differs for ${template.name}`);
    }
    reports.push(`Every entity template (${entitesNestUp.length}) exposes the same counters in the same order`);
    reports.push(check(!createCodexCombatRecord({ ...emptyEntity, type: 'lord' }).querySelector('.codex-combat-group--roles')
      && record.querySelector('.codex-combat-group--roles').textContent.includes('Rôle le plus joué : Mage')
      && record.querySelector('tr[data-role="mage"]').textContent === 'Mage420050'
      && record.querySelector('tr[data-role="tank"]').textContent === 'Tank14415',
      'The compact role report is sbire-only and selects the role by active combat duration'));
    const otherSources = createCodexCombatRecord({ ...emptyEntity,
      combatDetails: { damageByRange: { other: 17 }, healingByRange: { other: 9 } } });
    reports.push(check(otherSources.querySelector('[data-range="other"]').textContent === 'Autres sourcesDégâts17Soins9',
      'Other-source amounts stay intact without being reclassified as periodic effects'));
    const additionalProc = createCodexCombatRecord({ ...emptyEntity,
      combatDetails: { procs: { critical: 3, marathon: 0, futureCombatProc: 0 } } });
    reports.push(check(labelsOf(additionalProc).length === emptyLabels.length + 1
      && rowsOf(additionalProc).filter(row => row.textContent === 'Impacts critiques avec dégâts3').length === 1
      && additionalProc.textContent.includes('futureCombatProc0')
      && !labelsOf(additionalProc).includes('marathon'),
      'Recorded extension counters remain visible without duplicating known procs or marathon'));
    const iconProbe = document.createElement('div');
    iconProbe.innerHTML = `<span class="picto-stat magicalPiercingDamage"></span>
      <span class="picto-stat physicalPiercingDamage attack-signature-picto--rupture"></span>
      <span class="picto-stat magicalPiercingDamage attack-signature-picto--dissolution"></span>
      <span class="picto-stat physicalPiercingDamage attack-signature-picto--consolidation"></span>
      <span class="picto-stat magicalPiercingDamage attack-signature-picto--cohesion"></span>`;
    document.body.append(iconProbe);
    const iconUrls = [...iconProbe.children].map(icon => getComputedStyle(icon).backgroundImage);
    reports.push(check(iconUrls[0].includes('picto-spectral.svg')
      && iconUrls[1].includes('picto-piercieng-physic.svg')
      && iconUrls[2].includes('picto-piercieng-magic.svg')
      && iconUrls[3].includes('picto-piercieng-physic.svg')
      && iconUrls[4].includes('picto-piercieng-magic.svg'),
      'Nature icons are distinct from Rupture, Dissolution and their support signatures'));
    iconProbe.remove();
    for (const [colors, combatFunction, signatureKey, asset] of [
      [['red', 'yellow'], 'Attaquant', 'rupture', 'picto-piercieng-physic.svg'],
      [['blue', 'yellow'], 'Attaquant', 'dissolution', 'picto-piercieng-magic.svg'],
      [['red', 'yellow'], 'Support', 'consolidation', 'picto-piercieng-physic.svg'],
      [['blue', 'yellow'], 'Support', 'cohesion', 'picto-piercieng-magic.svg'],
    ]) {
      const row = createAttackNatureSignature(entity, {
        combatFunction, essenceSlots: colors.map(color => ({ color, active: true })),
      });
      document.body.append(row);
      reports.push(check(row.querySelector(`.attack-signature-picto--${signatureKey}`)
        && getComputedStyle(row.querySelector('.picto-stat')).backgroundImage.includes(asset),
        `The ${signatureKey} signature keeps its original pictogram`));
      row.remove();
    }
    const recordRect = record.getBoundingClientRect();
    const codexRect = codex.getBoundingClientRect();
    reports.push(check(recordRect.width > codexRect.width * .8 && recordRect.height > 100
      && getComputedStyle(codex.querySelector('.codex-colomn-1')).display === 'none',
      'The battle record fills the Codex while hiding the entity image column'));
    reports.push(`Record layout: top=${Math.round(recordRect.top)}, height=${Math.round(recordRect.height)}, color=${getComputedStyle(record).color}`);
    reports.push(check(getComputedStyle(info.querySelector('.picto-histoire')).backgroundImage.includes('picto-histoire.svg')
      && getComputedStyle(info.querySelector('.picto-battlestat')).backgroundImage.includes('picto-battlestat.svg'),
      'Both supplied SVG pictograms render through CSS'));
    const viewport = codex.querySelector('.codex-colomn-3');
    const backdrop = codex.querySelector('.codex-information-battle > .entity-lore-ambiance');
    const backdropTop = backdrop.getBoundingClientRect().top;
    const backdropImage = backdrop.querySelector('img');
    reports.push(check(getComputedStyle(backdrop).position === 'fixed'
      && Math.abs(backdropImage.getBoundingClientRect().width - backdrop.clientWidth) < 1
      && getComputedStyle(backdropImage).objectFit === 'contain'
      && getComputedStyle(backdropImage).transform === 'none',
      'The statistics background is fixed, full width and has no cover zoom or transform'));
    viewport.scrollTop = viewport.scrollHeight;
    reports.push(check(Math.abs(backdrop.getBoundingClientRect().top - backdropTop) < 1,
      'The statistics background stays stationary while the record scrolls'));
    const careerRows = [...record.querySelectorAll('.codex-combat-career .codex-combat-row')];
    const careerValue = label => careerRows.find(row => row.firstElementChild.textContent === label)?.lastElementChild.textContent;
    reports.push(check(careerValue('XP dépensée au total') === '540'
      && careerValue('Jours possédés') === '10' && careerValue("Jour d'obtention") === 'Jour 3'
      && careerValue("Source d'obtention") === 'Quête'
      && careerValue('Consommables utilisés sur cette entité') === '8',
      'Career sections expose the saved expense, game-day acquisition and consumable totals'));
    reports.push(check((viewport.scrollHeight <= viewport.clientHeight || viewport.scrollTop > 0)
      && record.lastElementChild.getBoundingClientRect().bottom
        <= viewport.getBoundingClientRect().bottom + 2,
      'The final offensive results remain reachable at the bottom of the Codex pane'));
    codex.querySelector('.codex-profil').parentElement.click();
    codex.querySelector('.codex-lore').parentElement.click();
    reports.push(check(!codex.querySelector('.codex-information-battle').hidden
      && codex.querySelector('.codex-substat-tab--combat.active'), 'Information restores the active combat subtab'));
    recordEntityCombatProc(entity, 'astrality');
    reports.push(check(codex.querySelector('.codex-information-battle:not([hidden])')?.textContent.includes('Astralités1')
      && codex.querySelector('.codex-substat-tab--combat.active'),
      'A live combat-stat update refreshes the detail without changing the active subtab'));
    codex.querySelector('.codex-substat-tab--history').click();
    reports.push(check(codex.querySelector('.codex-information-history:not([hidden])')
      && codex.querySelector('.codex-information-battle[hidden]')
      && getComputedStyle(codex.querySelector('.codex-colomn-1')).display !== 'none',
      'History can be restored after inspecting combat stats'));
    codex.querySelector('.codex-substat-tab--combat').click();
    return reports;
  });
  if (!process.argv.includes('--functional-only')) {
    await mkdir('outputs/combat-tests', { recursive: true });
    await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: 'outputs/combat-tests/battle-stats-desktop.png' });
    await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: 'outputs/combat-tests/battle-stats-bottom.png' });
    await page.setViewportSize({ width: 760, height: 820 });
    await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = 0; });
    const overflow = await page.locator('.codex-information-battle[data-mode="combat"]').evaluate(element =>
      element.scrollWidth - element.clientWidth);
    if (overflow > 2) throw Error(`Narrow combat statistics overflow horizontally by ${overflow}px`);
    await page.screenshot({ path: 'outputs/combat-tests/battle-stats-narrow.png' });
    await page.locator('.codex-substat-tab--history').click();
    await page.screenshot({ path: 'outputs/combat-tests/battle-history-narrow.png' });
    await page.locator('.codex-substat-tab--combat').click();
    const layouts = [];
    const layoutFailures = [];
    for (const width of [390, 760, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = 0; });
      const layout = await page.evaluate(() => {
        const record = document.querySelector('.codex-combat-record');
        const bounds = record.getBoundingClientRect();
        const columns = record.querySelector('.codex-combat-overview');
        const groups = [...columns.children].map(node => node.getBoundingClientRect());
        const rows = [...record.querySelectorAll('.codex-combat-row')];
        const title = record.querySelector('h2').getBoundingClientRect();
        const tabs = document.querySelector('.codex-information-tabs').getBoundingClientRect();
        const menu = document.querySelector('.battle-stats-view .codex-colomn-2');
        const pane = document.querySelector('.battle-stats-view .codex-colomn-3');
        const menuBounds = menu.getBoundingClientRect();
        const buttons = [...menu.children];
        const mobileMenu = matchMedia('(max-width: 720px)').matches;
        const separate = (a, b) => a.right <= b.left || a.left >= b.right
          || a.bottom <= b.top || a.top >= b.bottom;
        return {
          viewport: innerWidth,
          menu: menu.getBoundingClientRect().toJSON(),
          pane: pane.getBoundingClientRect().toJSON(),
          buttons: [...menu.children].map(node => ({
            text: node.textContent.trim(),
            bounds: node.getBoundingClientRect().toJSON(),
            overflow: node.scrollWidth - node.clientWidth,
          })),
          width: bounds.width,
          overflow: record.scrollWidth - record.clientWidth,
          stacked: groups[1].top >= groups[0].bottom,
          columns: getComputedStyle(columns).gridTemplateColumns.split(' ').length,
          maxColumns: Math.max(...[...record.querySelectorAll('.codex-combat-columns, .codex-combat-offense-columns')]
            .map(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)),
          rowsFit: rows.every(row => {
            const label = row.firstElementChild.getBoundingClientRect();
            const amount = row.lastElementChild.getBoundingClientRect();
            return row.scrollWidth <= row.clientWidth + 1 && label.right <= amount.left
              && amount.right <= bounds.right + 1;
          }),
          titleClear: title.right <= tabs.left || title.top >= tabs.bottom || title.bottom <= tabs.top,
          // Desktop intentionally overlaps the pane's empty padding, never its content.
          menuClear: separate(menuBounds, title) && separate(menuBounds, tabs)
            && (!mobileMenu || pane.getBoundingClientRect().top >= menuBounds.bottom)
            && buttons.every((node, index) => {
              const rect = node.getBoundingClientRect();
              return rect.left >= 0 && rect.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
                && (!mobileMenu || index === 0 || rect.left >= buttons[index - 1].getBoundingClientRect().right);
            }),
        };
      });
      layouts.push(layout);
      if (layout.overflow > 2 || !layout.rowsFit || !layout.titleClear || !layout.menuClear
        || layout.stacked !== (layout.width <= 700) || layout.maxColumns > 3
        || layout.columns !== (layout.width <= 700 ? 1 : layout.width <= 1050 ? 2 : 3)) {
        layoutFailures.push(`Combat layout at ${width}px: ${JSON.stringify(layout)}`);
      }
      await page.screenshot({ path: `outputs/combat-tests/battle-stats-${width}.png` });
      if (width === 390 || width === 1920) {
        await page.locator('.codex-combat-group--distribution').evaluate(element => {
          element.scrollIntoView({ block: 'start' });
        });
        await page.screenshot({ path: `outputs/combat-tests/battle-stats-distribution-${width}.png` });
      }
      await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.screenshot({ path: `outputs/combat-tests/battle-stats-${width}-bottom.png` });
    }
    await writeFile('outputs/combat-tests/responsive-layouts.json', JSON.stringify(layouts, null, 2));
    if (layoutFailures.length) throw Error(layoutFailures.join('\n'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.codex-colomn-2 .codex-soul').evaluate(icon => icon.parentElement.click());
    for (const mode of ['progression', 'soul', 'archetype', 'progression']) {
      await page.locator(`.codex-soul-tabs [data-mode="${mode}"]`).click();
      await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = 0; });
      await page.waitForFunction(() => !document.querySelector('.section-content.soul .attribut-graph-container.created'));
      await page.locator('.section-content.soul').evaluate(async panel => {
        await Promise.all([...panel.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
      });
      await page.screenshot({ path: `outputs/combat-tests/soul-${mode}.png` });
      if (mode !== 'archetype') {
        const graph = page.locator(`.codex-substat-panel--${mode} .attribut-graph-container`);
        if (!await graph.isVisible()) throw Error(`Soul graph not visible in ${mode}`);
      }
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log(reports.join('\n'));
  console.log(`PASS: ${reports.length} Codex combat-stat checks`);
} finally {
  await browser.close();
  server.close();
}
