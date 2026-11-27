import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const model = await import("/js/combat/attackResolution.js");
    const calc = await import("/js/combat/statistics.js"), _calc = await import("/js/ui/statistics/details.js");
    const ledger = await import("/js/items/essenceInventory.js");
    const essences = await import("/js/items/essences.js");
    const ui = await import("/js/ui/attacks.js"), _ui = await import("/js/ui/codex/index.js");
    const { buildStatHoverCard } = await import('/js/data/helpers.js');
    const { applyDamage, calculateDefensiveHpOutcome } = await import("/js/combat/vitals.js");
    const { calculateResistances } = await import("/js/entities/rules.js");
    const { createAttackStatView } = await import("/js/combat/statistics.js");
    const { getEntityCombatDetails } = await import("/js/storage/entityStorage.js");
    const { entites, enrichEntityStats, recomputeEntityStats } = await import("/js/entities/runtime.js");
    const { balanceData } = await import('/js/data/balanceData.js');
    const reports = [];
    const check = (ok, text) => { if (!ok) throw Error(text); reports.push(text); };
    const actor = id => {
      const entity = { id, name: `Essence test ${id}`, side: id === 885800 ? 'A' : 'B', type: 'sbire', role: ['mage'], level: 1,
        baseStats: { HP: 10000, strength: 0, agility: 0, intelligence: 0, physicalDamage: 100, magicalDamage: 20, piercingDamage: 80 }, attacks: ['autoAttack'] };
      enrichEntityStats(entity);
      Object.assign(entity.stats, { HP: { current: 10000, max: 10000 }, armor: { current: 0, max: 0 },
        criticalChance: 0, physicalResistance: 0, magicalResistance: 0, indestructibility: 0, astrality: 0, esoterism: 0, resilience: 0 });
      entity.isDEAD = false; entity.statut = ['alive'];
      entites.push(entity); return entity;
    };
    const owner = actor(885800), target = actor(885801);
    const inert = { ...owner.attackDetails[0], attacknature: ['inerte'], essenceSlots: [], essences: [],
      physicalRatio: 0.3, magicalRatio: 0.5, piercingRatio: 0.2,
      launchContextId: 'inert-test', attackRange: ['melee'], effets: [], combatFunction: 'Attaquant' };
    const preview = calc.calculateAttackDamagePreview(owner, inert);
    check(preview.totalDamage === 39, 'Inert reduces the ratio contributions by 30 percent before the single final floor: 56 x 0.7 = 39.2');
    check(Math.abs(preview.details.ratios.physicalRatio - .21) < 1e-12
      && Math.abs(preview.details.ratios.magicalRatio - .35) < 1e-12
      && Math.abs(preview.details.ratios.piercingRatio - .14) < 1e-12
      && inert.physicalRatio === .3 && inert.magicalRatio === .5 && inert.piercingRatio === .2,
      'Energy loss affects all effective ratios without changing the stored attack ratios');
    const unitRatioPreview = calc.calculateAttackDamagePreview(owner, { ...inert, physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 });
    check(unitRatioPreview.totalDamage === 70 && unitRatioPreview.details.ratios.physicalRatio === .7
      && unitRatioPreview.details.ratios.magicalRatio === 0 && unitRatioPreview.details.ratios.piercingRatio === 0,
      'A ratio of one becomes 0.7 for an Inert attack and explicit zero ratios remain zero');
    const inertImpact = calc.attemptAttackerDamages(owner, inert);
    const hpBeforeEnergyLoss = target.stats.HP.current;
    applyDamage(target, inertImpact.totalDamage, owner, { ...inert, launchContextId: 'inert-energy-loss', forceDamageSources: inertImpact.totalDamageSources }, inertImpact.totalDamageSources);
    check(hpBeforeEnergyLoss - target.stats.HP.current === 39,
      'The real attack calculation and impact apply energy loss once');
    check(preview.details.nature.stat === 'inerte' && !preview.details.nature.signature, 'Inert has its own nature and no nature property');
    check(calc.calculateMeleeExecBonus(owner, inert) === 0, 'Inert has no intrinsic melee execution bonus');
    owner.stats.bloodFury = 150; owner.stats.mysticism = 150; owner.stats.ambidextry = 150;
    const inertView = createAttackStatView(owner, inert);
    check(inertView.stats.bloodFury === 0 && inertView.stats.ambidextry === 0,
      'Inert ignores offensive Umbras');
    owner.stats.bloodFury = 0; owner.stats.mysticism = 0; owner.stats.ambidextry = 0;
    const c = globalThis.umbraProgression.getResistanceConstant('physicalResistance');
    target.stats.physicalResistance = c; target.stats.magicalResistance = c;
    const reduced = calculateResistances(target, { physical: 100 }, owner, { inert: true });
    check(reduced.reducedPhysicalDamage === 25, 'Both 50 percent resistances reduce the full hit successively: 100 -> 50 -> 25');
    check(calculateResistances(target, { physical: 100 }, owner).reducedPhysicalDamage === 50, 'Ordinary physical damage still uses one resistance');
    check(calculateDefensiveHpOutcome(owner, target, { physical: 100 }, { inert: true }) === 25, 'Defensive accounting uses the same double reduction');
    const before = target.stats.HP.current;
    applyDamage(target, 100, owner, { ...inert, forceDamageSources: { physical: 100 } }, { physical: 100 });
    check(before - target.stats.HP.current === 25, 'Actual Inert combat impact applies both resistances');
    const fullInertHit = calc.attemptAttackerDamages(owner, { ...inert, physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 });
    const hpBeforeCombined = target.stats.HP.current;
    applyDamage(target, fullInertHit.totalDamage, owner,
      { ...inert, launchContextId: 'inert-combined-effects', forceDamageSources: fullInertHit.totalDamageSources }, fullInertHit.totalDamageSources);
    check(fullInertHit.totalDamage === 70 && hpBeforeCombined - target.stats.HP.current === 17,
      'Both characteristics are wired together: 100 power -> 70 after energy loss -> 35 after physical resistance -> 17 HP after magical resistance');
    const record = getEntityCombatDetails(owner).damageByNature.inerte;
    check(record.total === 81 && record.physical === 0 && record.magical === 0 && record.piercing === 0,
      'Inert actual damage is not misclassified as physical by its internal transport channel');
    const magic = { ...inert, attacknature: ['magicalDamage'], essenceSlots: [{ color: 'blue' }], essences: ['blue'] };
    owner.stats.hypercognition = 0;
    owner.baseStats.intelligence = 10; recomputeEntityStats(owner); owner.stats.intelligence = 10;
    const withoutHyper = calc.calculateAttackDamagePreview(owner, magic).totalDamage;
    const restoredPreview = calc.calculateAttackDamagePreview(owner, magic);
    check(restoredPreview.details.ratios.physicalRatio === .3 && restoredPreview.details.ratios.magicalRatio === .5
      && restoredPreview.details.ratios.piercingRatio === .2,
      'Reinfusion restores the full original ratios without the Inert penalty');
    owner.stats.hypercognition = 150;
    check(calc.calculateHypercognitionRatio(1) > 1 && calc.calculateHypercognitionRatio(150) === 1.85
      && calc.calculateHypercognitionBonus({ stats: { hypercognition: 1, intelligence: 10 } }) === 8
      && calc.calculateHypercognitionBonus(owner) === 434 && calc.calculateMagicalTotal(owner) === 20,
      'Hyper retains H + Intelligence times its ratio, independently of magical power');
    const withHyper = calc.calculateAttackDamagePreview(owner, magic);
    check(withHyper.totalDamage - withoutHyper === 434 && withHyper.details.powerSources.hypercognition === 434
      && withHyper.details.powers.magical === restoredPreview.details.powers.magical,
      'Hyper adds one full flat bonus after ratios, without being multiplied by Psionic');
    check(_calc.calculateStatsDisplay('magicalDamage', owner).displayValue === 20
      && owner.stats.intelligence === 10 && owner.stats.magicalDamage === 20,
      'Displayed magical power excludes the separate flat bonus and leaves raw stats intact');
    const inertHyper = calc.calculateAttackDamagePreview(owner, inert);
    check(inertHyper.totalDamage === 39 && createAttackStatView(owner, inert).stats.hypercognition === 0,
      'Inert attacks continue to exclude offensive Hypercognition while the entity retains its power');
    const offNature = { ...magic, attacknature: ['physicalDamage'], essenceSlots: [{ color: 'red' }], essences: ['red'],
      physicalRatio: 0, magicalRatio: 1, piercingRatio: 0 };
    const offNatureResult = calc.calculateAttackDamagePreview(owner, offNature);
    check(offNatureResult.totalDamage === 454 && offNatureResult.sources.physical === 454
      && offNatureResult.sources.magical === 0 && offNature.magicalRatio === 1,
      'The normal magical ratio and independent flat bonus retain physical output');
    check(calc.calculateAttackDamagePreview(owner, { ...magic, physicalRatio: 0, magicalRatio: 0, piercingRatio: 1 }).totalDamage === 514,
      'A zero magical ratio still receives the whole flat Hyper bonus');
    const withoutHyperOwner = { ...owner, stats: { ...owner.stats, hypercognition: 0 } };
    const unchangedOwner = JSON.stringify(owner);
    for (const colors of [['red'], ['blue'], ['yellow'], ['red', 'blue'], ['red', 'yellow'], ['blue', 'yellow'], ['red', 'blue', 'yellow']]) {
      for (const ratio of [0, 0.2, 1, 1.7]) {
        const attack = { ...magic, essenceSlots: colors.map(color => ({ color })), essences: colors,
          physicalRatio: 0, magicalRatio: ratio, piercingRatio: .5 };
        const savedAttack = JSON.stringify(attack);
        const baseline = calc.calculateAttackDamagePreview(withoutHyperOwner, attack);
        const boosted = calc.calculateAttackDamagePreview(owner, attack);
        check(boosted.totalDamage - baseline.totalDamage === 434
          && boosted.details.powerSources.hypercognition === 434
          && boosted.details.nature.key === baseline.details.nature.key
          && JSON.stringify(boosted.details.powers) === JSON.stringify(baseline.details.powers)
          && JSON.stringify(attack) === savedAttack,
          `Full flat bonus, unchanged powers, nature and ratios for ${colors.join('+')} with magic ratio ${ratio}`);
      }
    }
    check(JSON.stringify(owner) === unchangedOwner, 'Repeated previews never mutate or stack Hyper on the entity');
    const autonomousOwner = { ...owner, stats: { ...owner.stats, cognitiveExplosion: 7 } };
    for (const attack of [magic, inert, offNature]) {
      const baseline = calc.calculateAttackDamagePreview(owner, attack);
      const boosted = calc.calculateAttackDamagePreview(autonomousOwner, attack);
      check(boosted.totalDamage === baseline.totalDamage + 7,
        'Autonomous cognitive explosion adds seven once, independently of attack ratios or Umbra eligibility');
      check(boosted.details.nature.key === baseline.details.nature.key, 'Autonomous explosion does not change output nature');
    }
    const frozenExplosion = { ...autonomousOwner, archetypeFrozen: true };
    check(calc.calculateCognitiveExplosionTotal(frozenExplosion) === 7, 'Only autonomous explosion survives the frozen Umbra restriction');
    const autonomousHit = calc.calculateAttackDamagePreview(autonomousOwner, offNature);
    const previousResistances = [target.stats.physicalResistance, target.stats.magicalResistance];
    target.stats.physicalResistance = target.stats.magicalResistance = 0;
    const beforeAutonomousHit = target.stats.HP.current;
    applyDamage(target, autonomousHit.totalDamage, autonomousOwner, offNature, autonomousHit.sources);
    check(beforeAutonomousHit - target.stats.HP.current === autonomousHit.totalDamage,
      'Real damage includes autonomous explosion exactly as displayed in the preview');
    [target.stats.physicalResistance, target.stats.magicalResistance] = previousResistances;
    const onlyHyper = { ...magic, physicalRatio: 0, magicalRatio: 0, piercingRatio: 0 };
    check(calc.calculateAttackDamagePreview(owner, onlyHyper).totalDamage === 434,
      'Explicit zero ratios leave the flat bonus intact');
    const disabledAttack = { ...magic, essenceSlots: [{ color: 'blue', active: false }] };
    check(calc.calculateAttackDamagePreview(owner, disabledAttack).details.powerSources.hypercognition === 0,
      'Inactive essences make the attack Inert and block Hyper');
    const dps = calc.calculateDirectAttackDps(offNature, owner);
    check(dps && dps.expectedAmount === offNatureResult.totalDamage
      && dps.perSecond === offNatureResult.totalDamage * 1000 / dps.expectedCycle,
      'DPS uses exactly the same flat contribution and combat cycle');
    ledger.syncEntityEssenceRewards(owner);
    check(owner.attackEssenceInventory.linkedItems.filter(item => item.hyperco).length === 10, 'The live entity receives ten linked blue essences');
    const hyper = owner.attackEssenceInventory.linkedItems.find(item => item.hyperco);
    const equipped = { ...magic, essenceSlots: [{ color: 'blue', active: true, hyperco: true, essenceId: hyper.id }] };
    target.stats.physicalResistance = 0; target.stats.magicalResistance = 0;
    applyDamage(target, 10, owner, { ...equipped, forceDamageSources: { magical: 10 } }, { magical: 10 });
    check(getEntityCombatDetails(owner).hypercognitionDamage === 10, 'Hypercognitive attacks record actual damage, not an invented separate bonus');
    const helper = _calc.calculateStatsDisplay('hypercognition', owner);
    check(JSON.stringify(helper).includes('essence-hyperco'), 'The Hypercognition helper contains the essence pictogram');
    const helperHost=document.createElement('div');helperHost.innerHTML=helper.helpContent;
    const helperText=helperHost.textContent.replace(/\s+/g,' ');
    check(helperText.includes('Confère + 150') && helperText.includes('+ 434')
      && helperText.includes('+ 10')
      && helper.hypercognitionIntel === 10 && helper.hypercognitionRatio === 1.85
      && helperText.includes('dégâts')
      && helperText.includes('Explosion cognitive') && helperText.includes('G\u00e9n\u00e9rateur cognitif')
      && helperText.includes('sans modifier leur nature')
      && helper.ambianceContent === "Les n\u0153uds de son esprit sont si tendu et inerv\u00e9 de magie, que l'entit\u00e9 donne l'impression qu'elle peut exploser \u00e0 tout moment"
      && helperHost.querySelector('.picto-stat.hypercognition')
      && !/recalcule|ench\u00e2ss|retire/.test(helper.helpContent),
      'The current Umbra helper retains its two capacities, lore and dynamic values');
    const overrideHelper = _calc.calculateStatsDisplay('hypercognition', owner, 1);
    check(overrideHelper.hypercognitionBonus === 8 && overrideHelper.hypercognitionRatio > 1
      && overrideHelper.hypercognitionEssences === 1,
      'A stat preview override uses the same value for its bonus, ratio and essence count');
    const withBonusHp = target.stats.HP.current;
    target.stats.physicalResistance = target.stats.magicalResistance = 0;
    applyDamage(target, offNatureResult.totalDamage, owner, offNature, offNatureResult.sources);
    check(withBonusHp - target.stats.HP.current === 454,
      'A real impact applies the flat Hyper bonus once in the attack output nature');
    owner.stats.hypercognition = 0;
    check(calc.calculateHypercognitionBonus(owner) === 0 && calc.calculateMagicalTotal(owner) === 20,
      'Losing Hypercognition removes its magical bonus immediately');
    owner.stats.hypercognition = 150;
    const description = document.createElement('div');
    description.innerHTML = ui.generateAttackDescription({ ...inert, attackDescription: 'Inflige {$totalDamage}.' }, owner);
    check(description.querySelector('.attack-damage-summary .picto-stat.inerte') && description.querySelectorAll('[data-power-source]').length === 3,
      'The description displays Inert damage alongside all three power contributions');
    check([...description.querySelectorAll('.attack-power-ratio')].map(node => node.textContent).join(',') === '0.21,0.35,0.14',
      'The description displays the effective ratios without floating-point tails');
    const statOwner = actor(885802);
    statOwner.baseStats.hypercognition = 0;
    statOwner.baseStats.charge = 2;
    statOwner.stuff = { slot1: ['e-hyper-test'] };
    const equippedItems = [{ equippedId: 'e-hyper-test', itemId: 'e-hyper-test',
      Stuffeffets: [{ type: 'stat-buff', stat: 'hypercognition', value: 100 }] }];
    recomputeEntityStats(statOwner, { equippedItems, persistEquipment: false });
    check(statOwner.attackEssenceInventory.linkedItems.filter(item => item.hyperco).length === 6, 'Committed equipment stats grant six essences at 100');
    check(calc.calculateHypercognitionBonus(statOwner) > 0 && calc.calculateMagicalTotal(statOwner) === statOwner.stats.magicalDamage,
      'Equipment Hypercognition grants a separate flat bonus and essences, never inflating magical ratios');
    statOwner.stuff.slot1 = [];
    recomputeEntityStats(statOwner, { equippedItems: [], persistEquipment: false });
    check(!statOwner.attackEssenceInventory.linkedItems.some(item => item.hyperco), 'Unequipping the stat revokes its essence entitlement');
    check(calc.calculateHypercognitionBonus(statOwner) === 0, 'Unequipping Hypercognition also removes its original power bonus');
    model.setEntityAttackDefinitions(owner, [{ ...inert, launchContextId: undefined, essenceBaseProfile: undefined,
      entityAttackId: undefined, functionName: 'inert-fixture', attackKey: 'inert-fixture', displayName: 'Inerte',
      attackDescription: 'Inflige {$totalDamage}.', attackAsset: './media/assets/spells/auto-attack' }]);
    localStorage.setItem('selectedArmyA', JSON.stringify([owner])); window.selectedArmyA = [owner];
    const host = document.createElement('div'); host.className = 'Game-UI';
    host.style.cssText = 'position:fixed;inset:0;z-index:2000000;display:block;background:#191414';
    const menu = document.createElement('div'); menu.className = 'menu-map-container'; host.append(menu); document.body.append(host);
    const codex = _ui.createCodexEntityScan(owner, menu, `codex-entity_${owner.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    check(codex.querySelector('.attack-nature-signature.inerte')?.textContent.includes('toutes les r'), 'The ability panel explains Inert defenses');
    check(codex.querySelector('.attack-inert-energy-loss')?.textContent.includes('30 %')
      && codex.querySelector('.attack-inert-energy-loss')?.dataset.helperText.includes('30 %')
      && codex.querySelector('.attack-nature')?.dataset.helperText.includes('30 %'),
      'The characteristics and both Inert helpers explain the 30 percent ratio loss');
    const inertRows = [...codex.querySelectorAll('.attack-nature-signature.inerte')];
    check(inertRows.length === 2 && inertRows[0].nextElementSibling === inertRows[1]
      && !inertRows[0].textContent.includes('30 %') && !inertRows[0].dataset.helperText.includes('30 %')
      && !inertRows[1].dataset.helperText.includes('r\u00e9sistances')
      && inertRows[0].dataset.helperKey !== inertRows[1].dataset.helperKey
      && inertRows.every(row => row.tabIndex === 0 && row.querySelector('.picto-stat.inerte')),
      'No nature and energy loss are sibling characteristics with separate icons, focus targets and helpers');
    for (const [row, icon] of [[inertRows[0], 'inerte-resistance'], [inertRows[1], 'inerte-ratio']]) {
      const picto = row.querySelector(`.picto-stat.${icon}`);
      const background = getComputedStyle(picto).backgroundImage;
      check(background.includes(`picto-${icon}.svg`) && !row.querySelector('img'),
        `${icon} uses its dedicated CSS pictogram without an image in the DOM`);
      const image = new Image();
      image.src = background.slice(5, -2);
      await image.decode();
      check(image.naturalWidth > 0 && image.naturalHeight > 0, `${icon} SVG loads and decodes successfully`);
    }
    check(getComputedStyle(codex.querySelector('.attack-nature .inerte')).color === 'rgb(96, 96, 96)', 'Inert nature uses #606060');
    check(getComputedStyle(codex.querySelector('.attack-nature .picto-stat.inerte')).backgroundImage.includes('picto-inerte.svg'), 'The Inert nature retains its original CSS icon');
    const sprites = document.createElement('div'); sprites.id = 'hyperco-preview';
    sprites.style.cssText = 'position:fixed;top:16px;left:16px;right:16px;max-width:940px;background:#051023;z-index:3000000;display:grid;gap:16px';
    const helperOptions = { entityName: 'Jeune Salamandron', attackName: 'Auto-attaque', slot: 1, used: true };
    for (const hyperco of [false, true]) {
      const card = document.createElement('div');
      card.className = 'stat-hover ' + essences.getLinkedEssenceHelperClass('blue');
      card._helperHost = sprites;
      card.style.cssText = 'position:relative;inset:auto;width:100%;min-width:0;max-width:100%;box-sizing:border-box;opacity:1;transition:none';
      card.innerHTML = essences.createLinkedEssenceHelperHTML('blue', { ...helperOptions, hyperco });
      sprites.append(card);
    }
    document.body.append(sprites);
    const ordinaryCard = sprites.firstElementChild.firstElementChild;
    const hyperCard = sprites.lastElementChild.firstElementChild;
    const text = (card, selector) => card.querySelector(selector).textContent.trim();
    check(JSON.stringify([...ordinaryCard.children].map(node => node.className)) ===
      JSON.stringify([...hyperCard.children].filter(node => !node.classList.contains('essence-linked-helper-origin')).map(node => node.className)),
      'Hyperco uses exactly the shared linked-essence structure, plus one origin line');
    check(['bound', 'type', 'quality', 'state'].every(field =>
      text(ordinaryCard, `.essence-linked-helper-${field}`) === text(hyperCard, `.essence-linked-helper-${field}`)),
      'Owner, type, quality and equipped state match the ordinary linked helper');
    check(text(hyperCard, '.essence-linked-helper-name') === 'Essence li\u00e9e d\u2019Intelligence Hypercognitive'
      && text(hyperCard, '.essence-linked-helper-effect').includes('alt\u00e8re la nature')
      && text(hyperCard, '.essence-linked-helper-origin').includes('Générateur cognitif de Jeune Salamandron'),
      'Hyperco retains the standard effect description with its custom name and concise origin');
    check(!hyperCard.querySelector('p, .essence-item-sprite') && !hyperCard.textContent.includes('Elle dispara\u00eet'),
      'The bespoke title orb and technical paragraphs are removed');
    check(getComputedStyle(hyperCard).getPropertyValue('--essence-color').trim() === '#C100AF'
      && getComputedStyle(hyperCard.querySelector('.essence-helper-infused-token .hyperco')).color === 'rgb(193, 0, 175)',
      'Hyperco keeps its requested color in the shared helper');
    check(getComputedStyle(hyperCard.querySelector('.essence-hyperco')).filter.includes('hue-rotate(250deg)'),
      'Hyperco retains its custom inline essence pictogram');
    const availableCard = document.createElement('div');
    availableCard.innerHTML = essences.createLinkedEssenceHelperHTML('blue', { hyperco: true, entityName: '<b>Owner</b>', attackName: '<img src=x>', used: false });
    check(!availableCard.querySelector('b, img') && text(availableCard, '.essence-linked-helper-state').includes('Disponible pour <b>Owner</b>'),
      'Available Hyperco essence uses the standard state and escapes entity names');
    availableCard.innerHTML = essences.createLinkedEssenceHelperHTML('blue', { hyperco: true, entityName: '<b>Owner</b>', attackName: '<img src=x>', slot: 2, used: true });
    check(!availableCard.querySelector('b, img') && text(availableCard, '.essence-linked-helper-state').includes('dans <img src=x>, chasse 2.'),
      'Equipped Hyperco essence escapes attack names and shows the correct socket');
    availableCard.innerHTML = essences.createEssenceSpriteHTML('blue', { mini: true, hyperco: true });
    document.body.append(availableCard);
    check(availableCard.querySelector('.essence-item-sprite-nature.intelligence.hyperco')
      && getComputedStyle(availableCard.querySelector('.essence-item-sprite-nature')).filter.includes('hue-rotate(250deg)'),
      'The actual Hyperco item remains an intelligence essence with its filtered sprite');
    availableCard.remove();
    const helperPreview = document.createElement('div');
    helperPreview.id = 'hypercognition-helper-preview'; helperPreview.className = 'stat-hover';
    helperPreview.style.cssText = 'position:fixed;top:30px;left:30px;width:440px;min-width:0;max-width:calc(100vw - 60px);padding:16px;box-sizing:border-box;background:#151515;z-index:4000000;text-align:center;opacity:1;transition:none';
    helperPreview.innerHTML = buildStatHoverCard({ helperHTML: helper.helpContent, ambianceHTML: helper.ambianceContent });
    document.body.append(helperPreview);
    check(getComputedStyle(helperPreview.querySelector('span.hypercognition:not(.picto-stat)')).color === 'rgb(193, 0, 175)'
      && getComputedStyle(helperPreview.querySelector('.essence-hyperco')).backgroundImage !== 'none'
      && getComputedStyle(helperPreview.querySelector('.picto-stat.cognitiveExplosion')).backgroundImage.includes('picto-explosion-cognitive.svg')
      && ['cognitiveExplosion', 'cognitiveGenerator'].every(effect => {
        const title = helperPreview.querySelector(`.umbra-effect-name.${effect}`);
        const icon = title?.querySelector('.picto-stat');
        return title?.textContent.trim() && icon && getComputedStyle(icon).backgroundImage !== 'none';
      })
      && getComputedStyle(helperPreview.querySelector('.picto-stat.hypercognition')).backgroundImage.includes('picto-hypercognition.svg'),
      'Current capacity cards retain their effect icons and their Hypercognition calculation pictograms');
    const hyperValues = [...helperPreview.querySelectorAll('.helper-figure[data-helper-stat="hypercognition"] > span.hypercognition:not(.picto-stat)')].filter(node => !node.closest('[data-helper-ratio]'));
    check(hyperValues.length >= 1 && hyperValues.every(node => getComputedStyle(node).color === 'rgb(193, 0, 175)'),
      'All Hypercognition totals and source amounts retain #C100AF; ratios belong to sub-helpers');
    check(helper.umbraHelperCalculations.cognitiveExplosionRatio.parts.some(part => part.stat === 'intelligence' && part.value === 6),
      'The collapsed calculation retains its own Intelligence contribution');
    const auto = { ...magic, functionName: 'autoAttack', physicalRatio: 0, magicalRatio: 0, piercingRatio: .5,
      attackDescription: 'Attaque de base. Inflige {$totalDamage}.' };
    const attackPreview = document.createElement('div');
    attackPreview.id = 'hyper-attack-preview'; attackPreview.className = 'section-content attaques';
    attackPreview.style.cssText = 'position:fixed;inset:0;z-index:3000000;background:#151515;overflow:auto;padding:20px;box-sizing:border-box';
    document.body.append(attackPreview);
    for (const colors of [['red'], ['blue'], ['yellow'], ['red', 'blue'], ['red', 'yellow'], ['blue', 'yellow'], ['red', 'blue', 'yellow'], []]) {
      const attack = { ...auto, essences: colors, essenceSlots: colors.map(color => ({ color })) };
      const card = ui.AttackDetailInfos(attack, owner, false, 0, {
        codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
      });
      attackPreview.replaceChildren(card);
      const nature = model.getAttackNatureRules(attack).stat;
      const rateLine = card.querySelector('.attack-dps-preview');
      const [label, icon, value] = rateLine.children;
      check(rateLine.children.length === 3 && label.classList.contains('neutral') && label.textContent === 'DPS :'
        && icon.classList.contains(nature) && value.classList.contains(nature),
        `DPS uses a neutral label, then the ${nature} icon and value, without extra text`);
      const inline = card.querySelector('.attack-power-calculation');
      const bonus = inline.querySelector('.attack-power-bonus.hypercognition');
      check(Boolean(bonus) === Boolean(colors.length)
        && inline.querySelector('.attack-power-ratio').parentElement.classList.contains('neutral')
        && !inline.querySelector('.attack-power-ratio .picto-stat') && !/[a-z\u00e0-\u00ff]/i.test(inline.textContent),
        `The inline formula has only icons, numbers, a neutral ratio and the correct flat for ${nature}`);
      if (colors.length) check(bonus.textContent.includes('434') && getComputedStyle(bonus).color === 'rgb(193, 0, 175)',
        'Inline Hyper amount matches the flat engine value and retains its own color regardless of attack nature');
    }
    const light = ui.createAttackLightDescription(auto, owner);
    check(light.querySelector('.attack-power-calculation .hypercognition') && !light.querySelector('.attack-damage-preview'),
      'The auto-attack hover keeps its inline power calculation beside the final damage');
    attackPreview.replaceChildren(ui.AttackDetailInfos(auto, owner, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    }));
    return reports;
  });
  await mkdir('outputs/hypercognition-tests', { recursive: true });
  await page.locator('#hypercognition-helper-preview').screenshot({ path: 'outputs/hypercognition-tests/hypercognition-helper.png' });
  await page.locator('#hypercognition-helper-preview').evaluate(element => element.remove());
  reports.push(...await page.evaluate(async () => {
    const { setAdminMode } = await import("/js/storage/gameStorage.js");
    const { refreshCodexUmbraPanel } = await import("/js/ui/codex/stats.js");
    const { entites } = await import("/js/entities/runtime.js");
    const reports = [];
    const check = (ok, text) => { if (!ok) throw Error(text); reports.push(text); };
    const panel = document.querySelector('#hyper-attack-preview');
    // Isolate static linked-essence fixtures from the live single-hover lifecycle.
    const linkedFixture = document.querySelector('#hyperco-preview');
    linkedFixture.remove();
    const hover = node => node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    hover(panel.querySelector('.attack-power-bonus.hypercognition'));
    const bonusHelper = document.querySelector('.stat-hover[data-stat="attackHypercognitionBonus"]');
    check(bonusHelper?.querySelector('.stat-hover-header') && bonusHelper.querySelector('.stat-hover-footer')
      && bonusHelper.textContent.includes('Explosion cognitive') && bonusHelper.textContent.includes('+ 434')
      && bonusHelper.textContent.includes('150') && bonusHelper.querySelector('span.intelligence:not(.picto-stat)')?.textContent === '6'
      && bonusHelper.textContent.includes('278') && bonusHelper.textContent.includes('6'),
      'Hovering the inline bonus opens the standard helper with its actual calculation');
    const source = bonusHelper.querySelector('.attack-bonus-source');
    const bonusValues = [...bonusHelper.querySelectorAll('.helper-figure[data-helper-stat="hypercognition"] > span.hypercognition:not(.picto-stat)')];
    check(bonusValues.length === 3 && bonusValues.every(node => getComputedStyle(node).color === 'rgb(193, 0, 175)'),
      'The inline bonus helper also renders every Hypercognition number in #C100AF');
    check(getComputedStyle(bonusHelper.querySelector('span.intelligence:not(.picto-stat)')).color === 'rgb(0, 152, 255)',
      'The inline bonus calculation also renders Intelligence in its own #0098FF color');
    check(source.textContent === 'Source : Umbra Hypercognition' && getComputedStyle(source).color === 'rgb(255, 155, 0)',
      'The bonus helper shows its Umbra source in orange');
    const row = panel.querySelector('.attack-dps-preview');
    setAdminMode(false);
    hover(row);
    const dpsHelper = () => document.querySelector('.stat-hover[data-stat="attackDps"]');
    check(dpsHelper()?.textContent.includes('DPS : D\u00e9g\u00e2ts par seconde bruts estim\u00e9s')
      && dpsHelper().textContent.includes('r\u00e9sistances de la cible') && !dpsHelper().querySelector('.attack-rate-technical')
      && !row.dataset.helperText.includes('100 cycles'),
      'The real player DPS hover explains the estimate without detailed totals');
    const normalAmount = row.querySelector('.attack-dps-value').textContent;
    setAdminMode(true);
    await new Promise(done => requestAnimationFrame(done));
    hover(row);
    check(dpsHelper()?.querySelector('.attack-rate-technical')?.textContent.includes('100 cycles')
      && row.dataset.helperText.includes('Cycle moyen') && row.querySelector('.attack-dps-value').textContent === normalAmount,
      'Enabling admin reveals the technical calculation on reopening the helper without changing DPS');
    setAdminMode(false);
    await new Promise(done => requestAnimationFrame(done));
    hover(row);
    check(!dpsHelper()?.querySelector('.attack-rate-technical') && !row.dataset.helperText.includes('Cycle moyen'),
      'Disabling admin immediately removes the technical details from the open helper and its source');
    dpsHelper()?.remove();
    const owner = entites.find(entity => entity.id === 885800);
    const updated = { ...owner, stats: { ...owner.stats, hypercognition: 1 } };
    refreshCodexUmbraPanel(updated);
    check(panel.querySelector('.attack-power-bonus.hypercognition')?.textContent === '8',
      'The open auto-attack formula refreshes after a stat change');
    hover(panel.querySelector('.attack-power-bonus.hypercognition'));
    check(document.querySelector('.stat-hover[data-stat="attackHypercognitionBonus"]')?.textContent.includes('+ 8'),
      'The refreshed bonus hover matches the refreshed inline amount');
    document.querySelector('.stat-hover[data-stat="attackHypercognitionBonus"]')?.remove();
    refreshCodexUmbraPanel(owner);
    linkedFixture.style.visibility = 'hidden';
    document.body.append(linkedFixture);
    return reports;
  }));
  await page.locator('#hyper-attack-preview').screenshot({ path: 'outputs/hypercognition-tests/flat-attack-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#hyper-attack-preview').evaluate(node => node.scrollWidth <= node.clientWidth), true,
    'The full flat attack panel fits on mobile');
  await page.locator('#hyper-attack-preview').screenshot({ path: 'outputs/hypercognition-tests/flat-attack-mobile.png' });
  await page.locator('#hyper-attack-preview').evaluate(element => element.remove());
  await page.setViewportSize({ width: 1440, height: 950 });
  // These are stacked visual fixtures, not floating helpers managed by viewport resize.
  const restoreLinkedFixture = async () => {
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.locator('#hyperco-preview').evaluate(element => {
      element.style.visibility = '';
      for (const card of element.children) {
        card.style.cssText = 'position:relative;inset:auto;width:100%;min-width:0;max-width:100%;box-sizing:border-box;opacity:1;transition:none';
      }
    });
  };
  await restoreLinkedFixture();
  await page.locator('#hyperco-preview').screenshot({ path: 'outputs/hypercognition-tests/linked-helpers-desktop.png' });
  await page.screenshot({ path: 'outputs/hypercognition-tests/inert-and-hyperco-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await restoreLinkedFixture();
  assert.equal(await page.locator('#hyperco-preview').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Shared helpers fit the mobile viewport');
  await page.locator('#hyperco-preview').screenshot({ path: 'outputs/hypercognition-tests/linked-helpers-mobile.png' });
  await page.screenshot({ path: 'outputs/hypercognition-tests/inert-and-hyperco-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.locator('#hyperco-preview').evaluate(element => element.remove());
  await page.locator('.attack-nature-signature.inerte').first().locator('..').screenshot({ path: 'outputs/hypercognition-tests/inert-energy-loss.png' });
  reports.push(...await page.evaluate(async () => {
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js");
    const { entites, enrichEntityStats, recomputeEntityStats } = await import("/js/entities/runtime.js");
    const { getAttackNatureRules, getAttackPowerRatios } = await import("/js/combat/attackResolution.js");
    const { syncEntityEssenceRewards } = await import("/js/items/essenceInventory.js");
    const reports = [];
    const check = (ok, text) => { if (!ok) throw Error(text); reports.push(text); };
    const settled = async predicate => {
      for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw Error('UI did not settle: ' + document.querySelector('.attack-essence-popup-status')?.textContent + JSON.stringify({
        attack: target(), nature: getAttackNatureRules(target()), signature: codex.querySelector('.attack-nature-signature')?.outerHTML,
        connected: codex.isConnected, allSignatures: [...document.querySelectorAll('.attack-nature-signature')].map(node => node.outerHTML),
        context: codex.querySelector('.attack-context-title')?.parentElement.innerHTML,
        uiNature: codex.querySelector('.attack-nature')?.outerHTML,
      }));
    };
    document.querySelector('#hyperco-preview')?.remove();
    document.querySelector('[id="codex-entity_885800"]')?.remove();
    const entity = { id: 885803, name: 'Hypercognition', side: 'A', type: 'sbire', role: ['mage'], level: 1,
      baseStats: { HP: 100, physicalDamage: 10, magicalDamage: 20, piercingDamage: 30, hypercognition: 100 },
      attacks: ['autoAttack', 'quickAttack'] };
    enrichEntityStats(entity); entites.push(entity);
    window.levelRunning = 'worldmap';
    localStorage.setItem('selectedArmyA', JSON.stringify([entity])); window.selectedArmyA = [entity];
    const menu = document.querySelector('.Game-UI > .menu-map-container');
    const codex = createCodexEntityScan(entity, menu, `codex-entity_${entity.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    const targetKey = codex.querySelector('.attack-essence-sockets--detail').dataset.attackKey;
    const currentOwner = () => window.selectedArmyA.find(item => item.id === entity.id);
    const target = () => currentOwner().attackDetails.find(a => a.attackKey === targetKey);
    const ratios = JSON.stringify(getAttackPowerRatios(target()));
    const count = target().essenceSlots.length;
    codex.querySelector('.attack-essence-sockets--detail .attack-essence-socket').click();
    const popup = document.querySelector('.attack-essence-popup');
    check(Boolean(popup), 'The real Codex socket opens its editor');
    const token = popup.querySelector('[data-essence-popup-color].hyperco');
    check(Boolean(token) && token.dataset.helperText.includes('Intelligence Hypercognitive'), 'Available Hyperco token has the correct helper');
    token.click();
    await settled(() => target().essenceSlots[0].hyperco && popup.querySelector('.attack-essence-equipped-name.hyperco'));
    check(popup.querySelector('.attack-essence-equipped-name').textContent.includes('Hypercognitive'), 'Real socket equip displays the Hyperco name');
    check(codex.querySelector('.attack-essence-sockets--detail .essence-item-sprite-nature.hyperco') &&
      codex.querySelector(`.attack-browser-thumb[data-attack-key="${targetKey}"] .essence-item-sprite-nature.hyperco`),
      'Both the detail and the multi-attack thumbnail refresh Hyperco visuals');
    const helperTargets = [popup.querySelector('.attack-essence-equipped-orb .essence-item-sprite'),
      codex.querySelector('.attack-essence-sockets--detail .attack-essence-socket.hyperco'),
      codex.querySelector(`.attack-browser-thumb[data-attack-key="${targetKey}"] .attack-essence-socket.hyperco`)];
    check(helperTargets.every(node => node.dataset.helperClass === 'essence-linked-hover blue'
      && node.dataset.helperText.includes('Li\u00e9e \u00e0 Hypercognition')
      && node.dataset.helperText.includes(`dans ${target().displayName}, chasse 1.`)),
      'Popup, detail and thumbnail helpers all retain the owner, equipped attack and socket');
    check(JSON.stringify(getAttackPowerRatios(target())) === ratios && target().essenceSlots.length === count, 'Real equip preserves ratios and socket count');
    popup.querySelector('[data-essence-popup-action="clear"]').click();
    await settled(() => getAttackNatureRules(target()).isInert && codex.querySelector('.attack-nature-signature.inerte'));
    check(JSON.stringify(getAttackPowerRatios(target())) === ratios, 'Clearing the last essence immediately renders Inert without changing ratios');
    check(!codex.querySelector('.attack-essence-sockets--detail .attack-essence-socket').dataset.helperText
      && !codex.querySelector('.attack-essence-sockets--detail .attack-essence-socket').dataset.helperClass,
      'Removing the essence clears its former Hyperco helper');
    popup.querySelector('[data-essence-popup-color].hyperco').click();
    await settled(() => target().essenceSlots[0].hyperco && codex.querySelector('.attack-nature[data-stat="magicalDamage"]'));
    check(codex.querySelector('.codex-attack-context [data-stat="messedSpell"]')
      && codex.querySelector('.codex-attack-context [data-stat="psionic"]')
      && !codex.querySelector('.attack-nature-signature.inerte')
      && JSON.stringify(getAttackPowerRatios(target())) === ratios,
      'Reinfusion restores magical nature and its current skills without changing power ratios');
    currentOwner().baseStats.hypercognition = 0;
    recomputeEntityStats(currentOwner(), { persistEquipment: false, skipReverseArchetype: true });
    syncEntityEssenceRewards(currentOwner());
    await settled(() => getAttackNatureRules(target()).isInert && codex.querySelector('.attack-nature-signature.inerte'));
    check(!currentOwner().attackEssenceInventory.linkedItems.some(item => item.hyperco), 'Losing Hypercognition removes equipped grants and refreshes the open attack');
    return reports;
  }));
  await page.screenshot({ path: 'outputs/hypercognition-tests/socket-empty-desktop.png' });
  reports.push(...await page.evaluate(async () => {
    const { createInventory } = await import("/js/ui/inventory.js");
    const { syncEntityEssenceRewards } = await import("/js/items/essenceInventory.js");
    const { recomputeEntityStats } = await import("/js/entities/runtime.js");
    const entity = window.selectedArmyA[0];
    entity.baseStats.hypercognition = 100;
    recomputeEntityStats(entity, { persistEquipment: false, skipReverseArchetype: true });
    syncEntityEssenceRewards(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    createInventory();
    const inventory = document.querySelector('.inventory-interface');
    inventory.querySelector('[data-inventory-tab="essences"]').click();
    const tokens = [...inventory.querySelectorAll('.inventory-item.hyperco')];
    if (tokens.length !== 6) throw Error(`Expected six available Hyperco inventory cards, got ${tokens.length}`);
    if (!tokens.every(token => token.textContent.includes('Intelligence Hypercognitive')
      && token.querySelector('.essence-item-sprite-nature.intelligence.hyperco')
      && token.dataset.helperText.includes('essence-linked-helper-quality')
      && token.dataset.helperText.includes('essence-linked-helper-origin')
      && token.dataset.helperText.includes('Disponible pour Hypercognition.'))) throw Error('Incomplete Hyperco inventory card');
    return ['The inventory lists exactly six Hyperco essences with the shared linked helper, owner, origin and availability'];
  }));
  assert.deepEqual(errors, []);
  console.log(reports.join('\n'));
  console.log(`PASS: ${reports.length} Hypercognition/Inert browser checks`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
