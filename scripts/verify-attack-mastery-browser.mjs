import assert from 'node:assert/strict';
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const mastery = await import("/js/combat/attackResolution.js");
    const affinity = await import("/js/combat/statistics.js");
    const selection = await import("/js/combat/attackResolution.js");
    const resolution = await import("/js/combat/attackResolution.js");
    const essence = await import("/js/items/essences.js");
    const { resetEntityAttackEssences } = await import("/js/items/essenceInventory.js");
    const { attackDetails: catalog } = await import('/js/data/attackList.js');
    const { enrichEntityStats, recomputeEntityStats, entites } = await import("/js/entities/runtime.js");
    const { getStatSystemResult } = await import("/js/entities/statSystem.js");
    const damage = await import("/js/combat/statistics.js"), _damage = await import("/js/ui/statistics/details.js");
    const combat = await import("/js/combat/attacks.js");
    const { createAttackFlight } = await import("/js/combat/attacks.js");
    const { selectAttackDecision, entiteTurn } = await import("/js/combat/loop.js");
    const progressionUI = await import("/js/ui/attacks.js");
    const ui = await import("/js/ui/statistics/components.js"), _ui = await import("/js/ui/attacks.js"), _ui2 = await import("/js/ui/codex/index.js");
    const reports = [];
    const check = (condition, name) => { if (!condition) throw Error(name); reports.push(name); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let serial = 971000;
    function fixture(natures = ['physicalDamage'], patch = {}) {
      const template = { ...catalog.find(a => a.functionName === 'autoAttack') };
      for (const field of ['physicalRatio', 'magicalRatio', 'piercingRatio']) delete template[field];
      const attack = { ...template, attacknature: natures,
        preparationTime: 100, executionTime: 250, recoveryTime: 100, cooldown: 40, ...patch };
      const entity = { id: ++serial, name: 'Maîtrise test', side: 'A', type: 'sbire', role: 'mage', level: 1,
        baseStats: { HP: 1000, will: 1, strength: 10, agility: 10, intelligence: 10, physicalDamage: 20, magicalDamage: 20, speed: 100 },
        attacks: [attack] };
      enrichEntityStats(entity);
      entity.isDEAD = false;
      return entity;
    }
    const entity = fixture(['hybridalDamage']);
    const attack = entity.attackDetails[0];
    const originalIds = entity.attackEssenceInventory.linkedItems.map(item => item.id);
    check(attack.mastery.level === 2 && attack.mastery.points === 100 && attack.essenceSlots.length === 2, 'Native hybrid starts at mastery 2 / 100 points with two sockets');
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    window.selectedArmyA = [entity];
    mastery.awardAttackMastery(entity, attack, { launch: true });
    mastery.awardAttackMastery(entity, attack, { impact: true, critical: true });
    mastery.awardAttackMastery(entity, attack, { impact: true });
    check(attack.mastery.points === 104, 'One launch + two direct impacts + one critical = four points');
    mastery.awardAttackMastery(entity, attack, { impact: true, critical: true, periodic: true });
    entity.isDEAD = true;
    mastery.awardAttackMastery(entity, attack, { impact: true, critical: true });
    check(attack.mastery.points === 104, 'Periodic and posthumous impacts award nothing');
    entity.isDEAD = false;
    attack.mastery.points = 249;
    mastery.awardAttackMastery(entity, attack, { impact: true });
    check(attack.mastery.level === 3 && attack.essenceSlots.length === 3 && !attack.essenceSlots[2].color, 'Mastery level-up unlocks one empty socket');
    check(entity.attackEssenceInventory.linkedItems.length === 2 && new Set(attack.essenceSlots.map(s => s.socketId)).size === 3, 'Mastery allocates unique socket IDs without creating an essence');
    const saved = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    resolution.ensureEntityAttackInstances(saved, catalog);
    check(saved.attackDetails[0].mastery.points === 250 && saved.attackDetails[0].essenceSlots.length === 3, 'Mastery and socket survive save/reload');
    const beforeCycles = attack.essenceSlots.length;
    entity.Archetype = { achieve: [{ key: 'golgoth', complete: true, level: 1, step: 100 }] };
    resolution.ensureEntityAttackInstances(entity, catalog);
    check(entity.attackDetails[0].essenceSlots.length === beforeCycles, 'Archetype completion no longer grants sockets');

    essence.grantEssencesToInventory({ yellow: 1 }, { origin: 'shop-purchase' });
    const universal = essence.loadUniversalEssenceItems()[0];
    const live = entity.attackDetails[0];
    const patch = essence.buildAttackEssenceSocketPatch(live, 2, 'yellow', 'inventory', entity, universal.id);
    const args = { entity, attackKey: live.attackKey, previousSlots: patch.previousEssenceSlots,
      nextSlots: patch.nextEssenceSlots, stagedNextSlots: patch.stagedNextEssenceSlots };
    const prepared = essence.previewAttackEssenceEquipTransaction(args);
    const bound = essence.commitAttackEssenceEquipTransaction({ ...args, preparedTransaction: prepared });
    check(bound.ok, 'Universal binds into a mastery-earned socket');
    resolution.updateEntityAttackDefinition(entity, live.attackKey, { ...patch.patch, essenceSlots: bound.finalNextSlots });
    const boundId = bound.universalBoundItems[0].id;
    resolution.setEntityAttackDefinitions(entity, [...entity.attackDetails, 'soin'], catalog);
    const learned = entity.attackDetails[1];
    mastery.awardAttackMastery(entity, learned, { impact: true });
    resolution.setEntityAttackDefinitions(entity, [entity.attackDetails[0]], catalog);
    resolution.setEntityAttackDefinitions(entity, [...entity.attackDetails, 'soin'], catalog);
    check(entity.attackDetails[1].mastery.points === 0 && entity.attackDetails[1].entityAttackId !== learned.entityAttackId, 'Forgotten attack relearns at zero with a new identity');
    check(!entity.attackEssenceInventory.linkedItems.some(item => item.nativeAttackId === learned.entityAttackId), 'Forgetting a temporary attack removes only its native essence, preventing relearn duplication');
    const reset = resetEntityAttackEssences(entity);
    check(reset.ok && entity.attackDetails.length === 1 && entity.attackDetails[0].mastery.points === 100, 'Purification removes acquired attacks and restores native mastery');
    check(entity.attackDetails[0].essenceSlots.length === 2 && originalIds.every(id => entity.attackDetails[0].essenceSlots.some(slot => slot.essenceId === id)), 'Purification restores native red/blue sockets and IDs');
    check(entity.attackEssenceInventory.linkedItems.find(item => item.id === boundId)?.state === 'available', 'Previously universal yellow survives purification as an available linked essence');
    check(essence.validateEntityEssenceLedger(entity).ok, 'Purified essence ledger remains coherent');

    const owner = fixture();
    Object.assign(owner.baseStats, { charge: 1, brutality: 10, physicalPen: 12, vigueur: 10, physicalDamage: 20,
      bloodFury: 10, bloodThirsty: 8,
      ambidextry: 9, hypercognition: 10, vitality: 20, criticalPower: 12 });
    const gear = { itemId: 'i-mastery-brutality', equippedId: 'e-mastery-brutality', equippedTo: owner.id,
      Stuffeffets: [{ type: 'stat-buff', stat: 'brutality', value: 4 }] };
    owner.stuff = { slot1: [gear.equippedId] };
    const recompute = entity => recomputeEntityStats(entity, { equippedItems: [gear], persistEquipment: false, skipReverseArchetype: true });
    recompute(owner);
    const equipmentOnly = structuredClone(owner);
    equipmentOnly.baseStats.brutality = 0;
    equipmentOnly.baseStats.bloodFury = 0;
    recompute(equipmentOnly);
    const mixed = { ...owner.attackDetails[0], essenceSlots: [{ color: 'red' }, { color: 'blue' }], attacknature: ['hybridalDamage'] };
    const ownerBeforeProjection = JSON.stringify(owner);
    const view = affinity.createAttackStatView(owner, mixed);
    const penetration = getStatSystemResult(view, 'physicalPen');
    check(view.stats.brutality === 4 && penetration.normal === 12
      && penetration.value === getStatSystemResult(equipmentOnly, 'physicalPen').value
      && penetration.value < getStatSystemResult(owner, 'physicalPen').value,
      'Incompatible umbra retains equipment and independent normal penetration under the source/attribute formula');
    check(getStatSystemResult(view, 'bloodThirsty').value === 8
      && getStatSystemResult(view, 'bloodThirsty').value === getStatSystemResult(equipmentOnly, 'bloodThirsty').value
      && view.stats.vitality === 20 && view.stats.HP === owner.stats.HP,
      'Incompatible offensive derivatives removed; independent lifesteal, utility and HP preserved');
    check(JSON.stringify(owner) === ownerBeforeProjection, 'Attack affinity projection leaves canonical owner sources and totals unchanged');
    const pure = { ...mixed, essenceSlots: [{ color: 'red' }], attacknature: ['physicalDamage'] };
    check(affinity.createAttackStatView(owner, pure).stats.brutality === 14, 'Compatible learned umbra adds equipment normally');
    const none = { ...pure, essenceSlots: [{ color: null }] };
    check(affinity.createAttackStatView(owner, none).stats.brutality === 0 && affinity.getAttackPurity(none).bonus === 0
      && !resolution.getAttackResolutionFlags(none).isPurePhysicalBrutality, 'Empty attack has no offensive umbra or purity bonus');
    const double = { ...pure, essenceSlots: [{ color: 'red' }, { color: 'red' }] };
    const doubleView = affinity.createAttackStatView(owner, double);
    check(affinity.getAttackPurity(double).bonus === 2
      && damage.brutalityPercantBonus(doubleView) - damage.brutalityPercantBonus(affinity.createAttackStatView(owner, pure)) === 2,
    'Second pure essence rounds its progressive bonus up to +2');
    check(affinity.getAttackPurity({ ...pure, essenceSlots: [{ color: 'red' }, { color: 'red' }, { color: 'red' }] }).bonus === 4,
      'Third pure essence rounds its progressive bonus up to +4');
    check(affinity.getAttackPurity({ ...pure, essenceSlots: Array.from({ length: 10 }, () => ({ color: 'red' })) }).bonus === 15, 'Pure bonus caps at +15');

    const sourceEntity = fixture();
    sourceEntity.modifierStats.durable.level.brutality = 3;
    sourceEntity.modifierStats.durable.derived.physicalPen = 6;
    sourceEntity.modifierStats.durable.stuff.orfevre.effectiveById = { 'test-item': { brutality: 4 } };
    sourceEntity.battleBoosts = { ...sourceEntity.battleBoosts,
      brutality: [{ value: 2, mode: 'flat', source: 'Bénédiction test', id: 'blessing-test' }] };
    const sourceHelper = progressionUI.statSourcesHelper(sourceEntity, 'brutality');
    check(sourceHelper.includes('Équipement') && sourceHelper.includes('Bénédiction test')
      && !sourceHelper.includes('Niveaux') && !sourceHelper.includes('Umbra'),
      'Stat helper lists equipment and external bonuses, not natural progression or Umbra sources');
    check(progressionUI.statSourcesHelper(sourceEntity, 'physicalPen') === '',
      'Natural Umbra-derived improvement does not display a source');
    const helperHost = document.createElement('div');
    helperHost.className = 'stat-hover';
    helperHost.innerHTML = sourceHelper;
    document.body.append(helperHost);
    check(getComputedStyle(helperHost.querySelector('.stat-source-details')).color === 'rgb(255, 155, 0)',
      'Displayed improvement sources use the shared orange source color');
    helperHost.remove();
    const sourceHost = document.createElement('div');
    sourceHost.className = 'stat-container';
    sourceHost.dataset.stat = 'brutality';
    sourceHost.innerHTML = '<span class="stat-name">Brutalité</span><span class="entite-stat">9</span>';
    document.body.append(sourceHost);
    ui.syncStatCurseMarker(sourceHost, sourceEntity, 'brutality');
    const sourceNameColor = getComputedStyle(sourceHost.querySelector('.stat-name')).color;
    const sourceValueColor = getComputedStyle(sourceHost.querySelector('.entite-stat')).color;
    check(sourceHost.classList.contains('source-upgraded') && sourceNameColor === 'rgb(193, 0, 0)'
      && sourceValueColor === sourceNameColor
      && [...sourceHost.querySelectorAll('.stat-name, .entite-stat')].every(node =>
        node.dataset.statState === 'umbra' && getComputedStyle(node).filter.includes('drop-shadow')),
      'External improvement remains marked while the Umbra name and value retain their own color and aura');
    const naturalEntity = fixture();
    naturalEntity.modifierStats.durable.level.brutality = 3;
    const naturalHost = sourceHost.cloneNode(true);
    document.body.append(naturalHost);
    ui.syncStatCurseMarker(naturalHost, naturalEntity, 'brutality');
    check(!naturalHost.classList.contains('source-upgraded'), 'Natural progression alone does not mark a stat as externally improved');
    sourceHost.remove(); naturalHost.remove();

    const liveUIEntity = fixture();
    resolution.setEntityAttackDefinitions(liveUIEntity, [...liveUIEntity.attackDetails, 'soin'], catalog);
    const liveCard = _ui.MultiAttackDisplay(liveUIEntity, { selectedAttackKey: liveUIEntity.attackDetails[0].attackKey });
    document.body.append(liveCard);
    const firstSocket = liveCard.querySelector('.attack-essence-socket');
    const detailBefore = liveCard.querySelector('.attack-details');
    liveUIEntity.attackDetails[0].mastery.points = 99;
    mastery.awardAttackMastery(liveUIEntity, liveUIEntity.attackDetails[0], { impact: true });
    await sleep(200);
    check(firstSocket.isConnected && detailBefore.isConnected && liveCard.querySelector('.attack-details .attack-essence-sockets').children.length === 2,
      'Mastery adds a live socket without rebuilding the multi-attack card or its existing sprites');
    liveCard.remove();

    const pureUIEntity = fixture(['piercingDamage'], { essenceSlots: [{ color: 'yellow' }, { color: 'yellow' }] });
    entites.push(pureUIEntity);
    const menu = document.createElement('div');
    menu.className = 'menu-map-container'; document.body.append(menu);
    const codex = _ui2.createCodexEntityScan(pureUIEntity, menu, `codex-entity_${pureUIEntity.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    const pureRow = codex.querySelector('.codex-attack-context .attack-submenu-infos [data-stat="transpiercingPower"]');
    check(pureRow?.querySelector('.stat-name')?.textContent.includes('2') && pureRow.dataset.purityBonus === '0'
      && codex.querySelector('.codex-attack-context [data-stat="perforation"] .stat-name')?.textContent.includes('2'),
      'Codex displays yellow levels for both Transpercement and Perforation');
    menu.remove();

    const host = document.createElement('main');
    host.id = 'mastery-test';
    host.style.cssText = 'position:fixed;inset:0;z-index:2000000;background:#120704;color:#eee;overflow:auto;padding:16px;box-sizing:border-box;';
    const surface = document.createElement('div');
    surface.id = 'mastery-surface';
    surface.style.cssText = 'max-width:560px;width:100%;margin:auto;';
    host.append(surface);
    document.body.append(host);
    const card = _ui.AttackDetailInfos(mixed, owner);
    surface.append(card);
    check(card.querySelector('.attack-mastery-gauge')?.dataset.helperText.includes('pleine vie'), 'Gauge helper contains gain rules and socket reward');
    const rows = [...card.querySelectorAll('.attack-umbra-entry')];
    const firstUnavailable = rows.findIndex(row => row.classList.contains('is-unavailable'));
    check(firstUnavailable > 0 && rows.slice(firstUnavailable).every(row => row.classList.contains('is-unavailable')), 'Available umbras precede all incompatible owned umbras');
    check([...card.querySelectorAll('.attack-umbra-title')].map(node => node.textContent).join('|')
      === 'Umbras utilisables|Umbras possédées mais non utilisables'
      && card.querySelector('.attack-umbra-heading')?.textContent === "Affinité à l'Umbra de l'attaque",
      'Populated usable and unavailable Umbra groups keep their useful headings');
    check(getComputedStyle(rows[firstUnavailable].querySelector('span')).color === 'rgb(133, 133, 133)'
      && getComputedStyle(rows[firstUnavailable].querySelector('.picto-stat')).filter !== 'none',
      'Incompatible umbras render in grey');
    check(!rows[firstUnavailable].dataset.helperText.includes('Manquant pour utiliser'),
      'Generic Umbra panels keep the normal helper without submenu-only requirements');
    const submenuPanel = progressionUI.createAttackUmbraPanel(owner, mixed, { showMissingRequirement: true });
    check(submenuPanel.querySelector('.attack-umbra-entry.is-unavailable')?.dataset.helperText.includes('Manquant pour utiliser :'),
      'Attack submenu appends the missing essence requirement to inactive Umbra helpers');
    const gauge = card.querySelector('.attack-mastery-gauge');
    gauge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(120);
    window.__masteryFixture = { owner, mixed };

    // Real combat actions: disable after selection; the launched heal must still complete.
    const caster = fixture(['magicalDamage'], { ...catalog.find(a => a.functionName === 'soin'), preparationTime: 130, executionTime: 240, recoveryTime: 100, cooldown: 20 });
    const target = fixture(); // A heal must select an allied full-health target.
    entites.length = 0; entites.push(caster, target);
    const combatBoard = document.createElement('div');
    combatBoard.className = 'hex-grid';
    document.body.append(combatBoard);
    for (const [i, e] of [caster, target].entries()) {
      const hex = document.createElement('div'); hex.className = 'hex'; hex.dataset.position = `hex_${900 + i}`;
      hex.style.cssText = `position:fixed;left:${100 + i * 300}px;top:180px;width:80px;height:80px;`;
      hex.innerHTML = `<div class="entite-box" id="Box_Entite_${e.id}"><div id="sbire_${e.id}" style="width:70px;height:70px"></div><div id="effectsContainer_${e.id}"></div><div id="PopDow_${e.id}"></div></div>`;
      combatBoard.append(hex);
      e.position = hex.dataset.position;
    }
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(combatBoard);
    const cast = caster.attackDetails[0];
    const running = combat.executeAttack(caster, target, cast);
    await sleep(35);
    selection.setAttackEnabled(caster, caster.attackDetails, cast.attackKey, false);
    await running;
    for (let attempt = 0; attempt < 20 && cast.mastery.points < 2; attempt++) await sleep(100);
    check(cast.mastery.points === 2, `Disabling a selected heal still launches and awards one hit on a full-health target (points: ${cast.mastery.points}, target HP: ${target.stats.HP.current})`);
    check((await selectAttackDecision(caster)).status === 'no-target', 'All disabled attacks enter unsuccessful search, not cooldown wait');
    const hpBefore = target.stats.HP.current;
    await entiteTurn(caster);
    check(target.stats.HP.current === hpBefore && cast.mastery.points === 2, 'All-disabled turn searches and recovers without any attack or mastery gain');
    const flight = createAttackFlight(owner, target, mixed, { physical: 1 });
    const frozen = flight.source.stats.brutality;
    owner.stats.brutality = 99;
    owner.modifierStats.durable.stuff.orfevre.effectiveById = {};
    check(flight.source.stats.brutality === frozen, 'Projectile retains the allowed contributions captured at launch');
    target.side = 'B'; // The following scenarios exercise offensive impacts.
    const striker = fixture(['piercingDamage']);
    Object.assign(striker.stats, { criticalPower: 1000, criticalChance: 1000, ambidextry: 0 });
    target.stats.HP = { current: 100000, max: 100000 };
    target.stats.dodge = 0;
    entites.push(striker);
    const criticalAttack = striker.attackDetails[0];
    const oldRandom = Math.random;
    Math.random = () => 0;
    try {
      const criticalFlight = createAttackFlight(striker, target, criticalAttack, { piercingDamage: 20 });
      await combat.resolveAttackImpact(criticalFlight);
      check(criticalAttack.mastery.points === 2, 'Real critical impact awards one hit point and one critical point');
      target.stats.indestructibility = 1;
      target.stats.armor = { current: 0, max: 0 };
      const hp = target.stats.HP.current;
      await combat.resolveAttackImpact(createAttackFlight(striker, target, criticalAttack, { piercingDamage: 20 }));
      check(criticalAttack.mastery.points === 3 && target.stats.HP.current === hp,
        'Indestructibility prevents damage but a landed impact still earns one point, without a critical point');
    } finally { Math.random = oldRandom; }
    const many = fixture(['physicalDamage']);
    many.attackDetails[0].mastery.points = 2699;
    mastery.awardAttackMastery(many, many.attackDetails[0], { impact: true, critical: true });
    check(many.attackDetails[0].mastery.points === 2700 && many.attackDetails[0].essenceSlots.length === 10,
      'Final mastery level caps points and sockets without overflow');
    mastery.awardAttackMastery(many, many.attackDetails[0], { impact: true });
    check(many.attackDetails[0].mastery.points === 2700, 'Maxed attacks stop accumulating points');
    const effects = await import("/js/combat/effects.js");
    const attributes = await import("/js/combat/vitals.js");
    const summons = await import("/js/combat/summons.js");
    const { balanceData } = await import('/js/data/balanceData.js');
    const { calculateResistances } = await import("/js/entities/rules.js");
    let natureLaunch = 0;
    const rawAttack = (colors, support = false) => ({
      ...catalog.find(a => a.functionName === 'autoAttack'),
      piercingRatio: 1,
      functionName: 'nature-regression', launchContextId: `nature-regression-${++natureLaunch}`,
      combatFunction: support ? 'Support' : 'Attaquant',
      attackRange: ['range'], attackTarget: [support ? 'ally' : 'enemy'],
      essenceSlots: colors.map(color => ({ color })), effets: [], selfEffects: [],
    });
    for (let level = 1; level <= 10; level++) {
      const yellow = resolution.getAttackNatureRules(rawAttack(Array(level).fill('yellow')));
      check(yellow.armorBypassPercent === level * 10
        && Math.abs(yellow.agilityDamageRatio - (5 + (level - 1) * 25 / 9) / 100) < 1e-10,
      `Yellow level ${level}: Perforation and agility ratio`);
    }
    const yellowMixed = resolution.getAttackNatureRules(rawAttack(['red', 'yellow', 'yellow']));
    check(resolution.getAttackNatureRules(null).profile.total === 0
      && _damage.calculateStatsDisplay('physicalDamage', { stats: { physicalDamage: 20 }, currentAttack: null }, 20),
      'Nature helpers remain safe when no attack is selected');
    check(resolution.getAttackResolutionFlags(rawAttack(['blue'])).canBrokenSpell
      && !resolution.getAttackResolutionFlags(rawAttack(['blue'], true)).canBrokenSpell,
      'Surcharge belongs only to offensive living-target attacks');
    check(yellowMixed.combinationLevel === 1 && yellowMixed.profile.yellow === 2 && yellowMixed.recoveryExtra > 0,
      'Recovery uses yellow count, while signature uses complete combinations');
    const mapping = [
      [['red', 'yellow'], 'rupture', 'consolidation'],
      [['blue', 'yellow'], 'dissolution', 'cohesion'],
      [['red', 'blue'], 'resonance', 'resonance'],
      [['red', 'blue', 'yellow'], 'discharge', 'effusion'],
    ];
    for (const [colors, offensive, support] of mapping) {
      check(resolution.getAttackNatureRules(rawAttack(colors)).signature.key === offensive
        && resolution.getAttackNatureRules(rawAttack(colors, true)).signature.key === support,
        `Offense/support nature mapping: ${offensive}/${support}`);
    }
    const bare = { id: 988888, name: 'Nature test', stats: {
      physicalDamage: 100, magicalDamage: 40, piercingDamage: 60, agility: 100, strength: 0, intelligence: 0,
    } };
    const physicalRatioAttack = { ...rawAttack(['red']), physicalRatio: 0.5, magicalRatio: 0.25, piercingRatio: 0 };
    const physicalPreview = damage.calculateAttackDamagePreview(bare, physicalRatioAttack);
    check(physicalPreview.totalDamage === 60 && physicalPreview.sources.magical === 0,
      'Physical power including Fracassante and magical power are multiplied by their ratios before physical routing');
    const piercePreview = damage.calculateAttackDamagePreview(bare, rawAttack(Array(10).fill('yellow')));
    check(piercePreview.totalDamage === 90, 'Pure yellow ten adds 30 percent agility without replacing the power calculation');
    const rp = damage.calculateAttackDamagePreview(bare, rawAttack(['red', 'yellow', 'yellow']));
    check(rp.sources.physical === 20 && rp.sources.piercingDamage === 40, 'Composition routes the fixed piercing-powered damage in essence proportions');
    const def = { stats: { physicalResistance: 200, magicalResistance: 100 } };
    const mitigation = calculateResistances(def, { physical: 100, magical: 100, piercingDamage: 100, hybridalDamage: 100 });
    check(mitigation.reducedpiercingDamage === 100 && mitigation.reducedPhysicalDamage === Math.floor(100 * 70 / 270),
      'Existing resistance formulas retained, without importing the V11 simulator');
    check(resolution.getAttackResonance(rawAttack(['red', 'blue']), 100, 29).bonus === 0
      && resolution.getAttackResonance(rawAttack(['red', 'blue']), 100, 100).bonus === 40
      && resolution.getAttackResonance(rawAttack(Array(5).fill('red').concat(Array(5).fill('blue'))), 100, 100).bonus === 50,
      'Resonance threshold and perfect combination levels');
    check(resolution.getAttackResonance(rawAttack(Array(5).fill('red').concat(Array(5).fill('blue'))), 15, 45).bonus === 2
      && resolution.getAttackResonance(rawAttack(Array(4).fill('red').concat(Array(4).fill('blue'))), 36, 104).bonus === 5,
      'Resonance floors exactly once even at rational integer boundaries');
    const inherited = summons.inheritSummonEssences({ attacks: ['soin'] }, rawAttack(['red', 'yellow']));
    check(resolution.getAttackNatureRules(inherited.attackDetails[0]).key === 'physical-piercing', 'Summoned creature inherits essence composition by default');
    const independent = { attacks: ['soin'], 'essence-heritage': false };
    check(summons.inheritSummonEssences(independent, rawAttack(['red'])) === independent, 'Summon can keep its own essences');
    const combined = summons.inheritSummonEssences({ attacks: ['soin'], 'essence-heritage': 'combine' }, rawAttack(['red', 'yellow']));
    check(resolution.getAttackNatureRules(combined.attackDetails[0]).key === 'prism', 'Summon combine adds native and inherited colors');
    const inheritedEntity = fixture([], inherited.attackDetails[0]);
    check(inheritedEntity.attackDetails[0].magicalRatio === 1 && inheritedEntity.attackDetails[0].physicalRatio === 0,
      'Summon inherits the casting nature while retaining its own native magical power ratio');
    check(inheritedEntity.attackDetails[0].mastery.level === 2 && essence.validateEntityEssenceLedger(inheritedEntity).ok,
      'Inherited native sockets receive coherent mastery and independent ownership');
    const victim = fixture();
    Object.assign(victim.baseStats, { physicalResistance: 40, magicalResistance: 40, dodge: 0, indestructibility: 0,
      resilience: 0, astrality: 0, armor: { current: 0, max: 0 }, HP: { current: 10000, max: 10000 } });
    const recomputeCombatant = entity => recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    recomputeCombatant(victim);
    const casterNature = fixture();
    casterNature.baseStats.criticalChance = 100;
    recomputeCombatant(casterNature);
    const magic = rawAttack(['blue']);
    const currentRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const outcome = attributes.applyDamage(victim, 100, affinity.createAttackStatView(casterNature, magic), magic, { magical: 100 });
      check(outcome.critical, 'Magic can critically hit using an autonomous contribution');
      const supported = rawAttack(['red', 'yellow'], true);
      const result = attributes.applyDamage(victim, 0, casterNature, supported);
      check(result.hit && getComputedStyle(document.body) && !resolution.getAttackResolutionFlags(magic).canBeDodged,
        'Successful zero heal and pure magic immunity to dodge');
      check((await import("/js/entities/rules.js")).getSafe(victim, 'physicalResistance') === 45,
        'Successful support applies Consolidation even at zero effective healing');
      effects.clearAttackNatureEffects(victim);
      const rupture = rawAttack(['red', 'yellow']);
      for (let i = 0; i < 7; i++) effects.applyAttackNatureEffect(victim, casterNature, rupture);
      const safe = (await import("/js/entities/rules.js")).getSafe;
      check(safe(victim, 'physicalResistance') === 15 && victim.baseStats.physicalResistance === 40,
        'Rupture caps at five shared stacks without changing base stats');
      effects.applyAttackNatureEffect(victim, casterNature, rawAttack(['red', 'red', 'yellow', 'yellow']));
      check(safe(victim, 'physicalResistance') === 14, 'Higher signature replaces only the weakest stack');
      effects.applyAttackNatureEffect(victim, casterNature, { ...rupture, type: ['alteration'] });
      check(safe(victim, 'physicalResistance') === 14, 'Periodic effects cannot grow signature stacks');
      const storage = await import("/js/storage/gameStorage.js");
      storage.saveToLocalStorage('nature-effect-save-test', victim);
      const savedVictim = JSON.parse(localStorage.getItem('nature-effect-save-test'));
      check(safe(savedVictim, 'physicalResistance') === 40 && safe(victim, 'physicalResistance') === 14,
        'Saving excludes temporary nature stacks without removing them from the running battle');
      localStorage.removeItem('nature-effect-save-test');
      window.dispatchEvent(new Event('battleStopped'));
      check(safe(victim, 'physicalResistance') === 40, 'Battle cleanup removes all nature resistance contributions');
      const beforeDuration = balanceData.attackNature.rupture.durationMs;
      try {
        balanceData.attackNature.rupture.durationMs = 50;
        effects.applyAttackNatureEffect(victim, casterNature, rupture);
        await sleep(280);
        check(safe(victim, 'physicalResistance') === 40, 'Stack expiration restores resistance');
      } finally { balanceData.attackNature.rupture.durationMs = beforeDuration; }
      const effusion = rawAttack(['red', 'blue', 'yellow'], true);
      victim.stats.HP.current = 9000;
      effects.applyAttackNatureEffect(victim, casterNature, effusion);
      check(victim.stats.HP.current === 9150, 'Effusion heals 1.5 percent max HP without recursive proc or secondary critical');
      const prism = rawAttack(['red', 'blue', 'yellow']);
      const controlVictim = fixture();
      controlVictim.baseStats = structuredClone(victim.baseStats);
      for (const [roll, key, nature] of [[0.1, 'physical', 'physicalDamage'], [0.5, 'magical', 'magicalDamage'], [0.9, 'piercingDamage', 'piercingDamage']]) {
        Math.random = () => roll;
        victim.stats.HP.current = 10000;
        controlVictim.stats = structuredClone(victim.stats);
        effects.applyAttackNatureEffect(victim, casterNature, prism);
        const sources = { [key]: 150 };
        attributes.applyDamage(controlVictim, 150, casterNature, {
          launchContextId: 'control-discharge', functionName: 'control-discharge',
          natureEffectSecondary: true, attacknature: [nature], combatFunction: 'Attaquant',
          attackTarget: ['enemy'], attackRange: ['range'], effets: [], selfEffects: [], forceDamageSources: sources,
        }, sources);
        check(victim.stats.HP.current === controlVictim.stats.HP.current && victim.stats.HP.current < 10000,
          `Convergent discharge keeps the existing ${key} damage pipeline without recursive procs`);
      }
      Math.random = () => 0.5;
      const light = _ui.createAttackLightDescription(rawAttack(['blue', 'yellow']), bare);
      check(light.querySelector('.attack-damage-summary .picto-stat')?.nextElementSibling?.classList.contains('magicalPiercingDamage')
        && !light.querySelector('.attack-umbra-panel, .attack-nature-signature, .attack-damage-preview'),
        'Light helper has typed icon before amount, without bonus panels or expanded calculation');
      const natureHost = document.createElement('div');
      natureHost.className = 'attack-submenu-infos';
      natureHost.append(progressionUI.createAttackNatureSignature(owner, mixed));
      surface.append(natureHost);
      surface.append(light);
      check(getComputedStyle(natureHost.querySelector('strong')).color === 'rgb(255, 100, 238)',
        'Resonance uses the configured hybrid color');
      const vigor = surface.querySelector('.attack-umbra-entry.is-available > .vigueur');
      const vigorReference = document.createElement('span');
      vigorReference.className = 'vigueur';
      document.body.append(vigorReference);
      check(getComputedStyle(vigor).color === getComputedStyle(vigorReference).color,
        `Offensive Umbra labels retain their configured stat color: ${getComputedStyle(vigor).color}`);
      vigorReference.remove();
      check(Math.abs(natureHost.querySelector('.picto-stat').getBoundingClientRect().left
        - natureHost.querySelector('strong').getBoundingClientRect().left) < 2,
        'Signature icon and title stay left-aligned without inherited auto margins');
      check(getComputedStyle(light.querySelector('.attack-damage-summary .magicalPiercingDamage')).color === 'rgb(147, 219, 117)',
        'Magical-piercing helper amount uses the V11 green palette');
      casterNature.baseStats.criticalChance = 0;
      victim.baseStats.physicalResistance = 0;
      victim.baseStats.magicalResistance = 0;
      recomputeCombatant(casterNature);
      recomputeCombatant(victim);
      const { grantEntityExternalArmor } = await import('/js/items/armor.js');
      for (const level of [1, 10]) {
        grantEntityExternalArmor(victim, 1000 - (victim.stats.armor?.current || 0));
        check(victim.stats.armor.current === 1000, 'Perforation fixture uses a real tracked armor reserve');
        victim.stats.HP.current = 10000;
        const perforation = { ...rawAttack(Array(level).fill('yellow')), attackRange: ['melee'] };
        attributes.applyDamage(victim, 100, affinity.createAttackStatView(casterNature, perforation), perforation, { piercingDamage: 100 });
        check(victim.stats.armor.current === 1000 - (100 - level * 10) && victim.stats.HP.current === 10000 - level * 10,
          `Real armor gate: Perforation ${level} bypasses ${level * 10} percent only`);
      }
    } finally { Math.random = currentRandom; effects.clearAttackNatureEffects(); }
    return reports;
  });
  await mkdir('outputs/mastery-tests', { recursive: true });
  await page.mouse.move(10, 10);
  await page.evaluate(() => document.querySelectorAll('.stat-hover').forEach(node => node.remove()));
  await page.screenshot({ path: 'outputs/mastery-tests/desktop.png' });
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: 'outputs/mastery-tests/mobile.png' });
  await page.locator('#mastery-surface .attack-mastery-gauge').hover();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.stat-hover.attack-mastery-hover')).opacity) >= 0.99);
  const helper = await page.locator('.stat-hover.attack-mastery-hover').boundingBox();
  assert.ok(helper && helper.x >= 0 && helper.x + helper.width <= 390 && helper.y >= 0 && helper.y + helper.height <= 950, 'Mastery hover stays inside mobile viewport');
  await page.screenshot({ path: 'outputs/mastery-tests/mobile-hover.png' });
  const fits = await page.evaluate(() => [...document.querySelectorAll('#mastery-surface .attack-progression, #mastery-surface .attack-umbra-panel')]
    .every(node => node.scrollWidth <= node.clientWidth + 1));
  assert.equal(fits, true, 'New mastery and umbra surfaces fit mobile width');
  assert.deepEqual(errors, []);
  console.log(reports.join('\n'));
  console.log(`PASS: ${reports.length + 3} mastery / affinity / UI checks`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
