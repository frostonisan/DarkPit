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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { calculateAttackDamagePreview, calculateDirectAttackDps, calculateCritDamageBonus, getEffectiveAttackTimings, attemptMeleeExecBonus } = await import("/js/combat/statistics.js");
    const { getAttackPowerRatios, getAttackResolutionFlags, initializeAttackPowerRatios, readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const { buildAttackTimingsWithHaste } = await import("/js/combat/attacks.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const { AttackDetailInfos, generateAttackDescription } = await import("/js/ui/attacks.js");
    const entity = { id: 1, name: 'Test', stats: { physicalDamage: 15, magicalDamage: 0, piercingDamage: 0,
      speed: 3000, criticalPower: 0, criticalChance: 0, ambidextry: 0, agility: 0, strength: 0, haste: 0 } };
    const melee = { attackId: 'test', displayName: 'Test', combatFunction: 'Attaquant', attackTarget: ['enemy'],
      attackRange: ['melee'], attacknature: ['physicalDamage'], physicalRatio: 1, magicalRatio: 0, piercingRatio: 0,
      preparationTime: 3000, executionTime: 1000, recoveryTime: 2000, cooldown: 15000, effets: ['none'] };
    const direct = calculateDirectAttackDps(melee, entity);
    const varied = calculateDirectAttackDps({ ...melee, physicalRatio: 2 }, entity);
    const range = calculateDirectAttackDps({ ...melee, attackRange: ['range'], executionTime: 10000, cooldown: 0 }, entity);
    const criticalEntity = structuredClone(entity);
    criticalEntity.stats.criticalChance = 25;
    const critical = calculateDirectAttackDps(melee, criticalEntity);
    const ambidextryEntity = structuredClone(entity);
    Object.assign(ambidextryEntity.stats, { piercingDamage: 15, physicalDamage: 0, ambidextry: 30, agility: 40 });
    const ambidextryAttack = { ...melee, physicalRatio: 0, piercingRatio: 1, attacknature: ['piercingDamage'], cooldown: 0 };
    const ambidextry = calculateDirectAttackDps(ambidextryAttack, ambidextryEntity);
    const magicalEntity = structuredClone(entity);
    Object.assign(magicalEntity.stats, { physicalDamage: 0, magicalDamage: 15, intelligence: 0 });
    const magicalAttack = { ...melee, physicalRatio: 0, magicalRatio: 1, attackRange: ['range'], attacknature: ['magicalDamage'] };
    const brokenSpell = calculateDirectAttackDps(magicalAttack, magicalEntity);
    const magicalDamage = calculateAttackDamagePreview(magicalEntity, magicalAttack).totalDamage;
    const liveTimings = buildAttackTimingsWithHaste(entity, melee);
    const uiTimings = getEffectiveAttackTimings(melee, entity);
    const catalog = name => attackDetails.find(attack => attack.displayName === name);
    const catalogEntity = structuredClone(entitesNestUp.find(entry => entry.name === 'Mouche asticoteuse'));
    const display = name => AttackDetailInfos(catalog(name), catalogEntity, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    }).querySelector('.attack-dps-preview');
    const ownedAttack = readAttackDefinitionsForEntity(catalogEntity).find(attack => attack.functionName === 'autoAttack');
    const shown = AttackDetailInfos(ownedAttack, catalogEntity, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    }).querySelector('.attack-dps-preview');
    const ratioOwner = { id: 901, stats: { physicalDamage: 20, magicalDamage: 30, piercingDamage: 40,
      agility: 100, strength: 0, intelligence: 0, brutality: 0, psionic: 0 } };
    const piercingRatioAttack = { ...melee, physicalRatio: 0, magicalRatio: 0, piercingRatio: 0.5,
      essenceBaseProfile: { natures: ['physicalDamage'] } };
    const piercingPhysical = calculateAttackDamagePreview(ratioOwner, piercingRatioAttack);
    const piercingMagical = calculateAttackDamagePreview(ratioOwner,
      { ...piercingRatioAttack, attacknature: ['magicalDamage'], essences: ['blue'] });
    const piercingYellow = calculateAttackDamagePreview(ratioOwner,
      { ...piercingRatioAttack, attacknature: ['piercingDamage'], essences: ['yellow'] });
    const boostedOwner = structuredClone(ratioOwner);
    Object.assign(boostedOwner.stats, { strength: 100, intelligence: 100 });
    const fracassWithoutPhysicalRatio = calculateAttackDamagePreview(boostedOwner,
      { ...piercingRatioAttack, essences: ['red'] });
    const psionicWithoutMagicalRatio = calculateAttackDamagePreview(boostedOwner,
      { ...piercingRatioAttack, attacknature: ['magicalDamage'], essences: ['blue'] });
    const implicitPhysical = { ...melee };
    delete implicitPhysical.physicalRatio;
    initializeAttackPowerRatios(implicitPhysical);
    implicitPhysical.essences = ['blue'];
    const implicitMagical = calculateAttackDamagePreview(ratioOwner, implicitPhysical);
    const plainOwner = { id: 902, stats: { physicalDamage: 10, magicalDamage: 0, piercingDamage: 0 } };
    const multiplier = ratio => ({ ...magicalAttack, physicalRatio: ratio, magicalRatio: 0,
      attackDescription: 'Inflige {$totalDamage}.' });
    const multiplications = [0, 0.3, 1, 1.2].map(ratio => calculateAttackDamagePreview(plainOwner, multiplier(ratio)).totalDamage);
    const tiny = calculateAttackDamagePreview({ id: 903, stats: { physicalDamage: 1, magicalDamage: 1, piercingDamage: 1 } }, {
      ...melee, attacknature: ['hybridalPiercingDamage'], physicalRatio: 0.3, magicalRatio: 0.3, piercingRatio: 0.4,
    });
    const split = ['physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].map(nature =>
      calculateAttackDamagePreview({ id: 904, stats: { piercingDamage: 5 } }, {
        ...melee, attacknature: [nature], physicalRatio: 0, piercingRatio: 1,
      }).sources);
    const describe = (attack, owner = plainOwner) => {
      const description = document.createElement('div');
      description.innerHTML = generateAttackDescription({ ...attack, attackDescription: 'Inflige {$totalDamage}.' }, owner);
      const inline = description.querySelector('.attack-power-calculation');
      const outsideHelper = Boolean(inline && !inline.closest('.detail'));
      description.querySelectorAll('.detail').forEach(node => node.remove());
      return {
        text: description.textContent.replace(/\s+/g, ' ').trim(),
        sources: [...description.querySelectorAll('[data-power-source]')].map(node => node.dataset.powerSource),
        coefficients: [...description.querySelectorAll('.attack-power-ratio')].map(node => node.textContent),
        nature: description.querySelector('.attack-damage-summary > .picto-stat').classList[1],
        total: Number(description.querySelector('.damage-total').textContent),
        outsideHelper,
      };
    };
    const ratioDescriptions = {
      fractional: describe(multiplier(0.3)), unit: describe(multiplier(1)), zero: describe(multiplier(0)),
      overUnit: describe(multiplier(1.2)), precise: describe(multiplier(0.35)),
      piercingMagic: describe({ ...piercingRatioAttack, attacknature: ['magicalDamage'], piercingRatio: 1 }, ratioOwner),
      piercingBonus: describe({ ...piercingRatioAttack, attacknature: ['piercingDamage'] }, ratioOwner),
      composites: ['physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].map(nature =>
        describe({ ...multiplier(0.3), attacknature: [nature], magicalRatio: 0.3, piercingRatio: 0.4 }, ratioOwner)),
    };
    return {
      multiplications, tiny: tiny.totalDamage, split, ratioDescriptions,
      direct, directPreview: calculateAttackDamagePreview(entity, melee).totalDamage, varied, range,
      critical, criticalBonus: calculateCritDamageBonus(criticalEntity), ambidextry, brokenSpell, magicalDamage,
      liveTimings, uiTimings, liveMeleeExecution: attemptMeleeExecBonus(entity, melee, melee.executionTime).finalExecMs,
      shown: { text: shown?.textContent, helper: shown?.dataset.helperText, hover: shown?.dataset.hover },
      ratioCases: { piercingPhysical: piercingPhysical.sources, piercingMagical: piercingMagical.sources,
        piercingYellow: piercingYellow.sources, piercingYellowTotal: piercingYellow.totalDamage,
        fracassWithoutPhysicalRatio: fracassWithoutPhysicalRatio.totalDamage,
        psionicWithoutMagicalRatio: psionicWithoutMagicalRatio.totalDamage,
        implicitMagical: implicitMagical.sources, implicitRatios: getAttackPowerRatios(implicitPhysical),
        piercingRatios: getAttackPowerRatios(piercingRatioAttack) },
      missingRange: getAttackResolutionFlags({ ...melee, attackRange: undefined }),
      explicitRange: getAttackResolutionFlags({ ...melee, attackRange: ['range'] }),
      excluded: ['Venin', 'Incinération', 'Soin', 'Lancé de jarret', 'Profanation']
        .map(name => ({ name, calculation: calculateDirectAttackDps(catalog(name), catalogEntity), visible: Boolean(display(name)) })),
    };
  });
  assert.equal(result.direct.expectedDamage, result.directPreview, 'DPS uses the combat damage preview');
  assert.equal(result.direct.expectedCycle, 15000, 'Cooldown starts before melee preparation');
  assert.equal(result.direct.dps, result.directPreview / 15, 'DPS is damage per effective cycle');
  assert.ok(result.varied.dps > result.direct.dps, 'Changing the real damage ratio changes DPS');
  assert.deepEqual(result.ratioCases.piercingRatios,
    { physical: 0, magical: 0, piercing: 0.5 }, 'Piercing-only ratio does not acquire a nature ratio');
  assert.deepEqual(result.multiplications, [0, 3, 10, 12], 'Ratios multiply power without adding it again');
  assert.equal(result.tiny, 1, 'Fractional contributions are summed before rounding');
  assert.ok(result.split.every(sources => Object.values(sources).reduce((sum, value) => sum + value, 0) === 5),
    'All composite natures preserve five damage through integer distribution');
  const descriptions = result.ratioDescriptions;
  assert.deepEqual(descriptions.fractional.sources, ['physicalDamage'], 'Zero-ratio sources are absent');
  assert.deepEqual(descriptions.fractional.coefficients, ['0.3']);
  assert.match(descriptions.fractional.text, /3\s+\(10 × 0.3\)/,
    'Effective nature and decimal power calculation appear together without hover');
  assert.ok(descriptions.fractional.outsideHelper, 'Calculation is not inside the hidden helper');
  assert.deepEqual(descriptions.unit.coefficients, [], 'A unit coefficient is omitted');
  assert.match(descriptions.unit.text, /10\s+\(10\)/);
  assert.match(descriptions.piercingMagic.text, /40\s+\(40\)/,
    'Power source is independent of effective nature');
  assert.deepEqual(descriptions.zero.sources, [], 'Zero ratios never appear');
  assert.equal(descriptions.zero.total, 0);
  assert.equal(descriptions.zero.nature, 'magicalDamage', 'A zero result keeps the effective nature');
  assert.deepEqual(descriptions.overUnit.coefficients, ['1.2']);
  assert.deepEqual(descriptions.precise.coefficients, ['0.35'], 'Explicit ratio precision is preserved');
  assert.match(descriptions.piercingBonus.text, /\(40 × 0.5 \+ 5\)/,
    'Flat nature bonuses are included next to the power calculation');
  assert.equal(descriptions.piercingBonus.total, result.ratioCases.piercingYellowTotal);
  assert.deepEqual(descriptions.composites.map(entry => entry.nature),
    ['physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage']);
  assert.ok(descriptions.composites.every(entry => entry.sources.length === 3
    && !entry.text.includes('%') && entry.text.includes(' + ')), 'Mixed powers use additions and decimal multipliers');
  assert.equal(result.ratioCases.piercingPhysical.physical, 20,
    'A physical attack can draw all its power from the piercing ratio');
  assert.equal(result.ratioCases.piercingMagical.magical, 20,
    'Changing the essence redirects the same piercing-powered hit to magical damage');
  assert.equal(result.ratioCases.piercingYellowTotal, 25,
    'Transpiercing agility belongs to yellow nature on top of immutable power ratios');
  assert.equal(result.ratioCases.fracassWithoutPhysicalRatio, 20,
    'Fracassante cannot increase a hit with no physical-power ratio');
  assert.equal(result.ratioCases.psionicWithoutMagicalRatio, 20,
    'Psionique cannot increase a hit with no magical-power ratio');
  assert.equal(result.ratioCases.implicitRatios.physical, 1,
    'A generated original physical power source survives an essence change');
  assert.ok(result.ratioCases.implicitMagical.magical > 0,
    'A generated default ratio remains damaging after its nature changes');
  assert.equal(result.missingRange.isMelee, true, 'A missing range resolves as melee');
  assert.equal(result.explicitRange.isMelee, false, 'An explicit ranged attack does not resolve as melee');
  assert.equal(result.range.expectedCycle, 8000, 'Projectile travel overlaps recovery and the next ATB');
  assert.equal(result.range.firstImpact, 16000, 'Projectile travel still delays its own impact');
  assert.equal(result.critical.critChance, 0.25, 'Critical chance is included');
  assert.equal(result.critical.expectedDamage,
    result.directPreview + 0.25 * (Math.round(result.directPreview * (1 + result.criticalBonus / 100)) - result.directPreview),
    'Critical expectation keeps combat rounding');
  assert.ok(result.ambidextry.expectedProcs > 0 && result.ambidextry.procDamage > 0
    && result.ambidextry.expectedCycle > result.ambidextry.baseCycle,
  'Ambidextry adds expected damage and extends melee cycles');
  assert.ok(result.brokenSpell.brokenChance > 0, 'Pure magical ranged attacks can break');
  assert.equal(result.brokenSpell.expectedDamage,
    (1 - result.brokenSpell.brokenChance) * result.magicalDamage,
    'A broken ranged spell contributes no target damage');
  assert.equal(result.uiTimings.effective.executionTime, result.liveMeleeExecution,
    'UI and combat timing agree after melee execution bonuses');
  assert.equal(result.uiTimings.effective.cooldown, result.liveTimings.timings.cooldown,
    'UI and combat share the cooldown reduction');
  assert.ok(result.shown.text?.startsWith('DPS :') && !result.shown.text?.includes('dégâts/s')
    && result.shown.helper?.includes('Dégâts par seconde bruts estimés')
    && !result.shown.helper?.includes('100 cycles') && result.shown.hover === 'true',
  'Codex displays compact DPS with a player explanation, without admin calculations');
  assert.ok(result.excluded.every(entry => entry.calculation === null && !entry.visible),
    JSON.stringify(result.excluded));
  const healingReports = await page.evaluate(async () => {
    const calc = await import("/js/combat/statistics.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { applyDamage } = await import("/js/combat/vitals.js");
    const { entites } = await import("/js/entities/runtime.js");
    const { getEntityCombatDetails } = await import("/js/storage/entityStorage.js");
    const { getAttackPowerRatios } = await import("/js/combat/attackResolution.js");
    const { AttackDetailInfos } = await import("/js/ui/attacks.js");
    const reports = [];
    const check = (ok, label) => { if (!ok) throw Error(label); reports.push(label); };
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const owner = { id: 990301, name: 'HPS test', side: 'A', type: 'sbire', role: ['mage'], isDEAD: false,
      stats: { HP: { current: 1000, max: 1000 }, armor: { current: 0, max: 0 },
        magicalDamage: 30, physicalDamage: 10, piercingDamage: 30, strength: 0, intelligence: 0, agility: 0,
        criticalPower: 0, criticalChance: 0, ambidextry: 0, speed: 1000, haste: 0 } };
    const attack = { ...structuredClone(attackDetails.find(entry => entry.functionName === 'soin')),
      physicalRatio: 0, magicalRatio: 0, piercingRatio: 1 };
    const amount = calc.calculateAttackDamagePreview(owner, attack).totalDamage;
    const rate = calc.calculateDirectAttackHps(attack, owner);
    check(amount === 30 && rate.expectedHealing === 30 && rate.expectedCycle === 6000 && rate.hps === 5,
      'A 30 HP direct heal every six seconds produces 5 HPS, without counting heal visuals twice');
    check(rate.healingPerMinute === 300 && rate.projectedCycles === 100 && rate.projectedDuration === 600000,
      '100 expected cycles normalize to a sustained HP-per-second and HP-per-minute rate');
    check(rate.brokenChance === 0 && rate.expectedProcs === 0,
      'A magical support has no offensive backfire or invented second heal');
    const delayed = calc.calculateDirectAttackHps({ ...attack, executionTime: 20000 }, owner);
    check(delayed.hps === rate.hps && delayed.firstImpact > rate.firstImpact,
      'Long healing projectiles delay arrival without slowing the sustained ranged cadence');
    const fallbackOwner = structuredClone(owner); delete fallbackOwner.stats.speed;
    check(calc.calculateDirectAttackHps(attack, fallbackOwner).speed === 1000,
      'Missing entity speed uses the one-second fallback');
    const boosted = structuredClone(owner);
    Object.assign(boosted.stats, { strength: 150, agility: 60, haste: 25,
      attackPreparationReduc: 10, attackExecutionReduc: 20, attackRecoveryReduc: 15, attackCooldownReduc: 20 });
    const melee = { ...attack, attackRange: ['melee'], cooldown: 0 };
    const meleeRate = calc.calculateDirectAttackHps(melee, boosted);
    const actualMelee = calc.attemptMeleeExecBonus(boosted, melee, melee.executionTime);
    check(meleeRate.timings.executionTime === actualMelee.finalExecMs
      && meleeRate.secondDelay === calc.applyReducToMs(500, actualMelee.totalReduc),
      'HPS melee execution and repeat delay use all the same reductions as combat');
    check(near(meleeRate.expectedCycle, meleeRate.timings.preparationTime
      + Math.max(200, actualMelee.finalExecMs) + meleeRate.timings.recoveryTime + meleeRate.speed),
      'A melee healing cycle includes execution, recovery and entity speed');
    check(calc.calculateDirectAttackHps({ ...melee, attackRange: undefined }, boosted).hps === meleeRate.hps,
      'A missing range uses the full melee timing convention');
    const criticalOwner = structuredClone(owner);
    criticalOwner.stats.criticalChance = 25;
    const criticalRate = calc.calculateDirectAttackHps(attack, criticalOwner);
    const criticalAmount = Math.round(amount * (1 + calc.calculateCritDamageBonus(criticalOwner) / 100));
    check(near(criticalRate.expectedHealing, amount * .75 + criticalAmount * .25),
      'Critical healing expectation uses combat rounding, not random preview rolls');
    const doubleOwner = structuredClone(owner);
    Object.assign(doubleOwner.stats, { ambidextry: 100, criticalChance: 25, agility: 80, strength: 150 });
    const doubleAttack = { ...melee, attacknature: ['piercingDamage'], essences: ['yellow'], physicalRatio: 0,
      magicalRatio: 1, piercingRatio: 0 };
    const view = calc.createAttackStatView(doubleOwner, doubleAttack);
    const doubleRate = calc.calculateDirectAttackHps(doubleAttack, doubleOwner);
    const firstAmount = calc.calculateAttackDamagePreview(view, doubleAttack).totalDamage;
    const secondAmount = Math.round(firstAmount * calc.calculateAmbidextryDamageBonus(view) / 100);
    const expectation = value => value + doubleRate.critChance
      * (Math.round(value * (1 + calc.calculateCritDamageBonus(view) / 100)) - value);
    const p = doubleRate.ambidextryChance;
    check(p > 0 && near(doubleRate.directHealing, expectation(firstAmount))
      && near(doubleRate.procHealing, p * expectation(secondAmount))
      && near(doubleRate.expectedHealing, doubleRate.directHealing + doubleRate.procHealing),
      'Ambidextry contributes only the second heal and includes its independent critical expectation');
    check(doubleRate.doubleCycle > doubleRate.baseCycle
      && near(doubleRate.expectedCycle, (1 - p) * doubleRate.baseCycle + p * doubleRate.doubleCycle),
      'Ambidextrous melee cycles are averaged by proc probability, not added to every cycle');
    const mirrored = calc.calculateDirectAttackDps({ ...doubleAttack, combatFunction: 'Attaquant', attackTarget: ['enemy'] }, doubleOwner);
    check(mirrored.expectedCycle === doubleRate.expectedCycle && mirrored.secondDelay === doubleRate.secondDelay,
      'DPS and HPS share the corrected repeat cadence');
    const rangedDouble = calc.calculateDirectAttackHps({ ...doubleAttack, attackRange: ['range'] }, doubleOwner);
    check(rangedDouble.expectedCycle === rangedDouble.baseCycle && rangedDouble.procHealing > 0,
      'A second ranged heal overlaps recovery without extending the cycle');
    const blockedDouble = calc.calculateDirectAttackHps({ ...doubleAttack, cooldown: 60000 }, doubleOwner);
    check(blockedDouble.expectedCycle === 60000, 'A long cooldown absorbs both melee impacts');
    const inert = { ...attack, attacknature: ['inerte'], essenceSlots: [] };
    const fixedRatios = JSON.stringify(getAttackPowerRatios(inert));
    const inertRate = calc.calculateDirectAttackHps(inert, owner);
    check(inertRate.expectedHealing === 21 && inertRate.hps === 3.5
      && JSON.stringify(getAttackPowerRatios(inert)) === fixedRatios,
      'Inert healing loses 30 percent of its ratios without changing the stored coefficients');
    check(calc.calculateDirectAttackHps(attack, owner).hps === 5,
      'Reinfusion restores the ordinary healing output');
    const prism = { ...attack, attacknature: ['hybridalPiercingDamage'], essences: ['red', 'blue', 'yellow'] };
    const prismRate = calc.calculateDirectAttackHps(prism, owner);
    check(prismRate.targetDependentHealing?.label === 'Effusion convergente'
      && prismRate.targetDependentHealing.percent > 0
      && prismRate.expectedHealing === calc.calculateAttackDamagePreview(owner, prism).totalDamage,
      'Prismatic HPS marks target-dependent Effusion as excluded from direct healing');
    const zero = calc.calculateDirectAttackHps({ ...attack, piercingRatio: 0 }, owner);
    check(zero.hps === 0 && Number.isFinite(zero.hps), 'A zero-powered direct heal displays zero HPS');
    check(calc.calculateDirectAttackHps({ ...attack, cooldown: Infinity }, owner) === null,
      'Nonfinite timing data does not produce an invalid HPS value');
    for (const invalid of [null,
      ...['resurrection', 'lancedejarret', 'profanation'].map(key => attackDetails.find(entry => entry.functionName === key)),
      { ...attack, combatFunction: 'Attaquant' }, { ...attack, attackTarget: ['hexa'] },
      { ...attack, effets: ['rez'] }, { ...attack, effets: ['poison'] }, { ...attack, effets: ['unknown-buff'] },
      { ...attack, effectDot: 5, effectDuration: 10 }, { ...attack, type: ['alteration'] },
      { ...attack, natureEffectSecondary: true }]) {
      check(calc.calculateDirectAttackHps(invalid, owner) === null,
        `Exclude non-direct healing: ${invalid?.functionName || 'null'} / ${invalid?.effets || invalid?.type || ''}`);
    }
    const freeze = value => { Object.values(value).forEach(entry => {
      if (entry && typeof entry === 'object') freeze(entry);
    }); return Object.freeze(value); };
    const frozenOwner = structuredClone(doubleOwner);
    freeze(frozenOwner.stats);
    const frozenAttack = freeze(structuredClone(doubleAttack));
    const savedBefore = JSON.stringify(Object.entries(localStorage));
    const ownerBefore = JSON.stringify(doubleOwner);
    const random = Math.random;
    try {
      Math.random = () => { throw Error('HPS preview consumed a random roll'); };
      for (let index = 0; index < 100; index++) {
        if (calc.calculateDirectAttackHps(frozenAttack, frozenOwner).hps !== doubleRate.hps) throw Error('Unstable HPS');
      }
    } finally { Math.random = random; }
    check(JSON.stringify(Object.entries(localStorage)) === savedBefore
      && JSON.stringify(frozenOwner) === ownerBefore && JSON.stringify(doubleOwner) === ownerBefore,
      'Repeated HPS reads preserve frozen stats and attack data, consume no random rolls and modify no entity or save');
    const victim = { ...structuredClone(owner), id: 990302, name: 'HPS target' };
    Object.assign(victim.stats, { armor: { current: 1000, max: 1000 }, physicalResistance: 10000,
      magicalResistance: 10000, dodge: 10000, resilience: 10000 });
    victim.stats.HP.current = 1;
    entites.push(owner, victim);
    localStorage.setItem('selectedArmyA', JSON.stringify([owner, victim]));
    const impact = (spell, source = owner, secondHit = false) => {
      const preview = calc.calculateAttackDamagePreview(source, spell);
      return applyDamage(victim, preview.totalDamage, source, { ...spell, launchContextId: 'hps-check',
        ambidextryHitIndex: secondHit ? 2 : 1 }, preview.sources);
    };
    try {
      Math.random = () => .999999;
      check(impact(attack).healedHP === amount && impact(inert).healedHP === 21,
        'Real ordinary and Inert heals match the preview without armor, resistance or dodge reduction');
      owner.stats.criticalChance = 100;
      const criticalAmount = Math.round(amount * (1 + calc.calculateCritDamageBonus(owner) / 100));
      const expectedHealing = amount + .99 * (criticalAmount - amount);
      check(near(calc.calculateDirectAttackHps(attack, owner).expectedHealing, expectedHealing),
        'Theoretical healing weights critical gains by the 99% chance cap');
      Math.random = () => 0;
      check(impact(attack).healedHP === criticalAmount, 'A successful critical heal applies the full critical gain');
      Math.random = () => .999999;
      check(impact(attack).healedHP === amount, 'The remaining 1% still permits an ordinary heal');
      owner.stats.criticalChance = 0;
      victim.stats.HP.current = 995;
      const before = owner.totalHeal;
      check(impact(attack).healedHP === 5 && impact(attack).healedHP === 0 && owner.totalHeal === before + 5,
        'Combat still excludes overheal even though theoretical HPS assumes a wounded target');
      const prior = getEntityCombatDetails(owner).ambidextryHealing;
      victim.stats.HP.current = 995;
      impact(attack, owner, true);
      check(getEntityCombatDetails(owner).ambidextryHealing === prior + 5,
        'Second-heal accounting still credits only the restored HP');
    } finally { Math.random = random; }
    const render = spell => AttackDetailInfos(spell, owner, false, 0, {
      codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false,
    });
    const row = render(prism).querySelector('.attack-hps-preview');
    check(row?.dataset.stat === 'attackHps' && row.dataset.hover === 'true' && row.tabIndex === 0
      && row.textContent.includes('HPS théorique') && row.textContent.includes('HP/s')
      && row.querySelector('.picto-stat.healing') && row.dataset.helperText.includes('100 cycles')
      && row.dataset.helperText.includes('Effusion convergente exclue')
      && row.dataset.helperText.includes('sans sursoin'),
      'The accessible HPS row uses the healing icon and explains its assumptions and Effusion exclusion');
    check(!render(attack).querySelector('.attack-dps-preview')
      && !render(attackDetails.find(entry => entry.functionName === 'resurrection')).querySelector('.attack-rate-preview'),
      'Support gets HPS rather than DPS, while resurrection gets neither');
    return reports;
  });
  console.log(healingReports.join('\n'));
  await page.evaluate(async () => {
    const { AttackDetailInfos } = await import("/js/ui/attacks.js");
    const { attackDetails } = await import('/js/data/attackList.js');
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const { readAttackDefinitionsForEntity } = await import("/js/combat/attackResolution.js");
    const host = document.createElement('div');
    host.className = 'section-content attaques';
    host.id = 'attack-dps-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#130f10;z-index:999999';
    const owner = structuredClone(entitesNestUp.find(entity => entity.name === 'Mouche asticoteuse'));
    const attack = readAttackDefinitionsForEntity(owner).find(attack => attack.functionName === 'autoAttack');
    host.append(AttackDetailInfos(attack,
      owner,
      false, 0, { codexLayout: true, showProgression: false, showUmbraPanel: false, showActivation: false }));
    const { generateAttackDescription } = await import("/js/ui/attacks.js");
    const examples = document.createElement('div');
    examples.className = 'attack-description-examples';
    examples.style.cssText = 'padding:16px;line-height:1.6';
    const plainOwner = { id: 902, stats: { physicalDamage: 10, magicalDamage: 10, piercingDamage: 10 } };
    examples.innerHTML = [
      { attacknature: ['magicalDamage'], physicalRatio: 0, magicalRatio: 0, piercingRatio: 1 },
      { attacknature: ['magicalDamage'], physicalRatio: 0.5, magicalRatio: 0, piercingRatio: 0 },
      { attacknature: ['hybridalPiercingDamage'], physicalRatio: 0.3, magicalRatio: 0.3, piercingRatio: 0.4 },
    ].map(variant => generateAttackDescription({ ...variant, attackDescription: 'Inflige {$totalDamage} à la cible.' }, plainOwner)).join('');
    host.append(examples);
    document.body.append(host);
  });
  const output = resolve('outputs/attack-description-tests');
  await mkdir(output, { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const layout = await page.evaluate(() => {
      const host = document.querySelector('#attack-dps-test');
      const row = host.querySelector('.attack-dps-preview');
      return { width: row.clientWidth, scrollWidth: row.scrollWidth, text: row.textContent,
        descriptions: [...host.querySelectorAll('.attack-description')].map(node => ({
          width: node.clientWidth, scrollWidth: node.scrollWidth,
          inlineVisible: node.querySelector('.attack-power-calculation')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        })),
      };
    });
    assert.ok(layout.width > 0 && layout.scrollWidth <= layout.width + 1 && layout.text.includes('DPS'),
      `DPS row fits at ${width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.descriptions.every(node => node.inlineVisible && node.width > 0 && node.scrollWidth <= node.width + 1),
      `Inline calculations are visible without hover and fit at ${width}px: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: resolve(output, `${width}.png`) });
  }
  const liveHealing = await page.evaluate(async () => {
    const { createCodexEntityScan } = await import("/js/ui/codex/index.js");
    const { entites, entitesNestUp, recomputeEntityStats } = await import("/js/entities/runtime.js");
    const { calculateDirectAttackHps } = await import("/js/combat/statistics.js");
    const { syncDOMWithStats } = await import("/js/ui/statistics/components.js");
    const { readAttackDefinitionsForEntity, getAttackPowerRatios } = await import("/js/combat/attackResolution.js");
    const reports = [];
    const check = (ok, label) => { if (!ok) throw Error(label); reports.push(label); };
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const settled = async condition => {
      for (let step = 0; step < 80; step++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw Error('HPS interface did not refresh');
    };
    document.getElementById('attack-dps-test').remove();
    const sample = structuredClone(entitesNestUp.find(entity => entity.name === 'Grouille-Doigt TEST 2A support'));
    sample.side = 'A';
    sample.role = ['mage'];
    const recompute = () => recomputeEntityStats(sample, { persistEquipment: false, skipReverseArchetype: true });
    recompute();
    entites.length = 0;
    entites.push(sample);
    localStorage.setItem('selectedArmyA', JSON.stringify([sample]));
    window.selectedArmyA = [sample];
    let host = document.querySelector('.Game-UI');
    if (!host) { host = document.createElement('div'); host.className = 'Game-UI'; }
    document.body.append(host);
    host.style.cssText = 'position:fixed;inset:0;z-index:2000000;display:block;background:#191414;';
    host.replaceChildren();
    const menu = document.createElement('div'); menu.className = 'menu-map-container'; host.append(menu);
    const codex = createCodexEntityScan(sample, menu, `codex-entity_${sample.id}`);
    codex.querySelector('.codex-attacks').parentElement.click();
    const choose = key => codex.querySelector(`.attack-browser-thumb[data-attack-key="${key}"] .attack-image`).click();
    choose('resurrection');
    check(!codex.querySelector('.attack-rate-preview'), 'The real resurrection panel has no fictitious HPS');
    choose('soin');
    const value = () => codex.querySelector('.attack-hps-value')?.textContent;
    const formatted = (spell, entity) => calculateDirectAttackHps(spell, entity).hps
      .toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const spell = entity => readAttackDefinitionsForEntity(entity).find(attack => attack.functionName === 'soin');
    check(value() === formatted(spell(sample), sample), 'The real support attack displays its calculated HPS');
    const row = codex.querySelector('.attack-hps-preview');
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await frame();
    check(document.querySelector('.Game-helper .stat-hover-body')?.textContent.includes('HPS théorique'),
      'Hovering the HPS row actually opens its dedicated helper');
    row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    document.querySelectorAll('.Game-helper .stat-hover').forEach(node => node.remove());
    const before = value();
    const oldStats = structuredClone(sample.stats);
    const oldSources = structuredClone(sample.modifierStats.durable.statLeveled);
    sample.modifierStats.durable.statLeveled.magicalDamage = (oldSources.magicalDamage || 0) + 100;
    recompute();
    check(sample.stats.magicalDamage > oldStats.magicalDamage, 'The source modifier increases recomputed magical power');
    syncDOMWithStats(oldStats, sample.stats, sample.id, sample);
    check(value() !== before && value() === formatted(spell(sample), sample)
      && codex.querySelector('.attack-details').dataset.attackKey === 'soin',
      'Equipment/level stat synchronization refreshes HPS immediately without changing attack focus');
    const beforeHaste = structuredClone(sample.stats);
    const beforeTiming = value();
    sample.modifierStats.durable.statLeveled.attackPreparationReduc = 60;
    sample.modifierStats.durable.statLeveled.attackCooldownReduc = 60;
    recompute();
    syncDOMWithStats(beforeHaste, sample.stats, sample.id, sample);
    check(value() !== beforeTiming && value() === formatted(spell(sample), sample), 'Timing modifiers refresh the visible HPS as well');
    const modifiedStats = structuredClone(sample.stats);
    sample.modifierStats.durable.statLeveled = oldSources;
    recompute();
    syncDOMWithStats(modifiedStats, sample.stats, sample.id, sample);
    check(value() === before, 'Removing stat modifiers restores the initial HPS without reopening the panel');
    localStorage.setItem('selectedArmyA', JSON.stringify([sample]));
    const ratios = JSON.stringify(getAttackPowerRatios(spell(sample)));
    const beforeClear = value();
    codex.querySelector('.attack-essence-sockets--detail .attack-essence-socket').click();
    await settled(() => document.querySelector('.attack-essence-popup'));
    document.querySelector('[data-essence-popup-action="clear"]').click();
    await settled(() => codex.querySelector('.attack-nature-signature.inerte'));
    const currentOwner = () => window.selectedArmyA.find(entity => entity.id === sample.id);
    check(value() !== beforeClear && value() === formatted(spell(currentOwner()), currentOwner())
      && JSON.stringify(getAttackPowerRatios(spell(currentOwner()))) === ratios,
      'Clearing the last essence immediately recalculates Inert HPS without changing ratios');
    await settled(() => document.querySelector('.attack-essence-popup [data-essence-popup-color="blue"]'));
    document.querySelector('.attack-essence-popup [data-essence-popup-color="blue"]').click();
    await settled(() => !codex.querySelector('.attack-nature-signature.inerte'));
    check(value() === formatted(spell(currentOwner()), currentOwner()) && value() === beforeClear,
      'Reinfusing the linked intelligence essence restores the prior HPS in the open panel');
    document.querySelector('.attack-essence-popup-close')?.click();
    return reports;
  });
  console.log(liveHealing.join('\n'));
  for (const width of [1440, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const row = page.locator('.section-content.attaques .attack-hps-preview');
    await row.scrollIntoViewIfNeeded();
    const layout = await row.evaluate(node => {
      const children = [...node.children].map(child => child.getBoundingClientRect());
      const bounds = node.getBoundingClientRect();
      return { fits: node.scrollWidth <= node.clientWidth + 1 && children.every(rect =>
        rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1),
        overlaps: children.some((a, index) => children.slice(index + 1).some(b =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
        color: getComputedStyle(node.querySelector('.attack-hps-value')).color,
        icon: getComputedStyle(node.querySelector('.picto-stat')).backgroundImage };
    });
    assert.ok(layout.fits && !layout.overlaps && layout.color === 'rgb(96, 199, 255)'
      && layout.icon.includes('picto-heal.svg'), `HPS layout at ${width}: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: resolve(output, `hps-${width}.png`) });
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`PASS: DPS regressions, ${healingReports.length + liveHealing.length} HPS checks, live refresh and responsive Codex display`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
