import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
  const page = await browser.newPage();
  page.on('pageerror', error => { throw error; });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const { enrichEntityStats, recomputeEntityStats, entites } = await import("/js/entities/runtime.js");
    const { grantEntityExternalArmor } = await import('/js/items/armor.js');
    const { addFadedLife } = await import('/js/items/resourceStocks.js');
    const { applyDamage, LifeandDeath, calculateDefensiveHpOutcome, estimateCancelledAttackHp } = await import("/js/combat/vitals.js");
    const { lifesteal, LifestealBloodFury, rez } = await import("/js/combat/effects.js");
    const { resetLevelBattleStats, getLevelBattleStats, getLevelCombatDetails } = await import("/js/rendering/hud.js");
    const { recordEntityCombatStat, recordEntityDamageDetails, recordEntityDamageReceived, recordEntityCombatMovement, recordEntityCombatProc, getEntityCombatDetails, resetStoredArmorCurrentToMax, beginEntityBattleRole, endEntityBattleRole, applyHpBattleRegenAtTurnStart, recordEntityProgression, recordEntityDays, countCompletedArchetypes } = await import("/js/storage/entityStorage.js");
    const { saveToLocalStorage, loadFromLocalStorage, setAdminMode, isAdminMode } = await import("/js/storage/gameStorage.js");
    const { createCodexCombatRecord } = await import("/js/ui/codex/profile.js");
    const check = (condition, message) => { if (!condition) throw Error(message); return message; };
    const fixture = (id, side) => {
      const entity = { id, name: `Combat total ${id}`, side, type: 'sbire', role: ['mage'], level: 1,
        baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1, physicalDamage: 10 }, attacks: ['autoAttack'] };
      enrichEntityStats(entity);
      entity.stats.HP = { current: 100, max: 100 };
      entity.stats.armor = { current: 0, max: 0 };
      entity.armorLayers = { external: { current: 0, max: 0 }, stuff: {}, robustness: { current: 0, max: 0 } };
      entity.stats.physicalResistance = 0;
      entity.stats.magicalResistance = 0;
      entity.stats.astrality = 0;
      entity.stats.indestructibility = 0;
      entity.stats.resilience = 0;
      entity.isDEAD = false;
      entity.statut = ['alive'];
      return entity;
    };
    const attacker = fixture(998801, 'A');
    const target = fixture(998802, 'B');
    const shielded = fixture(998803, 'B');
    grantEntityExternalArmor(shielded, 50);
    const dotTarget = fixture(998804, 'B');
    const reviving = fixture(998805, 'B');
    reviving.stats.extraLife = { current: 1, max: 1 };
    entites.push(attacker, target, shielded, dotTarget, reviving);
    saveToLocalStorage('selectedArmyA', [attacker]);
    saveToLocalStorage('ArmyB', { armies: { ArmyB_combat_totals: { entities: [target, shielded, dotTarget, reviving] } } });
    window.currentStageId = 'combat_totals';
    document.body.insertAdjacentHTML('beforeend', `<div id="Kills_${attacker.id}"></div><div id="TotalDamages_${attacker.id}"></div><div id="TotalHeal_${attacker.id}"></div><div id="PopUp_${shielded.id}"></div><div id="PopDow_${shielded.id}" class="combat-popup-status"></div>`);
    const attack = (combatFunction, amount) => ({ functionName: `counter-${combatFunction}`, displayName: 'Counter test',
      launchContextId: `counter-${combatFunction}`, combatFunction, attackTarget: [combatFunction === 'Support' ? 'ally' : 'enemy'],
      attackRange: ['melee'], attacknature: ['physicalDamage'], effets: [], forceDamageSources: { physical: amount } });
    const reports = [];
    target.stats.HP.current = 95;
    applyDamage(target, 20, attacker, attack('Support', 20));
    reports.push(check(target.stats.HP.current === 100 && attacker.totalHeal === 5
      && document.getElementById(`TotalHeal_${attacker.id}`).textContent.includes('5'),
    'Support counts only HP actually restored and updates the visible counter'));
    reports.push(check(getEntityCombatDetails(target).healingReceived === 5,
      'The supported target records five HP actually received'));
    reports.push(check(getEntityCombatDetails(attacker).healingByRange.melee === 5,
      'Melee support healing is credited to its range'));
    reports.push(check(loadFromLocalStorage('selectedArmyA')[0].totalHeal === 5,
      'Support healing total persists on the attacker'));
    attacker.stats.HP.current = 50;
    LifestealBloodFury(attacker, target, 20, 25);
    reports.push(check(attacker.totalHeal === 10 && loadFromLocalStorage('selectedArmyA')[0].totalHeal === 10,
      'Blood Fury counts its five restored HP in the same total'));
    lifesteal(attacker, 20, { effectName: 'lifesteal', effectMagicalRatio: 0 });
    reports.push(check(attacker.totalHeal === 14 && loadFromLocalStorage('selectedArmyA')[0].totalHeal === 14,
      'Ordinary lifesteal adds only its four restored HP'));
    reports.push(check(getEntityCombatDetails(attacker).lifeStealHealed === 9
      && getEntityCombatDetails(attacker).healingReceived === 9,
      'Both lifesteal sources credit only HP restored to the attacker'));
    applyDamage(shielded, 10, attacker, attack('Attaquant', 10), { physical: 10 });
    reports.push(check(shielded.stats.HP.current === 100 && shielded.stats.armor.current === 40
      && attacker.totalDamage === 10,
      'Damage absorbed by armor counts as effective damage dealt'));
    reports.push(check(getEntityCombatDetails(shielded).damageReceived === 10
      && getEntityCombatDetails(shielded).armorDamageReceived === 10,
      'The defender records ten real armor damage received'));
    reports.push(check(document.querySelector(`#PopUp_${shielded.id} .damage-popup--armor-hit .damage-popup-value`)?.textContent === '−10'
      && !document.querySelector(`#PopDow_${shielded.id} .damage-popup--armor-destroyed`),
      'Partial armor damage shows its icon and value without a destruction announcement'));
    applyDamage(dotTarget, 7, attacker, { ...attack('Attaquant', 7), type: ['alteration'],
      attacknature: ['magicalDamage'], forceDamageSources: { magical: 7 } }, { magical: 7 });
    reports.push(check(dotTarget.stats.HP.current === 93 && attacker.totalDamage === 17,
      'A damage-over-time impact credits the HP actually removed'));
    reviving.stats.HP.current = 5;
    applyDamage(reviving, 40, attacker, attack('Attaquant', 40), { physical: 40 });
    reports.push(check(reviving.stats.HP.current > 0 && (attacker.kills || 0) === 0,
      'An extra life prevents a kill from being credited'));
    reports.push(check(reviving.extraLivesUsed === 1 && !reviving.deaths && !reviving.resurrections,
      'A consumed extra life is not a death or a resurrection'));
    target.stats.HP.current = 10;
    applyDamage(target, 40, attacker, attack('Attaquant', 40), { physical: 40 });
    reports.push(check(attacker.totalDamage === 32 && loadFromLocalStorage('selectedArmyA')[0].totalDamage === 32
      && document.getElementById(`TotalDamages_${attacker.id}`).textContent.includes('32'),
    'Overkill credits only the ten HP actually removed'));
    reports.push(check(attacker.kills === 1 && loadFromLocalStorage('selectedArmyA')[0].kills === 1
      && document.getElementById(`Kills_${attacker.id}`).textContent.includes('1'),
    'Final death credits and persists exactly one kill'));
    reports.push(check(target.deaths === 1 && loadFromLocalStorage('ArmyB').armies.ArmyB_combat_totals.entities[0].deaths === 1,
      'Final death is counted once and persisted on the victim'));
    LifeandDeath(target, attacker);
    reports.push(check(attacker.kills === 1 && target.deaths === 1,
      'Repeated death resolution cannot credit a second kill or death'));
    attacker.stats.HP.current = 50;
    applyDamage(attacker, 8, attacker, attack('Attaquant', 8), { physical: 8 });
    reports.push(check(attacker.stats.HP.current < 50 && attacker.totalDamage === 32,
      'Self-inflicted damage is received but not credited as damage dealt'));
    const adminTarget = fixture(998806, 'B');
    const mixedTarget = fixture(998807, 'B');
    grantEntityExternalArmor(mixedTarget, 3);
    entites.push(adminTarget, mixedTarget);
    const adminArmy = loadFromLocalStorage('ArmyB');
    adminArmy.armies.ArmyB_combat_totals.entities.push(adminTarget, mixedTarget);
    saveToLocalStorage('ArmyB', adminArmy);
    const storedEnemy = entity => loadFromLocalStorage('ArmyB').armies.ArmyB_combat_totals.entities
      .find(candidate => candidate.id === entity.id);
    document.body.insertAdjacentHTML('beforeend', `<div id="PopUp_${adminTarget.id}"></div><div id="PopUp_${mixedTarget.id}"></div><div id="PopDow_${mixedTarget.id}" class="combat-popup-status"></div>`);
    const previousLevelRunning = window.levelRunning;
    const adminCounterKeys = ['kills', 'deaths', 'resurrections', 'extraLivesUsed', 'totalHeal'];
    const adminCounters = entity => [
      ...adminCounterKeys.map(key => entity[key] || 0), getEntityCombatDetails(entity).healingReceived,
    ];
    const beforeAdminCounters = [attacker, adminTarget, mixedTarget].map(adminCounters);
    const beforeAdminAttackerHP = attacker.stats.HP.current;
    const beforeAdminKillsDisplay = document.getElementById(`Kills_${attacker.id}`).textContent;
    const beforeAdminHealDisplay = document.getElementById(`TotalHeal_${attacker.id}`).textContent;
    try {
      setAdminMode(true);
      window.levelRunning = 'admin';
      window.__adminInvincibleMode = true;
      localStorage.setItem('DarkPitAdminInvincibleMode', 'true');
      reports.push(check(isAdminMode() && loadFromLocalStorage('proceduralAdmin').enabled === true,
        'Admin invincibility runs with global admin mode enabled through GameStorage'));
      const beforeAdminDamage = attacker.totalDamage;
      applyDamage(adminTarget, 6, attacker, attack('Attaquant', 6), { physical: 6 });
      reports.push(check(adminTarget.stats.HP.current === 94 && storedEnemy(adminTarget).stats.HP.current === 94
        && attacker.totalDamage === beforeAdminDamage + 6
        && loadFromLocalStorage('selectedArmyA')[0].totalDamage === beforeAdminDamage + 6
        && document.getElementById(`TotalDamages_${attacker.id}`).textContent === `Dégâts : ${beforeAdminDamage + 6}`
        && document.querySelector(`#PopUp_${adminTarget.id} > .combat-popup-flight:last-child .damage-popup-value`)?.textContent === '−6',
        'Admin mode credits, persists and displays all six HP when the target has enough HP'));
      reports.push(check([adminTarget, storedEnemy(adminTarget)].every(entity => {
        const details = getEntityCombatDetails(entity);
        return details.damageReceived === 6 && details.hpDamageReceived === 6 && details.armorDamageReceived === 0;
      }), 'Admin six-HP damage received is recorded and persisted without armor damage'));
      adminTarget.stats.HP.current = 1;
      applyDamage(adminTarget, 6, attacker, attack('Attaquant', 6), { physical: 6 });
      reports.push(check(adminTarget.stats.HP.current === 100 && storedEnemy(adminTarget).stats.HP.current === 100
        && attacker.totalDamage === beforeAdminDamage + 7
        && loadFromLocalStorage('selectedArmyA')[0].totalDamage === beforeAdminDamage + 7
        && document.getElementById(`TotalDamages_${attacker.id}`).textContent === `Dégâts : ${beforeAdminDamage + 7}`
        && document.querySelector(`#PopUp_${adminTarget.id} > .combat-popup-flight:last-child .damage-popup-value`)?.textContent === '−1',
        'Admin invincibility credits, persists and displays only one remaining HP before restoration'));
      reports.push(check([adminTarget, storedEnemy(adminTarget)].every(entity => {
        const details = getEntityCombatDetails(entity);
        return details.damageReceived === 7 && details.hpDamageReceived === 7 && details.armorDamageReceived === 0
          && entity.isDEAD === false && entity.statut.includes('alive') && !entity.statut.includes('dead');
      }), 'Admin restoration preserves seven cumulative HP damage and the living state in memory and storage'));
      const beforeMixedDamage = attacker.totalDamage;
      applyDamage(mixedTarget, 6, attacker, attack('Attaquant', 6), { physical: 6 });
      reports.push(check(mixedTarget.stats.armor.current === 0 && mixedTarget.stats.HP.current === 97
        && storedEnemy(mixedTarget).stats.armor.current === 0 && storedEnemy(mixedTarget).stats.HP.current === 97
        && attacker.totalDamage === beforeMixedDamage + 6
        && loadFromLocalStorage('selectedArmyA')[0].totalDamage === beforeMixedDamage + 6
        && document.getElementById(`TotalDamages_${attacker.id}`).textContent === `Dégâts : ${beforeMixedDamage + 6}`
        && document.querySelector(`#PopUp_${mixedTarget.id} .damage-popup--armor-hit .damage-popup-value.physicalDamage`)?.textContent === '−6'
        && document.querySelector(`#PopUp_${mixedTarget.id} .damage-popup--armor-hit .damage-popup-nature-icon.physicalDamage`)
        && document.querySelector(`#PopDow_${mixedTarget.id} .damage-popup--armor-destroyed`)?.textContent === 'armure détruite',
        'A split hit credits, persists and displays six total damage with its nature, then announces destroyed armor'));
      reports.push(check([mixedTarget, storedEnemy(mixedTarget)].every(entity => {
        const details = getEntityCombatDetails(entity);
        return details.damageReceived === 6 && details.armorDamageReceived === 3 && details.hpDamageReceived === 3;
      }), 'A split hit records and persists three armor and three HP damage received'));
      const adminCopies = [attacker, adminTarget, mixedTarget,
        loadFromLocalStorage('selectedArmyA')[0], storedEnemy(adminTarget), storedEnemy(mixedTarget)];
      reports.push(check(adminCopies.every((entity, index) =>
        JSON.stringify(adminCounters(entity)) === JSON.stringify(beforeAdminCounters[index % 3]))
        && attacker.stats.HP.current === beforeAdminAttackerHP
        && document.getElementById(`Kills_${attacker.id}`).textContent === beforeAdminKillsDisplay
        && document.getElementById(`TotalHeal_${attacker.id}`).textContent === beforeAdminHealDisplay,
        'Admin restoration adds no death, kill, resurrection, extra-life use or artificial healing in memory, storage or counters'));
      setAdminMode(false);
      reports.push(check(!isAdminMode() && loadFromLocalStorage('proceduralAdmin').enabled === false
        && window.__adminInvincibleMode === false && localStorage.getItem('DarkPitAdminInvincibleMode') === 'false',
        'Disabling global admin mode clears both runtime and stored invincibility flags'));
      const overkillsBefore = attacker.overkills || 0;
      reports.push(check(overkillsBefore > 0 && loadFromLocalStorage('selectedArmyA')[0].overkills === overkillsBefore,
        'Overkill popups are counted and persisted without adding excess damage'));
      reports.push(check(rez(target, { restoredHP: 20, feedback: [] }) === true
        && target.resurrections === 1 && target.deaths === 1
        && storedEnemy(target).resurrections === 1,
        'A corpse resurrection is distinct from an extra life and persists'));
      window.__adminInvincibleMode = true;
      localStorage.setItem('DarkPitAdminInvincibleMode', 'true');
      applyDamage(target, 20, attacker, attack('Attaquant', 20), { physical: 20 });
      reports.push(check(!isAdminMode() && target.stats.HP.current === 0 && target.isDEAD === true
        && target.deaths === 2 && attacker.kills === 2
        && storedEnemy(target).deaths === 2 && loadFromLocalStorage('selectedArmyA')[0].kills === 2,
        'With global admin mode disabled, stale invincibility flags cannot prevent a resurrected entity dying and crediting a second kill'));
    } finally {
      setAdminMode(false);
      window.levelRunning = previousLevelRunning;
    }
    reports.push(check(!isAdminMode() && window.__adminInvincibleMode === false
      && localStorage.getItem('DarkPitAdminInvincibleMode') === 'false' && window.levelRunning === previousLevelRunning,
      'Admin checks leave global mode and invincibility disabled and restore the previous level mode'));
    resetLevelBattleStats([attacker, target]);
    reports.push(check(getLevelBattleStats(attacker).kills === 0 && getLevelBattleStats(target).deaths === 0
      && attacker.kills === 2 && target.deaths === 2,
      'A new level clears its counters but preserves career totals'));
    document.body.insertAdjacentHTML('beforeend', `<span data-level-battle-stat="battlesFought" data-entity-id="${attacker.id}">0</span>`);
    recordEntityCombatStat(attacker, 'battlesFought');
    reports.push(check(getLevelBattleStats(attacker).battlesFought === 1
      && loadFromLocalStorage('selectedArmyA')[0].battlesFought === 1
      && document.querySelector(`[data-level-battle-stat="battlesFought"][data-entity-id="${attacker.id}"]`)?.textContent === '1',
      'Combat participation is counted and persisted separately from level reset'));
    const careerDamageBefore = attacker.totalDamage;
    attacker.totalDamage += 100;
    recordEntityDamageDetails(attacker, 'physicalPiercingDamage', {
      armorDamage: 30, hpDamage: 70,
      armorSources: { physical: 30 }, hpSources: { piercingDamage: 70 },
      critical: true, execution: true, range: 'melee',
    });
    const kinetic = getEntityCombatDetails(attacker).damageByNature.physicalPiercingDamage;
    reports.push(check(kinetic.total === 100 && kinetic.physical === 30 && kinetic.piercing === 70
      && kinetic.magical === 0 && kinetic.total === kinetic.physical + kinetic.magical + kinetic.piercing,
      'Kinetic damage records actual 30 physical plus 70 piercing as 100 total'));
    const classifiedDamage = Object.values(getEntityCombatDetails(attacker).damageByNature)
      .reduce((sum, entry) => sum + entry.total, 0);
    reports.push(check(classifiedDamage === attacker.totalDamage,
      'Every credited damage point belongs to exactly one attack nature'));
    const careerSection = createCodexCombatRecord(attacker);
    document.body.appendChild(careerSection);
    const kineticRow = careerSection.querySelector('.codex-combat-nature--physicalPiercingDamage');
    reports.push(check(kineticRow?.textContent.includes('Cinétique100')
      && kineticRow.textContent.includes('Part physique30') && kineticRow.textContent.includes('Part perçante70'),
      'The battle record shows the kinetic total with real physical and piercing amounts'));
    reports.push(check(getEntityCombatDetails(attacker).criticalDamage >= 100
      && getEntityCombatDetails(attacker).executionDamage >= 100
      && loadFromLocalStorage('selectedArmyA')[0].combatDetails.damageByNature.physicalPiercingDamage.total === 100
      && attacker.totalDamage === careerDamageBefore + 100,
      'Critical and execution totals overlap, and detailed damage persists'));
    recordEntityCombatMovement(attacker, { marathon: true });
    recordEntityCombatMovement(attacker, { forced: true });
    recordEntityCombatProc(attacker, 'trailer');
    reports.push(check(getEntityCombatDetails(attacker).movements === 2
      && getEntityCombatDetails(attacker).marathonMovements === 1
      && getEntityCombatDetails(attacker).forcedMovements === 1
      && getEntityCombatDetails(attacker).procs.trailer === 1,
      'Movement, marathon, forced swap and trailer counters are separate'));
    resetLevelBattleStats([attacker]);
    reports.push(check(getLevelCombatDetails(attacker).damageByNature.physicalPiercingDamage.total === 0
      && getLevelCombatDetails(attacker).damageByRange.melee === 0
      && getLevelCombatDetails(attacker).ambidextryDamage === 0
      && getEntityCombatDetails(attacker).damageByNature.physicalPiercingDamage.total === 100,
      'A new level resets detailed local stats without erasing career damage'));
    const ambiTarget = fixture(998808, 'B');
    entites.push(ambiTarget);
    applyDamage(ambiTarget, 6, attacker, {
      ...attack('Attaquant', 6), attackRange: ['range'], ambidextryHitIndex: 1,
    }, { physical: 6 });
    reports.push(check(getEntityCombatDetails(attacker).ambidextryDamage === 0,
      'The first hit of an ambidextry attack does not contribute to ambidextry damage'));
    const beforeAmbidextry = attacker.totalDamage;
    const rangedBeforeAmbidextry = getLevelCombatDetails(attacker).damageByRange.ranged;
    applyDamage(ambiTarget, 6, attacker, {
      ...attack('Attaquant', 6), attackRange: ['range'], ambidextryHitIndex: 2,
    }, { physical: 6 });
    const creditedAmbidextry = attacker.totalDamage - beforeAmbidextry;
    reports.push(check(creditedAmbidextry > 0
      && getEntityCombatDetails(attacker).ambidextryDamage === creditedAmbidextry
      && getLevelCombatDetails(attacker).ambidextryDamage === creditedAmbidextry
      && getLevelCombatDetails(attacker).damageByRange.ranged === rangedBeforeAmbidextry + creditedAmbidextry
      && loadFromLocalStorage('selectedArmyA')[0].combatDetails.ambidextryDamage === creditedAmbidextry,
      'Only the real second ambidextry impact is credited as ambidextry and ranged damage'));
    const overlapBefore = { ...getEntityCombatDetails(attacker) };
    attacker.totalDamage += 10;
    recordEntityDamageDetails(attacker, 'physicalDamage', {
      hpDamage: 10, hpSources: { physical: 10 }, critical: true, ambidextry: true,
      criticalBonusDamage: 3,
    });
    const overlapAfter = getEntityCombatDetails(attacker);
    reports.push(check(overlapAfter.criticalDamage - overlapBefore.criticalDamage === 10
      && overlapAfter.ambidextryDamage - overlapBefore.ambidextryDamage === 10
      && overlapAfter.criticalBonusDamage - overlapBefore.criticalBonusDamage === 3,
    'A ten-damage critical ambidextry hit overlaps categories without doubling total damage'));
    reports.push(check(overlapAfter.damageByRange.melee - overlapBefore.damageByRange.melee === 10,
      'An impact without attackRange is classified as melee'));
    const armorBeforeReset = loadFromLocalStorage('selectedArmyA');
    const aliveArmor = fixture(998809, 'A');
    const deadArmor = fixture(998810, 'A');
    aliveArmor.stats.armor = { current: 2, max: 9, totalMax: 9, robustnessMax: 9, regenMax: 9 };
    aliveArmor.armorLayers = { external: { current: 0, max: 0 }, stuff: {}, robustness: { current: 2, max: 9 } };
    deadArmor.stats.armor = { current: 2, max: 9, totalMax: 9, robustnessMax: 9, regenMax: 9 };
    deadArmor.armorLayers = { external: { current: 0, max: 0 }, stuff: {}, robustness: { current: 2, max: 9 } };
    deadArmor.stats.HP.current = 0;
    deadArmor.isDEAD = true;
    deadArmor.statut = ['dead'];
    saveToLocalStorage('selectedArmyA', [aliveArmor, deadArmor]);
    resetStoredArmorCurrentToMax();
    const resetArmor = loadFromLocalStorage('selectedArmyA');
    reports.push(check(resetArmor[0].stats.armor.current === 9 && resetArmor[1].stats.armor.current === 2,
      'Day-start armor regenerates only the robustness layer of entities already alive'));
    saveToLocalStorage('selectedArmyA', armorBeforeReset);
    const criticalTarget = fixture(998811, 'B');
    criticalTarget.stats.HP.current = 10;
    entites.push(criticalTarget);
    attacker.baseStats.criticalChance = 100; enrichEntityStats(attacker);
    const beforeCritical = { ...getEntityCombatDetails(attacker) };
    const damageBeforeCritical = attacker.totalDamage;
    const beforeCriticalRandom = Math.random; Math.random = () => 0;
    applyDamage(criticalTarget, 8, attacker, {
      ...attack('Attaquant', 8), ambidextryHitIndex: 2,
    }, { physical: 8 });
    Math.random = beforeCriticalRandom;
    const afterCritical = getEntityCombatDetails(attacker);
    reports.push(check(attacker.totalDamage - damageBeforeCritical === 10
      && afterCritical.criticalDamage - beforeCritical.criticalDamage === 10
      && afterCritical.ambidextryDamage - beforeCritical.ambidextryDamage === 10
      && afterCritical.criticalBonusDamage - beforeCritical.criticalBonusDamage === 2,
    'A lethal critical second hit credits only ten real damage and two real critical bonus points'));
    attacker.baseStats.criticalChance = 0; enrichEntityStats(attacker);
    shielded.stats.HP.current = 95;
    const beforeRangedHeal = attacker.totalHeal;
    applyDamage(shielded, 20, attacker, {
      ...attack('Support', 20), attackRange: ['range'],
    });
    reports.push(check(attacker.totalHeal === beforeRangedHeal + 5
      && getEntityCombatDetails(attacker).healingByRange.ranged === 5
      && getLevelCombatDetails(attacker).healingByRange.ranged === 5
      && loadFromLocalStorage('selectedArmyA')[0].combatDetails.healingByRange.ranged === 5,
      'Ranged support healing records only the HP restored in the correct range'));
    reports.push(check(getEntityCombatDetails(attacker).hpDamageDealt + getEntityCombatDetails(attacker).armorDamageDealt === attacker.totalDamage,
      'Actual HP and armor damage reconcile exactly with the career damage total'));
    const healer = fixture(998830, 'A');
    const healedTarget = fixture(998831, 'A');
    entites.push(healer, healedTarget);
    saveToLocalStorage('selectedArmyA', [...loadFromLocalStorage('selectedArmyA'), healer, healedTarget]);
    const healingRandom = Math.random;
    try {
      Math.random = () => .99999;
      resetLevelBattleStats([healer]);
      for (const range of ['melee', 'range']) {
        healedTarget.stats.HP.current = 85;
        const before = getEntityCombatDetails(healer).ambidextryHealing;
        applyDamage(healedTarget, 10, healer, {
          ...attack('Support', 10), attackRange: [range], ambidextryHitIndex: 1,
        });
        check(healedTarget.stats.HP.current === 95 && getEntityCombatDetails(healer).ambidextryHealing === before,
          `The first ${range} support impact is not ambidextry healing`);
        applyDamage(healedTarget, 10, healer, {
          ...attack('Support', 10), attackRange: [range], ambidextryHitIndex: 2,
        });
        const result = getEntityCombatDetails(healer);
        reports.push(check(healedTarget.stats.HP.current === 100 && result.ambidextryHealing === before + 5
          && result.healingByRange[range === 'range' ? 'ranged' : 'melee'] === 15
          && getLevelCombatDetails(healer).ambidextryHealing === result.ambidextryHealing
          && loadFromLocalStorage('selectedArmyA').find(e => e.id === healer.id).combatDetails.ambidextryHealing === result.ambidextryHealing,
          `${range} ambidextry credits and persists only the five HP restored by its second impact`));
        applyDamage(healedTarget, 10, healer, {
          ...attack('Support', 10), attackRange: [range], ambidextryHitIndex: 2,
        });
        check(getEntityCombatDetails(healer).ambidextryHealing === result.ambidextryHealing,
          `A full-HP target adds no ${range} ambidextry healing`);
      }
      reports.push(check(healer.totalHeal === 30 && getEntityCombatDetails(healer).ambidextryHealing === 10
        && getEntityCombatDetails(healedTarget).healingReceived === 30
        && getEntityCombatDetails(healer).ambidextryDamage === 0,
        'Ambidextry healing is included once in total healing and remains separate from damage'));
      healedTarget.stats.HP.current = 80;
      applyDamage(healedTarget, 10, healer, attack('Support', 10));
      reports.push(check(getEntityCombatDetails(healer).ambidextryHealing === 10 && healer.totalHeal === 40,
        'Ordinary support healing does not inflate the ambidextry counter'));
      healer.baseStats.criticalChance = 100; enrichEntityStats(healer);
      const hpBefore = healedTarget.stats.HP.current;
      applyDamage(healedTarget, 8, healer, { ...attack('Support', 8), ambidextryHitIndex: 2 });
      const restored = healedTarget.stats.HP.current - hpBefore;
      reports.push(check(restored > 0 && getEntityCombatDetails(healer).ambidextryHealing === 10 + restored
        && healer.totalHeal === 40 + restored,
        'A critical second heal remains one actual-healing amount with no critical cross-breakdown'));
      const finalHealing = getEntityCombatDetails(healer).ambidextryHealing;
      healedTarget.isDEAD = true;
      healedTarget.stats.HP.current = 0;
      applyDamage(healedTarget, 10, healer, { ...attack('Support', 10), ambidextryHitIndex: 2 });
      reports.push(check(getEntityCombatDetails(healer).ambidextryHealing === finalHealing,
        'A second support impact on a corpse credits no healing'));
      resetLevelBattleStats([healer]);
      reports.push(check(getLevelCombatDetails(healer).ambidextryHealing === 0
        && getEntityCombatDetails(healer).ambidextryHealing === finalHealing,
        'Level reset clears ambidextry healing for the level without erasing career healing'));
    } finally {
      Math.random = healingRandom;
    }
    const originalRandom = Math.random;
    const originalNow = Date.now;
    try {
      Math.random = () => .99999;
      const lifeTarget = fixture(998820, 'B');
      entites.push(lifeTarget);
      for (const pool of ['fadedLife', 'eternalLife', 'extraLife']) {
        if (pool === 'fadedLife') addFadedLife(lifeTarget, 1, 'natural');
        else lifeTarget.stats[pool] = { current: 1, max: 1 };
        lifeTarget.stats.HP.current = 5;
        applyDamage(lifeTarget, 10, attacker, attack('Attaquant', 10), { physical: 10 });
        check(lifeTarget.stats.HP.current > 0 && getEntityCombatDetails(lifeTarget).livesUsed[pool] === 1,
          `${pool} is consumed and credited to its own pool`);
      }
      reports.push(check(lifeTarget.extraLivesUsed === 3 && !lifeTarget.deaths && !lifeTarget.resurrections,
        'Extra, faded and eternal lives have separate counters without fake deaths or resurrections'));
      const roleEntity = fixture(998821, 'A');
      saveToLocalStorage('selectedArmyA', [roleEntity]);
      let now = 1000;
      Date.now = () => now;
      beginEntityBattleRole(roleEntity);
      now = 2000;
      beginEntityBattleRole(roleEntity);
      roleEntity.role = ['tank'];
      recordEntityCombatMovement(roleEntity);
      recordEntityDamageDetails(roleEntity, 'physicalDamage', { hpDamage: 7, armorDamage: 3 });
      recordEntityDamageReceived(roleEntity, 4, 2);
      now = 5000;
      roleEntity.role = ['mage'];
      recordEntityCombatMovement(roleEntity, { forced: true });
      now = 6000;
      recordEntityCombatStat(roleEntity, 'deaths');
      now = 10000;
      recordEntityCombatStat(roleEntity, 'resurrections');
      now = 12000;
      endEntityBattleRole(roleEntity);
      const roleData = getEntityCombatDetails(roleEntity);
      reports.push(check(roleData.roles.mage.battles === 1 && roleData.roles.tank.battles === 1
        && roleData.roles.mage.durationMs === 4000 && roleData.roles.tank.durationMs === 3000
        && !Object.hasOwn(roleData, 'roleTransitions') && !Object.hasOwn(roleEntity.combatDetails, 'roleTransitions')
        && roleData.roles.tank.damageDealt === 10 && roleData.roles.tank.damageReceived === 6,
        'Role changes attribute impact damage to the current role, count each role once and exclude time spent dead'));
      now = 20000;
      reports.push(check(getEntityCombatDetails(roleEntity).roles.mage.durationMs === 4000
        && loadFromLocalStorage('selectedArmyA')[0].combatDetails.roles.mage.durationMs === 4000,
        'Ending combat freezes and persists role duration'));
      resetLevelBattleStats([roleEntity]);
      reports.push(check(getLevelCombatDetails(roleEntity).roles.tank.damageDealt === 0
        && getEntityCombatDetails(roleEntity).roles.tank.damageDealt === 10,
        'Level reset clears nested role counters while keeping their career values'));
      Date.now = originalNow;

      const regenTarget = fixture(998822, 'A');
      regenTarget.stats.HP.current = 96;
      regenTarget.baseStats.hpBattleRegen = 20;
      regenTarget.stats.hpBattleRegen = 20;
      entites.push(regenTarget);
      saveToLocalStorage('selectedArmyA', [regenTarget]);
      reports.push(check(applyHpBattleRegenAtTurnStart(regenTarget) === 4
        && applyHpBattleRegenAtTurnStart(regenTarget) === 0
        && getEntityCombatDetails(regenTarget).battleHpRegenerated === 4
        && getEntityCombatDetails(regenTarget).healingReceived === 4
        && loadFromLocalStorage('selectedArmyA')[0].combatDetails.battleHpRegenerated === 4,
        'Combat regeneration counts only missing HP, persists it and does not count overhealing'));
      const { bumpDayHpRegenInStorage } = await import("/js/app/stages.js");
      regenTarget.stats.dayHpRegen = 5;
      regenTarget.stats.HP.current = 90;
      const storedRegen = structuredClone(regenTarget);
      storedRegen.stats.HP.current = 93;
      const deadRegen = fixture(998823, 'A');
      deadRegen.stats.dayHpRegen = 10;
      deadRegen.stats.HP.current = 0;
      deadRegen.isDEAD = true;
      entites.push(deadRegen);
      saveToLocalStorage('selectedArmyA', [storedRegen, deadRegen]);
      bumpDayHpRegenInStorage(1);
      reports.push(check(regenTarget.stats.HP.current === 95
        && getEntityCombatDetails(regenTarget).dailyHpRecovered === 5
        && getEntityCombatDetails(regenTarget).healingReceived === 9
        && loadFromLocalStorage('selectedArmyA')[0].stats.HP.current === 95
        && loadFromLocalStorage('selectedArmyA')[0].combatDetails.dailyHpRecovered === 5
        && deadRegen.stats.HP.current === 0 && !getEntityCombatDetails(deadRegen).dailyHpRecovered,
        'Daily regeneration uses live HP, heals once across saved/live copies and never heals a corpse'));
      bumpDayHpRegenInStorage(3);
      reports.push(check(regenTarget.stats.HP.current === 100 && getEntityCombatDetails(regenTarget).dailyHpRecovered === 10,
        'Multi-day regeneration is capped to missing HP'));

      const pureTarget = fixture(998824, 'B');
      let rolls = 0;
      Math.random = () => { rolls++; return .99999; };
      const snapshot = JSON.stringify(pureTarget);
      const replay = calculateDefensiveHpOutcome(attacker, pureTarget, { physical: 100 },
        { resilience: 20, critical: true, criticalBonus: 50, resilienceCrit: 10, indestructibility: 20 });
      reports.push(check(replay === 93 && rolls === 0 && JSON.stringify(pureTarget) === snapshot,
        'Defensive replay: 80 normal + (40 critical bonus minus 10%) = 116, then 20% indestructibility rounds to 93, without RNG or mutation'));
      grantEntityExternalArmor(pureTarget, 5);
      pureTarget.stats.HP.current = 3;
      reports.push(check(estimateCancelledAttackHp(attacker, pureTarget, attack('Attaquant', 10), { physical: 10 }) === 3
        && rolls === 0,
        'Canceled-hit estimates subtract armor and cap at remaining HP without invented procs'));

      const astral = fixture(998825, 'B');
      astral.baseStats.astrality = 10;
      recomputeEntityStats(astral, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      astral.stats.HP.current = 20;
      entites.push(astral);
      Math.random = () => 0;
      applyDamage(astral, 50, attacker, attack('Attaquant', 50), { physical: 50 });
      const astralStats = getEntityCombatDetails(astral);
      reports.push(check(astral.stats.HP.current === 1 && astralStats.defenseHp.astrality === 49
        && astralStats.hpDamageReceived === 19 && astralStats.procs.astrality === 1,
        'Astrality credits lethal damage minus one (49), while actual HP loss remains 19'));

      const esoTarget = fixture(998826, 'B');
      esoTarget.stats.esoterism = 10;
      entites.push(esoTarget);
      applyDamage(esoTarget, 20, attacker,
        { ...attack('Attaquant', 20), attacknature: ['magicalDamage'], forceDamageSources: { magical: 20 } }, { magical: 20 });
      const esoStats = getEntityCombatDetails(esoTarget);
      reports.push(check(esoStats.defenseHp.esoterism > 0 && esoStats.procs.esoterism === 1
        && esoStats.defenseHp.esoterism + esoStats.hpDamageReceived === 20,
        'Esoterism separates HP preserved from its proc count and reconciles with the actual hit'));
      const invulnTarget = fixture(998827, 'B');
      invulnTarget.stats.indestructibility = 10;
      entites.push(invulnTarget);
      applyDamage(invulnTarget, 20, attacker, attack('Attaquant', 20), { physical: 20 });
      const invulnStats = getEntityCombatDetails(invulnTarget);
      reports.push(check(invulnTarget.stats.HP.current === 100 && invulnStats.defenseHp.indestructible > 0
        && invulnStats.procs.indestructible === 1 && invulnStats.hpDamageReceived === 0,
        'Indestructibility cancellation credits a passive-defense estimate, not actual damage'));
      Math.random = () => .99999;
      invulnTarget.stats.indestructibility = 150;
      applyDamage(invulnTarget, 20, attacker, attack('Attaquant', 20), { physical: 20 });
      const passiveStats = getEntityCombatDetails(invulnTarget);
      reports.push(check(passiveStats.defenseHp.indestructibility > 0
        && passiveStats.defenseHp.indestructibility + passiveStats.hpDamageReceived === 20
        && passiveStats.procs.indestructible === 1,
        'Passive indestructibility reduction is counted separately from canceled hits'));
      for (const mode of ['alteration', 'critical', 'shadow']) {
        const protectedTarget = fixture(998840, 'B');
        const baselineTarget = fixture(998841, 'B');
        const definition = attack('Attaquant', 20);
        if (mode === 'shadow') {
          protectedTarget.isInvisible = true;
          protectedTarget.stats.occultism = 10;
        } else {
          protectedTarget.baseStats.resilience = 150; enrichEntityStats(protectedTarget);
          if (mode === 'alteration') definition.type = ['alteration'];
          if (mode === 'critical') { attacker.baseStats.criticalChance = 100; enrichEntityStats(attacker); }
        }
        Math.random = () => mode === 'critical' ? 0 : .99999;
        applyDamage(baselineTarget, 20, attacker, mode === 'alteration' ? { ...definition, type: [] } : definition, { physical: 20 });
        applyDamage(protectedTarget, 20, attacker, definition, { physical: 20 });
        const delta = mode === 'shadow'
          ? baselineTarget.stats.HP.current - protectedTarget.stats.HP.current
          : protectedTarget.stats.HP.current - baselineTarget.stats.HP.current;
        const key = { alteration: 'resilience', critical: 'resilienceCrit', shadow: 'occultismFragility' }[mode];
        check(delta > 0 && getEntityCombatDetails(protectedTarget).defenseHp[key] === delta
          && getEntityCombatDetails(protectedTarget).procs[key] === 1,
          `${mode}: expected difference ${delta}, baseline HP ${baselineTarget.stats.HP.current}, observed ${JSON.stringify(getEntityCombatDetails(protectedTarget).defenseHp)}, procs ${JSON.stringify(getEntityCombatDetails(protectedTarget).procs)}`);
        attacker.baseStats.criticalChance = 0; enrichEntityStats(attacker);
      }
      reports.push('Resilience against alterations and criticals and shadow fragility match actual HP differences');
      Math.random = () => .99999;
      const cappedDefense = fixture(998842, 'B');
      cappedDefense.baseStats.resilience = 150; enrichEntityStats(cappedDefense);
      cappedDefense.stats.HP.current = 1;
      applyDamage(cappedDefense, 20, attacker, { ...attack('Attaquant', 20), type: ['alteration'] }, { physical: 20 });
      reports.push(check(getEntityCombatDetails(cappedDefense).defenseHp.resilience === 0
        && getEntityCombatDetails(cappedDefense).hpDamageReceived === 1,
        'Reducing overkill without saving any actual HP does not inflate preserved HP'));
      let cases = 0;
      for (const [nature, sources] of [
        ['physicalDamage', { physical: 41 }], ['magicalDamage', { magical: 41 }],
        ['piercingDamage', { piercingDamage: 41 }], ['hybridalDamage', { hybridalDamage: 41 }],
        ['physicalPiercingDamage', { physical: 21, piercingDamage: 20 }],
        ['magicalPiercingDamage', { magical: 21, piercingDamage: 20 }],
        ['hybridalPiercingDamage', { physical: 13, magical: 14, piercingDamage: 14 }],
      ]) for (const armor of [0, 10, 100]) for (const range of ['melee', 'range']) {
        const specimen = fixture(999100 + cases++, 'B');
        grantEntityExternalArmor(specimen, armor);
        specimen.stats.physicalResistance = 15; specimen.stats.magicalResistance = 20;
        specimen.stats.indestructibility = 150;
        const definition = { ...attack('Attaquant', 41), attacknature: [nature], attackRange: [range], forceDamageSources: sources,
          natureSignatureSuppressed: true };
        const estimate = estimateCancelledAttackHp(attacker, specimen, definition, sources);
        applyDamage(specimen, 41, attacker, definition, sources);
        check(estimate === getEntityCombatDetails(specimen).hpDamageReceived,
          `Canceled-hit estimate differs from passive resolution for ${nature}/${armor}/${range}: ${estimate} vs ${getEntityCombatDetails(specimen).hpDamageReceived}`);
      }
      reports.push(`Canceled-hit estimates match ${cases} actual passive resolutions across all natures, armor levels and ranges`);

      const escapeTarget = fixture(998828, 'A');
      escapeTarget.stats.speed = 1; escapeTarget.stats.velocity = 0;
      entites.push(escapeTarget);
      saveToLocalStorage('selectedArmyA', [escapeTarget]);
      beginEntityBattleRole(escapeTarget);
      let fleeRolls = 0;
      Math.random = () => ++fleeRolls === 1 ? 0 : .99;
      const { RunawayFunction } = await import("/js/combat/orders.js");
      await RunawayFunction(escapeTarget);
      const escapeStats = getEntityCombatDetails(escapeTarget);
      reports.push(check(escapeTarget.hasFled && escapeStats.fleeAttempts === 2
        && escapeStats.fleeFailures === 1 && escapeStats.fleeSuccesses === 1
        && loadFromLocalStorage('selectedArmyA')[0].combatDetails.fleeAttempts === 2,
        'Fleeing records the failed first attempt and the successful retry exactly once'));
      await RunawayFunction(escapeTarget);
      reports.push(check(getEntityCombatDetails(escapeTarget).fleeAttempts === 2,
        'An entity that has already fled cannot add another attempt'));
    } finally { Math.random = originalRandom; Date.now = originalNow; }
    const career = fixture(998850, 'A');
    career.acquisition = { source: 'quest', gameDay: 3 };
    entites.push(career);
    window.selectedArmyA = [structuredClone(career)];
    saveToLocalStorage('selectedArmyA', [career]);
    recordEntityDays(career, 1, 5);
    recordEntityDays(career, 1, 5);
    reports.push(check(getEntityCombatDetails(career).lifetime.daysAlive === 2
      && getEntityCombatDetails(career).lifetime.longestAliveStreak === 2,
      'Day tracking starts at acquisition and cannot count the same interval twice'));
    recordEntityCombatStat(career, 'deaths');
    career.isDEAD = true; career.statut = ['dead']; career.stats.HP.current = 0;
    recordEntityDays(career, 5, 8);
    reports.push(check(getEntityCombatDetails(career).lifetime.daysDead === 3
      && getEntityCombatDetails(career).lifetime.aliveStreak === 0
      && getEntityCombatDetails(career).lifetime.longestDeadStreak === 3,
      'Dead days form their own streak without extending the living streak'));
    recordEntityCombatStat(career, 'resurrections');
    career.isDEAD = false; career.statut = ['alive']; career.stats.HP.current = 100;
    recordEntityDays(career, 8, 9);
    const savedLife = loadFromLocalStorage('selectedArmyA')[0].combatDetails.lifetime;
    reports.push(check(savedLife.daysAlive === 3 && savedLife.daysDead === 3
      && savedLife.aliveStreak === 1 && savedLife.deadStreak === 0
      && savedLife.longestAliveStreak === 2 && savedLife.longestDeadStreak === 3,
      'A resurrection starts a new living streak and persists both historical maxima'));
    const { nextDay } = await import("/js/app/stages.js");
    saveToLocalStorage('gameDay', 9);
    nextDay(1, { animate: false });
    reports.push(check(getEntityCombatDetails(career).lifetime.daysAlive === 4
      && window.selectedArmyA[0].combatDetails.lifetime.daysAlive === 4
      && loadFromLocalStorage('selectedArmyA')[0].combatDetails.lifetime.daysAlive === 4,
      'The real next-day action updates saved, combat and menu copies consistently'));
    recordEntityCombatMovement(career, { negative: true });
    recordEntityCombatMovement(career, { negative: true, marathon: true });
    recordEntityCombatMovement(career, { negative: true, forced: true });
    reports.push(check(getEntityCombatDetails(career).negativeMovements === 1,
      'Only paid manual movement can consume negative movement reserve'));
    const { getCycleLenFor } = await import("/js/entities/rules.js");
    career.level.current = 8;
    const completed = { key: 'egare', level: 1, step: getCycleLenFor('egare', career) };
    career.Archetype = { current: { key: 'egare', level: 1, step: 0 }, inProgress: [], achieve: [completed] };
    career.experience = 100;
    recordEntityProgression(career, { experienceSpent: 100, completedBefore: 0 });
    recordEntityProgression(career);
    reports.push(check(getEntityCombatDetails(career).lifetime.experienceSpent === 100
      && getEntityCombatDetails(career).lifetime.maxLevelReached === 8
      && getEntityCombatDetails(career).lifetime.archetypesCompleted === 1,
      'Progression stores committed expense, peak level and each completed archetype once'));
    const { resetEntityProgression } = await import("/js/entities/progression.js");
    const reset = await resetEntityProgression(career);
    reports.push(check(reset.ok && career.experience === 0 && career.level.current === 1
      && countCompletedArchetypes(career) === 0
      && getEntityCombatDetails(career).lifetime.experienceSpent === 100
      && getEntityCombatDetails(career).lifetime.maxLevelReached === 8
      && getEntityCombatDetails(career).lifetime.archetypesCompleted === 1,
      'Anima resets current progression without erasing career XP, peak level or completed archetypes'));
    career.level.current = 4; career.experience = 25;
    career.Archetype.achieve = [{ ...completed, step: getCycleLenFor('egare', career) }];
    recordEntityProgression(career, { experienceSpent: 25, completedBefore: 0 });
    reports.push(check(loadFromLocalStorage('selectedArmyA')[0].combatDetails.lifetime.experienceSpent === 125
      && getEntityCombatDetails(career).lifetime.maxLevelReached === 8
      && getEntityCombatDetails(career).lifetime.archetypesCompleted === 2,
      'Reinvestment after Anima adds XP and new completions while retaining the highest historical level'));
    recordEntityProgression(window.selectedArmyA[0], { experienceSpent: 10 });
    reports.push(check(career.combatDetails.lifetime.experienceSpent === 135
      && loadFromLocalStorage('selectedArmyA')[0].combatDetails.lifetime.experienceSpent === 135,
      'A subsequent action from the menu copy preserves the accumulated career counters'));
    const battleState = await import("/js/app/state.js");
    const { fledEntities } = await import("/js/combat/orders.js");
    const deadAlly = fixture(998812, 'A');
    deadAlly.stats.HP.current = 0;
    deadAlly.isDEAD = true;
    entites.length = 0;
    entites.push(deadAlly, fixture(998813, 'B'));
    fledEntities.length = 0;
    fledEntities.push({ id: 998814, side: 'A', hasFled: true });
    battleState.resetBattleResolution();
    document.querySelector('.GameOverMessage')?.remove();
    battleState.resolveBattleOutcome(entites);
    reports.push(check(battleState.battleOutcome === 'escape' && !document.querySelector('.GameOverMessage'),
      'A successful escape ends combat without displaying a Game Over message'));
    battleState.resetBattleResolution();
    fledEntities.length = 0;
    return reports;
  });
  console.log(reports.join('\n'));
  console.log(`PASS: ${reports.length} combat-total checks`);
} finally {
  await browser.close();
  server.close();
}
