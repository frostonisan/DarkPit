import assert from 'node:assert/strict';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/stat-system');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file === root ? resolve(root, 'index.html') : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index-13.html`);
  const report = await page.evaluate(async () => {
    // Enter the game's module graph in its normal startup order.
    await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const S = await import("/js/entities/statSystem.js");
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/ui/statistics/details.js"), _D = await import("/js/combat/statistics.js");
    const H = await import('/js/data/helpers.js');
    const R = await import("/js/entities/rules.js");
    const U = await import("/js/entities/progression.js");
    const Ess = await import("/js/items/essenceInventory.js");
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const equal = (actual, expected, message) => check(Math.abs(actual - expected) < 0.00001, `${message}: ${actual} = ${expected}`);
    for (const key of ['magicalPen', 'bloodFuryExecutionChance']) {
      const mixed = document.createElement('span');
      mixed.className = key;
      mixed.dataset.statState = 'X';
      const reference = document.createElement('span');
      reference.className = key;
      reference.style.backgroundImage = 'linear-gradient(to right, hsl(from var(--stat-color) h s calc(l + 20)), var(--stat-color))';
      document.body.append(mixed, reference);
      check(getComputedStyle(mixed).backgroundImage === getComputedStyle(reference).backgroundImage, `${key}: workshop X gradient ends in the Umbra base color`);
      check(!getComputedStyle(mixed).backgroundImage.includes('rgb(220, 225, 230)'), `${key}: workshop X gradient has no neutral endpoint`);
      mixed.remove();
      reference.remove();
    }
    const fixture = values => ({ id: 987131, name: 'System audit', type: 'sbire', side: 'A',
      awakening: 1, level: { current: 1, max: 250 }, attacks: ['autoAttack'],
      baseStats: { HP: 100, ...values }, stats: structuredClone(values), stuff: {} });
    const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const readAudit = fixture({ strength: 170, vigueur: 160, haste: 8, HP: { current: 43, max: 100 } });
    readAudit.modifierStats = { durable: { level: {}, adminLevel: {}, archetype: {}, statLeveled: {}, stuff: { byId: {} } } };
    const verifyFreshRead = label => {
      const before = JSON.stringify(readAudit);
      for (const preview of [false, true]) for (const combat of [false, true]) {
        const encode = values => JSON.stringify([values, values[S.STAT_POINT_INPUTS]]);
        const actual = E.getStatSystemInputs(readAudit, { preview, combat });
        const fresh = E.getStatSystemInputs(structuredClone(readAudit), { preview, combat });
        check(encode(actual) === encode(fresh), `${label}: repeated stat reads match a fresh owner (${preview}/${combat})`);
        actual.strength = -999;
        check(encode(E.getStatSystemInputs(readAudit, { preview, combat })) === encode(fresh), 'Changing a returned top-level projection never changes another read');
      }
      check(JSON.stringify(readAudit) === before, `${label}: read-only stat projection preserves entity inputs`);
    };
    verifyFreshRead('Initial source read');
    readAudit.baseStats.strength = 190; readAudit.baseStats.HP.current = 21;
    verifyFreshRead('In-place base stat and reserve edit');
    readAudit.baseStatSources = { crystal: { vigueur: 50 } };
    readAudit.modifierStats.durable.level.strength = { flat: 13, percent: 10 };
    readAudit.modifierStats.durable.stuff.byId.e1 = { vigueur: 30 };
    verifyFreshRead('Natural, equipment and crystal gains');
    readAudit.battleBoosts = { strength: [{ mode: 'flat', value: 10 }], vigueur: [{ mode: 'percent', value: 20 }] };
    verifyFreshRead('Buff applied');
    readAudit.battleBoosts.strength[0].value = -7;
    verifyFreshRead('Buff amount edited in place');
    delete readAudit.battleBoosts;
    verifyFreshRead('Buff removed');
    readAudit.modifierStats.preview = { statLeveled: { vigueur: 4, strength: { percent: 30 } } };
    verifyFreshRead('Preview applied');
    delete readAudit.modifierStats.preview;
    readAudit.seuilUmbra = 220; readAudit.Archetype = { current: { key: 'egare' } };
    verifyFreshRead('Threshold and archetype changed');
    readAudit.modifierStats.durable.adminLevel.haste = 4;
    readAudit._statSystemOverrides = { strength: 9 };
    verifyFreshRead('Admin unlock and attack view override');
    const progression = (await import('/js/data/balanceData.js')).balanceData.generatedUmbraStats.progression;
    const oldOverflow = progression.levelOverflowRate;
    try { progression.levelOverflowRate = .27; verifyFreshRead('Live balance edit'); }
    finally { progression.levelOverflowRate = oldOverflow; }
    verifyFreshRead('Balance restored');
    const generatedRules = (await import('/js/data/balanceData.js')).balanceData.generatedUmbraStats.sources;
    const sharedFlatKeys = new Set(Object.values(generatedRules).map(rule => rule.target));
    const progressiveGain = (u, a) => {
      const curve = n => 1 + .85 * (1 - Math.exp(-2.5 * n / 150)) / (1 - Math.exp(-2.5));
      return u ? Math.round(u * curve(u)) + Math.round(a * .5 * curve(a)) : Math.round(a * .5);
    };
    for (const [gain, expected] of [[{ vigueur: 6 }, 44], [{ physicalDamagePlus: 6 }, 36], [{ physicalDamage: 31 }, 31]]) {
      const entity = fixture({ physicalDamage: 25, strength: 10, ...gain });
      recompute(entity);
      equal(entity.stats.physicalDamage, expected, 'Force 10: plus retains its flat amount and unlocks ratios without inventing Vigueur');
      equal(D.calculateStatsDisplay('physicalDamage', entity).statSystem.value, expected, 'The reported three-entity case uses the same helper and combat total');
    }
    for (const plus of [1, 6, 100]) {
      equal(S.calculateStatSources({ physicalDamage: 25, physicalDamagePlus: plus, strength: 10 }, 'physicalDamage').value, 30 + plus,
        'Every additional plus point adds its flat power');
      equal(S.calculateStatSources({ physicalDamage: 25, physicalDamagePlus: plus, vigueur: 6, strength: 10 }, 'physicalDamage').value, 44 + plus,
        'Plus and Umbra share their ratios exactly once');
    }
    for (const [values, expected] of [[{ physicalDamagePlus: 9 }, 14], [{ vigueur: 9 }, 25],
      [{ physicalDamage: 10, physicalDamagePlus: 4, vigueur: 6 }, 33]]) {
      const actor = fixture({ strength: 10, ...values });
      recompute(actor);
      equal(actor.stats.physicalDamage, expected, 'Vigueur combines independent progressive ratios and a fixed gift');
      recompute(actor);
      equal(actor.stats.physicalDamage, expected, 'Repeated recomputation does not persist the derived Umbra flat');
    }
    const convertGenerated = {
      physicalPen: points => R.calculatePenetrationPercent(null, 'physicalPen', points),
      magicalPen: points => R.calculatePenetrationPercent(null, 'magicalPen', points),
      velocity: points => E.calculateVelocityReduction(points, 1000000).percentage,
    };
    for (const [origin, config] of Object.entries(generatedRules)) {
      const key = config.target;
      for (const [normal, plus, umbra, attribute] of [
        [0, 0, 0, 10], [0, 6, 0, 10], [25, 6, 6, 10], [3, 4, 5, 0],
        [10, 0, 0, 10], [0, 10, 0, 10], [0, 0, 10, 10],
        [0, -4, 0, 20], [5, -2, 0, 10], [0, -100, 3, 10], [7, -2, 3, 10], [-5, 110, 0, 10], [.25, 1.25, 4, 7],
      ]) {
        const inputs = { [key]: normal, [`${key}Plus`]: plus, [origin]: umbra, [config.attribute]: attribute };
        const curve = n => 1 + .85 * (1 - Math.exp(-2.5 * n / 150)) / (1 - Math.exp(-2.5));
        const score = umbra * config.ratios.source * (umbra > 0 ? curve(umbra) : 1)
          + (plus > 0 || umbra > 0 ? attribute * config.ratios.attribute * (umbra > 0 ? curve(attribute) : 1) : 0);
        const generated = config.ratioPercent ? config.maxPercent * score / (config.constant + score) : plus > 0 || umbra > 0 ? config.progressive ? progressiveGain(umbra, attribute)
          : Math.round(umbra * config.ratios.source + attribute * config.ratios.attribute) : 0;
        const ratio = !config.ratioPercent && convertGenerated[key] ? convertGenerated[key](generated) : generated;
        const cap = key === 'velocity' ? 65 : convertGenerated[key] ? 99 : Infinity;
        const umbraFlat = config.progressive ? umbra : 0;
        const expected = key === 'armor' ? Math.max(0,Math.round(normal+Math.round(plus+umbraFlat+ratio))) : Math.max(0, Math.min(cap, normal + plus + umbraFlat + ratio));
        const result = S.calculateStatSources(inputs, key);
        equal(result.value, expected, `${key}: normal ${normal} + plus ${plus} + Umbra flat ${umbraFlat} + one existing ratio ${ratio}`);
        const actor = fixture(inputs);
        recompute(actor);
        equal(S.getStatSystemResult(actor, key)?.value ?? actor.stats[key], expected, `${key}: entity recomputation retains the complete flat`);
        equal(S.getStatSystemSourceTotals(actor, key).reduce((sum, source) => sum + source.value, 0), expected,
          `${key}: signed and capped sources reconcile without duplicate gains`);
        const model = S.buildStatSystemModel(result);
        equal(model.parts.reduce((sum, part) => sum + (part.operator === '\u2212' ? -part.value : part.value), 0), expected,
          `${key}: detailed formula reconciles with the shared total`);
        const summary = document.createElement('div');
        summary.innerHTML = H.buildAutonomousCalculationHelper(model, '', key);
        const summaryNumber = kind => Number(summary.querySelector(`[data-autonomous-kind="${kind}"] .helper-figure`).textContent.replace(/\s|%/g, ''));
        if (model.contributions) {
          check(!summary.querySelector('[data-autonomous-kind="base"]'), 'PP never mislabels Umbra flat as base');
          for (const part of model.contributions.filter(part => part.value)) equal(summaryNumber(part.kind), Math.round(Math.abs(part.value) * 100) / 100, `PP ${part.kind}: exclusive amount`);
          equal([...summary.querySelectorAll('[data-contribution-value]')].reduce((sum, node) => sum + Number(node.dataset.contributionValue), 0), expected, 'PP exclusive signed amounts reconcile');
          check(!summary.querySelector('[data-autonomous-kind="total"], .helper-calculation-detail'), 'PP detail contains no repeated total or equations');
        } else equal(summaryNumber('base'), Math.round((normal + plus) * 100) / 100, `${key}: base displays owned fixed gains before ratios and caps`);
        const totalLine = key !== 'physicalDamage' && summary.querySelector('[data-autonomous-kind="total"]');
        if (totalLine) {
          const summaryTotal = Number(totalLine.querySelector('.helper-calculation-result').textContent.replace(/\s|%/g, ''));
          equal(summaryTotal, Math.round(expected * 100) / 100, `${key}: direct helper reconciles signed flat values and caps`);
          const expectedLabel = key + (umbra > 0 ? ' X' : plus > 0 ? ' +' : '');
          check(totalLine.querySelector(':scope > [data-stat-state]').textContent === expectedLabel,
            `${key}: normal, plus and Umbra results retain the appropriate stat name`);
        }
        if (plus > 0 || umbra > 0) {
          equal(S.calculateStatSources({ ...inputs, [key]: normal + 4 }, key).value,
            S.calculateStatSources({ ...inputs, [`${key}Plus`]: plus + 4 }, key).value,
            `${key}: after unlock normal and plus additions have the same effect`);
        }
      }
      const actor = fixture({ [key]: 3, [`${key}Plus`]: 1, [config.attribute]: 10 });
      recompute(actor);
      const committed = key === 'armor' ? actor.stats.armor.totalMax : actor.stats[key];
      actor.modifierStats.preview = { statLeveled: { [`${key}Plus`]: 4 } };
      U.ComputeStatPreview(actor);
      equal(S.getStatSystemResult(actor, key).value, committed + 4, `${key}: Level up previews the added flat`);
      equal(key === 'armor' ? actor.stats.armor.totalMax : actor.stats[key], committed, `${key}: preview does not commit its gain`);
      actor.modifierStats.preview = { statLeveled: { [`${key}Plus`]: -1 } };
      U.ComputeStatPreview(actor);
      equal(S.getStatSystemResult(actor, key).value, 3, `${key}: removing the final plus disables ratios but keeps the normal flat`);
      actor.modifierStats.preview.statLeveled[origin] = 4;
      U.ComputeStatPreview(actor);
      check(S.getStatSystemResult(actor, key).state === 'X', `${key}: Umbra keeps ratio access after the final plus is removed`);
      const curve = n => 1 + .85 * (1 - Math.exp(-2.5 * n / 150)) / (1 - Math.exp(-2.5));
      const percent = score => config.maxPercent * score / (config.constant + score);
      const previewRatio = config.ratioPercent ? percent(4 * curve(4) + 5 * curve(10)) : config.progressive ? progressiveGain(4, 10) : convertGenerated[key] ? convertGenerated[key](9) : 9;
      const directUmbra = config.progressive ? 4 : 0;
      equal(S.getStatSystemResult(actor, key).value, 3 + directUmbra + previewRatio, `${key}: preview uses the appropriate Umbra contribution`);
      const wearer = fixture({ [key]: 3, [`${key}Plus`]: 1, [config.attribute]: 10, charge: 3 });
      const recipient = { ...fixture({ [key]: 1, [config.attribute]: 20, charge: 3 }), id: 987132 };
      const item = { equippedId: `e-two-layers-${key}`, equippedTo: wearer.id, itemId: `i-two-layers-${key}`,
        name: `Umbra ${origin}`, serial: 'i42', itemType: ['stuff'], Stuffeffets: [
          { type: 'stat-buff', stat: origin, value: 4 },
          { type: 'stat-buff', stat: key, value: 2 },
          { type: 'stat-buff', stat: `${key}Plus`, value: 3 },
        ] };
      const update = entity => E.recomputeEntityStats(entity, { equippedItems: [item], persistEquipment: false, skipReverseArchetype: true });
      const converted = points => config.ratioPercent ? percent(points) : convertGenerated[key] ? convertGenerated[key](points) : points;
      wearer.stuff = { slot1: [item.equippedId] };
      update(wearer);
      equal((key === 'armor' ? wearer.stats.armor.totalMax : wearer.stats[key]), 9 + directUmbra + previewRatio, `${key}: equipped flat, plus and Umbra combine exactly once`);
      const umbraSource = S.getStatSystemSourceTotals(wearer, key).find(source => source.category === 'umbra');
      equal(umbraSource.value, config.ratioPercent ? previewRatio : config.progressive ? directUmbra + previewRatio : converted(9) - converted(5), `${key}: equipment Umbra contribution counts its owned ratios once`);
      check(umbraSource.provenance.length > 0, `${key}: equipment Umbra keeps its provenance`);
      const restored = JSON.parse(JSON.stringify(wearer));
      update(restored);
      equal((key === 'armor' ? restored.stats.armor.totalMax : restored.stats[key]), (key === 'armor' ? wearer.stats.armor.totalMax : wearer.stats[key]), `${key}: reloading never adds the derived flat a second time`);
      wearer.stuff.slot1 = [];
      recipient.stuff = { slot1: [item.equippedId] };
      item.equippedTo = recipient.id;
      update(wearer);
      update(recipient);
      equal((key === 'armor' ? wearer.stats.armor.totalMax : wearer.stats[key]), 4 + converted(5), `${key}: removal clears both Umbra layers from the previous wearer`);
      equal((key === 'armor' ? recipient.stats.armor.totalMax : recipient.stats[key]), 6 + directUmbra + (config.ratioPercent ? percent(4 * curve(4) + 10 * curve(20)) : config.progressive ? progressiveGain(4, 20) : converted(14)), `${key}: swap uses the new wearer's attribute`);
      equal(S.getStatSystemSourceTotals(recipient, key).reduce((sum, source) => sum + source.value, 0) + (key === 'armor' ? recipient.stats.armor.stuffMax : 0), (key === 'armor' ? recipient.stats.armor.totalMax : recipient.stats[key]),
        `${key}: swapped source calculations reconcile`);
      equal(D.calculateStatsDisplay(key, recipient).umbraHelperCalculations.autonomousTotal.value, (key === 'armor' ? recipient.stats.armor.totalMax : recipient.stats[key]), `${key}: swapped helper reads the new total`);
    }
    for (const [key, attribute, channel] of [['physicalResistance', 'strength', 'Physical'], ['magicalResistance', 'intelligence', 'Magical']]) {
      const actor = fixture({ [attribute]: 10, [`${key}Plus`]: 6 });
      const physical = key === 'physicalResistance';
      const expected = Math.floor(100 * (1 - .99 * 11 / (11 + 70)));
      recompute(actor);
      equal(R.calculateResistances(actor, { physical: 100, magical: 100 })[`reduced${channel}Damage`], expected,
        `${key}: combat uses the appropriate resistance unit`);
      const origin = S.STAT_SYSTEM_ORIGINS[key];
      actor.baseStats[origin] = 3;
      recompute(actor);
      for (const penetration of [0, 25, 100]) {
        const attacker = fixture({ physicalPen: penetration, magicalPen: penetration });
        recompute(attacker);
        const retained = 1 - Math.min(99, penetration) / 100;
        const ratio = .99 * 18 * retained / (18 * retained + 70);
        equal(R.calculateResistances(actor, { physical: 100, magical: 100 }, attacker)[`reduced${channel}Damage`],
          Math.floor(100 * (1 - ratio)), `${key}: penetration applies before the resistance conversion`);
      }
    }
    for (const normal of [-5, -2, 0, 3]) {
      const improved = S.calculateStatSources({ weaponMastery: 4, strength: 10 }, 'charge').value;
      equal(S.calculateStatSources({ charge: normal }, 'charge').value, normal, 'Normal Charge preserves its signed amount');
      equal(S.calculateStatSources({ charge: normal, weaponMastery: 4, strength: 10 }, 'charge').value,
        normal + improved, 'Charge debt offsets the Umbra contribution without changing its formula');
    }
    equal(S.calculateStatSources({ criticalChance: -5 }, 'criticalChance').value, 0, 'Probabilities retain their zero minimum');
    const debt = fixture({ charge: 3 });
    const debtItem = { equippedId: 'e-charge-debt', equippedTo: debt.id, itemId: 'charge-debt', itemType: ['stuff'],
      Stuffeffets: [{ type: 'stat-buff', stat: 'charge', value: -5 }] };
    debt.stuff = { slot1: [debtItem.equippedId] };
    const recomputeDebt = entity => E.recomputeEntityStats(entity, { equippedItems: [debtItem], persistEquipment: false, skipReverseArchetype: true });
    recomputeDebt(debt);
    equal(debt.stats.charge, -2, 'Equipment Charge debt is not clamped away');
    equal(R.getSafe(debt, 'charge'), -2, 'Charge reader preserves equipment debt');
    equal(_D.calculateChargeEquipmentSlots(debt), 0, 'Negative Charge grants no usable equipment capacity');
    equal(D.calculateStatsDisplay('charge', debt).chargeEquipmentSlots, 0, 'Charge helper does not describe negative slots');
    check(E.getEquipmentSlotKeys(debt).join() === 'slot1' && debt.stuff.slot1[0] === debtItem.equippedId,
      'Only the malus equipment slot remains accessible at negative Charge');
    const chargeSources = S.getStatSystemSourceTotals(debt, 'charge');
    equal(chargeSources.find(part => part.category === 'fixed').value, 3, 'Charge source retains the base amount');
    equal(chargeSources.find(part => part.category === 'equipment').value, -5, 'Charge source retains the full equipment malus');
    equal(chargeSources.reduce((sum, part) => sum + part.value, 0), -2, 'Charge sources reconcile with the signed total');
    const reloadedDebt = JSON.parse(JSON.stringify(debt));
    recomputeDebt(reloadedDebt);
    equal(reloadedDebt.stats.charge, -2, 'Charge debt survives serialization and recomputation');
    debt.modifierStats.preview = { statLeveled: { charge: 1 } };
    U.ComputeStatPreview(debt);
    equal(R.getSafe(debt, 'charge'), -1, 'Level-up preview offsets Charge debt instead of discarding it');
    equal(S.getStatSystemSourceTotals(debt, 'charge').reduce((sum, part) => sum + part.value, 0), -1, 'Preview Charge sources reconcile');
    equal(debt.stats.charge, -2, 'Charge preview leaves committed debt unchanged');
    delete debt.modifierStats.preview;
    debt.stuff.slot1 = [];
    recompute(debt);
    equal(debt.stats.charge, 3, 'Removing the malus restores base Charge');
    for (const [values, expected] of [
      [{ cognitiveGenerator: 0.9 }, 0],
      [{ cognitiveGenerator: 3.9 }, 3],
      [{ cognitiveGenerator: 0.9, cognitiveGeneratorPlus: 2 }, 2],
      [{ cognitiveGenerator: 2.9, hypercognition: 1 }, 3],
      [{ cognitiveGenerator: 3.9, hypercognition: 150 }, 10],
    ]) {
      const generator = fixture(values);
      recompute(generator);
      equal(generator.stats.cognitiveGenerator, expected, 'Generator total is a whole available essence count');
      equal(Ess.calculateCognitiveEssenceCount(generator), expected, 'Generator reader agrees with the stored total');
      equal(D.calculateStatsDisplay('cognitiveGenerator', generator).hypercognitionEssences, expected, 'Generator helper agrees with the available count');
      equal(generator.attackEssenceInventory.linkedItems.filter(item => item.hyperco).length, expected, 'Generator inventory contains exactly the displayed count');
      equal(S.getStatSystemSourceTotals(generator, 'cognitiveGenerator').reduce((sum, part) => sum + part.value, 0), expected, 'Generator source totals include final whole-count rounding');
    }
    const randomBeforeDodge = Math.random;
    try {
      // Final autonomous percentages must not pass through the points curve again in combat.
      for (const [values, expected] of [
        [{ adresse: 3, agility: 6 }, 9],
        [{ dodge: 6 }, 6],
        [{ dodgePlus: 3, agility: 6 }, 6],
        [{ dodge: 2, dodgePlus: 3, adresse: 3, agility: 6 }, 14],
      ]) {
        const target = fixture(values);
        recompute(target);
        equal(target.stats.dodge, expected, 'Dodge stored as score');
        equal(D.calculateStatsDisplay('dodge', target).calculateTotalDodgeBonus, 99 * expected / (expected + 98), 'Dodge helper converts score to chance');
        equal(_D.calculateTotalDodgeBonus(target), 99 * expected / (expected + 98), 'Dodge reader converts generated points once');
        for (const precision of [0, 10]) for (const offset of [-0.001, 0.001]) {
          const chance = 99 * expected / (expected + 98) * (1 - E.calculatePrecisionPercent(precision) / 100);
          Math.random = () => (chance + offset) / 100;
          check(_D.attemptDodge(fixture({ precision }), target) === (offset < 0),
            `Actual dodge roll respects ${expected}% and precision ${precision} at boundary ${offset}`);
        }
      }
    } finally { Math.random = randomBeforeDodge; }
    const source = (kind, key, value) => ({ id: `${kind}-${key}`, kind, key, value });
    const compositions = [
      [0, 0, 0, 'normal'], [3, 0, 0, 'normal'], [0, 4, 0, '+'], [0, 0, 10, '+'],
      [3, 4, 0, 'X'], [3, 0, 10, '◇'], [0, 4, 10, '◆'], [3, 4, 10, 'Ω'],
    ];
    const inputsForState=(key,origin,normal,plus,umbra)=>({[key]:normal,[key+'Plus']:plus,[origin]:umbra});
    for (const [key, origin] of Object.entries(S.STAT_SYSTEM_ORIGINS)) {
      for (const [normal, plus, umbra, legacyState] of compositions) {
        const state = S.calculateStatSources(inputsForState(key,origin,normal,plus,umbra),key).uniquePassive ? 'normal' : (sharedFlatKeys.has(key) || ['criticalPower','resilience','equilibre','astrality'].includes(origin) || S.calculateStatSources(inputsForState(key,origin,normal,plus,umbra),key).passiveCurve) ? umbra > 0 ? 'X' : plus > 0 ? '+' : 'normal' : legacyState;
        const inputs = { strength: 20, agility: 20, intelligence: 30, [key]: normal, [`${key}Plus`]: plus, [origin]: umbra };
        const row = S.calculateStatSources(inputs, key);
        check(row.state === state, `${key}: ${normal}/${plus}/${umbra} composition is ${state}`);
        const withoutNormal = S.calculateStatSources({ ...inputs, [key]: 0 }, key);
        equal(row.enhanced, withoutNormal.enhanced, `${key}/${state}: normal does not enter the improvement ratios`);
        equal(row.normalApplied + row.enhanced, row.value, `${key}/${state}: contributions sum to the final total`);
        const model = S.buildStatSystemModel(row);
        equal(model.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0), row.value, `${key}/${state}: helper total unchanged`);
        const entries = [source('normal', key, normal), source('improved', key, plus), source('umbra', origin, umbra),
          ...['strength', 'agility', 'intelligence'].map(stat => source('normal', stat, inputs[stat]))];
        // Index 13 keeps the historical experiment. Only unchanged rule
        // families can be compared with it; live curves are audited above.
        if (!row.progression && !row.ratioPercent && !row.passiveCurve && !row.uniquePassive && !row.converted && !['criticalPower','resilience','vision','transcendence','bloodFury','movement'].includes(origin)) {
          const lab = window.statLab.calculate(entries).rows.find(entry => entry.id === key);
          check(lab.state === state, key+': unchanged standalone composition');
          equal(lab.value,row.value,key+': unchanged standalone formula');
        }
        const entity = fixture(inputs);
        recompute(entity);
        for (const total of S.getStatSystemSourceTotals(entity, key)) for (const kind of ['normal', 'improved']) {
          const detail = total.calculations[kind];
          equal(detail.parts.reduce((sum, part) => sum + (part.operator === '\u2212' ? -part.value : part.value), 0),
            total[kind === 'normal' ? 'normalValue' : 'improvedValue'], `${key}/${state}/${kind}: source calculation reconciles, including caps and rounding`);
        }
      }
    }
    for (const value of [1, 5, 20, 80, 150]) for (const spec of window.statLab.catalogs.improved) {
      const inputs = { [spec.key]: 2, [`${spec.key}Plus`]: value, strength: 20, agility: 20, intelligence: 20 };
      const entries = [source('normal', spec.key, 2), source('improved', spec.key, value),
        ...['strength', 'agility', 'intelligence'].map(key => source('normal', key, 20))];
      const system = S.calculateStatSources(inputs,spec.key);
      if(system.progression || system.ratioPercent || system.passiveCurve || system.uniquePassive || system.converted || ['criticalPower','resilience','vision','transcendence','bloodFury','movement'].includes(spec.origin)) continue;
      const expected = window.statLab.calculate(entries).rows.find(row => row.id === spec.key);
      if (!['physicalResistance', 'magicalResistance'].includes(spec.key)) equal(S.calculateStatSources(inputs, spec.key).value, expected.value, `${spec.key} agrees with approved workshop`);
      for (const mode of ['umbra', 'mixed']) {
        const umbraInputs = { [spec.origin]: value, strength: 20, agility: 20, intelligence: 20,
          ...(mode === 'mixed' ? { [spec.key]: 2, [`${spec.key}Plus`]: 6 } : {}) };
        const umbraEntries = [source('umbra', spec.origin, value), ...['strength', 'agility', 'intelligence'].map(key => source('normal', key, 20)),
          ...(mode === 'mixed' ? [source('normal', spec.key, 2), source('improved', spec.key, 6)] : [])];
        const expectedUmbra = window.statLab.calculate(umbraEntries).rows.find(row => row.id === spec.key);
        if (!generatedRules[spec.origin]?.progressive && spec.key !== 'magicalResistance') equal(S.calculateStatSources(umbraInputs, spec.key).value, expectedUmbra.value, `${spec.key}: ${mode} parity`);
      }
    }
    const pen = fixture({ magicalPen: 1, magicalPenPlus: 7, intelligence: 0 });
    recompute(pen);
    equal(R.calculateMagicalPenPercent(pen), 8, 'Plus retains its flat penetration without Intelligence or Inflexion');
    check(D.getStatImprovement(pen, 'magicalPen').state === '+', 'Normal and plus without Umbra display plus');
    pen.modifierStats.preview = { statLeveled: { magicalPenPlus: 3, intelligence: 20 } };
    U.ComputeStatPreview(pen);
    const preview = S.getStatSystemResult(pen, 'magicalPen');
    equal(R.calculateMagicalPenPercent(pen), preview.value, 'Preview and combat reader share result');
    equal(pen.stats.magicalPen, 8, 'Preview leaves committed stats unchanged');
    delete pen.modifierStats.preview;
    const split = fixture({ physicalDamage: 5, strength: 20 });
    split.modifierStats = { durable: { level: { physicalDamagePlus: 4 }, statLeveled: { physicalDamagePlus: 3 } } };
    recompute(split);
    equal(R.getSafe(split, 'physicalDamage'), 22, 'Both plus amounts and the shared attribute bonus are counted');
    split.modifierStats.durable.statLeveled.physicalDamagePlus += 2;
    recompute(split);
    equal(R.getSafe(split, 'physicalDamage'), 24, 'Third plus source adds only its input points, not another ratio');
    equal(S.getStatSystemSourceTotals(split, 'physicalDamage').reduce((sum, part) => sum + part.value, 0), 24, 'Sources sum to total');
    const ordinary = fixture({ physicalDamage: 5, strength: 100 });
    recompute(ordinary);
    equal(R.getSafe(ordinary, 'physicalDamage'), 5, 'Normal stat does not receive attribute ratio');
    check(!D.getStatImprovement(ordinary, 'physicalDamage'), 'Normal stat has no plus');
    check(R.normalizeStatKey('magicalPen+') === 'magicalPenPlus', 'Explicit plus source key');
    equal(E.buildStuffModifierDelta({ Stuffeffets: [{ type: 'stat-buff', stat: 'magicalPen', value: 6, variant: '+' }] }).magicalPenPlus, 6, 'Existing equipment pipeline accepts plus sources');
    const equipped = fixture({ chargePlus: 3, intelligence: 20 });
    const gear = [
      { equippedId: 'e-system-normal', variant: 'normal', value: 2 },
      { equippedId: 'e-system-plus-a', variant: '+', value: 5 },
      { equippedId: 'e-system-plus-b', variant: '+', value: 6 },
    ].map(({ equippedId, variant, value }) => ({ equippedId, equippedTo: equipped.id, itemId: equippedId, serial: 'i42', itemType: ['stuff'],
      Stuffeffets: [{ type: 'stat-buff', stat: 'magicalPen', variant, value }] }));
    equipped.stuff = Object.fromEntries(gear.map((item, index) => [`slot${index + 1}`, [item.equippedId]]));
    const gearRecompute = () => E.recomputeEntityStats(equipped, { equippedItems: gear, persistEquipment: false, skipReverseArchetype: true });
    gearRecompute();
    equal(R.calculateMagicalPenPercent(equipped), 16, 'Equipment plus sources add 11 flat percent and share one Intelligence improvement');
    equal(S.getStatSystemSourceTotals(equipped, 'magicalPen').reduce((sum, part) => sum + part.value, 0), 16, 'Equipment source totals reconcile');
    equipped.stuff.slot3 = [];
    gearRecompute();
    equal(R.calculateMagicalPenPercent(equipped), 10, 'Removing one plus equipment removes its flat but retains ratio access from the other');
    equipped.stuff.slot2 = [];
    gearRecompute();
    equal(R.calculateMagicalPenPercent(equipped), 2, 'Removing last plus equipment disables improvement');
    const boost = R.entityBattleBooste(pen, { stat: 'magicalPen', value: 2, mode: 'flat', source: 'system-test' });
    equal(R.calculateMagicalPenPercent(pen), 10, 'Normal combat buff adds its final value');
    boost.remove();
    equal(R.calculateMagicalPenPercent(pen), 8, 'Expired buff no longer contributes');
    const enemy = fixture({ magicalResistance: 50 });
    recompute(enemy);
    // Eight percent penetration removes four of the fifty resistance points.
    equal(R.calculateResistances(enemy, { magical: 100 }, pen).reducedMagicalDamage,
      Math.floor(100 * (1 - .99 * 46 / (46 + 70))), 'Penetration applies to resistance points before conversion; damage rounds down');
    for (const spec of window.statLab.catalogs.improved) {
      const entity = fixture({ [spec.key]: 2, [`${spec.key}Plus`]: 6, strength: 20, agility: 20, intelligence: 20 });
      recompute(entity);
      const row = S.getStatSystemResult(entity, spec.key);
      const before = JSON.stringify(entity);
      const display = D.calculateStatsDisplay(spec.helperKey, entity);
      check(before === JSON.stringify(entity), `${spec.key}: helper is read-only`);
      equal(display.statSystem.value, row.value, `${spec.key}: helper uses final total`);
      check(!/NaN|undefined|Infinity/.test(display.helpContent), `${spec.key}: valid helper text`);
      const model = display.umbraHelperCalculations.autonomousTotal;
      equal(model.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0), model.value, `${spec.key}: detail adds up`);
      if (row.uniquePassive || row.ratioPercent || row.passiveCurve || ['criticalPower', 'resilience'].includes(S.STAT_SYSTEM_ORIGINS[spec.key])) {
        equal(S.getStatSystemSourceTotals(entity, spec.key).reduce((sum, part) => sum + part.value, 0), row.value, `${spec.key}: exclusive passive sources reconcile`);
        recompute(entity);
        equal(S.getStatSystemResult(entity, spec.key).value, row.value, `${spec.key}: repeated passive recompute cannot stack gains`);
        continue;
      }
      check(model.sourceGroups, `${spec.key}: current contribution model provides source groups`);
      equal(model.sourceGroups.normal.reduce((sum, part) => sum + part.value, 0), row.normal, `${spec.key}: normal detail reconciles`);
      equal(model.sourceGroups.improved.reduce((sum, part) => sum + part.value, 0), row.plus, `${spec.key}: improved input detail reconciles`);
      equal(model.improvement.parts.reduce((sum, part) => sum + part.value, 0), row.generated, `${spec.key}: Umbra-style contributions match generated gains`);
      const detail = document.createElement('div');
      detail.innerHTML = H.buildAutonomousCalculationHelper(model, '', spec.name);
      if (spec.key === 'physicalDamage') {
        check(!detail.querySelector('.helper-calculation-detail'), 'PP: total hover contains exclusive amounts only');
        check(!detail.querySelector('[data-umbra-calculation]'), 'PP: complete formulas do not create recursive hovers');
      } else {
        check(!detail.querySelector('.helper-calculation-detail, [data-umbra-calculation]'), `${spec.key}: direct hover contains no formulas`);
        check(!/Autonome|Base :|Stuff :|[()×→]/.test(detail.textContent), `${spec.key}: no repeated source or conversion text`);
      }
      const summaryLines = model.contributions
        ? model.contributions.filter(part => part.value).map(part => [part.kind, part.value, part.state])
        : [['base', row.normal + row.plusApplied + (row.umbraFlat || 0), 'normal'], ['total', row.value, row.state]];
      for (const [kind, value, state] of summaryLines) {
        const line = detail.querySelector(`[data-autonomous-kind="${kind}"]`);
        const labelState = spec.key === 'physicalDamage' && kind === 'total' ? 'normal' : state;
        const label = spec.key === 'physicalDamage' && kind === 'total' ? 'Total' : kind === 'base' ? 'Stat de base' : (spec.key === 'shift' ? 'Déplacements max' : spec.name) + (state === 'normal' ? '' : ` ${state}`);
        check(line.querySelector(':scope > [data-stat-state]').textContent === label, `${spec.key}: base and final stat are explicitly labelled`);
        check(line.querySelector(':scope > [data-stat-state]').dataset.statState === labelState, `${spec.key}: ${kind} keeps its color state`);
        check(line.querySelector('.picto-stat').classList.contains(model.stat), `${spec.key}: ${kind} keeps its pictogram`);
        equal(Number(line.querySelector('.helper-figure').textContent.replace(/\s|%/g, '')), Math.round(value * 100) / 100, `${spec.key}: ${kind} shows its final amount`);
        if (kind === 'base' && value > 0) check(line.querySelector('.helper-figure').textContent.startsWith('+'), `${spec.key}: positive base has an explicit plus sign`);
      }
      equal(S.getStatSystemSourceTotals(entity, spec.key).reduce((sum, part) => sum + part.value, 0), row.value, `${spec.key}: sources add up`);
      const oldValue = row.value;
      recompute(entity);
      equal(S.getStatSystemResult(entity, spec.key).value, oldValue, `${spec.key}: repeated recompute cannot stack bonuses`);
    }
    const requestedTexts = {
      physicalDamage: /^Renforce les dégâts des attaques qui utilisent la puissance physique de \d+(?:[.,]\d+)?\s*\./,
      magicalDamage: /^Renforce les dégâts des attaques qui utilisent la puissance magique de \d+(?:[.,]\d+)?\s*\./,
      piercingDamage: /^Renforce les dégâts des attaques qui utilisent la puissance perçante de \d+(?:[.,]\d+)?\s*\./,
      magicalPen: /Les attaques de nature magique ignorent .* de la résistance magique de la cible\./,
      physicalPen: /Les attaques de nature physique ignorent .* de la résistance physique de la cible\./,
      physicalResistance: /Les dégâts de nature physique subis sont réduits de/,
      magicalResistance: /Les dégâts de nature magique subis sont réduits de/,
      criticalChance: /Les attaques qui le peuvent ont .* de chance de réaliser un coup critique\./,
      criticalDamage: /Les coups critiques infligent .* de dégâts supplémentaires\./,
      bloodFuryExecutionChance: /Une attaque qui le peut a .* de chance d'exécuter sa cible\./,
      bloodFuryExecutionDamage: /Les exécutions infligent .* dégâts supplémentaires\./,
      bloodFuryTargetThreshold: /Les cibles avec .* de leurs HP max ou moins sont exécutables par les attaques qui le peuvent\./,
      bloodThirsty: /Les attaques qui le peuvent soignent l'attaquant de .* des dégâts infligés\./,
      cognitiveExplosion: /Ajoute .* dégâts à l’attaque sans modifier sa nature\./,
      cognitiveGenerator: /Génère .* essences d'intelligence hypercognitive\./,
      dodge: /Chance d’esquive : .*Score d’esquive total :/,
      hpBattleRegen: /Au début de chaque tour, l'entité se soigne de .* de ses HP max\./,
      extraLife: /L'entité gagne .* vies transcendées supplémentaires\./,
      dayHpRegen: /L'entité récupère .* HP au début de chaque nouvelle journée\./,
      attackCooldownReduc: /Le cooldown des attaques de l'entité est réduit de/,
      attackPreparationReduc: /La durée de préparation des attaques de l'entité est réduite de/,
      attackExecutionReduc: /La durée d'exécution des attaques de l'entité est réduite de/,
      attackRecoveryReduc: /La durée de récupération des attaques de l'entité est réduite de/,
      attackProjectileSpeed: /Les projectiles de l'entité sont .* plus rapides\./,
    };
    const visibleContent = html => {
      const node = document.createElement('div');
      node.innerHTML = html;
      node.querySelectorAll('.helper-calculation-detail').forEach(detail => detail.remove());
      return node;
    };
    for (const [key, pattern] of Object.entries(requestedTexts)) for (const mode of ['normal', '+', 'X']) {
      const spec = window.statLab.catalogs.improved.find(stat => stat.key === key);
      const entity = fixture({ strength: 20, agility: 20, intelligence: 20,
        ...(mode !== '+' ? { [key]: 2 } : {}), ...(mode !== 'normal' ? { [`${key}Plus`]: 3 } : {}),
        ...(mode === 'X' && sharedFlatKeys.has(key) ? { [S.STAT_SYSTEM_ORIGINS[key]]: 4 } : {}) });
      recompute(entity);
      for (const preview of [false, true]) {
        if (preview) {
          entity.modifierStats.preview = { statLeveled: { intelligence: 4, [mode === 'normal' ? key : `${key}Plus`]: 2 } };
          U.ComputeStatPreview(entity);
        }
        const saved = JSON.stringify(entity);
        const display = D.calculateStatsDisplay(spec.helperKey, entity);
        const body = visibleContent(display.helpContent);
        const text = body.textContent.replace(/\s+/g, ' ').trim();
        check(pattern.test(text), `${key} ${mode}${preview ? ' preview' : ''}: requested sentence`);
        if (key === 'dodge') {
          const figures = [...body.querySelectorAll('.helper-figure[data-helper-stat="dodge"]')];
          equal(Number(figures[0].textContent.replace(/\s|%/g, '')), display.calculateTotalDodgeBonus, 'Dodge displays the precise converted probability');
          equal(Number(figures[1].textContent.trim()), display.statSystem.value, 'Dodge also displays its score');
        } else {
          check(body.querySelectorAll('.helper-calculation-result').length === 1, `${key}: one result in the body`);
          equal(Number(body.querySelector('.helper-calculation-result').textContent.replace(/\s|%/g, '')), Math.round(display.statSystem.value * 100) / 100, `${key}: sentence displays the total to two decimals`);
        }
        const sourceDetails = document.createElement('div');
        const totals = S.getStatSystemSourceTotals(entity, key);
        sourceDetails.innerHTML = H.buildStatisticOrigins({ compact: true, totals, statName: spec.name });
        const sourceValues = [];
        for (const template of sourceDetails.querySelectorAll('template[data-helper-source-detail]')) {
          check(!!template.dataset.helperSourceTitle, `${key}: source header identifies its origin`);
          check(!/Autonome|Base :|Stuff :|Umbra :/.test(template.content.textContent), `${key}: source has no redundant category`);
          const figures = template.content.querySelectorAll('.stat-source-details > .helper-calculation > .helper-calculation-result > .helper-figure');
          const names = template.content.querySelectorAll('.stat-source-details > [data-stat-state]');
          check(names.length === figures.length, `${key}: one named line per source contribution`);
          for (const name of names) check(name.textContent === spec.name + (name.dataset.statState === 'normal' ? '' : ` ${name.dataset.statState}`), `${key}: source uses the stat name and state`);
          for (const figure of figures) sourceValues.push(Number(figure.textContent.replace(/\s|%/g, '')));
        }
        equal(sourceValues.reduce((sum, value) => sum + value, 0), Math.round(display.statSystem.value * 100) / 100, `${key} ${mode}${preview ? ' preview' : ''}: displayed sources add up without duplicate totals`);
        check(saved === JSON.stringify(entity), `${key}: text refresh leaves the entity unchanged`);
        if (key === 'bloodFuryExecutionDamage') check(!text.includes('%'), 'Execution damage remains a flat amount');
      }
    }
    const effectsEntity = fixture({ strength: 20, agility: 20, intelligence: 20, ambidextry: 20, resilience: 20,
      indestructibility: 20, occultism: 20, equilibre: 20, mysticism: 20, speed: 1000 });
    recompute(effectsEntity);
    for (const [stat, key, pattern] of [
      ['ambidextry', 'ambidextryTotalChance', /Les attaques qui le peuvent ont .* de chance de réaliser un deuxième coup/],
      ['ambidextry', 'ambidextryDamageBonus', /Les dégâts du deuxième coup représentent .* des dégâts du premier coup/],
      ['resilience', 'resilienceCritTotalBonus', /Le supplément de dégâts des coups critiques subis est réduit de/],
      ['resilience', 'resilienceAlteTotalBonus', /Les altérations d'état subies par l'entité sont .* moins efficaces/],
      ['resilience', 'resilienceTotalCancelBonus', /Les altérations d'état subies par l'entité ont .* de chance d'échouer totalement/],
      ['indestructibility', 'indestructibilityBonus', /L'entité a .* de chance de nullifier totalement une source de dégâts/],
      ['indestructibility', 'indestructibilityReductionTotal', /L'entité réduit tous les dégâts subis de/],
      ['occultism', 'occultismInvisibilityChance', /L'entité a .* de chance de devenir invisible/],
      ['occultism', 'occultismTargetableChance', /L'entité n'a que .* de chance d'être prise pour cible quand elle est invisible/],
      ['occultism', 'occultismCritChanceBonus', /L'attaque qui se prépare pendant l'invisibilité aura/],
      ['equilibre', 'equilibreAggroReduction', /L'entité génère .* d'aggro en moins en attaquant/],
      ['equilibre', 'equilibreInvisibleDetection', /L’entité réduit l’évitement du ciblage des ennemis invisibles de .* points de pourcentage/],
      ['equilibre', 'equilibreBalancedAttackChance', /L'entité a .* de chance que son attaque soit équilibrée/],
      ['mysticism', 'mysticismProcChance', /L'entité a .* de chance d'entrer en transe mystique/],
      ['mysticism', 'mysticismTranceDuration', /Les transes mystiques durent .* s\s*\./],
      ['mysticism', 'mysticismPreparationAcceleration', /Durant une transe mystique, la vitesse de préparation de l'attaque est .* plus rapide/],
      ['mysticism', 'mysticismDamageBonus', /Une attaque lancée pendant la transe mystique inflige/],
    ]) {
      const display = H.selectStatisticHelper(D.calculateStatsDisplay(stat, effectsEntity), key);
      const body = visibleContent(display.helpContent);
      check(pattern.test(body.textContent.replace(/\s+/g, ' ')), `${key}: dedicated requested sentence`);
      check(body.querySelectorAll('.helper-calculation-result').length === 1, `${key}: only its own result`);
      equal(Number(body.querySelector('.helper-calculation-result').textContent.replace(/\s|%|s|\+/g, '')), Math.round(display.umbraHelperCalculations[key].value * 100) / 100, `${key}: current calculated value displayed to two decimals`);
    }
    check(/L'entité met 1 s\s+à charger son tour\./.test(visibleContent(D.calculateStatsDisplay('speed', effectsEntity).helpContent).textContent), 'Speed sentence uses seconds');
    const movementCases = [
      { label: 'normal', values: { shift: 10 } },
      { label: 'plus', values: { shiftPlus: 10 } },
      { label: 'mixed', values: { shift: 5, shiftPlus: 7 } },
      { label: 'Umbra with both source types', values: { shift: 5, shiftPlus: 7, movement: 20 } },
      { label: 'explicit starting reserve', values: { shift: { current: 3, max: 8 }, shiftPlus: 7, movement: 20 } },
      { label: 'explicit empty starting reserve', values: { shift: { current: 0, max: 8 }, movement: 20 } },
      { label: 'default reserve', values: {} },
    ];
    for (const { label, values } of movementCases) for (const agility of [0, 30, 150]) {
      const entity = fixture({ ...values, agility });
      recompute(entity);
      const initial = structuredClone(entity.stats.shift);
      const checkDisplay = expected => {
        const before = JSON.stringify(entity);
        const display = D.calculateStatsDisplay('shift', entity);
        const model = display.umbraHelperCalculations.shiftStartingCharges;
        const daily = expected.baseDefault ? 0 : _D.calculateMovementStartingCharges({ stats: {
          movement: expected.max, agility: R.getSafe(entity, 'agility', 0),
        } });
        equal(display.shiftStartingCharges, daily, `${label}: daily reserve includes every capacity source`);
        equal(model.value, daily, `${label}: daily calculation model agrees`);
        equal(display.umbraHelperCalculations.autonomousTotal.value, expected.max, `${label}: capacity includes every source`);
        const body = visibleContent(display.helpContent);
        const text = body.textContent.replace(/\s+/g, ' ');
        check(text.includes(`Déplacements disponibles : ${R.getSafe(entity, 'shift').current}.`)
          && new RegExp(`Déplacements max : ${expected.max}\\s*\\.`).test(text), `${label}: current and maximum explicitly distinguished`);
        check(text.includes(`sa réserve revient à ${daily} déplacements`), `${label}: daily refill is distinguished from current charges`);
        check(text.includes('Poids actuel :') && text.includes("Coût d'un déplacement :"), 'Movement keeps weight and charge cost');
        equal(D.getStatisticSourceTotals(entity, 'shift', display).reduce((sum, part) => sum + part.value, 0), expected.max, `${label}: capacity sources reconcile`);
        check(JSON.stringify(entity) === before, 'Starting reserve helper is read-only');
      };
      checkDisplay(initial);
      entity.stats.shift.current = 0;
      checkDisplay(initial);
      entity.modifierStats.preview = { statLeveled: { shiftPlus: 3, movement: 2, agility: 4 } };
      U.ComputeStatPreview(entity);
      const inputs = E.getStatSystemInputs(entity);
      const expected = fixture({ ...inputs, ...(typeof values.shift === 'object'
        ? { shift: { current: values.shift.current, max: inputs.shift?.max ?? inputs.shift } } : {}) });
      recompute(expected);
      checkDisplay(expected.stats.shift);
      equal(entity.stats.shift.current, 0, 'Preview helper never restores spent movement');
    }
    const inactiveMovement = fixture({ shift: 5, shiftPlus: 7, movement: 20, agility: 30 });
    inactiveMovement.Archetype = { current: { key: 'egare' } };
    recompute(inactiveMovement);
    const inactiveMovementDisplay = D.calculateStatsDisplay('shift', inactiveMovement);
    equal(inactiveMovementDisplay.shiftMax, 12, 'Inactive Movement contributes no capacity');
    equal(inactiveMovementDisplay.shiftStartingCharges, inactiveMovement.stats.shift.current, 'Inactive Umbra does not hide the autonomous starting reserve');
    const equippedMovement = fixture({ movement: 20, agility: 30, charge: 3 });
    const movementGear = [{ stat: 'shift', value: 5 }, { stat: 'shiftPlus', value: 7 }].map((effect, index) => ({
      equippedId: `e-movement-${index}`, equippedTo: equippedMovement.id, itemId: `i-movement-${index}`,
      serial: 'i42', itemType: ['stuff'], Stuffeffets: [{ type: 'stat-buff', ...effect }],
    }));
    equippedMovement.stuff = Object.fromEntries(movementGear.map((item, index) => [`slot${index + 1}`, [item.equippedId]]));
    E.recomputeEntityStats(equippedMovement, { equippedItems: movementGear, persistEquipment: false, skipReverseArchetype: true });
    const equippedMovementDisplay = D.calculateStatsDisplay('shift', equippedMovement);
    equal(equippedMovementDisplay.shiftMax, 32, 'Normal and plus equipment both add movement capacity');
    equal(equippedMovementDisplay.shiftStartingCharges, equippedMovement.stats.shift.current, 'Equipment is counted in the initial reserve');
    const movementSources = D.getStatisticSourceTotals(equippedMovement, 'shift', equippedMovementDisplay);
    equal(movementSources.find(source => source.category === 'equipment').value, 12, 'Both equipment source types are counted once');
    equal(movementSources.reduce((sum, source) => sum + source.value, 0), 32, 'Movement equipment source footer matches capacity');
    const removedMovement = fixture({ shiftPlus: 10, agility: 30 });
    recompute(removedMovement);
    removedMovement.modifierStats.preview = { statLeveled: { shiftPlus: -10 } };
    U.ComputeStatPreview(removedMovement);
    const emptyMovementDisplay = D.calculateStatsDisplay('shift', removedMovement);
    equal(emptyMovementDisplay.shiftStartingCharges, 0, 'Removing the last source previews an empty starting reserve');
    equal(emptyMovementDisplay.umbraHelperCalculations.autonomousTotal.value, 1, 'Empty preview keeps the engine default capacity');
    equal(Ess.calculateCognitiveEssenceCount(fixture({ cognitiveGenerator: 8, cognitiveGeneratorPlus: 8 })), 10, 'Essence cap remains ten');
    const restricted = fixture({ inflexion: 30, intelligence: 20, magicalPen: 2 });
    restricted.Archetype = { current: { key: 'egare' } };
    recompute(restricted);
    equal(R.calculateMagicalPenPercent(restricted), 2, 'Inactive Umbra grants no ratio');
    restricted.baseStats.magicalPenPlus = 6;
    recompute(restricted);
    equal(R.calculateMagicalPenPercent(restricted), 11, 'Independent plus keeps its flat and ratios without an active Umbra');
    const umbraExample = fixture({ magicalPen: 2, magicalPenPlus: 3, inflexion: 1, intelligence: 44 });
    recompute(umbraExample);
    const compareUmbraDetail = (entity, label) => {
      const autonomous = D.calculateStatsDisplay('magicalPen', entity).umbraHelperCalculations.autonomousTotal;
      const umbra = D.calculateStatsDisplay('inflexion', entity).umbraHelperCalculations.generatedUmbraSource;
      const ratios = umbra.improvement || umbra.parts.find(part => part.calculation).calculation;
      equal(autonomous.improvement.value, ratios.value, `${label}: same ratio points as Inflexion, before conversion`);
      equal(umbra.value, autonomous.system.enhanced, `${label}: Umbra helper retains the full capacity including autonomous plus`);
      check(JSON.stringify(autonomous.improvement.parts.map(({ stat, value, unit }) => ({ stat, value, unit })))
        === JSON.stringify(ratios.parts.map(({ stat, value, unit }) => ({ stat, value, unit }))), `${label}: same Umbra contributions and units`);
      const detail = document.createElement('div');
      detail.innerHTML = H.buildAutonomousCalculationHelper(autonomous, '', 'Pénétration magique');
      check(!detail.querySelector('[data-autonomous-improvement], .helper-calculation-detail'), `${label}: Umbra ratios stay out of the direct hover`);
      equal([...detail.querySelectorAll('[data-contribution-value]')].reduce((sum, node) => sum + Number(node.dataset.contributionValue), 0),
        autonomous.system.value, `${label}: exclusive contributions retain the final stat amount`);
      return autonomous.improvement.value;
    };
    equal(compareUmbraDetail(umbraExample, 'Equipped plus with Inflexion'), 23, 'Underlying Umbra calculation is unchanged');
    umbraExample.modifierStats.preview = { statLeveled: { intelligence: 2, inflexion: 1 } };
    U.ComputeStatPreview(umbraExample);
    equal(compareUmbraDetail(umbraExample, 'Inflexion preview'), 25, 'Preview still calculates all Umbra contributions');
    const previewSource = fixture({ physicalDamage: 5, strength: 20 });
    recompute(previewSource);
    previewSource.modifierStats.preview = { statLeveled: { physicalDamage: 4, physicalDamagePlus: 3 } };
    U.ComputeStatPreview(previewSource);
    equal(R.getSafe(previewSource, 'physicalDamage'), 22, 'Preview preserves both flat inputs and one shared ratio');
    Object.assign(previewSource.modifierStats.durable.statLeveled, previewSource.modifierStats.preview.statLeveled);
    delete previewSource.modifierStats.preview;
    recompute(previewSource);
    equal(R.getSafe(previewSource, 'physicalDamage'), 22, 'Confirmed preview matches its result');
    const removed = fixture({ physicalDamagePlus: 5, strength: 20 });
    recompute(removed);
    removed.modifierStats.preview = { statLeveled: { physicalDamagePlus: -5 } };
    U.ComputeStatPreview(removed);
    equal(R.getSafe(removed, 'physicalDamage'), 0, 'Removing last plus source deactivates its ratio in preview');
    const pools = fixture({ HP: 10, HPPlus: 7, extraLife: 2, extraLifePlus: 3, armor: 4, armorPlus: 6 });
    recompute(pools);
    equal(pools.stats.extraLife.current, 5, 'New life pool gets its full capacity');
    pools.stats.extraLife.current = 0;
    for (const [key, slot] of Object.entries(pools.extraLifeRegen)) if (/^\d{3}$/.test(key)) slot.currentRegen = 0;
    pools.stats.HP.current = 3;
    recompute(pools);
    equal(pools.stats.extraLife.current, 0, 'Recompute does not refill spent lives');
    equal(pools.stats.HP.current, 3, 'Recompute does not heal');
    const spell = { essences: ['red'], attackRange: ['melee'], combatFunction: 'Attaquant', attackTarget: ['enemy'] };
    const affinity = fixture({ inflexion: 15, intelligence: 20, magicalPen: 2, magicalPenPlus: 6 });
    affinity.Archetype = { current: { key: 'mage' } };
    recompute(affinity);
    const view = _D.createAttackStatView(affinity, spell);
    equal(R.calculateMagicalPenPercent(view), 11, 'Incompatible attack loses Umbra but retains independent normal/plus');
    const umbrella = fixture({ criticalPower: 15, bloodFury: 15, strength: 20, agility: 20, physicalDamage: 10,
      criticalChance: 2, criticalChancePlus: 4, criticalDamage: 3, criticalDamagePlus: 6,
      bloodFuryExecutionChance: 2, bloodFuryExecutionChancePlus: 4, bloodFuryExecutionDamage: 3, bloodFuryExecutionDamagePlus: 6 });
    umbrella.Archetype = { current: { key: 'mage' } };
    recompute(umbrella);
    for (const key of ['criticalPower', 'bloodFury']) {
      const display = D.calculateStatsDisplay(key, umbrella);
      for (const model of Object.values(display.umbraHelperCalculations)) {
        const sum = model.parts.reduce((total, part) => total + (part.operator === '−' ? -part.value : part.value), 0);
        check(Math.abs(sum - model.value) < 1.01 || model.maximumReached, `${key}: no duplicated source in Umbra helper (${sum}, ${model.value})`);
      }
    }
    const Store = await import("/js/storage/gameStorage.js");
    const Manager = await import('/js/items/itemManager.js');
    const { ItemDetails } = await import('/js/data/itemList.js');
    window.levelRunning = 'worldmap';
    const shop = document.createElement('section');
    shop.className = 'shop-interface';
    const mosaic = document.createElement('div');
    const buy = document.createElement('button');
    buy.className = 'seller-button';
    shop.append(mosaic, buy);
    document.body.append(shop);
    const listed = () => [...mosaic.querySelectorAll('.item-wrapper:not(.entity)')]
      .map(node => Manager.getIngameItemById(node.dataset.itemId).serial);
    Store.setAdminMode(false);
    Manager.displayShopItems(mosaic, shop);
    equal(listed().length, 6, 'Normal merchant retains six-item selection');
    Store.setAdminMode(true);
    check(ItemDetails.every(item => listed().includes(item.serial)), 'Admin merchant offers every catalogue item');
    equal(new Set(listed()).size, ItemDetails.length, 'Admin catalogue has no duplicates');
    Store.setAdminMode(false);
    equal(listed().length, 6, 'Leaving admin restores normal merchant selection');
    Store.setAdminMode(true);
    const info = Store.loadPlayerInfo();
    Store.savePlayerInfo({ ...info, battleSlotCount: 24 });
    Manager.displayShopItems(mosaic, shop);
    check(ItemDetails.every(item => listed().includes(item.serial)), 'Admin catalogue remains complete at full satchel capacity');
    const xpBefore = Store.getAvailablePlayerExperience();
    const owned = () => Store.loadFromLocalStorage('PlayerSave', {}).Playerinventory || [];
    const initialOwnedCount = owned().length;
    for (const [index, serial] of ['i47', 'i48', 'i49'].entries()) {
      const node = [...mosaic.children].find(node => Manager.getIngameItemById(node.dataset.itemId)?.serial === serial);
      check(Boolean(node), `${serial}: test equipment is available`);
      if (index === 0) { node.click(); buy.click(); }
      else node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      equal(owned().length, initialOwnedCount + index + 1, `${serial}: purchase grants exactly one item after repeated shop refreshes`);
    }
    equal(Store.getAvailablePlayerExperience(), xpBefore, 'Admin test purchases remain free');
    const testGear = owned().filter(item => ['i47', 'i48', 'i49'].includes(item.serial));
    const testEntity = fixture({ intelligence: 30, charge: 3 });
    const equippedTests = testGear.map(item => ({ ...item, equippedId: `equipped-${item.itemId}`, equippedTo: testEntity.id }));
    const equip = serials => {
      testEntity.stuff = Object.fromEntries(equippedTests.filter(item => serials.includes(item.serial))
        .map((item, index) => [`slot${index + 1}`, [item.equippedId]]));
      E.recomputeEntityStats(testEntity, { equippedItems: equippedTests, persistEquipment: false, skipReverseArchetype: true });
    };
    equip(['i47']);
    equal(R.calculateMagicalPenPercent(testEntity), 2, 'Purchased normal equipment stays at 2 percent with 30 Intelligence');
    equip(['i48']);
    equal(R.calculateMagicalPenPercent(testEntity), 9, 'Purchased plus equipment keeps its flat 3 and one Intelligence improvement');
    check(D.getStatImprovement(testEntity, 'magicalPen').state === '+', 'Purchased plus equipment displays plus state');
    equip(['i49']);
    equal(R.calculateMagicalPenPercent(testEntity), 15, 'Purchased mixed equipment combines normal 4, plus 5 and Intelligence 6');
    check(D.getStatImprovement(testEntity, 'magicalPen').state === '+', 'Mixed equipment without Umbra displays plus state');
    equip(['i47', 'i48', 'i49']);
    equal(R.calculateMagicalPenPercent(testEntity), 20, 'Three purchased items pool 6 normal and 8 plus with one Intelligence bonus');
    equal(S.getStatSystemSourceTotals(testEntity, 'magicalPen').reduce((sum, part) => sum + part.value, 0), 20, 'Purchased item source totals reconcile');
    const mixedModel = D.calculateStatsDisplay('magicalPen', testEntity).umbraHelperCalculations.autonomousTotal;
    equal(mixedModel.sourceGroups.normal.find(part => part.category === 'equipment').value, 6, 'Normal equipment sources are grouped separately');
    equal(mixedModel.sourceGroups.improved.find(part => part.category === 'equipment').value, 8, 'Plus equipment inputs are grouped before ratios');
    testEntity.modifierStats.preview = { statLeveled: { weaponOrfevre: 100 } };
    U.ComputeStatPreview(testEntity);
    const orfevreModel = D.calculateStatsDisplay('magicalPen', testEntity).umbraHelperCalculations.autonomousTotal;
    equal(orfevreModel.sourceGroups.normal.find(part => part.category === 'equipment').value, 12, 'Orfevre preview belongs to normal equipment sources');
    equal(orfevreModel.sourceGroups.improved.find(part => part.category === 'equipment').value, 16, 'Orfevre preview belongs to plus equipment sources');
    const orfevreSources = S.getStatSystemSourceTotals(testEntity, 'magicalPen');
    check(orfevreSources.every(part => ['fixed', 'plus'].includes(part.category)), 'Orfevre preview stays in its fixed and Stat+ contributions');
    equal(orfevreSources.reduce((sum, part) => sum + part.value, 0), 34, 'Orfevre preview sources match the displayed total');
    delete testEntity.modifierStats.preview;
    const effect = R.entityBattleBooste(testEntity, { stat: 'magicalPen', value: 25, mode: 'percent', source: 'helper-audit' });
    const combatModel = D.calculateStatsDisplay('magicalPen', testEntity).umbraHelperCalculations.autonomousTotal;
    equal(combatModel.sourceGroups.normal.find(part => part.category === 'combat').value, 1.5, 'Combat multiplier remains an effect source');
    equal(S.getStatSystemSourceTotals(testEntity, 'magicalPen').reduce((sum, part) => sum + part.value, 0), 21.5, 'Combat sources match the total');
    effect.remove();
    testEntity.modifierStats.preview = { statLeveled: { inflexion: 20 } };
    U.ComputeStatPreview(testEntity);
    equal(R.calculateMagicalPenPercent(testEntity), 34, 'Purchased items combine with the Inflexion ratio in preview');
    equal(testEntity.stats.magicalPen, 20, 'Purchased-item preview does not change committed total');
    delete testEntity.modifierStats.preview;
    equip(['i47']);
    equal(R.calculateMagicalPenPercent(testEntity), 2, 'Removing improved test gear removes its ratios');
    shop.remove();
    Store.setAdminMode(false);
    window.__systemAudit = { pen, split };
    return { checks: checks.length, last: checks.slice(-8) };
  });
  assert.deepEqual(errors, []);
  const uiEntity = await page.evaluate(() => window.__systemAudit.pen);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async entity => {
    const UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    Object.assign(entity.baseStats, { physicalDamage: 5, inflexion: 1, bloodFuryExecutionChancePlus: 4, bloodFury: 15, transcendenceTotal: 12 });
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const root = document.createElement('main');
    root.id = 'system-test';
    root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:1';
    document.body.append(root);
    UI.createCodexEntityScan(entity, root, `codex-entity_${entity.id}`);
    root.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    root.querySelector('.section-content.stats [data-mode="stat"]').click();
  }, uiEntity);
  const row = page.locator('#system-test .stat-container[data-stat="magicalPen"]').first();
  const colors = await page.evaluate(() => {
    const reference = document.createElement('span');
    reference.style.color = 'hsl(from rgb(255, 0, 6) h s calc(l + 20))';
    document.body.append(reference);
    const plusColor = getComputedStyle(reference).color;
    reference.className = 'magicalPen';
    reference.style.backgroundImage = 'linear-gradient(to right, var(--color-intelligence), var(--color-inflexion))';
    const mixedBackground = getComputedStyle(reference).backgroundImage;
    reference.className = 'bloodFury';
    reference.style.backgroundImage = 'linear-gradient(to right, hsl(from var(--stat-color) h s calc(l + 20)), var(--stat-color))';
    const executionMixedBackground = getComputedStyle(reference).backgroundImage;
    reference.remove();
    const read = (key, selector) => {
      const node = document.querySelector(`#system-test .stat-container[data-stat="${key}"] ${selector}`);
      const style = getComputedStyle(node);
      return { state: node.dataset.statState, color: style.color, background: style.backgroundImage, fill: style.webkitTextFillColor, filter: style.filter };
    };
    return { plusColor, mixedBackground, executionMixedBackground, normal: read('physicalDamage', '.stat-name [data-stat-state]'), normalValue: read('physicalDamage', '.entite-stat'),
      plus: read('bloodFuryExecutionChance', '.stat-improved-label'), plusValue: read('bloodFuryExecutionChance', '.entite-stat'),
      execution: ['bloodFuryExecutionChance', 'bloodFuryExecutionDamage', 'bloodFuryTargetThreshold'].map(key => ({
        key, name: read(key, '.stat-improved-label'), value: read(key, '.entite-stat'), icon: read(key, '.picto-stat'),
      })),
      mixed: read('magicalPen', '.stat-improved-label'), mixedValue: read('magicalPen', '.entite-stat'),
      icon: read('bloodFuryExecutionChance', '.picto-stat') };
  });
  assert.equal(colors.normal.color, 'rgb(220, 225, 230)');
  assert.equal(colors.normalValue.color, colors.normal.color);
  assert.equal(colors.plus.state, '◆', 'Plus and Umbra have their own composition state');
  assert.equal(colors.plus.background, colors.executionMixedBackground);
  assert.equal(colors.plusValue.background, colors.executionMixedBackground);
  assert.match(colors.mixed.background, /linear-gradient/);
  assert.equal(colors.mixed.background, colors.mixedBackground, 'X name fades from its attribute color to its Umbra color');
  assert.doesNotMatch(colors.mixed.background, /rgb\(220, 225, 230\)/);
  assert.equal(colors.mixed.fill, 'rgba(0, 0, 0, 0)');
  assert.match(colors.mixedValue.background, /linear-gradient/);
  assert.equal(colors.mixedValue.background, colors.mixedBackground, 'Mixed value uses the same gradient as its name');
  assert.equal(colors.icon.color, 'rgb(255, 0, 6)', 'The execution pictogram keeps its original color');
  for (const stat of colors.execution) {
    if (stat.key === 'bloodFuryExecutionChance') {
      assert.equal(stat.name.background, colors.executionMixedBackground, `${stat.key}: mixed name retains Fureur sanguinaire hues`);
      assert.equal(stat.value.background, stat.name.background, `${stat.key}: value matches its label`);
    } else {
      assert.equal(stat.name.color, colors.plusColor, `${stat.key}: Umbra-only name uses the Fureur sanguinaire hue`);
      assert.equal(stat.value.color, colors.plusColor, `${stat.key}: value matches its label`);
    }
    assert.equal(stat.icon.color, 'rgb(255, 0, 6)', `${stat.key}: base hue matches Fureur sanguinaire`);
  }
  assert.match(await row.locator('.stat-name').innerText(), /X/);
  assert.match(await row.locator('.entite-stat').innerText(), /9\s*%/);
  await row.click();
  const helper = page.locator('[data-umbra-pinned="true"]');
  await helper.waitFor({ state: 'visible' });
  assert.match(await helper.innerText(), /9\s*%/);
  assert.match(await helper.locator('.stat-hover-header').innerText(), /^Statistique : .* X$/);
  assert.match(await helper.locator('.stat-hover-body').innerText(), /Les attaques de nature magique ignorent 9 % de la résistance magique de la cible\./);
  await helper.locator('.helper-calculation-result').first().hover();
  const detail = page.locator('[data-umbra-detail]');
  await detail.waitFor({ state: 'visible' });
  const penetrationName = (await row.locator('.stat-name').innerText()).trim().replace(/\s*:\s*$/, '').replace(/\s+[+X◇◆Ω]$/, '');
  const textOf = locator => locator.innerText().then(text => text.replace(/\s+/g, ' ').trim());
  assert.equal(await textOf(detail.locator('[data-autonomous-kind=umbra]')), `${penetrationName} X : 1 %`);
  assert.equal(await textOf(detail.locator('[data-autonomous-kind=plus]')), `${penetrationName} + : 7 %`);
  assert.equal(await textOf(detail.locator('[data-autonomous-kind=normal]')), `${penetrationName} : 1 %`);
  assert.equal(await detail.locator('.helper-calculation-result').count(), 3, 'The three exclusive contributions reconcile to 9 %');
  assert.equal(await detail.locator('.helper-calculation-detail').count(), 0, 'Direct hover has no calculations');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
    .every(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'stats-x-helper.png') });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.evaluate(async () => (await import("/js/ui/statistics/helpers.js")).closeOpenHelpers());
    await page.setViewportSize(viewport);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await helper.waitFor({ state: 'visible' });
    const box = await helper.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'Helper within viewport');
    await page.keyboard.press('Escape');
  }
  const resurrectionRow = page.locator('#system-test .stat-container[data-stat="transcendenceTotal"]').first();
  await resurrectionRow.click();
  await helper.waitFor({ state: 'visible' });
  assert.match((await helper.innerText()).replace(/\s+/g, ' '), /L'entité a 12 % de chance de ne pas consommer de ressource de résurrection lors d'une utilisation\./);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
  await page.screenshot({ path: resolve(output, 'stat-colors-resurrection.png') });
  await page.keyboard.press('Escape');
  await page.locator('#system-test .section-content.stats [data-mode="umbra"]').click();
  const umbraColors = await page.locator('#system-test .stat-container[data-stat="bloodFury"]').first().evaluate(node => {
    const name = node.querySelector('.stat-name');
    const value = node.querySelector('.entite-stat');
    return { state: name.dataset.statState, color: getComputedStyle(name).color, filter: getComputedStyle(name).filter, value: getComputedStyle(value).color };
  });
  assert.equal(umbraColors.state, 'umbra');
  assert.equal(umbraColors.color, 'rgb(255, 0, 6)');
  assert.equal(umbraColors.value, umbraColors.color);
  assert.match(umbraColors.filter, /drop-shadow/);
  await page.screenshot({ path: resolve(output, 'umbra-colors.png') });
  await page.locator('#system-test .section-content.stats [data-mode="stat"]').click();
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const U = await import("/js/ui/statistics/components.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    const before = structuredClone(entity.stats);
    entity.baseStats = { HP: 100, magicalPen: 2, intelligence: 30, charge: 3 };
    entity.modifierStats = {};
    const gear = { ...structuredClone(ItemDetails.find(item => item.serial === 'i48')),
      itemId: 'i-helper-plus', equippedId: 'e-helper-plus', equippedTo: entity.id };
    const G = await import("/js/storage/gameStorage.js");
    G.saveToLocalStorage('equippedItems', [gear]);
    entity.stuff = { slot1: [gear.equippedId] };
    E.recomputeEntityStats(entity, { equippedItems: [gear], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    U.updateStatsInDOM(entity.stats, { ...before, id: entity.id }, entity);
    window.__helperEquipmentAudit = { entity, gear };
  });
  assert.match(await row.locator('.entite-stat').innerText(), /11\s*%/);
  await row.click();
  await helper.waitFor({ state: 'visible' });
  assert.match(await helper.innerText(), /11\s*%/, 'Helper follows equipped entity, not the original Codex snapshot');
  assert.deepEqual(await helper.locator('[data-helper-source]').evaluateAll(nodes => nodes.map(node => node.dataset.helperSource)), ['plus', 'fixed']);
  await helper.locator('.helper-calculation-result').first().hover();
  await detail.waitFor({ state: 'visible' });
  assert.equal(await textOf(detail.locator('[data-autonomous-kind=plus]')), `${penetrationName} + : 9 %`);
  assert.equal(await textOf(detail.locator('[data-autonomous-kind=normal]')), `${penetrationName} : 2 %`);
  assert.equal(await detail.locator('.helper-calculation-detail, [data-autonomous-improvement]').count(), 0, 'Ratios are omitted from the summary');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
    .every(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'equipped-x-helper.png') });
  await helper.locator('[data-helper-source=fixed]').hover();
  assert.equal(await textOf(detail.locator('.stat-hover-header')), 'Stat fixe');
  assert.deepEqual(await detail.locator('.stat-source-details > .helper-calculation > .helper-calculation-result > .helper-figure').allTextContents(), ['+ 2 %'], 'Fixed stat source contains only its own value');
  await helper.locator('[data-helper-source=plus]').hover();
  assert.equal(await textOf(detail.locator('.stat-hover-header')), 'Statistique +');
  assert.deepEqual(await detail.locator('.stat-source-details > .helper-calculation > .helper-calculation-result > .helper-figure').allTextContents(), ['+ 9 %'], 'Stat+ includes its fixed value and the attribute ratio once');
  assert.match(await detail.locator('.helper-calculation-detail').first().innerText(), /30.*×.*0\.5.*→.*6/, 'Pinned source displays Intelligence calculation next to its result');
  assert.equal(await detail.locator('.helper-calculation-detail .intelligence:not(.picto-stat)').first().evaluate(node => getComputedStyle(node).color),
    await page.locator('#system-test .picto-stat.intelligence').first().evaluate(node => getComputedStyle(node).color),
    'Source calculation keeps the attribute colour');
  assert.match(await textOf(detail.locator('[data-provenance=equipment]')), /Stuff.*\+ 3 %/, 'Equipment input is identified without adding its ratios twice');
  assert.ok((await textOf(detail.locator('[data-provenance=equipment]'))).includes(await page.evaluate(() => window.__helperEquipmentAudit.gear.displayName)), 'Equipment provenance names the actual item');
  await page.mouse.move(0, 0);
  await helper.locator('[data-helper-source=plus]').focus();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-umbra-detail]');
    return node && Number(getComputedStyle(node).opacity) >= .99;
  });
  assert.ok(await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const pinned = document.querySelector('[data-umbra-pinned]');
    const detail = document.querySelector('[data-umbra-detail]');
    for (let index = 0; index < 3; index++) UI.refreshStatHelper(pinned, pinned._helperHost, window.__helperEquipmentAudit.entity);
    return detail === document.querySelector('[data-umbra-detail]') && Number(getComputedStyle(detail).opacity) >= .99;
  }), 'Unchanged source refreshes preserve the visible subhelper and do not restart its fade');
  await page.screenshot({ path: resolve(output, 'source-inline-calculation.png'), animations: 'disabled' });
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const U = await import("/js/ui/statistics/components.js");
    const { entity } = window.__helperEquipmentAudit;
    const updated = structuredClone(entity);
    updated.stuff = {};
    E.recomputeEntityStats(updated, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([updated]));
    U.updateStatsInDOM(updated.stats, { ...entity.stats, id: updated.id }, updated);
    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail: { entity: updated } }));
  });
  await page.waitForFunction(() => document.querySelector('[data-umbra-pinned]')?.textContent.includes('2 %')
    && !document.querySelector('[data-umbra-pinned] [data-helper-source=plus]'));
  assert.equal(await detail.locator('[data-provenance=equipment]').count(), 0, 'Open source removes the unequipped item');
  assert.match(await row.locator('.entite-stat').innerText(), /2\s*%/);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const U = await import("/js/entities/progression.js"), _U = await import("/js/ui/codex/stats.js");
    const UI = await import("/js/ui/statistics/helpers.js");
    const D = await import("/js/ui/statistics/details.js");
    const entity = structuredClone(window.__helperEquipmentAudit.entity);
    U.setPlayerExperience(1000000);
    const form = _U.createLevelUpForm(entity);
    document.body.append(form);
    try {
      entity.modifierStats.preview = { statLeveled: { magicalPen: 1, magicalPenPlus: 2 } };
      U.ComputeStatPreview(entity);
      const bound = UI.getBoundHelperEntity(form.querySelector('.axis-line'));
      if (!bound?.modifierStats?.preview?.statLeveled) throw new Error('Level-up helper lost preview source inputs');
      const display = D.calculateStatsDisplay('magicalPen', bound);
      const model = display.umbraHelperCalculations.autonomousTotal;
      if (model.value !== 14 || model.system.normal !== 3 || model.system.plus !== 5) throw new Error('Level-up helper must include equipment and both preview source types');
      if (!display.helpContent.startsWith('Les attaques de nature magique ignorent ')) throw new Error('Level-up uses the updated helper sentence');
      if (entity.stats.magicalPen !== 11) throw new Error('Level-up helper changed committed statistics');
    } finally { form.remove(); }
  });
  await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    const entity = { id: 987132, name: 'Helper text audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 100, physicalDamage: 5, cognitiveExplosion: 2, cognitiveExplosionPlus: 3,
        bloodFuryExecutionChancePlus: 4, resilience: 20, indestructibility: 20, ambidextry: 20, mysticism: 20,
        hpBattleRegen: 50, shift: 5, shiftPlus: 7, movement: 20, agility: 30 } };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const root = document.getElementById('system-test');
    root.replaceChildren();
    UI.createCodexEntityScan(entity, root, `codex-entity_${entity.id}`);
    root.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    root.querySelector('.section-content.stats [data-mode="stat"]').click();
  });
  for (const [key, state, pattern] of [
    ['physicalDamage', 'normal', /Renforce les dégâts des attaques qui utilisent la puissance physique/],
    ['bloodFuryExecutionChance', '+', /Une attaque qui le peut a/],
    ['cognitiveExplosion', 'X', /Ajoute .* dégâts à l’attaque sans modifier sa nature/],
  ]) {
    const target = page.locator(`#system-test .stat-container[data-stat="${key}"]`).first();
    await target.click();
    await helper.waitFor({ state: 'visible' });
    assert.match(await helper.locator('.stat-hover-header').innerText(), /^Statistique :/);
    assert.equal(await target.locator('.entite-stat').getAttribute('data-stat-state'), state);
    assert.match(await helper.locator('.stat-hover-body').innerText(), pattern);
    assert.equal(await helper.locator('.stat-lore').count(), 0, 'Autonomous footer has no Umbra lore');
    assert.ok(await helper.locator('[data-helper-source]').count(), 'Sources remain available');
    if (key === 'cognitiveExplosion') {
      const icon = helper.locator('.helper-calculation-result .picto-stat').first();
      assert.match(await icon.evaluate(node => getComputedStyle(node).backgroundImage), /picto-explosion-cognitive\.svg/);
      await helper.locator('.helper-calculation-result').first().hover();
      await detail.waitFor({ state: 'visible' });
      assert.ok(await detail.locator('.picto-stat.cognitiveExplosion:not(.magicalDamage)').count(), 'Calculation detail keeps the cognitive explosion pictogram');
      assert.match(await detail.locator('.helper-calculation-result .picto-stat').first().evaluate(node => getComputedStyle(node).backgroundImage), /picto-explosion-cognitive\.svg/, 'Detail total also uses the cognitive pictogram');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
        .every(node => Number(getComputedStyle(node).opacity) >= .99));
      await page.screenshot({ path: resolve(output, 'helper-copy-cognitive.png') });
    }
    await page.keyboard.press('Escape');
  }
  for (const [effect, asset, label] of [
    ['resilienceTotalCancelBonus', 'resilience-totale', 'Résilience totale'],
    ['indestructibilityBonus', 'indestructibility-totale', 'Indestructibilité totale'],
  ]) {
    const target = page.locator(effect === 'resilienceTotalCancelBonus'
      ? '#system-test .stat-container[data-stat="resilienceTotal"]'
      : `#system-test .stat-container[data-stat-effect="${effect}"]`);
    assert.ok((await target.locator('.stat-name').innerText()).includes(label));
    assert.ok((await target.locator('.picto-stat').first().evaluate(node => getComputedStyle(node).backgroundImage)).includes(`picto-${asset}.svg`));
    await target.click();
    await helper.waitFor({ state: 'visible' });
    assert.equal(await helper.locator('.helper-calculation-result').count(), 1, 'Only the requested effect is shown');
    assert.ok((await helper.locator('.helper-calculation-result .picto-stat').evaluate(node => getComputedStyle(node).backgroundImage)).includes(`picto-${asset}.svg`));
    await page.keyboard.press('Escape');
  }
  assert.match(await page.locator('#system-test [data-stat-effect="mysticismPreparationAcceleration"] .stat-name').innerText(), /Bonus vitesse mystique/);
  const regen = await page.evaluate(async () => {
    const S = await import("/js/entities/statSystem.js");
    return S.getStatSystemResult(JSON.parse(localStorage.getItem('selectedArmyA'))[0], 'hpBattleRegen');
  });
  const regenRow = page.locator('#system-test .stat-container[data-stat="hpBattleRegen"]').first();
  const regenName = (await regenRow.locator('.stat-name').innerText()).trim().replace(/\s*:\s*$/, '').replace(/\s+[+X◇◆Ω]$/, '');
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await regenRow.scrollIntoViewIfNeeded();
    await page.evaluate(async () => (await import("/js/ui/statistics/helpers.js")).closeOpenHelpers());
    await regenRow.click();
    await helper.waitFor({ state: 'visible' });
    assert.deepEqual(await helper.locator('[data-helper-source]').allTextContents(), ['Umbra', 'Base']);
    await helper.locator('.helper-calculation-result').first().hover();
    await detail.waitFor({ state: 'visible' });
    assert.equal(await textOf(detail.locator('[data-autonomous-kind=base]')), `Stat de base : + ${regen.normal + regen.plusApplied} %`);
    assert.equal(await textOf(detail.locator('[data-autonomous-kind=total]')), `${regenName} ${regen.state} : ${regen.value} %`);
    for (const [category, title, name, value] of [
      ['umbra', 'Stat fournie par les Umbras', `${regenName} +`, regen.enhanced],
      ['fixed', 'Stat de base possédée', regenName, regen.normalApplied],
    ]) {
      await page.mouse.move(0, 0);
      await helper.locator(`[data-helper-source="${category}"]`).focus();
      assert.equal(await textOf(detail.locator('.stat-hover-header')), title);
      assert.equal(await detail.locator('.stat-hover-body').evaluate(node => {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('.helper-calculation-detail').forEach(part => part.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
      }), `${name} : + ${value} %`);
      assert.equal(await detail.locator('.stat-source-details > .helper-calculation > .helper-calculation-result').count(), 1, 'One result per source line');
      if (category === 'umbra') assert.ok(await detail.locator('.helper-calculation-detail').count(), 'Umbra source includes its calculation');
      assert.equal(await detail.locator('.picto-stat.hpBattleRegen').count(), 1, 'Source keeps the regeneration pictogram');
      await page.waitForFunction(() => document.querySelector('[data-umbra-detail]') && [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
        .every(node => Number(getComputedStyle(node).opacity) >= .99));
      for (const box of await page.locator('[data-umbra-pinned], [data-umbra-detail]').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }))) assert.ok(box.x >= 0 && box.y >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1, 'Source helpers stay within the viewport');
      await page.screenshot({ path: resolve(output, `regen-source-${category}-${viewport.width}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
  }
  const movementText = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js");
    const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    const display = D.calculateStatsDisplay('shift', entity);
    return { initial: display.shiftStartingCharges, current: display.shiftCurrent, capacity: display.shiftMax, percent: display.shiftStartingPercent };
  });
  const movementRow = page.locator('#system-test .stat-container[data-stat="shift"]').first();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await movementRow.scrollIntoViewIfNeeded();
    await page.evaluate(async () => (await import("/js/ui/statistics/helpers.js")).closeOpenHelpers());
    await movementRow.click();
    await helper.waitFor({ state: 'visible' });
    const movementBody = await textOf(helper.locator('.stat-hover-body'));
    assert.ok(movementBody.includes(`Déplacements disponibles : ${movementText.current}.`));
    assert.match(movementBody, new RegExp(`Déplacements max : ${movementText.capacity}\\s*\\.`));
    assert.equal(await helper.locator('.helper-calculation-result').count(), 2, 'Initial reserve and total capacity have separate details');
    await helper.locator('[data-umbra-calculation="shiftStartingCharges"]').hover();
    await detail.waitFor({ state: 'visible' });
    assert.ok((await detail.innerText()).includes(`${movementText.capacity} × ${movementText.percent / 100}`), 'Initial detail uses full capacity and the actual starting ratio');
    assert.match(await detail.locator('.stat-hover-footer').innerText(), /La valeur finale est arrondie/);
    await helper.locator('[data-umbra-calculation="autonomousTotal"]').hover();
    await detail.waitFor({ state: 'visible' });
    assert.equal(await textOf(detail.locator('[data-autonomous-kind=base]')), 'Stat de base : + 12');
    assert.equal(await textOf(detail.locator('[data-autonomous-kind=total]')), 'Déplacements max Ω : 32');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
      .every(node => Number(getComputedStyle(node).opacity) >= .99));
    for (const box of await page.locator('[data-umbra-pinned], [data-umbra-detail]').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }))) assert.ok(box.x >= 0 && box.y >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1, 'Movement helpers stay within the viewport');
    await page.screenshot({ path: resolve(output, `movement-start-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    const U = await import("/js/ui/codex/stats.js"), _U2 = await import("/js/entities/progression.js");
    const UI = await import("/js/ui/statistics/helpers.js");
    const D = await import("/js/ui/statistics/details.js"), _D2 = await import("/js/combat/statistics.js");
    const entity = JSON.parse(localStorage.getItem('selectedArmyA'))[0];
    const before = JSON.stringify(entity.stats);
    const form = U.createLevelUpForm(entity);
    document.body.append(form);
    try {
      entity.modifierStats.preview = { statLeveled: { shiftPlus: 3, movement: 2, agility: 4 } };
      _U2.ComputeStatPreview(entity);
      const bound = UI.getBoundHelperEntity(form.querySelector('.axis-line'));
      const display = D.calculateStatsDisplay('shift', bound);
      if (display.shiftMax !== 37) throw new Error('Movement preview misses autonomous or Umbra capacity');
      const expected = _D2.calculateMovementStartingCharges({ stats: { movement: 37, agility: 34 } });
      if (display.shiftStartingCharges !== expected) throw new Error('Movement preview ignores the total starting reserve');
      if (JSON.stringify(entity.stats) !== before) throw new Error('Movement preview changed live charges');
    } finally { form.remove(); }
  });
  await page.evaluate(async () => {
    document.getElementById('system-test').remove();
    const Store = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/inventory.js");
    window.levelRunning = 'worldmap';
    Store.setAdminMode(true);
    const gameUI = document.querySelector('.Game-UI') || document.body.appendChild(document.createElement('div'));
    gameUI.classList.add('Game-UI');
    gameUI.style.cssText = 'display:block;position:fixed;inset:0;z-index:1;visibility:visible';
    UI.openShopInterface();
    document.querySelector('[data-browser-test-fixture="starter-hidden"]')?.remove();
  });
  const mixedTile = page.locator('.shop-interface .item-wrapper:has(img.DevMagicalPenMixed)');
  await mixedTile.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.shop-interface img.DevMagicalPenNormal, .shop-interface img.DevMagicalPenPlus, .shop-interface img.DevMagicalPenMixed')]
    .every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    const Manager = await import('/js/items/itemManager.js');
    const node = document.querySelector('.shop-interface img.DevMagicalPenMixed').closest('.item-wrapper');
    const id = node.dataset.itemId;
    Manager.createItemDescription(Manager.getIngameItemById(id), id, node, { persistent: true });
  });
  const itemHelper = page.locator('.shop-item-card.item-description-card.persistent');
  await itemHelper.waitFor({ state: 'visible' });
  assert.equal(await itemHelper.locator('.stuff-stat-row').count(), 2, 'Mixed equipment helper keeps both source lines');
  assert.match(await itemHelper.locator('[data-stat="magicalPenPlus"] .stat-line').getAttribute('aria-label'), /\+$/);
  assert.equal(await itemHelper.locator('[data-stat="magicalPenPlus"] .stat-improved-label').innerText(), 'Pénétration magique +');
  assert.equal(await itemHelper.locator('.stuff-stat-row[data-stat="magicalPen"] .stat-name').innerText(), 'Pénétration magique');
  assert.match(await itemHelper.locator('.stuff-stat-row[data-stat="magicalPenPlus"] .stuff-stat-effective').innerText(), /5\s*%/);
  assert.match(await itemHelper.locator('.stuff-stat-row[data-stat="magicalPen"] .stuff-stat-effective').innerText(), /4\s*%/);
  assert.equal(await itemHelper.locator('.stuff-stat-row[data-stat="magicalPen"] .stat-name [data-stat-state]').evaluate(node => getComputedStyle(node).color), 'rgb(220, 225, 230)');
  assert.equal(await itemHelper.locator('.stuff-stat-row[data-stat="magicalPen"] .stuff-stat-effective').evaluate(node => getComputedStyle(node).color), 'rgb(220, 225, 230)');
  assert.equal(await itemHelper.locator('[data-stat="magicalPenPlus"] .stat-improved-label').getAttribute('data-stat-state'), '+');
  await page.screenshot({ path: resolve(output, 'admin-shop-mixed-equipment.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
