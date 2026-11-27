import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
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
    const { entites, enrichEntityStats, removedEntities } = await import("/js/entities/runtime.js");
    const { applyDamage, LifeandDeath, calculateDefensiveHpOutcome } = await import("/js/combat/vitals.js");
    const { summonEntite, consommationSummon } = await import("/js/combat/summons.js");
    const { summons } = await import('/js/data/summons.js');
    const { balanceData } = await import('/js/data/balanceData.js');
    const { grantEntityExternalArmor } = await import('/js/items/armor.js');
    const { getEntityCombatDetails, recordSummonCreated } = await import("/js/storage/entityStorage.js");
    const { resetLevelBattleStats, getLevelCombatDetails } = await import("/js/rendering/hud.js");
    const { rebuildBoardOccupancy } = await import("/js/board/controller.js");
    const { saveToLocalStorage, loadFromLocalStorage } = await import("/js/storage/gameStorage.js");
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js"), { createCodexCombatRecord, createCodexInvocationsRecord } = await import("/js/ui/codex/profile.js");
    const reports = [];
    const check = (condition, message) => { if (!condition) throw Error(message); reports.push(message); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    window.levelRunning = 'worldmap';
    entites.length = 0;
    const host = document.createElement('div');
    document.body.append(host);
    const hexes = Array.from({ length: 8 }, (_, i) => {
      const hex = document.createElement('div');
      hex.className = 'hex Neutral'; hex.dataset.position = `hex_${900 + i}`;
      hex.innerHTML = '<div class="socle neutre"></div>';
      host.append(hex); return hex;
    });
    let serial = 980000;
    const cleanStats = entity => {
      entity.stats.HP = { current: 100, max: 100 };
      entity.stats.armor = { current: 0, max: 0 };
      delete entity.armorLayers;
      for (const key of ['dodge', 'criticalChance', 'resilience', 'indestructibility', 'astrality',
        'physicalResistance', 'magicalResistance', 'physicalPen', 'magicalPen']) entity.stats[key] = 0;
      entity.isDEAD = false; entity.statut = ['alive'];
      entity.hasDeathBeenLogged = false; entity.hasAlreadyDeadBeenLogged = false;
      return entity;
    };
    const makeEntity = (name, side, hex) => {
      const entity = { id: ++serial, name, side, type: 'sbire', role: ['mage'], class: name, level: 1,
        baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1, physicalDamage: 10 },
        attacks: ['autoAttack'], sprite: './media/sprites/mouche-asticoteuse.png', position: hex.dataset.position };
      enrichEntityStats(entity); cleanStats(entity); entites.push(entity);
      const box = document.createElement('div'); box.id = `Box_Entite_${entity.id}`; box.className = 'entite-box';
      box.dataset.position = entity.position;
      box.innerHTML = `<div id="effectsContainer_${entity.id}"></div><div id="PopUp_${entity.id}"></div>`;
      hex.append(box); hex.classList.add('occupied');
      rebuildBoardOccupancy(host);
      return entity;
    };
    const owner = makeEntity('Invocateur test', 'A', hexes[0]);
    const target = makeEntity('Cible test', 'B', hexes[1]);
    saveToLocalStorage('selectedArmyA', [owner]);
    saveToLocalStorage('ArmyB', { armies: { ArmyB_summon_stats: { entities: [target] } } });
    window.currentStageId = 'summon_stats';
    const attack = (nature = 'physicalDamage', combatFunction = 'Attaquant') => ({
      functionName: 'summon-stat-test', displayName: 'Stat test', launchContextId: 'summon-stat-test',
      attacknature: [nature], attackRange: ['melee'], effets: [], selfEffects: [],
      attackTarget: [combatFunction === 'Support' ? 'ally' : 'enemy'], combatFunction,
    });
    const hit = (source, victim, amount, nature = 'physicalDamage', combatFunction = 'Attaquant') => {
      const sources = { [nature === 'magicalDamage' ? 'magical' : 'physical']: amount };
      return applyDamage(victim, amount, source, { ...attack(nature, combatFunction), forceDamageSources: sources }, sources);
    };
    const details = () => getEntityCombatDetails(owner);
    const inert = makeEntity('Inerte test', 'A', hexes[2]);
    target.stats.physicalResistance = target.stats.magicalResistance = globalThis.umbraProgression.getResistanceConstant('physicalResistance');
    hit(inert, target, 100, 'inerte');
    let d = getEntityCombatDetails(inert);
    check(target.stats.HP.current === 75 && d.damageByNature.inerte.total === 25
      && d.inertResistanceInput === 100 && d.inertPhysicalReduction === 50 && d.inertMagicalReduction === 25,
    'Inert actual impact: 100 -> 50 -> 25, with both resistance reductions recorded');
    calculateDefensiveHpOutcome(inert, target, { physical: 100 }, { inert: true });
    check(getEntityCombatDetails(inert).inertResistanceInput === 100, 'A defensive replay cannot increment resistance counters');
    const inertBlock = createCodexCombatRecord(inert).querySelector('.codex-combat-nature--inerte');
    check(inertBlock.textContent.includes('75 (75%)'), 'The Inert record displays the total weighted reduction');
    resetLevelBattleStats([inert]);
    grantEntityExternalArmor(target, 20);
    hit(inert, target, 100, 'inerte');
    d = getEntityCombatDetails(inert);
    check(d.inertResistanceInput === 180 && d.inertPhysicalReduction === 90 && d.inertMagicalReduction === 45
      && inert.totalDamage === 65, 'Armor absorbs 20 before the two resistance passes over the remaining 80');
    check(getLevelCombatDetails(inert).inertResistanceInput === 80, 'Inert level counters reset without clearing career counters');
    target.stats.HP.current = 1;
    hit(inert, target, 100, 'inerte');
    check(inert.totalDamage === 66 && getEntityCombatDetails(inert).inertResistanceInput === 280,
      'Overkill is excluded from dealt damage, not confused with resistance reduction');
    cleanStats(target);
    target.stats.physicalResistance = target.stats.magicalResistance = globalThis.umbraProgression.getResistanceConstant('physicalResistance');
    hit(inert, target, 1, 'inerte');
    check(getEntityCombatDetails(inert).inertResistanceInput === 281 && inert.totalDamage === 66,
      'A fully resisted Inert hit still records its reduction');
    hit(inert, target, 10);
    check(getEntityCombatDetails(inert).inertResistanceInput === 281, 'Normal attacks never enter Inert resistance totals');
    cleanStats(target);

    const template = { name: 'Gardien invoque', class: 'stats-guardian', type: 'sbire', level: 1,
      sprite: './media/sprites/mouche-asticoteuse.png', 'essence-heritage': false,
      baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1 }, attacks: ['autoAttack'] };
    const result = await summonEntite(hexes[3], template, owner, () => {}, 0);
    const summoned = cleanStats(entites.find(entity => entity.id === result.summonId));
    const key = summoned.summonOrigin.statistics.key;
    const entityRecord = () => details().summons.entities[key];
    check(entityRecord().count === 1 && entityRecord().combatFunction === 'Attaquant', 'Successful real spawn registers one attacking invocation');
    recordSummonCreated(owner, summoned, { template });
    check(entityRecord().count === 1, 'Duplicate registration is idempotent');
    check(await summonEntite(null, template, owner, () => {}, 0) === null && entityRecord().count === 1,
      'An invalid summon target grants no invocation');
    const result2 = await summonEntite(hexes[4], template, owner, () => {}, 0);
    const second = cleanStats(entites.find(entity => entity.id === result2.summonId));
    check(entityRecord().count === 2, 'Two instances of a template aggregate into the same type');
    hit(summoned, target, 12);
    hit(summoned, target, 8, 'magicalDamage');
    check(entityRecord().damageDealt === 20 && entityRecord().damageByNature.physicalDamage === 12
      && entityRecord().damageByNature.magicalDamage === 8 && !owner.totalDamage,
      'Invocation damage uses the impact nature without adding to caster personal damage');
    summoned.stats.armor = { current: 3, max: 3 };
    hit(target, summoned, 10);
    hit(owner, summoned, 20, 'magicalDamage', 'Support');
    check(entityRecord().damageReceived === 10 && entityRecord().healingReceived === 7,
      'Summon durability includes armor and HP; received healing excludes overheal');
    target.stats.HP.current = 4;
    hit(summoned, target, 40);
    LifeandDeath(target, summoned);
    check(entityRecord().kills === 1 && entityRecord().damageDealt === 24 && !owner.kills,
      'A summon kill and its four remaining HP are credited once, not to caster kills');
    cleanStats(target);
    second.stats.HP.current = 3;
    second.stats.extraLife = { current: 1, max: 1 };
    hit(target, second, 5);
    check(entityRecord().deaths === 0, 'An extra life is not a summoned entity death');
    second.stats.extraLife.current = 0;
    second.stats.HP.current = 2;
    hit(target, second, 10);
    check(entityRecord().deaths === 1, 'Final summoned entity death is attributed to the right type');

    const supportTemplate = { ...template, name: 'Soigneur invoque', class: 'stats-healer',
      attackDetails: [{ ...attack('magicalDamage', 'Support'), functionName: 'healer-stats', physicalRatio: 0, magicalRatio: 1, piercingRatio: 0 }], attacks: ['healer-stats'] };
    const healerResult = await summonEntite(hexes[5], supportTemplate, owner, () => {}, 0);
    const healer = cleanStats(entites.find(entity => entity.id === healerResult.summonId));
    const healerKey = healer.summonOrigin.statistics.key;
    const ownHeal = owner.totalHeal || 0;
    summoned.stats.HP.current = 96;
    hit(healer, summoned, 50, 'magicalDamage', 'Support');
    check(details().summons.entities[healerKey].combatFunction === 'Support'
      && details().summons.entities[healerKey].healingDone === 4 && owner.totalHeal === ownHeal,
      'Support invocations count actual restored HP separately from their caster');
    owner.isDEAD = true;
    entites.splice(entites.indexOf(owner), 1); removedEntities.push(owner);
    hit(summoned, target, 5);
    check(entityRecord().damageDealt === 29, 'Delayed damage remains credited when the caster is dead and removed');
    removedEntities.splice(removedEntities.indexOf(owner), 1); entites.push(owner); owner.isDEAD = false;
    const childResult = await summonEntite(hexes[6], template, summoned, () => {}, 0);
    const child = cleanStats(entites.find(entity => entity.id === childResult.summonId));
    hit(child, target, 6);
    check(entityRecord().damageDealt === 29
      && Object.values(getEntityCombatDetails(summoned).summons.entities)[0].damageDealt === 6,
      'Nested summons attribute only to the direct caster, without ancestor double counting');
    const blocker = makeEntity('Board blocker', 'B', hexes[7]);
    // Dead entities do not occupy their hex; temporarily revive the second summon to fill the board.
    cleanStats(second);
    rebuildBoardOccupancy(host);
    let rejected = false;
    try { await summonEntite(hexes[0], template, owner, () => {}, 0); } catch { rejected = true; }
    check(rejected && entityRecord().count === 2, 'A real spawn rejected by a full board cannot increment counts');
    entites.splice(entites.indexOf(blocker), 1);
    document.getElementById(`Box_Entite_${blocker.id}`).remove();
    hexes[7].classList.remove('occupied'); delete hexes[7].dataset.occupiedBy;
    rebuildBoardOccupancy(host);
    const enemySummon = { id: ++serial, attackDetails: [attack()], stats: {}, side: 'B' };
    recordSummonCreated(target, enemySummon, { template });
    const enemyKey = enemySummon.summonOrigin.statistics.key;
    entites.splice(entites.indexOf(target), 1);
    hit(enemySummon, owner, 2);
    const savedEnemy = loadFromLocalStorage('ArmyB').armies.ArmyB_summon_stats.entities[0];
    check(savedEnemy.combatDetails.summons.entities[enemyKey].damageDealt === 2,
      'Enemy casters absent from live pools still receive and persist outcomes in ArmyB');
    target.combatDetails = savedEnemy.combatDetails; entites.push(target);
    check(JSON.parse(JSON.stringify(summoned)).summonOrigin.statistics.casterId === owner.id,
      'Summon attribution remains serializable without a reference to the caster object');

    const place = (definition, hex, options = {}) => {
      const node = document.createElement('div'); node.id = `summon-stats-${++serial}`;
      node.dataset.groundSummon = 'true'; hex.append(node);
      return consommationSummon(definition, hex, node.id, () => {}, { attacker: owner, ...options });
    };
    const consumable = name => Object.values(details().summons.consumables).find(entry => entry.name === name);
    const [healthy, rotten] = summons;
    owner.currentAttack = attack('magicalDamage');
    owner.stats.HP.current = 98;
    const beforePersonalHeal = owner.totalHeal;
    place(healthy, hexes[0]);
    check(consumable(healthy.summonDisplayName)?.count === 1 && consumable(healthy.summonDisplayName).consumed === 1
      && consumable(healthy.summonDisplayName).healingDone === 2 && owner.totalHeal === beforePersonalHeal + 2,
      'Summoned consumables retain existing personal heal credit and add a subset, not a second heal');
    place(rotten, hexes[1]);
    check(Object.keys(details().summons.consumables).length === 2
      && consumable(rotten.summonDisplayName).combatFunction === 'Attaquant',
      'Healthy and rotten Jarrets stay separate even though both catalogue IDs are 1');
    const personalDamage = owner.totalDamage || 0;
    await sleep(10200);
    check(consumable(rotten.summonDisplayName).damageDealt === 5
      && consumable(rotten.summonDisplayName).damageByNature.magicalDamage === 5
      && consumable(rotten.summonDisplayName).consumed === 1 && owner.totalDamage === personalDamage + 5,
      'All poison ticks are attributed by real damage while consumption stays counted once');
    target.stats.HP.current = 1;
    place(rotten, hexes[1]);
    await sleep(2200);
    check(consumable(rotten.summonDisplayName).kills === 1 && consumable(rotten.summonDisplayName).damageDealt === 6,
      'A fatal poison tick credits its consumed item with one kill and only the remaining HP');
    await sleep(1000);
    cleanStats(target);
    place({ ...healthy, summonDuration: .03 }, hexes[7]);
    await sleep(70);
    check(consumable(healthy.summonDisplayName).expired === 1, 'An unconsumed item expiration is counted separately');
    place(healthy, hexes[7]);
    hexes[7].querySelector('[data-ground-summon]').remove();
    await sleep(30);
    check(consumable(healthy.summonDisplayName).lost === 1, 'Removing a ground summon counts it once without consumption');
    const beforeManual = JSON.stringify(details().summons);
    place(healthy, hexes[7], { itemId: 'inventory-test', consumeItem: () => ({ ok: true }) });
    hexes[7].querySelector('[data-ground-summon]').remove();
    await sleep(30);
    check(JSON.stringify(details().summons) === beforeManual, 'A manually placed inventory item is not counted as an invocation');
    resetLevelBattleStats([owner]);
    hit(summoned, target, 3);
    const level = getLevelCombatDetails(owner).summons.entities[key];
    check(level.count === 0 && level.damageDealt === 3 && level.name === template.name,
      'Level deltas preserve type labels and exclude prior level totals');
    check(JSON.stringify(loadFromLocalStorage('selectedArmyA')[0].combatDetails.summons) === JSON.stringify(details().summons),
      'Summon career totals persist through the normal entity save');

    const empty = { id: 'empty-invocations', stats: {} };
    const beforeEmpty = JSON.stringify(empty);
    check(createCodexInvocationsRecord(empty).textContent.includes('Aucune') && JSON.stringify(empty) === beforeEmpty,
      'An empty invocation page displays zeroes without changing the entity');
    const ties = createCodexInvocationsRecord({ combatDetails: { summons: { entities: {
      one: { name: '<Test>', count: 2, kills: 1, damageReceived: 4 },
      two: { name: 'Second type', count: 2, kills: 1, damageReceived: 4 },
    } } } });
    check(!ties.querySelector('test') && [...ties.querySelectorAll('.codex-summons-summary[data-summon-kind="entities"] .codex-combat-row')]
      .slice(1).every(row => row.textContent.includes('<Test> / Second type')),
      'Ties show all winning types and names are rendered as text, never markup');
    host.remove();
    let ui = document.querySelector('.Game-UI');
    if (!ui) { ui = document.createElement('div'); ui.className = 'Game-UI'; document.body.append(ui); }
    document.body.append(ui);
    ui.style.cssText = 'position:fixed;inset:0;z-index:2000000;display:block;background:#191414;';
    ui.replaceChildren();
    if (!document.getElementById('score')) {
      const score = document.createElement('div'); score.id = 'score'; document.body.append(score);
    }
    const menu = document.createElement('div'); menu.className = 'menu-map-container'; ui.append(menu);
    window.selectedArmyA = [owner];
    const codex = createCodexEntityScan(owner, menu, `codex-entity_${owner.id}`);
    codex.querySelector('.codex-lore').parentElement.click();
    codex.querySelector('.codex-substat-tab--combat').click();
    const tab = codex.querySelector('.codex-substat-tab--combat');
    const visible = () => codex.querySelector('.codex-information-battle[data-mode="combat"]');
    check(tab.classList.contains('active') && tab.getAttribute('aria-selected') === 'true'
      && !visible().hidden && codex.querySelector('.codex-information-history').hidden
      && !codex.querySelector('.codex-substat-tab--invocations')
      && codex.querySelectorAll('.codex-information-tabs > button').length === 2,
      'Information keeps only History and Combat tabs, with no separate invocation tab');
    const invocationRecord = visible().querySelector('.codex-summons-record');
    check(invocationRecord.previousElementSibling.classList.contains('codex-combat-overview')
      && invocationRecord.querySelector(':scope > h3')?.textContent === 'Invocations',
      'Invocations occupy their own full-width group below Attack, without a separate tab');
    check([...invocationRecord.querySelectorAll('.codex-summons-kind > h4')]
      .map(heading => heading.textContent).join('|') === 'Entités invoquées|Consommables invoqués'
      && [...invocationRecord.querySelector('.codex-summons-groups').children]
        .map(group => group.querySelector('h5').textContent).join('|') === 'Bilan|Attaquant|Support'
      && [...invocationRecord.querySelectorAll('.codex-summons-groups')]
        .every(group => group.classList.contains('codex-combat-columns')),
      'Invocation kinds and column headings use the same compact hierarchy and grid as other statistics');
    const rows = [...visible().querySelectorAll('.codex-summons-summary[data-summon-kind="entities"] > .codex-combat-row')];
    check(rows.find(row => row.firstElementChild.textContent === 'La plus invoqu\u00e9e').textContent.includes(template.name)
      && rows.find(row => row.firstElementChild.textContent === 'La plus r\u00e9sistante').textContent.includes(template.name)
      && rows.find(row => row.firstElementChild.textContent === 'La plus meurtri\u00e8re').textContent.includes(template.name),
      'Invocation leaders use count, actual damage received per spawn, and kills');
    codex.querySelector('.codex-profil').parentElement.click();
    codex.querySelector('.codex-lore').parentElement.click();
    check(!visible().hidden && tab.classList.contains('active'), 'Leaving and returning restores combat statistics including invocations');
    const prior = entityRecord().damageDealt;
    hit(summoned, target, 2);
    check(entityRecord().damageDealt === prior + 2 && visible().textContent.includes(String(prior + 2))
      && tab.classList.contains('active'), 'Live updates refresh invocation statistics without changing tabs');
    hit(summoned, target, 4, 'inerte');
    check(entityRecord().damageByNature.inerte === 4, 'Inert invocation damage remains separate from physical damage');
    const displayedSummon = visible().querySelector('[data-summon-name="Gardien invoque"]');
    check(displayedSummon.querySelectorAll('.codex-combat-row--sub').length === 8,
      'All eight damage natures, including unused ones, remain visible during development');
    check(!codex.querySelector('.ScanEntity .codex-summons-record'), 'Compact combat scans do not acquire the long invocation record');
    return reports;
  });
  await mkdir('outputs/summon-tests', { recursive: true });
  for (const width of [390, 760, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('.codex-summons-record').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { overflow: element.scrollWidth - element.clientWidth,
        fullWidth: Math.abs(bounds.width - element.parentElement.getBoundingClientRect().width) < 2,
        columns: getComputedStyle(element.querySelector('.codex-summons-groups')).gridTemplateColumns.split(' ').length,
        rowsFit: [...element.querySelectorAll('.codex-combat-row')].every(row => {
          const label = row.firstElementChild.getBoundingClientRect();
          const value = row.lastElementChild.getBoundingClientRect();
          return label.right <= value.left && value.right <= bounds.right + 1 && row.scrollWidth <= row.clientWidth + 1;
        }) };
    });
    if (layout.overflow > 2 || !layout.rowsFit || !layout.fullWidth || layout.columns > 3
      || (width === 1440 && layout.columns !== 3) || (width === 390 && layout.columns !== 1)) {
      throw Error(`Invocation layout at ${width}: ${JSON.stringify(layout)}`);
    }
    await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `outputs/summon-tests/invocations-${width}.png` });
    await page.locator('.codex-summons-record').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `outputs/summon-tests/invocations-${width}-detail.png` });
    await page.locator('.codex-colomn-3').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: `outputs/summon-tests/invocations-${width}-bottom.png` });
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({ checks: reports.length, reports, responsiveWidths: [390, 760, 1440] }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
