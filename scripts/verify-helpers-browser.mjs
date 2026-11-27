import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, extname, sep, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(playwrightPath);
const { babelParse, traverse } = require(resolve(dirname(require.resolve(playwrightPath)), 'lib/transform/babelBundle.js'));
const root = resolve('docs');
const output = resolve('outputs/helpers');
await mkdir(output, { recursive: true });
const helperSource = await readFile(resolve(root, 'js/data/helpers.js'), 'utf8');
assert.doesNotMatch(helperSource, /^import\s/m, 'The content module must not import gameplay or UI modules');
assert.doesNotMatch(helperSource, /localStorage|addEventListener|setInterval|new Function/, 'Content renderers must not own storage, events, timers or formula evaluation');
const helpers = await import(pathToFileURL(resolve(root, 'js/data/helpers.js')));
assert.equal(helpers.HELPER_TEXT.umbraCalculationTitle('Intelligence'), 'Détail du ratio : Intelligence');
assert.equal(helpers.HELPER_TEXT.umbraCalculationTitle('<img src=x>'), 'Détail du ratio : &lt;img src=x&gt;');
assert.match(helpers.buildAttackActivationHelper(true), /sélectionnée automatiquement/);
assert.match(helpers.buildAttackActivationHelper(false), /ne sera pas utilisée/);
assert.equal(helpers.buildAttackPurityHelper(null), '');
assert.match(helpers.buildAttackPurityHelper(3), /Niveau d'essence 3/);
assert.match(helpers.buildInertEnergyHelper({ loss: 30 }), /30 %/);
assert.equal(helpers.buildStatGraphHelper({ label: 'Force', value: 35 }), 'Force : 35%');
assert.match(helpers.buildDefenseHpHelper('astrality'), /moins 1/);
assert.match(helpers.buildDefenseHpHelper('dodge'), /limités aux HP disponibles/);
assert.match(helpers.buildDefenseHpHelper('resilience'), /Hors overkill/);
assert.equal(helpers.buildRoleDurationHelper(12), '12 s dans ce rôle');
assert.equal(helpers.buildStatCurseHelper([{ source: 'Malus', value: -5, mode: 'percent' }]), 'Stat maudite : Malus : -5 %');
assert.match(helpers.buildMilestoneEssenceHelper(true), /gagnée/);
assert.match(helpers.buildMilestoneEssenceHelper(true, { preview: true }), /confirmation des niveaux/);
assert.match(helpers.buildMilestoneEssenceHelper(false), /Ce jalon accorde/);
assert.match(helpers.buildMilestoneEssenceHelper(false, { preview: true }), /Ce jalon accorde/);
assert.equal(Object.keys(helpers.ESSENCE_EFFECT_HELPERS).length, 23);
const resonanceHelper = helpers.buildAttackSignatureHelper({
  resonance: { bonus: 5, percent: 20, proximity: 1, reference: 25 },
  balanceData: { attackNature: { resonance: { normalCap: 20, capPerLevel: 2, threshold: .5, startPercent: 1, perfectJump: 5 } } },
  signature: { level: 1 }, getSafe: () => 25, view: {}, nature: { profile: { red: 1, blue: 1, total: 2 } }, attack: {},
});
assert.equal(resonanceHelper.descriptionText, '+5 puissance hybride (20.00 %).', 'Plain text consumers must not display HTML tags');
assert.match(resonanceHelper.helper, /class="physicalDamage">25/);
assert.match(resonanceHelper.helper, /class="magicalDamage">25/);
assert.doesNotMatch(resonanceHelper.helper, /arrondi|helper-calculation-note/i, 'Player resonance helper omits calculation commentary');
assert.doesNotMatch(helpers.buildHypercognitionBonusHelper({ hypercognitionBonus: 6, hypercognitionValue: 1,
  hypercognitionIntel: 10, hypercognitionRatio: .5 }), /arrondi|helper-calculation-note/i,
  'The inline Hypercognition bonus helper omits rounding notes');

// Scan content destinations, not unrelated utility functions also named "helper".
const contentKeys = new Set(['helpContent', 'ambianceContent', 'totalMagicalDamageHelp', 'helperText', 'helperAmbiance', 'helperSuffix', 'convention']);
const keyName = node => node?.name || node?.value;
function containsInlineText(node) {
  if (!node) return false;
  if (node.type === 'StringLiteral') return node.value.trim().length > 0;
  if (node.type === 'TemplateLiteral') return node.quasis.some(part => part.value.raw.trim());
  if (node.type === 'ConditionalExpression') return containsInlineText(node.consequent) || containsInlineText(node.alternate);
  if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression') return containsInlineText(node.left) || containsInlineText(node.right);
  return false;
}
let auditedModules = 0;
for (const entry of await readdir(resolve(root, 'js'), { recursive: true })) {
  if (!entry.endsWith('.js') || entry.endsWith('.test.js')) continue;
  const filename = resolve(root, 'js', entry);
  if (filename === resolve(root, 'js/data/helpers.js')) continue;
  const source = await readFile(filename, 'utf8');
  const ast = babelParse(source, filename);
  const checkContent = (key, node) => {
    if (contentKeys.has(key)) assert.equal(containsInlineText(node), false, `${entry}:${node.loc.start.line}: helper text must be in data/helpers.js`);
  };
  traverse(ast, {
    AssignmentExpression({ node }) {
      if (node.left.type === 'MemberExpression') checkContent(keyName(node.left.property), node.right);
    },
    ObjectProperty({ node }) { checkContent(keyName(node.key), node.value); },
    FunctionDeclaration({ node }) {
      if (node.id?.name === 'calculateStatsDisplay') {
        const body = source.slice(node.start, node.end);
        assert.match(body, /withStatDisplayReads\(/, 'Display reads share the synchronous calculation context');
        assert.match(body, /calculateStatsDisplayContent\(/, 'The public API delegates to its content calculation');
      }
      if (node.id?.name === 'calculateStatsDisplayContent') {
        const body = source.slice(node.start, node.end);
        assert.doesNotMatch(body, /<\/?(?:div|span|p|br|strong)\b/, 'Stat calculations must not construct HTML');
        assert.doesNotMatch(body, /totalMagicalDamageHelp/, 'The magic fragment is built only in the helper module');
        assert.match(body, /buildStatHelperContent\(/, 'Keep the existing calculation API wired to the content builder');
      }
    },
  });
  auditedModules++;
}
console.log(`PASS: helper-content audit across ${auditedModules} modules`);
const server = createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  if (path === root) path = resolve(root, 'index.html');
  try {
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream');
    let data;
    if (process.argv.includes('--original')) {
      try { data = await readFile(resolve(output, 'source-before/docs', relative(root, path))); } catch {}
    }
    res.end(data ?? await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const readSourceDetails = async () => {
    const titles = { umbra: 'Stat fournie par les Umbras', fixed: 'Stat de base possédée', stat: 'Stat acquise par progression',
      equipment: "Stat fournie par l'équipement", combat: 'Stat fournie par les effets',
      consumable: 'Réserve des consommables', spell: 'Réserve des sorts', malus: 'Malus' };
    const result = [];
    for (const source of await page.locator('[data-umbra-pinned] [data-helper-source]').all()) {
      await source.dispatchEvent('mouseover');
      assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'One source detail at a time');
      assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(),
        titles[await source.getAttribute('data-helper-source')]);
      assert.equal(await page.locator('[data-umbra-detail] [data-helper-source]').count(), 0, 'Source detail cannot recurse');
      result.push(await page.locator('[data-umbra-detail] .stat-hover-body').innerText());
    }
    return result.join('\n');
  };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 7341;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    Date.now = () => 1791806400000;
    let uuid = 0;
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await dismissStarterForFixture(page);
  const snapshot = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js"), _D = await import("/js/combat/statistics.js");
    const UI = await import("/js/ui/statistics/components.js"), _UI = await import("/js/ui/codex/profile.js"), _UI2 = await import("/js/ui/attacks.js"), _UI3 = await import("/js/data/helpers.js");
    const E = await import("/js/entities/runtime.js");
    const A = await import("/js/ui/attacks.js");
    const R = await import("/js/combat/attackResolution.js");
    const Ess = await import("/js/items/essences.js");
    const Items = await import('/js/items/itemManager.js');
    const { stats } = await import('/js/data/statsData.js');
    const { attackDetails } = await import('/js/data/attackList.js');
    const { analyzeEntityCombatProfile } = await import("/js/entities/rules.js");
    const snapshot = {};
    const owners = [
      E.entitesNestUp.find(entity => entity.name === 'Grouille-Doigt TEST 2A support'),
      E.entitesNestUp.find(entity => entity.name === 'Grouille-Doigt TEST 3A polyvalent'),
    ].map((entity, index) => Object.assign(structuredClone(entity), { id: 987001 + index, side: 'A', role: 'mage' }));
    const allStats = structuredClone(owners[1]);
    allStats.id = 987003;
    for (const stat of stats) {
      const value = allStats.stats[stat.key];
      allStats.stats[stat.key] = value && typeof value === 'object' ? { ...value, current: 25, max: 25 } : 25;
      allStats.baseStats[stat.key] = structuredClone(allStats.stats[stat.key]);
    }
    allStats.modifierStats.durable.stuff.orfevre = { activePercent: 25 };
    owners.push(allStats);
    const extraKeys = ['cooldownTimeDetail', 'preparationTimeDetail', 'executionTimeDetail', 'executionRangeTimeDetail', 'recoveryTimeDetail',
      'meleeAttackPhysical', 'meleeAttackMagical', 'meleeAttackHybridal', 'meleeAttackPiercing', 'rangeAttackPhysical', 'rangeAttackMagical',
      'rangeAttackHybridal', 'rangeAttackPiercing', 'rangeAttackTranspiercing', 'transpiercingPower', 'fracass', 'psionic', 'brokenSpell', 'messedSpell', 'stuffSlot'];
    for (const [index, owner] of owners.entries()) {
      for (const key of new Set([...stats.map(stat => stat.key), ...extraKeys])) {
        const value = key.endsWith('TimeDetail') ? { label: key, baseMs: 1500, effectiveMs: 950, reduc: 37, reducKey: 'prepReduc' } : undefined;
        const helperOwner = key === 'executionRangeTimeDetail'
          ? { ...owner, currentAttack: { ...owner.currentAttack, attackRange: ['range'] } } : owner;
        const computed = D.calculateStatsDisplay(key, helperOwner, value);
        snapshot[`stat:${index}:${key}`] = {
          helpContent: computed.helpContent, ambianceContent: computed.ambianceContent, displayValue: computed.displayValue,
          totalMagicalDamageHelp: computed.totalMagicalDamageHelp,
          values: Object.fromEntries(Object.entries(computed).filter(([, value]) => typeof value === 'number' || typeof value === 'boolean')),
        };
      }
      snapshot[`profile:${index}`] = analyzeEntityCombatProfile(owner, R.readAttackDefinitionsForEntity(owner)).helper;
      for (const stat of stats) snapshot[`sources:${index}:${stat.key}`] = A.statSourcesHelper(owner, stat.key);
    }
    const owner = owners[1];
    E.entites.splice(0, E.entites.length, ...owners);
    for (const base of [0, 17.5]) for (const hypercognition of [0, 10, 150]) for (const override of [undefined, 0, 23.5]) {
      const entity = { id: 'magic-helper', stats: { magicalDamage: base, hypercognition, intelligence: 20 } };
      const before = JSON.stringify(entity);
      const computed = D.calculateStatsDisplay('magicalDamage', entity, override);
      if (JSON.stringify(entity) !== before) throw new Error('Helper calculation mutated its entity');
      if (computed.displayValue !== Math.round(override ?? base)) throw new Error('Flat Hyper bonus must not inflate magical power');
      if (!computed.helpContent.includes(computed.totalMagicalDamageHelp)) throw new Error('Magic fragment is disconnected');
      if (computed.totalMagicalDamageHelp.includes('hypercognition')) throw new Error('Flat Hyper bonus belongs to its own helper');
      snapshot[`magic:${base}:${hypercognition}:${override}`] = computed;
    }
    const formulaHost = document.createElement('div');
    const formulaValues = (key, entity, index = 0) => {
      const before = JSON.stringify(entity);
      const computed = D.calculateStatsDisplay(key, entity);
      if (before !== JSON.stringify(entity)) throw new Error(`${key}: helper mutated entity`);
      formulaHost.innerHTML = computed.helpContent;
      const framed = formulaHost.querySelector('[data-umbra-layout="card"]');
      const mainModels = framed ? [...formulaHost.querySelectorAll('[data-umbra-inline-detail]')].map(node=>computed.umbraHelperCalculations[node.dataset.umbraInlineDetail]) : null;
      const formula = framed ? formulaHost.querySelectorAll('[data-umbra-section="capacity"] .helper-calculation, .umbra-passive-value .helper-calculation')[index] : formulaHost.querySelectorAll('.helper-calculation')[index];
      const read = node => Number(node.textContent.replace(/[^0-9.+-]/g, ''));
      return { computed, formula, total: read(formula.querySelector('.helper-calculation-result')),
        parts: mainModels ? mainModels[index].parts.map(part=>part.value*(part.operator==='−'?-1:1)) : [...formula.querySelectorAll('.helper-calculation-detail .helper-figure')].filter(node=>!node.closest('[data-helper-ratio]')).map(read) };
    };
    let arithmeticChecks = 0;
    for (const points of [0, 1, 25, 150, 300]) {
      const entity = { stats: { strength: 10, intelligence: 10, agility: 10, physicalDamage: 12, magicalDamage: 12,
        bloodFury: points, bloodFuryExecutionDamage: 7, hypercognition: points, astrality: points,
        criticalPower: points, criticalChance: 2, criticalDamage: 3, precision: 8, vigueur: points } };
      const execution = formulaValues('bloodFuryExecutionDamage', entity);
      if (execution.total !== Math.ceil(execution.parts.reduce((sum, value) => sum + value, 0))) throw new Error('Execution contributions do not reproduce engine');
      for (const index of [0, 1]) {
        const critical = formulaValues('criticalPower', entity, index);
        const sum = critical.parts.reduce((sum, value) => sum + value, 0);
        if (Math.abs(critical.total - (index === 0 ? Math.min(99, sum) : sum)) > .11) throw new Error('Critical contributions do not match capped total');
      }
      for (const key of ['psionic', 'fracass']) {
        const power = formulaValues(key, entity, 1);
        if (power.total !== power.parts.reduce((sum, value) => sum + value, 0)) throw new Error(`${key}: minimum bonus not represented`);
      }
      const generated = formulaValues('physicalDamage', entity);
      if (generated.computed.generatedUmbraTarget.generatedBonus < generated.computed.generatedUmbraTarget.bonus
        && generated.total !== generated.parts.reduce((sum, value) => sum + value, 0)) throw new Error('Generated contribution must respect effective total');
      if (points === 0) {
        for (const key of ['hypercognition', 'astrality']) {
          const inactive = formulaValues(key, entity);
          if (inactive.total !== 0 || inactive.parts.some(value => value !== 0)) throw new Error(`${key}: inactive Umbra must not credit attribute contribution`);
        }
      }
      arithmeticChecks += 6;
    }
    snapshot.formulaArithmeticChecks = arithmeticChecks;
    // Compare the helper to live combat entry points, not to an obsolete display snapshot.
    const B = await import("/js/combat/vitals.js");
    const Rules = await import("/js/entities/rules.js");
    const StatSystem = await import("/js/entities/statSystem.js");
    const { isUmbraRestricted } = await import('/js/procedural/proc-bareme.js');
    let parityChecks = 0;
    const regressions = [];
    const equal = (actual, expected, label) => {
      if (Math.abs(actual - expected) > 1e-9) throw new Error(`${label}: ${actual} != ${expected}`);
      parityChecks++;
    };
    // Collect this existing calculation regression so the remaining helper
    // cases still run. It remains a failing assertion in the final report.
    const armorBuffCheck = (actual, expected, label) => {
      if (actual !== expected) regressions.push({ label, actual, expected });
      parityChecks++;
    };
    const fixture = values => ({ id: 987099, name: 'Helper audit', side: 'A', stats: values, baseStats: structuredClone(values) });
    const generatedFinalValue = (target, points) => ({
      dodge: E.calculateDodgePercent,
      velocity: value => E.calculateVelocityReduction(value, 1000000).percentage,
      physicalPen: value => Rules.calculatePenetrationPercent(null, 'physicalPen', value),
      magicalPen: value => Rules.calculatePenetrationPercent(null, 'magicalPen', value),
      physicalResistance: Rules.calculateResistanceReductionPercent,
      magicalResistance: Rules.calculateResistanceReductionPercent,
    }[target] || (value => value))(points);
    for (const cfg of Object.values(_D.getGeneratedUmbraStatConfigs())) {
      for (const points of [0, 1, 3, 25]) for (const attribute of [0, 1, 6, 29, 30, 50, 90, 300]) {
        const entity = fixture({ [cfg.source]: points, [cfg.attribute]: attribute });
        const row = StatSystem.calculateStatSources(entity.stats, cfg.target);
        equal(_D.calculateGeneratedUmbraStatBonus(entity, cfg.source), points > 0 ? row.umbraFlat + (cfg.progressive || cfg.ratioPercent ? row.generated : Math.round(row.generated)) : 0, cfg.source+': generated provider includes the configured flat grant');
        const shown = formulaValues(cfg.source, entity);
        const expected = cfg.progressive ? row.conversion : row.enhanced;
        equal(shown.total, Math.round(expected * 100) / 100, cfg.source+': visible capacity matches the appropriate ratio or complete legacy capacity');
        const model=shown.computed.umbraHelperCalculations[cfg.progressive ? 'generatedUmbraRatio' : 'generatedUmbraSource'];
        equal(Math.round(model.parts.reduce((sum,part)=>sum+part.value*(part.operator==='−'?-1:1),0)*1e6)/1e6,Math.round(model.value*1e6)/1e6,cfg.source+': model contributions reconcile to storage precision');
      }
      const generatedEntity = { id: 987094, name: 'Generated Umbra audit', type: 'sbire', side: 'A',
        level: { current: 1, max: 250 }, baseStats: { HP: 100, [cfg.source]: 3, [cfg.attribute]: 6 }, attacks: ['autoAttack'] };
      E.recomputeEntityStats(generatedEntity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      const row=StatSystem.getStatSystemResult(generatedEntity,cfg.target);
      equal(generatedEntity.stats[cfg.target],row.value,cfg.source+': committed entity follows the shared engine');
      equal(D.calculateStatsDisplay(cfg.source,generatedEntity).generatedUmbraSource.bonus,row.umbraFlat+row.generated,cfg.source+': helper matches derived stat');
    }
    const resistanceEntity = { id: 987095, name: 'Integrity audit', type: 'sbire', side: 'A',
      level: { current: 1, max: 250 }, baseStats: { HP: 100, intelligence: 6, integrite: 3 }, attacks: ['autoAttack'] };
    const recomputeResistance = () => E.recomputeEntityStats(resistanceEntity,
      { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    recomputeResistance();
    equal(resistanceEntity.stats.magicalResistance, 9, 'Generated entity stores resistance points');
    equal(Rules.calculateResistances(resistanceEntity, { magical: 100 }).details.magicalReductionPercent,
      Math.ceil(9 / 79 * 100), 'Combat reports the rounded resistance percentage');
    equal(Rules.calculateResistances(resistanceEntity, { magical: 100 }).reducedMagicalDamage,
      Math.floor(100 * (1 - 9 / (9 + 70))),
      'Magical damage uses the unchanged curve without an extra flat percentage');
    resistanceEntity.baseStats.intelligence = 50;
    recomputeResistance();
    equal(resistanceEntity.stats.magicalResistance, 44, 'Changing Intelligence updates resistance points');
    equal(D.calculateStatsDisplay('integrite', resistanceEntity).generatedUmbraSource.bonus, 44, 'Helper follows recalculated resistance');
    const targetFormula = formulaValues('magicalResistance', resistanceEntity);
    const targetModel = targetFormula.computed.umbraHelperCalculations.autonomousTotal;
    equal(targetModel.value, 44, 'Resistance hover total matches combat');
    equal(targetModel.improvement.parts.reduce((sum, part) => sum + part.value, 0), 41, 'Resistance improvement includes both Integrity and Intelligence before conversion');
    equal(targetFormula.total, 44, 'Main resistance helper displays the total resistance score');
    equal(targetFormula.computed.reductionPercent, 44 / 114 * 100, 'Resistance effectiveness remains separately available');
    resistanceEntity.baseStats.integrite = 0;
    recomputeResistance();
    equal(resistanceEntity.stats.magicalResistance ?? 0, 0, 'No generated resistance without Integrity');
    for (const [max, intel] of [[11, 0], [100, 150], [3, .5], [0, 0]]) {
      const entity = fixture({ HP: { current: 0, max }, intelligence: intel, extraLife: { current: 1, max: 1 } });
      const shown = D.calculateStatsDisplay('extraLife', entity);
      B.attemptExtraLife(entity);
      equal(shown.extraLifeResurrectHP, entity.stats.HP.current, `Extra life ceil/cap ${max}/${intel}`);
      equal(shown.extraLifeResurrectPercentTotal, Math.min(100, 20 + intel), 'Extra life cap');
    }
    const randomBefore = Math.random;
    try {
      for (const points of [0, 1, 25, 100, 150, 300]) {
        const entity = fixture({ esoterism: points });
        const chance = D.calculateStatsDisplay('esoterism', entity).esoterismBonus;
        for (const roll of [0, .02, .2, .73, .99]) {
          (await import('/js/combat/effects.js')).clearEsoterismCooldown(entity);
          Math.random = () => roll;
          equal(Number(_D.attemptEsoterism(null, entity)), Number(roll * 100 < chance), `Esoterism ${points}/${roll}`);
        }
      }
    } finally { Math.random = randomBefore; }
    const inactive = fixture({ strength: 150, intelligence: 150, agility: 150, HP: { current: 11, max: 11 } });
    for (const [key, indexes] of Object.entries({ resilience: [0], ambidextry: [0, 1], esoterism: [0, 1], weaponMastery: [0, 1, 2], bloodFury: [3] })) {
      for (const index of indexes) {
        const value = formulaValues(key, inactive, index);
        equal(value.total, 0, `${key}: inactive total`);
        equal(value.parts.reduce((sum, part) => sum + Math.abs(part), 0), 0, `${key}: inactive contributions`);
      }
    }
    equal(_D.attemptResilienceCritReduction(null, inactive, 100), 100, 'Inactive resilience in combat');
    const frozen = { ...fixture({ hypercognition: 100, intelligence: 150 }), archetypeFrozen: true };
    if (isUmbraRestricted(frozen, 'hypercognition')) {
      equal(D.calculateStatsDisplay('hypercognition', frozen, 100).hypercognitionBonus, 0, 'Restricted explicit preview');
    } else throw new Error('Frozen fixture must exercise the restriction');
    const magicAttack = { attacknature: ['magicalDamage'], attackRange: ['melee'], combatFunction: 'Attaquant',
      physicalRatio: 0, magicalRatio: 1, piercingRatio: 0, entityAttackId: 'audit-attack' };
    const partial = { ...fixture({ criticalPower: 100, agility: 20, precision: 10 }), currentAttack: magicAttack,
      modifierStats: { durable: { stuff: { byId: { auditItem: { criticalPower: 5 } } } } } };
    const panel = A.createAttackUmbraPanel(partial, magicAttack);
    formulaHost.innerHTML = panel.querySelector('[data-stat="criticalPower"]').dataset.helperText;
    equal(Number(formulaHost.querySelector('.helper-calculation-result').textContent.replace(/[^0-9.]/g, '')),
      Math.round(_D.calculateCritTotalChance(_D.createAttackStatView(partial, magicAttack)) * 100) / 100, 'Attack-specific equipment contribution is displayed to two decimals');
    for (const range of ['melee', 'range']) for (const nature of ['physicalDamage', 'piercingDamage', 'inerte']) {
      for (const direct of [-10, 0, 20, 95, 120]) for (const haste of [0, 25]) {
        const attack = { ...magicAttack, attacknature: [nature], attackRange: [range], cooldown: 1001,
          preparationTime: 1001, executionTime: 1001, recoveryTime: 1001 };
        const entity = fixture({ strength: 13, intelligence: 10, agility: 23, haste,
          attackExecutionReduc: direct, attackProjectileSpeed: 25, attackRecoveryReduc: direct,
          attackPreparationReduc: direct, attackCooldownReduc: direct });
        entity.currentAttack = attack;
        const timing = _D.getEffectiveAttackTimings(attack, entity);
        for (const [key, field] of [['cooldownTimeDetail', 'cooldown'], ['preparationTimeDetail', 'preparationTime'],
          [range === 'range' ? 'executionRangeTimeDetail' : 'executionTimeDetail', 'executionTime'], ['recoveryTimeDetail', 'recoveryTime']]) {
          const helper = D.calculateStatsDisplay(key, entity, { baseMs: 1001, reduc: timing.reduc }).helperDetails.timing;
          equal(helper.calculatedMs, timing.effective[field], `${key}: grouped clamps ${range}/${nature}/${direct}/${haste}`);
          equal(helper.effectiveMs, field === 'executionTime' ? timing.impactExecutionTime : timing.effective[field], `${key}: impact minimum`);
        }
        if (range === 'melee') equal(timing.effective.executionTime,
          _D.attemptMeleeExecBonus(entity, attack, 1001).finalExecMs, 'Melee live execution reduction');
      }
    }
    const regen = fixture({ strength: 150, indestructibility: 150, hpBattleRegen: 15, HP: { current: 50, max: 101 } });
    regen.battleBoosts = { hpBattleRegen: [{ value: -10, mode: 'flat' }] };
    const regenFormula = formulaValues('hpBattleRegen', regen);
    equal(regenFormula.total, Math.round(regenFormula.parts.reduce((sum, value) => sum + value, 0)), 'Signed regen contributions');
    equal(regenFormula.computed.statSystem.normal, 5, 'Regen penalty reduces the autonomous 15 percent by ten');
    equal(StatSystem.getStatSystemSourceTotals(regen, 'hpBattleRegen')
      .filter(source => source.category === 'combat').reduce((sum, source) => sum + source.value, 0), -10,
      'Regen penalty remains visible in current source details');
    equal(regenFormula.computed.hpBattleRegenAmount, _D.calculateHpBattleRegenAmount(regen), 'Regen HP rounding');
    const highChance = fixture({ criticalPower: 300, criticalChance: 150, ambidextry: 300, agility: 300 });
    equal(D.calculateStatsDisplay('criticalChance', highChance).criticalChanceTotal, 99, 'Crit probability cap');
    check(D.calculateStatsDisplay('ambidextry', highChance).ambidextryTotalChance < 99, 'Ambidextry probability approaches 99%');
    const resist = fixture({ physicalResistance: 1 });
    equal(D.calculateStatsDisplay('physicalResistance', resist).reductionPercent, 100 / 71, 'Autonomous resistance is converted from its score');
    equal(Rules.calculateResistances(resist, { physical: 1000 }).reducedPhysicalDamage, Math.floor(1000 * 70 / 71), 'Autonomous resistance uses the current curve');
    const generatedResist = fixture({ constitution: 1 });
    equal(D.calculateStatsDisplay('physicalResistance', generatedResist).reductionPercent, 200 / 72, 'Generated resistance includes the current fixed gift');
    equal(Rules.calculateResistances(generatedResist, { physical: 1000 }).reducedPhysicalDamage, Math.floor(1000 * 70 / 72), 'Generated resistance retains the exact curve then floors damage');
    const fractional = fixture({ magicalDamage: 12.4, intelligence: 0 });
    const psionic = formulaValues('psionic', fractional, 1);
    equal(psionic.total, psionic.parts.reduce((sum, value) => sum + value, 0), 'Psionic rounded input');
    for (const points of [0, 1, 25, 150, 300]) {
      const entity = fixture({ hypercognition: points, intelligence: 10 });
      const helper = D.calculateStatsDisplay('hypercognition', entity);
      const retained = points <= 150 ? points : 150 + (points - 150) * .1;
      equal(helper.hypercognitionBonus, globalThis.umbraProgression.hypercognitionExplosionDetails(retained, 10, 150).value, 'Hyper final rounding after natural point retention');
    }
    for (const haste of [0, 1, 25, 150, 300]) for (const attribute of [0, 1, 2.99, 25, 150, 300]) {
      const entity = fixture({ haste, strength: attribute, intelligence: attribute, agility: attribute });
      const before = JSON.stringify(entity);
      const shown = D.calculateStatsDisplay('haste', entity);
      equal(Number(JSON.stringify(entity) === before), 1, 'Haste helper leaves the entity unchanged');
      formulaHost.innerHTML = shown.helpContent;
      const formulas = [...formulaHost.querySelectorAll('[data-umbra-section="capacity"] > .helper-calculation')];
      equal(formulas.length, 5, 'All five Haste effects remain visible');
      const expected = [
        [_D.calculateHastePrepReduc(entity), [['haste', E.calculateHastePercent(Rules.getSafe(entity, 'haste'))], ['intelligence', _D.calculateHasteIntelRatio(entity)]]],
        [_D.calculateHasteCDReduc(entity), [['intelligence', _D.calculateHasteCDReduc(entity)]]],
        [_D.calculateHasteExecReduc(entity), [['strength', _D.calculateHasteExecReduc(entity)]]],
        [_D.calculateHasteProjectilSpeed(entity), [['strength', _D.calculateHasteProjectilSpeed(entity)]]],
        [_D.calculateHasteRecupReduc(entity), [['agility', _D.calculateHasteRecupReduc(entity)]]],
      ];
      for (const [index, [total, parts]] of expected.entries()) {
        const formula = formulas[index];
        const value = formula.querySelector('.helper-calculation-result .helper-figure');
        equal(Number(value.textContent.replace('%', '').trim()), total, `Haste ${index} total ${haste}/${attribute}`);
        equal(Number(value.dataset.helperStat === 'haste'), 1, 'Haste final value uses its own stat');
        const details = [...formula.querySelectorAll('.helper-calculation-detail .helper-figure')];
        equal(details.length, parts.length, `Haste ${index} keeps zero contributions`);
        for (const [partIndex, [stat, amount]] of parts.entries()) {
          equal(Number(details[partIndex].dataset.helperStat === stat), 1, `Haste ${index} identifies ${stat}, including at zero`);
          equal(Number(details[partIndex].textContent.replace('%', '').trim()), amount, `Haste ${index}/${stat} matches combat`);
        }
      }
      snapshot[`haste:${haste}:${attribute}`] = shown.helpContent;
    }
    const armorMultiplier = n => {
      const gain = x => Math.floor(x / 150) + (1 - Math.exp(-2.5 * (x % 150) / 150)) / (1 - Math.exp(-2.5));
      return 1 + .85 * (gain(Math.min(n, 150)) + (gain(n) - gain(Math.min(n, 150))) * .0005);
    };
    const armorPart = (n, base) => {
      const normal = Math.min(n, 150), raw = n * base * armorMultiplier(n), atLimit = normal * base * armorMultiplier(normal);
      return Math.round(atLimit + Number.EPSILON * Math.max(1, atLimit) * 4) + Math.max(0, raw - atLimit);
    };
    const armorExpected = (r, f, cfg = { ratios: { source: 1, attribute: .5 }, flatPerPoint: 1 }) =>
      r > 0 ? Math.round(armorPart(r, cfg.ratios.source) + armorPart(Math.max(0, f), cfg.ratios.attribute) + r * cfg.flatPerPoint) : 0;
    for (const [r, f, expected] of [[1,0,2],[10,10,27],[1,100,90],[50,50,164],[150,150,567]])
      equal(E.calculateRobustnessBonus(r, f), expected, 'Approved progressive armor table');
    for (const robustness of [-1, 0, .5, 1, 3, 25, 150, 300, 10000]) for (const strength of [0, 5, 100, 300]) {
      const entity = fixture({ robustness, strength, armor: { current: 3, max: 9999 } });
      const shown = D.calculateStatsDisplay('robustness', entity);
      const r = Rules.getSafe(entity, 'robustness'), f = Rules.getSafe(entity, 'strength');
      equal(shown.armorBonus, armorExpected(r, f), 'Armor helper follows retained points and common curves');
      formulaHost.innerHTML = shown.helpContent;
      equal(formulaHost.querySelectorAll('[data-umbra-passive="solarArmor"]').length, 1, 'Solar armor is an exclusive passive');
      equal(formulaHost.querySelectorAll('[data-umbra-layout="card"]').length, 1, 'Robustness uses the shared card');
      const model = shown.umbraHelperCalculations.armorBonus;
      equal(model.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0), model.value, 'Sources and resource rounding reconcile');
      equal(shown.helpContent.includes('Max atteint'), false, 'No obsolete 999 cap');
      if (robustness === 150 && strength === 100) snapshot.robustnessExample = shown.helpContent;
      if (robustness === 150 && strength === 300) snapshot.robustnessSoftCapExample = shown.helpContent;
    }
    for (const override of [0, 1, 3, 25]) {
      const shown = D.calculateStatsDisplay('robustness', fixture({ robustness: 150, strength: 100 }), override);
      equal(shown.armorBonus, armorExpected(override, 100), 'Preview uses requested Robustness');
    }
    for (const r of [0, 1, 150, 1000, 1e6]) {
      let previous = 0;
      for (let force = 0; force <= 1000; force++) {
        const value = E.calculateRobustnessBonus(r, force);
        if (!Number.isInteger(value) || value < previous) throw Error('Armor capacity must be integral and monotonic');
        equal(value, armorExpected(r, force), 'Independent curve oracle across the Force range');
        previous = value;
      }
      equal(previous, armorExpected(r, 1000), 'Overflow follows the common curve without the old 999 ceiling');
    }
    equal(E.calculateRobustnessBonus(0, 150), 0, 'Force alone grants no solar armor');
    equal(E.calculateRobustnessBonus(NaN, 100), 0, 'Invalid Robustness grants no armor');
    const { balanceData } = await import('/js/data/balanceData.js');
    const armorConfig = balanceData.generatedStats.robustnessArmor;
    const savedRatios = { ...armorConfig.ratios }, savedGift = armorConfig.flatPerPoint;
    try {
      armorConfig.ratios.source = 2; armorConfig.ratios.attribute = .25; armorConfig.flatPerPoint = .5;
      for (const r of [0,1,3,10000]) {
        const entity = fixture({ robustness:r, strength:100 });
        equal(D.calculateStatsDisplay('robustness', entity).armorBonus, armorExpected(Rules.getSafe(entity,'robustness'),100,armorConfig), 'Editable ratios/gift reach helper and engine');
      }
    } finally { Object.assign(armorConfig.ratios, savedRatios); armorConfig.flatPerPoint = savedGift; }
    const Armor = await import('/js/items/armor.js');
    const Upgrade = await import("/js/rendering/vitalFeedback.js"), _Upgrade = await import("/js/entities/progression.js"), _Upgrade2 = await import("/js/ui/codex/stats.js");
    const makeArmorEntity = () => {
      const entity = { id: 987101, name: 'Armor audit', type: 'sbire', side: 'A', level: { current: 1, max: 250 },
        baseStats: { HP: 100, strength: 100, robustness: 150, will: 250, charge: 5 }, attacks: ['autoAttack'] };
      E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      return entity;
    };
    const armored = makeArmorEntity();
    equal(armored.armorLayers.robustness.max, 516, 'Generated Robustness capacity uses Force');
    equal(armored.stats.armor.current, 516, 'New entities receive their armor before any daily refill');
    equal(armored.armorLayers.robustness.current, 516, 'Initial armor is present in the combat reserve');
    const { createLifeBars } = await import("/js/rendering/entities.js");
    const barEntity = structuredClone(armored);
    barEntity.id = 987105;
    const barHost = document.createElement('div');
    barHost.id = 'armor-bars-regression';
    barHost.style.cssText = 'position:absolute;left:0;top:0;width:340px;padding:20px;box-sizing:border-box;background:#111;color:white;z-index:99999999';
    for (const [context, label] of [[null, 'Combat'], ['headsup', 'HUD'], ['codex', 'Profil']]) {
      const row = document.createElement('div');
      row.style.display = 'flow-root';
      const title = document.createElement('p');
      title.textContent = `${label} : 100 HP / 516 armure`;
      const frame = document.createElement('div');
      frame.className = context ? 'headsup-HP-container A sbire' : 'health-bar-container';
      frame.appendChild(createLifeBars(barEntity, { context }));
      row.append(title, frame);
      barHost.append(row);
    }
    document.body.append(barHost);
    await Promise.resolve();
    const checkArmorBars = (value, label) => {
      Upgrade.updateHealthBar(barEntity.stats.HP.current, barEntity.stats.HP.max, value, 516, barEntity.id);
      const bars = [...barHost.querySelectorAll('.armor-bar')];
      equal(bars.length, 3, 'Combat, HUD and Codex use the same armor reserve');
      for (const bar of bars) {
        equal(Number(getComputedStyle(bar).display !== 'none'), Number(value > 0), `${label}: armor bar visibility`);
        if (value > 0) {
          equal(Number(bar.dataset.prevArmor), value, `${label}: displayed armor amount`);
          equal(Number(bar.getBoundingClientRect().width > 0 && bar.getBoundingClientRect().height > 0), 1, `${label}: armor bar has visible dimensions`);
        }
      }
    };
    checkArmorBars(516, 'New entity without refill');
    Armor.consumeEntityArmor(barEntity, 100);
    E.recomputeEntityStats(barEntity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    equal(barEntity.stats.armor.current, 416, 'Reload preserves partially spent armor');
    checkArmorBars(barEntity.stats.armor.current, 'Partially spent armor');
    Armor.destroyEntityArmor(barEntity);
    E.recomputeEntityStats(barEntity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    equal(barEntity.stats.armor.current, 0, 'Recompute never refills an explicitly empty reserve');
    checkArmorBars(0, 'Depleted armor');
    const emptyWithoutLayers = structuredClone(barEntity);
    delete emptyWithoutLayers.armorLayers;
    E.recomputeEntityStats(emptyWithoutLayers, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    equal(emptyWithoutLayers.stats.armor.current, 0, 'Explicit zero stays empty even before layer initialization');
    Armor.resetEntityRegenerableArmor(barEntity);
    checkArmorBars(barEntity.stats.armor.current, 'Daily restored armor');
    Armor.consumeEntityArmor(armored, 100);
    const consumed = armored.armorLayers.robustness.current;
    for (let pass = 0; pass < 2; pass++) {
      E.recomputeEntityStats(armored, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      equal(armored.armorLayers.robustness.current, consumed, 'Recompute does not restore spent armor');
    }
    armored.modifierStats.preview = { statLeveled: { strength: 20 } };
    const preview = _Upgrade.ComputeStatPreview(armored);
    equal(preview.armor.max, 536, 'Force-only level preview updates armor');
    equal(D.calculateStatsDisplay('robustness', armored).armorBonus, preview.armor.max, 'Preview helper agrees with preview capacity');
    equal(armored.armorLayers.robustness.max, 516, 'Preview does not mutate real capacity');
    equal(armored.armorLayers.robustness.current, consumed, 'Preview does not heal real armor');
    armored.modifierStats.preview = { statLeveled: {} };
    const boost = Rules.entityBattleBooste(armored, { stat: 'strength', value: 20, source: 'armor-test' });
    equal(armored.armorLayers.robustness.max, 536, 'Temporary Force updates armor capacity');
    equal(armored.armorLayers.robustness.current, consumed, 'Temporary Force grants no free refill');
    equal(D.calculateStatsDisplay('robustness', armored).armorBonus, 536, 'Battle boost helper and capacity agree');
    E.recomputeEntityStats(armored, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    armorBuffCheck(armored.armorLayers.robustness.max, 536, 'Recompute retains active Force boost exactly once');
    boost.remove();
    equal(armored.armorLayers.robustness.max, 516, 'Removing temporary Force restores capacity');
    const replaced = makeArmorEntity();
    Rules.entityBattleBooste(replaced, { stat: 'strength', value: 20, source: 'armor-replace', stackable: false });
    Armor.resetEntityRegenerableArmor(replaced);
    const replacement = Rules.entityBattleBooste(replaced, { stat: 'strength', value: 20, source: 'armor-replace', stackable: false });
    equal(replaced.armorLayers.robustness.current, 536, 'Refreshing the same buff never clips armor through an intermediate capacity');
    for (let pass = 0; pass < 2; pass++) {
      E.recomputeEntityStats(replaced, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      armorBuffCheck(replaced.armorLayers.robustness.max, 536, 'Recompute keeps the active buff capacity');
      armorBuffCheck(replaced.armorLayers.robustness.current, 536, 'Recompute cannot clip already regenerated boosted armor');
      equal(replaced.stats.strength, 100, 'Temporary Force is not baked into persistent attributes');
    }
    replacement.remove();
    equal(replaced.armorLayers.robustness.current, 516, 'Expired buff clamps the remaining armor to its final capacity');
    const robustBoost = Rules.entityBattleBooste(armored, { stat: 'robustness', value: 100, mode: 'percent', source: 'armor-test' });
    equal(armored.armorLayers.robustness.max, armorExpected(225, 100), 'Robustness percentage buff retains half of external points above 150');
    robustBoost.remove();
    const gear = { serial: 'i42', itemId: 'i42-armor-audit', equippedId: 'e-armor-audit', equippedTo: armored.id, itemType: ['stuff'],
      Stuffeffets: [{ type: 'stat-buff', stat: 'strength', value: 20 }, { type: 'stat-buff', stat: 'armor', value: 80 }],
      armorReserve: { current: 30, max: 80 } };
    armored.stuff = { slot1: [gear.equippedId] };
    E.recomputeEntityStats(armored, { equippedItems: [gear], persistEquipment: false, skipReverseArchetype: true });
    equal(armored.armorLayers.robustness.max, 536, 'Equipment Force contributes to Robustness');
    equal(armored.armorLayers.stuff[gear.equippedId].current, 30, 'Equipment reserve remains separate and worn');
    equal(armored.armorLayers.robustness.current, consumed, 'Equipping Force does not refill Robustness armor');
    equal(armored.stats.armor.totalMax, 616, 'Equipment armor is separate from the solar reserve');
    Armor.grantEntityExternalArmor(armored, 15);
    Armor.resetEntityRegenerableArmor(armored);
    equal(armored.stats.armor.current, 581, 'Solar regeneration restores Robustness only');
    equal(armored.armorLayers.stuff[gear.equippedId].current, 30, 'Solar regeneration leaves equipment worn');
    equal(armored.armorLayers.spell.current, 15, 'Solar regeneration leaves spell armor unchanged');
    const frozenArmor = makeArmorEntity();
    frozenArmor.archetypeFrozen = true;
    E.recomputeEntityStats(frozenArmor, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    equal(frozenArmor.armorLayers.robustness.max, 0, 'Frozen entities cannot use Robustness');
    const blockedBoost = Rules.entityBattleBooste(frozenArmor, { stat: 'robustness', value: 150, source: 'armor-test' });
    equal(frozenArmor.armorLayers.robustness.max, 0, 'Temporary Robustness cannot bypass Frozen restriction');
    blockedBoost.remove();
    const Storage = await import("/js/storage/gameStorage.js");
    const Updates = await import("/js/storage/entityStorage.js");
    const storedBefore = ['selectedArmyA', 'ArmyA', 'ArmyB', 'playerExperience'].map(key => [key, Storage.loadFromLocalStorage(key)]);
    try {
      const combatArmor = makeArmorEntity();
      combatArmor.id = 987104;
      combatArmor.stats.physicalResistance = 0;
      combatArmor.stats.magicalResistance = 0;
      Armor.resetEntityRegenerableArmor(combatArmor);
      Storage.saveToLocalStorage('ArmyB', { armies: { test: { entities: [combatArmor] } } });
      const armorBeforeHit = combatArmor.stats.armor.current;
      const hpBeforeHit = combatArmor.stats.HP.current;
      B.applyDamage(combatArmor, 40, fixture({ strength: 1 }), { functionName: 'armor-audit',
        combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], attacknature: ['physicalDamage'],
        effets: [], forceDamageSources: { physical: 40 } }, { physical: 40 });
      equal(combatArmor.stats.armor.current, armorBeforeHit - 40, 'Real combat consumes the new Robustness armor');
      equal(combatArmor.armorLayers.robustness.current, armorBeforeHit - 40, 'Real combat consumes the same underlying reserve');
      equal(combatArmor.stats.HP.current, hpBeforeHit, 'Robustness armor protects HP during real combat');
      const dead = makeArmorEntity();
      dead.id = 987102;
      dead.stats.HP.current = 0;
      Armor.destroyEntityArmor(dead);
      Armor.consumeEntityArmor(armored, 100);
      Storage.saveToLocalStorage('selectedArmyA', [armored, dead]);
      Storage.saveToLocalStorage('ArmyB', { armies: { test: { entities: [structuredClone(dead)] } } });
      Updates.resetStoredArmorCurrentToMax();
      const [livingAfter, deadAfter] = Storage.loadFromLocalStorage('selectedArmyA');
      equal(livingAfter.armorLayers.robustness.current, 536, 'Living entity receives solar armor at day start');
      equal(livingAfter.armorLayers.stuff[gear.equippedId].current, 0, 'Day start does not refill equipment');
      equal(livingAfter.armorLayers.external.current, 0, 'Day start does not refill external armor');
      equal(deadAfter.stats.armor.current, 0, 'Dead ally does not receive solar armor');
      equal(Storage.loadFromLocalStorage('ArmyB').armies.test.entities[0].stats.armor.current, 0, 'Dead enemy does not receive solar armor');
      const leveled = makeArmorEntity();
      leveled.id = 987103;
      leveled.level.current = 30;
      leveled.Archetype = { current: { key: 'golgoth', level: 1, step: 0, milestone: [] }, inProgress: [], achieve: [] };
      E.recomputeEntityStats(leveled, { persistEquipment: false, skipReverseArchetype: true });
      Armor.resetEntityRegenerableArmor(leveled);
      Armor.consumeEntityArmor(leveled, 100);
      Storage.saveToLocalStorage('selectedArmyA', [leveled]);
      Storage.saveToLocalStorage('ArmyA', { entities: [leveled] });
      _Upgrade.setPlayerExperience(1000000);
      const form = _Upgrade2.createLevelUpForm(leveled);
      document.body.append(form);
      try {
        form.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
        const previewArmor = structuredClone(leveled.modifierStats.preview.total.armor);
        form.querySelector('.confirm-button.yes').click();
        const saved = Storage.loadFromLocalStorage('selectedArmyA')[0];
        equal(saved.stats.armor.max, previewArmor.max, 'Confirmed armor capacity matches the level preview');
        equal(saved.armorLayers.robustness.current, previewArmor.current, 'Confirmed current armor is stored in its actual layer');
        E.recomputeEntityStats(saved, { persistEquipment: false, skipReverseArchetype: true });
        equal(saved.stats.armor.current, previewArmor.current, 'Confirmed armor survives reload/recompute');
      } finally { form.remove(); }
    } finally {
      for (const [key, value] of storedBefore) Storage.saveToLocalStorage(key, value);
    }
    snapshot.combatParityChecks = parityChecks;
    for (const range of ['melee', 'range']) for (let mask = 0; mask < 8; mask++) {
      const slots = ['red', 'blue', 'yellow'].map((color, index) => ({ color, active: Boolean(mask & (1 << index)) }));
      const preview = Ess.calculateEssenceurPreview({ range, slots });
      snapshot[`essence-effects:${range}:${mask}`] = { all: preview.allEffects, available: preview.availableEffects, shares: preview.shares };
    }
    snapshot.entityRateHelper = UI.createEntityRateSummary(owner).title;
    snapshot.combatRecordHints = [..._UI.createCodexCombatRecord(owner).querySelectorAll('[title]')].map(node => node.title);
    const collect = node => [...node.querySelectorAll('[data-helper-text]')].map(element => ({ key: element.dataset.stat, html: element.dataset.helperText }));
    for (const attack of attackDetails) {
      const custom = structuredClone(attack);
      const view = _UI2.AttackDetailInfos(custom, owner);
      snapshot[`attack:${attack.functionName || attack.attackId}`] = collect(view);
      snapshot[`light:${attack.functionName || attack.attackId}`] = _UI2.createAttackLightDescription(custom, owner).innerHTML;
    }
    for (const color of ['red', 'blue', 'yellow', 'unknown']) {
      snapshot[`essence:universal:${color}`] = Ess.createUniversalEssenceHelperHTML(color);
      for (const used of [true, false]) for (const hyperco of [true, false]) {
        snapshot[`essence:${color}:${used}:${hyperco}`] = Ess.createLinkedEssenceHelperHTML(color, {
          entityName: '<Porteur & test>', attackName: 'Attaque "test"', slot: 2, used, hyperco,
        });
      }
    }
    snapshot.essenceAmbiance = Ess.createUniversalEssenceAmbianceHTML();
    snapshot.itemEffect = _UI3.generateEffectDescription({ effectDescription: '{TotalDamages} / {effectDotResult} / {effectDuration}', effectDot: 2.3, effectDuration: 5 }, null, { physicalDamage: 15, MagicDamage: 7 });
    if (!document.querySelector('.Game-helper')) {
      const helper = document.createElement('div'); helper.className = 'Game-helper'; document.body.append(helper);
    }
    const anchor = document.createElement('div'); document.body.append(anchor);
    const itemCases = [
      { itemId: 'helper-heal', displayName: 'Soin test', itemType: ['consumable'], itemQuality: 2, effets: ['itemHeal'], HealAmount: 15 },
      { itemId: 'helper-damage', displayName: 'Degat test', itemType: ['consumable'], itemQuality: 2, effets: ['itemDamage'], physicalDamage: 12 },
      { itemId: 'helper-stuff', displayName: 'Equipement test', itemType: ['stuff'], itemQuality: 2, Stuffeffets: [
        { type: 'stat-buff', stat: 'strength', value: 3 },
        { type: 'stat-malus', stat: 'agility', value: 1 },
        { type: 'stat-buff', stat: 'intelligence', value: 5, mode: 'percent' },
      ] },
      { itemId: 'helper-stuff-orfevre', equippedTo: allStats.id, equippedId: 'color-test-equipped', displayName: 'Orfevre test', itemType: ['stuff'], itemQuality: 2, Stuffeffets: [
        { type: 'stat-buff', stat: 'strength', value: 10 },
        { type: 'stat-malus', stat: 'agility', value: 2 },
        { type: 'stat-buff', stat: 'intelligence', value: 5, mode: 'percent' },
      ] },
    ];
    for (const item of itemCases) {
      const card = Items.createItemDescription(item, item.itemId, anchor);
      snapshot[`item:${item.itemId}`] = card?.innerHTML;
      card?.remove();
    }
    const entityCard = Items.createEntityDescription(owner, anchor);
    snapshot.entityCard = entityCard?.innerHTML;
    entityCard?.remove();
    const H = await import('/js/data/helpers.js');
    snapshot.orfevre = D.calculateStatsDisplay('orfevre-detail', owner, {
      stat: 'strength', label: 'Force', raw: 10, exactBonus: 2.5, exactTotal: 12.5, total: 13,
    }).helpContent;
    snapshot.statSource = H.buildStatSourcesHelper({
      statClass: 'agility', escape: value => String(value),
      sources: [{ source: 'Equipment', value: 5, mode: 'percent' }],
    });
    snapshot.calculationRegressions = regressions;
    return JSON.parse(JSON.stringify(snapshot));
  });
  assert.ok(Object.keys(snapshot).length >= 414, 'Catalog, numeric values, magic bonuses, essences and item helper cases are exercised');
  assert.match(snapshot['stat:0:bloodFury'].helpContent, /picto-stat bloodFuryExecutionChance/);
  assert.match(snapshot['essence:blue:true:true'], /Hypercognitive/);
  assert.match(snapshot['essence:blue:true:true'], /&lt;Porteur &amp; test&gt;/);
  assert.match(snapshot['essence:blue:true:true'], /chasse 2/);
  assert.match(snapshot['essence:blue:false:true'], /Disponible/);
  assert.doesNotMatch(snapshot['essence:blue:true:false'], /Hypercognitive/);
  assert.ok(snapshot['attack:autoAttack'].some(row => row.key === 'attackActivation'));
  assert.match(snapshot['light:autoAttack'], /combat-attack-helper-name/);
  assert.match(snapshot['item:helper-stuff'], /stuff-stat-row/);
  assert.match(snapshot['item:helper-stuff-orfevre'], /stuff-stat-orfevre-base strength/);
  assert.match(snapshot['item:helper-stuff-orfevre'], /stuff-stat-effective agility/);
  // Current layout coverage lives in the generated-stat, Umbra-structure,
  // execution-color and live-crystal suites. Keep old layout snapshots opt-in.
  if (!process.argv.includes('--historical-layout')) {
    assert.equal(snapshot.formulaArithmeticChecks, 30);
    assert.ok(snapshot.combatParityChecks >= 3200);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    const report = { modules: auditedModules, catalogCases: Object.keys(snapshot).length,
      arithmeticChecks: snapshot.formulaArithmeticChecks, combatChecks: snapshot.combatParityChecks,
      calculationRegressions: snapshot.calculationRegressions, errors };
    await writeFile(resolve(output, 'combat-parity-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.deepEqual(snapshot.calculationRegressions, [], 'Existing armor buff recomputation regression; calculation rules are unchanged in this lot');
  } else {
  const colorAudit = await page.evaluate(async snapshot => {
    const { stats } = await import('/js/data/statsData.js');
    const aliases = ['physical', 'magical', 'piercing', 'hybridal', 'healthPoint', 'healing', 'neutral',
      'criticalChance', 'criticalDamage', 'bloodThirsty', 'bloodCrazy', 'bloodGlutony', 'fracass', 'psionic',
      'perforation', 'shortRange', 'meleeAttack', 'transpiercingDamage', 'hybridalDamage',
      'physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage', 'inerte',
      'weaponOrfevre', 'weaponCollector', 'indiscretion', 'fragility', 'armorSlot', 'aggro', 'hyperco',
      'balance-view', 'balance-strike'];
    const keys = [...new Set([...stats.map(stat => stat.key), ...aliases])];
    const probe = document.createElement('span');
    probe.textContent = '12.5';
    document.body.append(probe);
    const colors = Object.fromEntries(keys.map(key => {
      probe.className = key;
      return [key, getComputedStyle(probe).color];
    }));
    const stateColors = Object.fromEntries(keys.map(key => {
      probe.className = key;
      return [key, Object.fromEntries(['normal', '+', 'X', '◇', '◆', 'Ω', 'umbra'].map(state => {
        probe.dataset.statState = state;
        return [state, getComputedStyle(probe).color];
      }))];
    }));
    probe.remove();
    const host = document.createElement('div');
    document.body.append(host);
    const mismatches = [];
    let checked = 0;
    const inspect = (node, key, context) => {
      const actual = getComputedStyle(node).color;
      const expected = stateColors[key]?.[node.dataset.statState] ?? colors[key];
      checked++;
      if (actual !== expected) mismatches.push({ context, key, actual, expected, html: node.outerHTML });
    };
    for (const context of ['stat-hover force', 'stat-hover intelligence', 'stat-hover agilite',
      'attack-details', 'attack-submenu-infos', 'attack-light-description', 'attack-umbra-panel',
      'attack-nature-effect', 'Game-helper item-detail-card']) {
      host.className = context;
      host.innerHTML = keys.map(key => `<span class="${key}">12.5</span>`).join(' ');
      for (const node of host.children) inspect(node, node.className, context);
    }
    const strings = (value, path) => typeof value === 'string'
      ? [[path, value]]
      : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => strings(child, `${path}:${key}`)) : [];
    const numericNodes = [];
    const uncoloredNumbers = [];
    for (const [context, html] of strings(snapshot, 'snapshot')) {
      if (!html.includes('<')) continue;
      host.className = 'stat-hover force';
      host.innerHTML = html;
      for (const node of host.querySelectorAll('span, strong, b, .entite-stat')) {
        if (node.children.length || !/\d/.test(node.textContent) || node.closest('.umbra-restricted')) continue;
        const key = [...node.classList].find(key => colors[key]);
        if (key) inspect(node, key, context);
        numericNodes.push({ context, className: node.className, text: node.textContent, color: getComputedStyle(node).color });
      }
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!/\d/.test(node.textContent)) continue;
        let parent = node.parentElement;
        while (parent !== host && ![...parent.classList].some(key => colors[key])) parent = parent.parentElement;
        if (parent === host) uncoloredNumbers.push({ context, text: node.textContent.trim() });
      }
    }
    for (const key of ['ambidextry', 'criticalPower', 'esoterism', 'mysticism', 'occultism',
      'cooldownTimeDetail', 'preparationTimeDetail', 'executionTimeDetail', 'executionRangeTimeDetail', 'recoveryTimeDetail']) {
      host.innerHTML = snapshot[`stat:2:${key}`].helpContent;
      const genericValues = [...host.querySelectorAll('.neutral, .less-bonus, .more-bonus, .less, .more')]
        .filter(node => /\d/.test(node.textContent)
          && !(node.classList.contains('neutral') && node.parentElement.matches('.helper-figure[data-helper-stat="neutral"]')));
      if (genericValues.length) throw new Error(`${key}: stat values still have generic formatting`);
    }
    for (const [key, expected] of Object.entries({ strength: 'rgb(172, 0, 0)', agility: 'rgb(255, 174, 0)',
      intelligence: 'rgb(0, 152, 255)', hypercognition: 'rgb(193, 0, 175)', criticalPower: 'rgb(255, 108, 0)',
      ambidextry: 'rgb(237, 255, 0)', bloodFury: 'rgb(255, 0, 6)', psionic: 'rgb(69, 61, 255)' })) {
      if (colors[key] !== expected) throw new Error(`${key}: canonical stat color changed`);
    }
    host.remove();
    return { checked, colors, mismatches, numericNodes, uncoloredNumbers };
  }, snapshot);
  await writeFile(resolve(output, 'color-audit.json'), JSON.stringify(colorAudit, null, 2));
  if (process.argv.includes('--audit-colors')) {
    await writeFile(resolve(output, 'color-before.json'), JSON.stringify(snapshot, null, 2));
    console.log(`Color audit: ${colorAudit.mismatches.length} mismatches across ${colorAudit.checked} values`);
  } else {
    assert.deepEqual(colorAudit.mismatches, [], 'Every stat keeps its own color in every helper surface');
    console.log(`PASS: ${colorAudit.checked} stat-color checks across helper surfaces and rendered catalog values`);
  }
  if (!process.argv.includes('--audit-colors')) {
    let before;
    try { before = JSON.parse(await readFile(resolve(output, 'color-before.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (before && process.argv.includes('--unchanged-calculations')) {
      for (const [key, value] of Object.entries(before)) {
        if (key.startsWith('stat:')) assert.deepEqual(snapshot[key].values, value.values, `${key}: calculations unchanged`);
      }
    }
      // Historical snapshots are opt-in; combat parity is the current correctness contract.
      const formulaAudit = await page.evaluate(snapshot => {
        const host = document.createElement('div');
        let checked = 0;
        for (const [key, entry] of Object.entries(snapshot)) {
          if (!key.startsWith('stat:')) continue;
          host.innerHTML = entry.helpContent;
          const familySource = ['vigueur', 'esprit', 'finesse', 'brutality', 'inflexion', 'constitution', 'integrite', 'adresse', 'vivacite'].includes(key.split(':').at(-1));
          if (familySource || ['physicalDamage', 'magicalDamage', 'piercingDamage', 'physicalPen', 'magicalPen', 'physicalResistance', 'magicalResistance', 'dodge', 'velocity'].includes(key.split(':').at(-1))) {
            for (const note of host.querySelectorAll('.helper-calculation-note')) {
              const expected = familySource ? 'La statistique peut être arrondie.' : 'La stat est arrondie.';
              if (note.textContent !== expected) throw new Error(`${key}: unexpected rounding note`);
              note.remove();
            }
          }
          if (host.querySelector('.helper-calculation-note')
            || /arrondi|plafonn|après limites|coefficient exact|délai minimal|contribution limitée/i.test(host.textContent)) {
            throw new Error(`${key}: developer calculation commentary remains in a player helper`);
          }
          for (const formula of host.querySelectorAll('.helper-calculation')) {
            if (formula.closest('[data-umbra-inline-detail]')) continue;
            if (!formula.firstElementChild?.classList.contains('helper-calculation-result')) throw new Error(`${key}: result must be first`);
            const figures = formula.querySelectorAll('.helper-figure');
            if (!figures.length) throw new Error(`${key}: missing result pictogram`);
            for (const figure of figures) {
              const label = formula.previousElementSibling;
              const labeledIcon = label?.dataset.helperEffect === figure.dataset.helperStat
                && label.previousElementSibling?.matches(`.picto-stat.${figure.dataset.helperStat}`);
              if (!figure.firstElementChild?.classList.contains('picto-stat') && !labeledIcon) {
                throw new Error(`${key}: pictogram must precede value: ${figure.outerHTML}`);
              }
              const value = figure.lastElementChild;
              if (!value.classList.contains(figure.dataset.helperStat)) throw new Error(`${key}: wrong stat color`);
              if (/NaN|undefined|Infinity|\[object/.test(value.textContent)) throw new Error(`${key}: invalid numeric value`);
            }
            const detail = formula.querySelector('.helper-calculation-detail');
            if (detail && !/^\(.*\)$/s.test(detail.textContent.trim())) throw new Error(`${key}: missing parentheses`);
            const numericDetail = detail?.cloneNode(true);
            numericDetail?.querySelectorAll('[data-helper-effect]').forEach(label => label.remove());
            if (numericDetail && /\p{L}/u.test(numericDetail.textContent.replace(/ms|s/g, ''))) throw new Error(`${key}: stat name remains in formula: ${detail.textContent}`);
            checked++;
          }
        }
        for (const key of ['ambidextry', 'criticalPower', 'bloodFury', 'hypercognition', 'psionic', 'fracass', 'weaponMastery']) {
          host.innerHTML = snapshot[`stat:2:${key}`].helpContent;
          if (!host.querySelector('.helper-calculation-detail')) throw new Error(`${key}: missing breakdown`);
        }
        return checked;
      }, snapshot);
      assert.ok(formulaAudit > 250, `Expected catalog coverage, got ${formulaAudit}`);
      console.log(`PASS: ${formulaAudit} final-first, icon-only calculation structures`);
      assert.equal(snapshot.formulaArithmeticChecks, 30);
      console.log('PASS: 30 arithmetic and inactive-Umbra boundary checks');
      assert.ok(snapshot.combatParityChecks >= 500);
      console.log(`PASS: ${snapshot.combatParityChecks} live-combat, cap, rounding and inactive-bonus checks`);
  }
  const presentationChecks = await page.evaluate(async snapshot => {
    const host = document.createElement('div');
    host.className = 'stat-hover force';
    document.body.append(host);
    let checked = 0;
    const check = (ok, message) => { if (!ok) throw new Error(message); checked++; };
    const show = key => { host.innerHTML = snapshot[`stat:2:${key}`].helpContent; };
    const improvedColor = key => {
      const reference = document.createElement('span');
      reference.className = key;
      reference.dataset.statState = '+';
      host.append(reference);
      const color = getComputedStyle(reference).color;
      reference.remove();
      return color;
    };
    for (const [key, icon, file, title] of [
      ['indestructibility', 'indestructibleSkin', 'picto-peau-indestructible.svg', 'Peau indestructible'],
      ['hypercognition', 'cognitiveExplosion', 'picto-explosion-cognitive.svg', 'Explosion cognitive'],
      ['hypercognition', 'cognitiveGenerator', 'picto-generateur-cognitif.svg', 'Générateur cognitif'],
      ['ambidextry', 'ambidextryChance', 'picto-ambi-chance.svg', 'Chance de deuxième coup'],
      ['ambidextry', 'dominantArm', 'picto-bras-faible.svg', 'Dégâts du deuxième coup'],
      ['robustness', 'solarArmor', 'picto-armor-solaire.svg', 'Armure solaire'],
      ['mysticism', 'mysticTrance', 'picto-trance-mystic.svg', 'Trance mystique'],
    ]) {
      show(key);
      const label = [...host.querySelectorAll(`[data-helper-effect="${icon}"]`)]
        .find(node => node.textContent.includes(title));
      const picto = label?.previousElementSibling;
      const originIcon = picto?.matches(`.picto-stat.${key}[data-helper-umbra-source="${key}"]`);
      check((picto?.matches(`.picto-stat.${icon}`) || originIcon) && label.textContent.includes(title), `${key}: missing named effect ${title}`);
      const background = getComputedStyle(picto).backgroundImage;
      const reference = document.createElement('span');
      reference.className = `picto-stat ${key}`;
      host.append(reference);
      check(originIcon ? background === getComputedStyle(reference).backgroundImage : background.includes(file), `${key}: wrong icon for ${title}: ${background}`);
      reference.remove();
      const asset = new Image();
      asset.src = background.slice(5, -2);
      await asset.decode();
      check(asset.naturalWidth > 0 && asset.naturalHeight > 0, `${key}: invalid SVG ${file}`);
    }
    show('mysticism');
    const tranceTitle = host.querySelector('[data-helper-effect="mysticTrance"]');
    const mysticismTitle = host.querySelector('[data-helper-effect="mysticism"]');
    check(tranceTitle.classList.contains('mysticism') && getComputedStyle(tranceTitle).color === getComputedStyle(mysticismTitle).color,
      'Trance mystique preserves the Mysticisme title color');
    check(getComputedStyle(host.querySelector('.helper-calculation-result .picto-stat.mysticTrance')).backgroundImage.includes('picto-trance-mystic.svg'),
      'Trance mystique chance uses its effect pictogram');
    check(host.querySelectorAll('.picto-stat.mysticTrance').length === 2
      && host.querySelectorAll('.helper-calculation-result .picto-stat.mysticism:not(.mysticTrance)').length === 3,
      'Only the trance heading and proc chance receive the new pictogram');
    check(host.textContent.includes("peut déclencher une transe mystique pendant la préparation de l'attaque.")
      && host.textContent.includes("Trance mystique : l'entité a") && host.textContent.includes('de chance d\'entrer en transe.')
      && host.textContent.includes('La transe dure') && host.textContent.includes('pendant la transe, la préparation est accélérée')
      && host.textContent.includes("Si l'attaque est lancée pendant la transe, elle gagne"),
      'Mysticism retains its descriptions and four effect lines');
    for (const [key, titles] of [
      ['weaponMastery', ['Charge +', 'Orfèvre armurier +', 'Collectionneur de guerre +']],
      ['haste', ['Préparation +', 'Cooldown +', 'Exécution +', 'Vitesse des projectiles +', 'Récupération +']],
      ['adresse', ['Esquive X']],
      ['robustness', ['Armure +']],
    ]) {
      show(key);
      for (const label of titles) {
        const title = [...host.querySelectorAll('[data-helper-effect]')].find(node => node.textContent === label);
        check(Boolean(title), `${key}: missing ${label}`);
        const icon = title.previousElementSibling;
        const originIcon = icon?.matches(`.picto-stat.${key}[data-helper-umbra-source="${key}"]`);
        check(originIcon || (label.endsWith(' X') && icon?.matches('.picto-stat'))
          || (icon?.matches('.picto-stat--bonus') && getComputedStyle(icon).filter.includes('drop-shadow')),
          `${key}: improved effect identifies its Umbra or its bonus pictogram`);
        const reference = document.createElement('span');
        reference.className = title.className;
        reference.dataset.statState = title.dataset.statState || '+';
        host.append(reference);
        check(getComputedStyle(reference).color === getComputedStyle(title).color,
          `${key}: improved label uses its lightened stat color`);
        reference.remove();
      }
    }
    for (const key of ['armor', 'robustness']) {
      show(key);
      check(host.querySelector('[data-helper-effect="day"].day')?.textContent === 'début de la journée'
        && host.querySelector('.picto-stat.day') && host.textContent.includes('vivante'), `${key}: day and living condition`);
    }
    show('robustness');
    check(host.textContent.split('•').length === 3 && host.innerHTML.includes('<br><br>•'),
      'Robustness has two distinct effects');
    const solarTitle = host.querySelector('[data-helper-effect="solarArmor"]');
    const armorTitle = host.querySelector('[data-helper-effect="armor"]');
    check(solarTitle.textContent === 'Armure solaire' && getComputedStyle(solarTitle).color === getComputedStyle(armorTitle).color,
      'Solar armor keeps the existing armor color');
    check(host.querySelector('[data-helper-effect="robustness"].robustness')?.previousElementSibling.matches('.picto-stat.robustness'),
      'Solar armor identifies its Robustness source with the existing icon and color');
    check(host.textContent.includes("points d'armure fournis par la robustesse se régénèrent à chaque début de la journée, si l'entité est vivante à cet instant."),
      'Solar armor states the amount, source and living-at-day-start condition');
    for (const [key, fixed, stat] of [['ambidextry', '100 %', 'neutral'], ['astrality', '1', 'HP'], ['bloodFury', '100 %', 'neutral']]) {
      show(key);
      check([...host.querySelectorAll(`.helper-figure[data-helper-stat="${stat}"]`)].some(node => node.textContent === fixed),
        `${key}: fixed value keeps its quantity identity`);
    }
    for (const [key, phrase] of [
      ['weaponMastery', "représente l'art de choisir, porter et exploiter l'équipement de guerre"],
      ['occultism', 'accorde la maîtrise des arts occultes de l’assassinat'],
      ['movement', "améliore les capacités de déplacement de l'entité pendant les combats"],
      ['psionic', "L'intelligence du porteur est telle qu'elle frappe directement l'esprit de la cible"],
      ['fracass', 'Elle fracasse littéralement sa cible'],
      ['extraLife', "L'entité gagne"],
    ]) {
      show(key);
      check(host.textContent.includes(phrase), `${key}: descriptive prose was lost`);
    }
    for (const key of ['vigueur', 'esprit', 'finesse', 'adresse', 'brutality', 'inflexion', 'vivacite', 'constitution', 'integrite',
      'vitality', 'haste', 'indestructibility', 'esoterism', 'mysticism', 'equilibre', 'robustness', 'astrality', 'bloodFury',
      'ambidextry', 'criticalPower', 'resilience', 'hypercognition', 'transcendence', 'occultism', 'movement', 'weaponMastery']) {
      show(key);
      check(key === 'astrality' ? host.querySelector('.helper-figure[data-helper-stat="HP"]') : host.querySelector('[data-umbra-inline-detail]') ? host.textContent.includes(' X :') : host.textContent.includes('•'), `${key}: missing effects`);
      check(!/\b(?:flat|ratio|procure)\b|contribution (?:effective|active)/i.test(host.textContent), `${key}: technical boilerplate remains`);
    }
    const hasteIcons = [
      ['cooldownTime', 'cooldown-haste', 'cooldownTimeDetail'],
      ['preparationTime', 'preparation-haste', 'preparationTimeDetail'],
      ['executionTime', 'execution-haste', 'executionTimeDetail'],
      ['projectileTime', 'projectile-speed-haste', 'executionRangeTimeDetail'],
      ['recuperationTime', 'recuperation-haste', 'recoveryTimeDetail'],
    ];
    for (const [stat, icon, detailKey] of hasteIcons) {
      show('haste');
      const labelIcon = host.querySelector(`[data-helper-effect="${icon}"]`)?.previousElementSibling;
      const resultIcon = host.querySelector(`.helper-calculation-result .picto-stat.${icon}`);
      const resultStat = 'haste';
      check(labelIcon.nextElementSibling.classList.contains(resultStat), `haste: wrong ${icon} heading color class`);
      check(resultIcon.parentElement.dataset.helperStat === resultStat, `haste: wrong ${icon} result color class`);
      check(getComputedStyle(labelIcon.nextElementSibling).color === improvedColor('haste'), `haste: wrong ${icon} heading color`);
      check(getComputedStyle(resultIcon.nextElementSibling).color === 'rgb(2, 255, 230)', `haste: wrong ${icon} final value color`);
      for (const picto of [labelIcon, resultIcon]) {
        if (picto === labelIcon && picto.dataset.helperUmbraSource === 'haste') {
          check(picto.classList.contains('haste'), `haste: heading identifies its Umbra`);
          continue;
        }
        check(picto?.classList.contains(icon), `haste: missing ${icon} on label/result`);
        check(getComputedStyle(picto).backgroundImage.includes(`picto-${icon}.svg`), `haste: wrong ${icon} asset`);
      }
      const asset = new Image();
      asset.src = getComputedStyle(resultIcon).backgroundImage.slice(5, -2);
      await asset.decode();
      check(asset.naturalWidth > 0, `haste: cannot decode ${icon}`);
      for (const key of [stat, detailKey]) {
        show(key);
        const source = key === stat
          ? host.querySelector('.helper-figure[data-helper-stat="haste"] > .picto-stat.haste')
          : host.querySelector(`[data-helper-effect="${stat}"]`)?.previousElementSibling;
        check(source?.classList.contains('haste'), `${key}: source identifies the Haste Umbra`);
        if (key === stat) check(getComputedStyle(source.nextElementSibling).color === 'rgb(2, 255, 230)',
          `${key}: Haste contribution keeps its stat color`);
        else check(source.dataset.helperUmbraSource === 'haste', `${key}: timing group identifies its Umbra source`);
        check(host.querySelector(`.helper-calculation-result .picto-stat.${stat}`), `${key}: total keeps its timing icon`);
      }
    }
    show('haste');
    const preparationHeading = host.querySelector('[data-helper-effect="preparation-haste"]');
    check(preparationHeading.textContent === 'Préparation +' && getComputedStyle(preparationHeading).color === improvedColor('haste'),
      'Haste preparation heading must use Haste color');
    const preparationResult = host.querySelector('.helper-calculation-result .helper-figure[data-helper-stat="haste"]');
    check(getComputedStyle(preparationResult.lastElementChild).color === 'rgb(2, 255, 230)', 'Haste preparation bonus must use Haste color');
    const preparationLabel = host.querySelector('[data-helper-effect="preparationTime-colo"]');
    check(preparationLabel.textContent === 'durée de préparation' && getComputedStyle(preparationLabel).color === 'rgb(196, 255, 156)',
      'Preparation duration must retain its own color');
    const preparationAsset = new Image();
    const preparationBackground = getComputedStyle(preparationLabel.previousElementSibling).backgroundImage;
    check(preparationBackground.includes('picto-preparationTime-colo.svg'), 'Preparation duration needs its colored icon');
    preparationAsset.src = preparationBackground.slice(5, -2);
    await preparationAsset.decode();
    check(preparationAsset.naturalWidth > 0, 'Colored preparation icon must load');
    check(host.textContent.includes("La durée de préparation des attaques de l'entité est réduite de"),
      'Haste preparation must retain the requested sentence');
    for (const [stat, text, color] of [
      ['cooldownTime', 'délai avant de pouvoir relancer ses attaques', 'rgb(247, 243, 170)'],
      ['executionTime', "durée d'exécution", 'rgb(239, 189, 189)'],
      ['projectileTime', 'vitesse des projectiles', 'rgb(255, 231, 186)'],
      ['recuperationTime', 'durée de récupération', 'rgb(181, 223, 242)'],
    ]) {
      const icon = stat === 'cooldownTime' ? stat : `${stat}-colo`;
      const label = host.querySelector(`[data-helper-effect="${icon}"]`);
      check(label?.textContent === text && getComputedStyle(label).color === color, `${stat}: phrase uses timing color`);
      const background = getComputedStyle(label.previousElementSibling).backgroundImage;
      check(background.includes(`picto-${icon}.svg`), `${stat}: phrase uses the existing colored icon`);
      const asset = new Image();
      asset.src = background.slice(5, -2);
      await asset.decode();
      check(asset.naturalWidth > 0, `${stat}: colored icon must load`);
    }
    check(host.textContent.includes("La vitesse des projectiles de l'entité est augmentée de"),
      'Haste projectile speed is an increase, not an equivalent travel-time reduction');
    const preparationDetail = preparationResult.closest('.helper-calculation').querySelector('.helper-calculation-detail');
    for (const [stat, color] of [['haste', 'rgb(2, 255, 230)'], ['intelligence', 'rgb(0, 152, 255)']]) {
      check(getComputedStyle(preparationDetail.querySelector(`.helper-figure[data-helper-stat="${stat}"] > span:last-child`)).color === color,
        `Haste preparation: ${stat} contribution must retain its own color`);
    }
    show('executionRangeTimeDetail');
    for (const stat of ['executionTime', 'projectileTime']) {
      const label = host.querySelector(`[data-helper-effect="${stat}"]`);
      check(label?.previousElementSibling?.dataset.helperUmbraSource === 'haste',
        `Ranged execution keeps its independent ${stat} Haste contribution`);
    }

    // A formula must use the same baseline as the existing inline pictogram markup.
    const inlineIcons = ['strength', 'agility', 'intelligence', 'bloodFury', 'bloodThirsty', 'bloodCrazy', 'bloodGlutony',
      'bloodFuryExecutionChance', 'bloodFuryTargetThreshold', 'bloodFuryExecutionDamage', 'hypercognition', 'ambidextry',
      'weaponMastery', ...hasteIcons.map(([stat, icon]) => `${stat} ${icon}`)];
    for (const context of ['stat-hover', 'Game-helper stat-hover']) {
      host.className = context;
      host.style.cssText = 'position:relative;width:380px;min-width:0;max-width:none';
      for (const icon of inlineIcons) {
        host.innerHTML = `<span class="picto-stat ${icon}"></span><span>23 %</span>
          <span class="helper-calculation"><span class="helper-calculation-result"><span class="helper-figure">
          <span class="picto-stat ${icon}"></span><span>23 %</span></span></span></span>`;
        const [plain, formula] = host.querySelectorAll('.picto-stat');
        check(getComputedStyle(plain).verticalAlign === getComputedStyle(formula).verticalAlign,
          `${context}/${icon}: formula overrides existing alignment`);
        check(Math.abs(plain.getBoundingClientRect().top - formula.getBoundingClientRect().top) < .5,
          `${context}/${icon}: formula pictogram is vertically shifted`);
      }
    }
    host.remove();
    return checked;
  }, snapshot);
  console.log(`PASS: ${presentationChecks} effect-icon, bonus-aura, prose and neutral-value checks`);
  await page.locator('#armor-bars-regression').screenshot({ path: resolve(output, 'armor-bars-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#armor-bars-regression').screenshot({ path: resolve(output, 'armor-bars-mobile.png') });
  const layeredChecks = await page.evaluate(async () => {
    const D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const Rules = await import("/js/entities/rules.js");
    const UI = await import("/js/ui/statistics/components.js"), _UI4 = await import("/js/ui/statistics/helpers.js");
    const H = await import('/js/data/helpers.js');
    const { stats } = await import('/js/data/statsData.js');
    const { balanceData } = await import('/js/data/balanceData.js');
    let checks = 0;
    const check = (value, message) => { if (!value) throw new Error(message); checks++; };
    const values = Object.fromEntries(stats.filter(stat => stat.nature === 'umbra').map(stat => [stat.key, 25]));
    Object.assign(values, { strength: 10, intelligence: 10, agility: 0, physicalDamage: 12,
      magicalDamage: 8, HP: { current: 80, max: 100 }, hypercognition: 1 });
    const entity = { id: 987190, name: 'Umbra layers', side: 'A', stats: values, baseStats: structuredClone(values) };
    const before = JSON.stringify(entity);
    const host = document.createElement('div');
    for (const stat of stats.filter(stat => stat.nature === 'umbra')) {
      const computed = D.calculateStatsDisplay(stat.key, entity);
      const models = computed.umbraHelperCalculations || {};
      check(Object.keys(models).length > 0, `${stat.key}: missing layered calculations`);
      host.innerHTML = computed.helpContent;
      const links = [...host.querySelectorAll('[data-umbra-calculation]')];
      for (const model of Object.values(models)) for (const [index, part] of model.parts.entries()) {
        if (!part.fixed && !part.compact && !part.progression && !part.curvePreview && !part.arithmetic && !part.calculation) check(H.buildUmbraContributionHelper(model, index) === '', `${stat.key}: unfinished nonlinear sources expose no invented ratio`);
      }
      for (const link of links) {
        const model = models[link.dataset.umbraCalculation];
        const index = Number(link.dataset.umbraPart);
        check(!!model?.parts[index], `${stat.key}: broken contribution link`);
        const part = model.parts[index];
        check(Number.isFinite(Number(part.value)), `${stat.key}: nonfinite contribution`);
        check(part.formula?.length > 0, `${stat.key}: missing underlying calculation`);
        if (!part.note) {
          const expression = part.formula.map(token => typeof token === 'string' ? token : Number(token.value)).join(' ');
          check(/^[\d\s.eE+*/(),<>=!?:&|^-]+$/.test(expression.replace(/min|max|exp|pow|sqrt|floor|ceil|round/g, '')),
            `${stat.key}: calculation contains something other than numbers and math`);
          const evaluate = new Function('min', 'max', 'exp', 'pow', 'sqrt', 'floor', 'ceil', 'round', `return (${expression});`);
          const raw = evaluate(Math.min, Math.max, Math.exp, Math.pow, Math.sqrt, Math.floor, Math.ceil, Math.round);
          check(Number.isFinite(raw) && Math.abs(raw - part.value) < 1.01,
            `${stat.key}/${link.dataset.umbraCalculation}/${index}: formula ${raw} does not explain ${part.value}`);
        }
        const html = H.buildUmbraContributionHelper(model, index);
        check(!/NaN|undefined|Infinity/.test(html), `${stat.key}: invalid sub-helper`);
        const probe = document.createElement('div');
        probe.innerHTML = html;
        check(!probe.querySelector('[data-umbra-calculation]'), 'No recursive sub-helpers');
        check(!probe.querySelector('.helper-calculation-result'), 'Sub-helper does not repeat its parent contribution');
        if (!part.arithmetic && !part.calculation) check(!/[()]/.test(probe.textContent), 'Simple products have no unnecessary parentheses');
        if (part.arithmetic) {
          const terms = part.arithmetic.terms.filter(term => typeof term === 'object');
          const figures = [...probe.querySelectorAll('.helper-figure')];
          check(terms.length === figures.length, 'Arithmetic details show exactly the selected source terms');
          for (const [i, term] of terms.entries()) {
            check(!!figures[i].querySelector('.picto-stat') === (term.icon !== null), 'Only source stats have icons, not coefficients or constants');
            check(figures[i].dataset.helperStat === term.stat, 'Arithmetic terms retain their own stat colors');
          }
        }
        check(!/min\(|max\(|pow\(|exp\(|floor\(|ceil\(|sqrt\(/.test(probe.textContent), 'No nested engine expressions in sub-helpers');
        const compactFigures = [...probe.querySelectorAll('.helper-figure')];
        const showsRoundedResult = part.compact?.source && part.rounded
          && Math.abs(part.compact.source.value * part.compact.multiplier.value - part.value) > .000001;
        check(compactFigures.length <= (part.calculation ? 7 : part.progression || part.curvePreview || part.arithmetic ? 4 : showsRoundedResult ? 3 : 2),
          `${stat.key}/${link.dataset.umbraCalculation}/${index}: only the selected contribution and its rounding are shown`);
        if (part.progression) {
          check(!/×/.test(probe.textContent), 'Milestones do not invent a multiplier');
          const outputStat = part.progression.stat || model.stat;
          check(compactFigures[0].dataset.helperStat === part.stat, 'Milestone points keep the source color');
          check(compactFigures[1].dataset.helperStat === outputStat, 'Milestone quantities keep the output color');
          check(compactFigures[1].querySelector(`.picto-stat.${part.progression.icon || outputStat}`), 'Milestone quantities use their output pictogram');
        }
        if (part.curvePreview) {
          check(!/×|Prochain palier/.test(probe.textContent), 'Continuous curves expose neither a multiplier nor a milestone');
          check(compactFigures.every(figure => figure.dataset.helperStat === part.stat), 'The curve contribution retains its source color');
          check(compactFigures.filter(figure => figure.querySelector('.picto-stat')).length === 1, 'Only the current curve input has a pictogram');
          check(!/Maximum\s*:/.test(probe.textContent), 'Future maxima are never displayed');
          check(!probe.textContent.includes('Max atteint'), 'Reached caps have no helper marker');
          check(!compactFigures[1].querySelector('.picto-stat') && !compactFigures.at(-1).querySelector('.picto-stat'), 'Percentages have no duplicate input icon');
        }
        if (part.compact?.source) {
          check(compactFigures[0].querySelector('.picto-stat'), 'The source keeps its pictogram');
          check(!compactFigures[1].querySelector('.picto-stat'), 'The coefficient is a colored number without a pictogram');
          const expectedColor = part.compact.multiplier.stat === 'neutral' ? part.compact.source.stat : part.compact.multiplier.stat;
          check(compactFigures[1].dataset.helperStat === expectedColor, 'The coefficient uses its associated stat color');
        }
        if (part.compact?.source && !part.note) {
          const source = part.compact.source;
          const multiplier = part.compact.multiplier;
          check(Math.abs(source.value * multiplier.value - part.value) < 1.01,
            `${stat.key}: true product precedes the engine rounding`);
          check(compactFigures[0].dataset.helperStat === source.stat, `${stat.key}: compact input color`);
          check(Math.abs(parseFloat(compactFigures[1].textContent.trim()) * source.value - source.value * multiplier.value) < .01,
            `${stat.key}: displayed coefficient preserves the unrounded product`);
          const changedResult = structuredClone(model);
          changedResult.parts[index].value += 123;
          const changedProbe = document.createElement('div');
          changedProbe.innerHTML = H.buildUmbraContributionHelper(changedResult, index);
          const changedFigures = [...changedProbe.querySelectorAll('.helper-figure')];
          check(changedFigures.slice(0, 2).every((figure, i) => figure.outerHTML === compactFigures[i].outerHTML),
            'Changing a rounded result cannot change its input or coefficient');
        }
        for (const figure of probe.querySelectorAll('.helper-figure')) {
          check(figure.querySelector(`:scope > span.${CSS.escape(figure.dataset.helperStat)}`), `${stat.key}: source color lost`);
        }
      }
    }
    check(JSON.stringify(entity) === before, 'Layered helpers must not mutate entity data');
    for (const points of [0, 1, 150, 300]) {
      const edge = structuredClone(entity);
      for (const stat of stats.filter(stat => stat.nature === 'umbra')) edge.stats[stat.key] = points;
      Object.assign(edge.stats, { strength: points, intelligence: points, agility: points });
      edge.baseStats = structuredClone(edge.stats);
      const untouched = JSON.stringify(edge);
      for (const stat of stats.filter(stat => stat.nature === 'umbra')) {
        const computed = D.calculateStatsDisplay(stat.key, edge);
        for (const [key, model] of Object.entries(computed.umbraHelperCalculations || {})) {
          check(Number.isFinite(Number(model.value)), `${stat.key}/${points}: nonfinite total`);
          for (const part of model.parts) {
            check(Number.isFinite(Number(part.value)), `${stat.key}/${points}: nonfinite contribution`);
            check(!/NaN|Infinity/.test(H.buildUmbraContributionHelper(model, model.parts.indexOf(part))), 'Zero and capped sources remain finite');
            if (part.note) continue;
            const expression = part.formula.map(token => typeof token === 'string' ? token : Number(token.value)).join(' ');
            const evaluate = new Function('min', 'max', 'exp', 'pow', 'sqrt', 'floor', 'ceil', 'round', `return (${expression});`);
            const raw = evaluate(Math.min, Math.max, Math.exp, Math.pow, Math.sqrt, Math.floor, Math.ceil, Math.round);
            check(Number.isFinite(raw) && Math.abs(raw - part.value) < 1.01,
              `${stat.key}/${key}/${part.stat}/${points}: formula ${raw} does not explain ${part.value}`);
          }
        }
      }
      check(JSON.stringify(edge) === untouched, 'Boundary details must remain read-only');
    }
    const { calculateHypercognitionEssenceCount } = await import("/js/items/essenceInventory.js");
    const essenceConfig = balanceData.hypercognition.essences;
    const essenceStateBefore = JSON.stringify(essenceConfig);
    for (const points of [-1, .5, 15.2, 99.5, 124.9, ...Array.from({ length: 301 }, (_, index) => index)]) {
      const probe = { stats: { hypercognition: points, intelligence: 6 } };
      const probeBefore = JSON.stringify(probe);
      const computed = D.calculateStatsDisplay('hypercognition', probe);
      const model = computed.umbraHelperCalculations.hypercognitionEssences;
      const progression = model.parts[0].progression;
      const count = calculateHypercognitionEssenceCount(points);
      check(progression.current.points === points && progression.current.count === count, `Cognitive milestone reads the actual value/count at ${points}`);
      check(computed.hypercognitionEssences === count && count <= 10, `Cognitive reward count and cap are unchanged at ${points}`);
      let next = null;
      for (let candidate = Math.max(1, Math.floor(points) + 1); candidate <= Math.ceil(essenceConfig.maxCount / essenceConfig.ratio); candidate++) {
        const candidateCount = calculateHypercognitionEssenceCount(candidate);
        if (candidateCount > count) { next = { points: candidate, count: candidateCount }; break; }
      }
      check(JSON.stringify(progression.next) === JSON.stringify(next), `First whole-point cognitive milestone at ${points}`);
      const html = H.buildUmbraContributionHelper(model, 0);
      check(html.includes(`Palier ${count} :`) && !/Prochain palier|Maximum atteint/.test(html), `Only the current cognitive milestone at ${points}`);
      check(count === 0 ? progression.threshold === 0
        : calculateHypercognitionEssenceCount(progression.threshold) === count
          && calculateHypercognitionEssenceCount(progression.threshold - 1) < count, 'The cognitive threshold comes from the actual generation rule');
      check(JSON.stringify(probe) === probeBefore, 'Reading milestones never mutates the entity or its inventory');
    }
    for (const [points, count, nextPoints, nextCount] of [[0, 0, 1, 1], [1, 1, 39, 2], [99, 6, 110, 7],
      [100, 6, 110, 7], [124, 8, 137, 9], [125, 8, 137, 9], [149, 9, 150, 10], [150, 10, null, null]]) {
      const progression = D.calculateStatsDisplay('hypercognition', { stats: { hypercognition: points } })
        .umbraHelperCalculations.hypercognitionEssences.parts[0].progression;
      check(progression.current.count === count, `Approved cognitive count at ${points}`);
      check((progression.next?.points ?? null) === nextPoints && (progression.next?.count ?? null) === nextCount,
        `Approved cognitive next threshold at ${points}`);
    }
    check(JSON.stringify(essenceConfig) === essenceStateBefore, 'Milestone reads preserve every balance setting');
    const previousRatio = essenceConfig.ratio;
    try {
      essenceConfig.ratio *= 2;
      const progression = D.calculateStatsDisplay('hypercognition', { stats: { hypercognition: 80 } })
        .umbraHelperCalculations.hypercognitionEssences.parts[0].progression;
      check(progression.current.count === calculateHypercognitionEssenceCount(80) && progression.next.count > progression.current.count,
        'Milestones read the live engine configuration, not hard-coded thresholds');
    } finally { essenceConfig.ratio = previousRatio; }
    const { calculateTranscendenceExtraLife } = await import("/js/entities/runtime.js");
    const lifeConfig = balanceData.generatedStats.transcendenceExtraLife;
    const lifeStateBefore = JSON.stringify(lifeConfig);
    for (const points of [-1, .1, .5, 5.4, 57.9, 89.9, 149.9, 1000, ...Array.from({ length: 301 }, (_, index) => index)]) {
      const probe = { stats: { transcendence: points, intelligence: 6, extraLife: { current: 0, max: 4 } } };
      const probeBefore = JSON.stringify(probe);
      const computed = D.calculateStatsDisplay('transcendence', probe);
      const model = computed.umbraHelperCalculations.transcendenceExBonus;
      const progression = model.parts[0].progression;
      const count = calculateTranscendenceExtraLife(points);
      check(progression.current.points === points && progression.current.count === count,
        `Transcendence milestone reads the actual value/count at ${points}`);
      check(computed.transcendenceExBonus === count && model.value === count && count <= 7,
        `Transcendence rounding and cap are unchanged at ${points}`);
      let next = null;
      for (let candidate = Math.max(1, Math.floor(points) + 1); candidate <= lifeConfig.capPoints; candidate++) {
        const candidateCount = calculateTranscendenceExtraLife(candidate);
        if (candidateCount > count) { next = { points: candidate, count: candidateCount }; break; }
      }
      check(JSON.stringify(progression.next) === JSON.stringify(next), `First whole-point Transcendence milestone at ${points}`);
      const html = H.buildUmbraContributionHelper(model, 0);
      check(html.includes(`Palier ${count} :`) && !/Prochain palier|Maximum atteint/.test(html), `Only the current Transcendence milestone at ${points}`);
      check(count === 0 ? progression.threshold === 0
        : calculateTranscendenceExtraLife(progression.threshold) === count
          && calculateTranscendenceExtraLife(progression.threshold - 1) < count, 'The life threshold comes from the actual generation rule');
      check(!/essence-hyperco|hyperco|×/.test(html), 'Life milestones use neither essence icons nor invented multipliers');
      check(JSON.stringify(probe) === probeBefore, 'Reading life milestones never grants or consumes lives');
    }
    for (const [points, count, nextPoints, nextCount] of [[0, 0, 1, 1], [1, 1, 6, 2], [6, 2, 17, 3],
      [17, 3, 34, 4], [34, 4, 58, 5], [50, 4, 58, 5], [57, 4, 58, 5], [58, 5, 90, 6],
      [89, 5, 90, 6], [90, 6, 150, 7], [149, 6, 150, 7], [150, 7, null, null]]) {
      const progression = D.calculateStatsDisplay('transcendence', { stats: { transcendence: points } })
        .umbraHelperCalculations.transcendenceExBonus.parts[0].progression;
      check(progression.current.count === count && (progression.next?.points ?? null) === nextPoints
        && (progression.next?.count ?? null) === nextCount, `Approved Transcendence thresholds at ${points}`);
    }
    check(JSON.stringify(lifeConfig) === lifeStateBefore, 'Life milestones preserve every balance setting');
    const originalLifeExponent = lifeConfig.exponent;
    try {
      lifeConfig.exponent = 1;
      const progression = D.calculateStatsDisplay('transcendence', { stats: { transcendence: 50 } })
        .umbraHelperCalculations.transcendenceExBonus.parts[0].progression;
      check(progression.current.count === 2 && progression.next.points === 54 && progression.next.count === 3,
        'Life milestones follow the live curve and its rounding, not hard-coded thresholds');
    } finally { lifeConfig.exponent = originalLifeExponent; }
    const protectionConfig = balanceData.transcendence.consoProtection;
    const protectionBefore = { ...protectionConfig };
    for (const transcendence of [0, 1, 150]) for (const intelligence of [-1, 0, .5, 6, 30, 75, 149.9, 150, 151, 300]) {
      const probe = { stats: { transcendence, intelligence } };
      const before = JSON.stringify(probe);
      const computed = D.calculateStatsDisplay('transcendence', probe);
      const model = computed.umbraHelperCalculations.transcendenceConsoProtectionPercent;
      const part = model.parts[1];
      const curve = part.curvePreview;
      const expected = transcendence > 0 ? D.transcendenceConsoIntel(probe) : 0;
      const maximum = transcendence > 0 ? D.transcendenceConsoIntel({ stats: { intelligence: protectionConfig.intelligenceCap } }) : 0;
      check(curve.current.points === intelligence && curve.current.value === expected && part.value === expected,
        `Transcendence Intelligence reads its actual rounded contribution at ${transcendence}/${intelligence}`);
      check(curve.maximum.points === protectionConfig.intelligenceCap && curve.maximum.value === maximum,
        'The maximum respects the live engine cap and inactive Umbra state');
      check(model.value === D.calculateTranscendenceConsoProtectionTotal(probe), 'The displayed total remains the combat total');
      check(JSON.stringify(probe) === before, 'The curve preview never mutates entity stats');
      check(H.buildUmbraContributionHelper(model, 1).includes('Bonus inactif.') === (transcendence <= 0), 'Inactive contributions keep their existing explanation');
    }
    const frozenProtection = D.calculateStatsDisplay('transcendence', {
      archetypeFrozen: true, stats: { transcendence: 150, intelligence: 30 },
    }).umbraHelperCalculations.transcendenceConsoProtectionPercent;
    check(frozenProtection.value === 0 && frozenProtection.parts[1].curvePreview.current.value === 0
      && frozenProtection.parts[1].curvePreview.maximum.value === 0, 'Frozen entities receive no hypothetical active protection');
    for (const [points, expected] of [[0, 0], [6, .39], [30, 1.8], [150, 5], [300, 5]]) {
      const model = D.calculateStatsDisplay('transcendence', { stats: { transcendence: 150, intelligence: points } })
        .umbraHelperCalculations.transcendenceConsoProtectionPercent;
      check(model.parts[1].curvePreview.current.value === expected, `Approved rounded curve contribution at ${points}`);
    }
    check(JSON.stringify(protectionConfig) === JSON.stringify(protectionBefore), 'Curve reads preserve the protection configuration');
    try {
      Object.assign(protectionConfig, { intelligenceCap: 200, intelligenceMaxPercent: 8, curvePower: 3, maxPercent: 4 });
      const model = D.calculateStatsDisplay('transcendence', { stats: { transcendence: 150, intelligence: 30 } })
        .umbraHelperCalculations.transcendenceConsoProtectionPercent;
      check(model.parts[1].curvePreview.current.value === 3.09
        && model.parts[1].curvePreview.maximum.points === 200 && model.parts[1].curvePreview.maximum.value === 8,
        'The curve preview reads the source coefficients, rounding and cap independently of the combined chance');
      check(model.value === 4, 'The combined chance remains capped by gameplay');
    } finally { Object.assign(protectionConfig, protectionBefore); }
    // Astralité now shares the progressive ratios and single capped chance.
    // Runtime, pause restoration and cards are covered by verify-astrality-browser.
    const astralityRules=globalThis.umbraProgression;
    for(const astrality of [0,1,50,150,300])for(const intelligence of [0,30,150]){
      const probe={stats:{astrality,intelligence,strength:30,HP:{current:100,max:100}}};
      const before=JSON.stringify(probe),shown=D.calculateStatsDisplay('astrality',probe);
      check(shown.umbraHelperCalculations.astralityTotal.value===D.calculateAstralityTotal(probe),'Astrality helper matches combat chance');
      check(shown.astralBody.seconds===D.calculateAstralBody(probe).seconds,'Astral duration matches combat');
      check(shown.helpContent.includes('data-umbra-capacity="astralReturn"'),'Return is explained on the card');
      check(JSON.stringify(probe)===before,'Reading Astrality does not mutate the entity');
    }
    check(astralityRules.astralityChanceDetails(1).value===1,'First point gives exactly 1%');
    // Équilibre now uses progressive direct percentages: covered by verify-equilibre.mjs and verify-equilibre-browser.mjs.
    const curveCases = [
      ['mysticism', 'mysticismProcChance', 'intelligence', 'proc', 'calculateMysticismIntelProcChance', 'calculateMysticismProcChance', 5.4, 15],
      ['mysticism', 'mysticismTranceDuration', 'intelligence', 'trance', 'calculateMysticismIntelTranceDuration', 'calculateMysticismTranceDuration', 4.88, 10, ' s', 1000],
      ['mysticism', 'mysticismPreparationAcceleration', 'intelligence', 'preparation', 'calculateMysticismIntelPreparationAcceleration', 'calculateMysticismPreparationAcceleration', 36, 100],
      ['mysticism', 'mysticismDamageBonus', 'intelligence', 'damage', 'calculateMysticismIntelDamageBonus', 'calculateMysticismTotalDamageBonus', 18, 50],
      ['occultism', 'occultismInvisibilityChance', 'agility', 'invisibility', 'calculateOccultismAgiInvisibilityChance', 'calculateOccultismInvisibilityChance', 5.4, 15],
      ['occultism', 'occultismTargetableChance', 'agility', 'targetable', 'calculateOccultismAgiTargetableChance', 'calculateOccultismTargetableChance', 3.6, 10],
      ['occultism', 'occultismDodgeBonus', 'agility', 'dodge', 'calculateOccultismAgiDodgeBonus', 'calculateOccultismDodgeBonus', 9, 25, ''],
      ['occultism', 'occultismCritChanceBonus', 'agility', 'critical', 'calculateOccultismAgiCritChanceBonus', 'calculateOccultismCritChanceBonus', 9, 25],
    ];
    window.__umbraCurveCases = [];
    for (const [stat, key, source, section, contributionFn, totalFn, example, maximum, unit = ' %', divisor = 1] of curveCases) {
      const config = balanceData[stat][section];
      const original = { ...config };
      const index = section === 'critical' ? 0 : 1;
      const getModel = probe => D.calculateStatsDisplay(stat, probe).umbraHelperCalculations[key];
      for (const points of [-1, 0, 1, 150]) for (const attribute of [-1, 0, .5, 6, 30, 149.9, 150, 151, 300]) {
        const probe = { stats: { [stat]: points, [source]: attribute } };
        const before = JSON.stringify(probe);
        const model = getModel(probe);
        const part = model.parts[index];
        const expected = D[contributionFn](probe) / divisor;
        const limit = config[`${source}Target`];
        const expectedMaximum = D[contributionFn]({ stats: { [stat]: points, [source]: limit } }) / divisor;
        check(part.curvePreview.current.points === attribute && part.curvePreview.current.value === expected
          && part.value === expected, `${key}: the current contribution matches its rounded engine calculation`);
        check(part.curvePreview.maximum.points === limit && part.curvePreview.maximum.value === expectedMaximum,
          `${key}: the maximum follows the engine cap and inactive state`);
        check(part.unit === unit && model.value === D[totalFn](probe) / divisor, `${key}: display units and total match combat`);
        check(H.buildUmbraContributionHelper(model, index).includes('Bonus inactif.') === (points <= 0),
          `${key}: inactive contributions retain their explanation`);
        if (index === 1) {
          const fixed = H.buildUmbraContributionHelper(model, 0);
          check(model.parts[0].fixed && fixed.includes('neutral') && !/×|→/.test(fixed), `${key}: the fixed base has a neutral detail without an invented ratio`);
        }
        check(JSON.stringify(probe) === before, `${key}: a preview never mutates the entity`);
      }
      const model = getModel({ stats: { [stat]: 25, [source]: 30 } });
      check(model.parts[index].curvePreview.current.value === example && model.parts[index].curvePreview.maximum.value === maximum,
        `${key}: the 30-point example and maximum remain exact`);
      const frozen = getModel({ archetypeFrozen: true, stats: { [stat]: 25, [source]: 30 } });
      check(frozen.value === 0 && frozen.parts[index].curvePreview.current.value === 0
        && frozen.parts[index].curvePreview.maximum.value === 0, `${key}: frozen entities receive no hypothetical active bonus`);
      check(JSON.stringify(config) === JSON.stringify(original), `${key}: reading details leaves balance unchanged`);
      try {
        const maxField = section === 'trance' ? 'intelligenceMaxSeconds' : `${source}MaxBonusPercent`;
        Object.assign(config, { [`${source}Target`]: 200, [maxField]: 12.345, curvePower: 3 });
        if ('decimals' in config) config.decimals = 1;
        const probe = { stats: { [stat]: 25, [source]: 40 } };
        const changed = getModel(probe);
        check(changed.parts[index].curvePreview.current.value === D[contributionFn](probe) / divisor
          && changed.parts[index].curvePreview.maximum.points === 200
          && changed.parts[index].curvePreview.maximum.value === D[contributionFn]({ stats: { [stat]: 25, [source]: 200 } }) / divisor,
          `${key}: changed coefficients, curve, rounding and cap are read live`);
        check(changed.value === D[totalFn](probe) / divisor, `${key}: dynamic totals remain the combat totals`);
      } finally { Object.assign(config, original); }
      window.__umbraCurveCases.push({ stat, key, source, index, example, maximum, unit });
    }
    const occultismModels = D.calculateStatsDisplay('occultism', { stats: { occultism: 25, agility: 30 } }).umbraHelperCalculations;
    for (const key of ['occultismPreparationSpeedDebuff', 'occultismShadowFragilityPercent']) {
      check(occultismModels[key].parts[0].fixed && !/×|→/.test(H.buildUmbraContributionHelper(occultismModels[key], 0)),
        'Fixed Occultism drawbacks expose their existing value without a ratio');
    }
    const E = await import("/js/entities/runtime.js");
    const completedCurves = [
      ['vitality', 'vitalityBonus', 0, e => E.calculateVitalityBonus(e.stats.vitality)],
      ['haste', 'hastePreparation', 0, e => E.calculateHastePercent(e.stats.haste)],
      ['haste', 'hasteProjectilSpeed', 0, D.calculateHasteProjectilSpeed],
      ['criticalPower', 'critTotalChance', 1, e => E.calculateCritChancePercent(e.stats.criticalPower)],
      ['criticalPower', 'critDamageBonus', 2, D.calculateCritRatioBonus],
      ['indestructibility', 'indestructibilityBonus', 0, D.calculateIndestructibilityPercentFromEntity],
      ['indestructibility', 'hpBattleRegenPercent', 1, D.calculateHpBattleRegenIndestructibilityRatio],
      ['resilience', 'resilienceCritTotalBonus', 0, e => E.calculateResiliencePercent(e.stats.resilience)],
      ['resilience', 'resilienceAlteTotalBonus', 0, D.calculateResilienceAlterationBonus],
      ['resilience', 'resilienceAlteTotalBonus', 1, D.calculateResilienceIntelligenceAlterBonus],
      ['resilience', 'resilienceTotalCancelBonus', 0, D.calculateResilienceCancelBonus],
      ['precision', 'precisionBonus', 0, e => E.calculatePrecisionPercent(e.stats.precision)],
      ['ambidextry', 'ambidextryTotalChance', 0, D.calculateAmbidextryProcBonus],
      ['ambidextry', 'ambidextryDamageBonus', 1, D.calculateAmbidextryRatioBonus],
      ['esoterism', 'esoterismBonus', 0, D.calculateEsoterismChance],
      ['esoterism', 'esoterismTotalReduction', 1, D.calculateEsoterismAgiRatio],
      ['movement', 'movementStartingTotalCurrent', 1, e => D.calculateMovementStartingChargeDetails(e).agiRatioCurrent],
    ];
    for (const [stat, key, index, calculate] of completedCurves) for (const points of [1, 12, 25, 150, 300]) {
      const probe = { stats: { [stat]: points, strength: points, intelligence: points, agility: points } };
      const before = JSON.stringify(probe);
      const model = D.calculateStatsDisplay(stat, probe).umbraHelperCalculations[key];
      const part = model.parts[index];
      if (['ambidextry', 'esoterism'].includes(stat)) {
        check(part.value === calculate(probe), `${key}: progressive contribution agrees with combat`);
        check(!part.rounded && !!part.compact && !part.curvePreview, `${key}: uses an exact progressive ratio`);
        check(JSON.stringify(probe) === before, 'Ambidextrie helper is read-only');
        continue;
      }
      check(part.curvePreview.current.value === calculate(probe), `${stat}/${key}: displayed curve reads the actual engine value at ${points}`);
      check(part.rounded && !/×|Prochain palier/.test(H.buildUmbraContributionHelper(model, index)),
        `${stat}/${key}: rounded curves never invent a linear ratio`);
      check(JSON.stringify(probe) === before, 'Completing curve details never alters entity state');
    }
    for (const movement of [0, 1, 10]) for (const agility of [-1, 0, 1, 30, 149.9, 150, 300]) {
      const probe = { stats: { movement, agility } };
      const before = JSON.stringify(probe);
      const shown = D.calculateStatsDisplay('movement', probe);
      const model = shown.umbraHelperCalculations.movementStartingTotalCurrent;
      const part = model.parts[1];
      const actual = D.calculateMovementStartingChargeDetails(probe);
      const detail = document.createElement('div');
      detail.innerHTML = H.buildUmbraContributionHelper(model, 1);
      check(part.curvePreview.current.points === Math.max(0, agility) && part.value === actual.agiRatioCurrent
        && model.value === actual.totalCurrent, 'Starting reserve shows the actual rounded Agility contribution');
      check(!part.curvePreview.maximum && !/Maximum|Max atteint|palier|×/.test(detail.textContent),
        'Movement shows only the current contribution, without a maximum or fabricated ratio');
      check(detail.querySelectorAll('.picto-stat.agility').length === 1
        && detail.querySelectorAll('.helper-figure[data-helper-stat="agility"]').length === 2,
        'Movement detail preserves the Agility pictogram and both number colors');
      check(shown.umbraHelperCalculations.movementStartingCharges.value === D.calculateMovementStartingCharges(probe),
        'Starting charges retain the combat rounding');
      if (movement === 10 && agility === 30) {
        check(detail.textContent.trim() === '30 → 32 %' && actual.totalCurrent === 62
          && shown.movementStartingCharges === 7, 'Approved example: 10 Movement and 30 Agility start with 7 charges at 62 percent');
      }
      check(JSON.stringify(probe) === before, 'Movement helper is read-only');
    }
    const movementConfig = balanceData.movement.charges;
    const originalMovementConfig = { ...movementConfig };
    try {
      Object.assign(movementConfig, { startingSoftCapDivider: 80, agilityCap: 200, baseStartingPercent: 20, maxAgilityStartingBonusPercent: 80 });
      const probe = { stats: { movement: 10, agility: 30 } };
      const shown = D.calculateStatsDisplay('movement', probe);
      const actual = D.calculateMovementStartingChargeDetails(probe);
      check(shown.umbraHelperCalculations.movementStartingTotalCurrent.parts[1].curvePreview.current.value === actual.agiRatioCurrent
        && shown.movementStartingCharges === D.calculateMovementStartingCharges(probe),
        'Movement descriptions follow live balance changes without changing the calculation');
    } finally { Object.assign(movementConfig, originalMovementConfig); }
    for (const points of [0, 1, 4, 5, 9, 10, 25, 99, 100, 101, 119, 120, 121, 150, 300]) {
      const probe = { stats: { weaponMastery: points, strength: points, bloodFury: points,
        physicalDamage: 12.7, bloodFuryExecutionDamage: 1.2 } };
      const before = JSON.stringify(probe);
      const models = D.calculateStatsDisplay('weaponMastery', probe).umbraHelperCalculations;
      for (const [key, index, expected] of [
        ['weaponMasteryChargeBonus', 0, E.calculateWeaponMasteryCharge(probe)],
        ['weaponOrfevreBonus', 0, D.calculateWeaponOrfevreWeaponMastery(probe)],
        ['weaponOrfevreBonus', 1, D.calculateWeaponOrfevreStrength(probe)],
        ['weaponMasteryTrophyChance', 0, D.calculateWeaponMasteryTrophyChance(probe)],
      ]) {
        const part = models[key].parts[index];
        check(part.value === expected, `${key}/${points}: the arithmetic source retains its engine value`);
        check(part.arithmetic && H.buildUmbraContributionHelper(models[key], index), `${key}/${points}: the missing detail is now available`);
        const changed = structuredClone(models[key]);
        changed.parts[index].value += 123;
        check(H.buildUmbraContributionHelper(changed, index) === H.buildUmbraContributionHelper(models[key], index),
          `${key}: coefficients never depend on rounded contributions`);
      }
      const damage = D.calculateStatsDisplay('bloodFury', probe).umbraHelperCalculations.bloodFuryExecDamage;
      const coefficient = globalThis.umbraProgression.bloodFuryExecutionDetails(points, points, 12.7).damage.percent / 100;
      check(damage.parts[0].compact.source.value === 12.7 && damage.parts[0].compact.multiplier.value === coefficient,
        'Execution detail uses physical power and the actual engine multiplier');
      check(damage.value === D.calculateExecutionDamage(probe), 'Execution total still matches combat, including rounding');
      check(JSON.stringify(probe) === before, 'Detail reads never alter the entity');
    }
    const masteryCharge = balanceData.weaponMastery.charge;
    const masteryOrfevre = balanceData.weaponOrfevre.fromWeaponMastery;
    const strengthOrfevre = balanceData.weaponOrfevre.fromStrength;
    const trophy = balanceData.weaponMastery.trophy;
    const originalMasterySettings = [masteryCharge, masteryOrfevre, strengthOrfevre, trophy].map(config => ({ ...config }));
    try {
      Object.assign(masteryCharge, { masteryDivisor: 20, masteryBaseBonus: 2 });
      Object.assign(masteryOrfevre, { earlyCap: 50, earlyDivisor: 4, lateDivisor: 8 });
      Object.assign(strengthOrfevre, { earlyCap: 50, earlyDivisor: 5, lateDivisor: 25 });
      Object.assign(trophy, { masteryMaxBonusPercent: 40, masteryRange: 199 });
      for (const points of [25, 75]) {
        const probe = { stats: { weaponMastery: points, strength: points } };
        const models = D.calculateStatsDisplay('weaponMastery', probe).umbraHelperCalculations;
        check(models.weaponMasteryChargeBonus.parts[0].arithmetic.terms[2].value === '0.05', 'Charge detail reads the updated divisor');
        check(Number(models.weaponOrfevreBonus.parts[0].arithmetic.terms.find(term => term.stat === 'weaponMastery' && term.icon === null).value)
          === (points <= 50 ? .25 : .125), 'Orfevre detail switches at the configured Mastery threshold');
        check(Number(models.weaponOrfevreBonus.parts[1].arithmetic.terms.find(term => term.stat === 'strength' && term.icon === null).value)
          === (points <= 50 ? .2 : .04), 'Orfevre detail switches at the configured Strength threshold');
        check(models.weaponMasteryTrophyChance.parts[0].arithmetic.terms.at(-1).value === String(Number((40 / 199).toPrecision(6))),
          'Collector detail retains the actual coefficient precision');
      }
    } finally {
      [masteryCharge, masteryOrfevre, strengthOrfevre, trophy].forEach((config, index) => Object.assign(config, originalMasterySettings[index]));
    }
    host.innerHTML = D.calculateStatsDisplay('ambidextry', entity).helpContent;
    check(host.textContent.startsWith("L'entité est si agile qu'elle peut manier ses deux bras pour attaquer plusieurs fois."),
      'Ambidextry retains the requested introduction before its effects');
    const hyperco = D.calculateStatsDisplay('hypercognition', { stats: { hypercognition: 20, intelligence: 6 } });
    check(hyperco.umbraHelperCalculations.hypercognitionBonus.parts[0].compact.multiplier.value === 1,
      'The direct Hypercognition contribution exposes its actual identity coefficient');
    check(!hyperco.umbraHelperCalculations.hypercognitionBonus.parts[0].rounded
      && hyperco.umbraHelperCalculations.hypercognitionBonus.parts[1].rounded,
      'Rounding is announced for the calculated bonus, not the unchanged Hypercognition input');
    host.innerHTML = hyperco.helpContent;
    check(host.querySelector('[data-umbra-calculation="hypercognitionEssences"]').textContent === '20',
      'Cognitive generator source retains the actual Hypercognition points');
    window.__remainingUmbraDetails = stats.filter(stat => stat.nature === 'umbra').flatMap(stat => {
      const models = D.calculateStatsDisplay(stat.key, entity).umbraHelperCalculations;
      return Object.entries(models).flatMap(([key, model]) => model.parts.flatMap((part, index) =>
        H.buildUmbraContributionHelper(model, index) ? [] : [`${stat.key}/${key}/${index}`]));
    });
    const robust = D.calculateStatsDisplay('robustness', entity);
    check(!!robust.umbraHelperCalculations.armorBonus, 'Robustness has a layered model');
    check(robust.helpContent.includes('data-umbra-calculation="armorBonus"'), 'Robustness sources open the compact calculation');
    for (const source of D.getGeneratedUmbraSourceKeys()) {
      const cfg = D.getGeneratedUmbraStatConfig(source);
      for (const attribute of [0, 6, 30, 60, 90, 300]) {
        const probe = { stats: { [source]: 3, [cfg.attribute]: attribute } };
        const model = D.calculateStatsDisplay(source, probe).umbraHelperCalculations.generatedUmbraSource;
        const system = D.calculateStatsDisplay(source, probe).generatedUmbraSource.system;
        const ratioModel = model.parts.find(part => part.calculation)?.calculation || model;
        const ratios = { parts: ratioModel.parts.filter(part => part.compact) };
        check(model.value === system.value && system.umbraFlat === 0, `${source}: own points are used by the ratio only`);
        check(ratios.parts[0].compact.source.value === 3 && ratios.parts[0].compact.multiplier.value === 1, `${source}: source ratio is one`);
        check(ratios.parts[1].compact.source.value === attribute && ratios.parts[1].compact.multiplier.value === .5, `${source}: real attribute times one half`);
      }
    }
    const integrityConfig = balanceData.generatedUmbraStats.sources.integrite.ratios;
    const originalIntegrityRatios = { ...integrityConfig };
    try {
      Object.assign(integrityConfig, { source: 2, attribute: .25 });
      const probe = { stats: { integrite: 3, intelligence: 6 } };
      const model = D.calculateStatsDisplay('integrite', probe).umbraHelperCalculations.generatedUmbraSource;
      const ratios = model.parts.find(part => part.calculation).calculation;
      check(model.value === Rules.calculateResistanceReductionPercent(8), 'Integrity follows configured coefficients without a target flat');
      check(ratios.parts[0].compact.multiplier.value === 2, 'Integrity source detail follows balance changes');
      check(ratios.parts[1].compact.multiplier.value === .25, 'Intelligence detail follows balance changes');
    } finally { Object.assign(integrityConfig, originalIntegrityRatios); }
    const simpleCases = [
      ['integrite', 'generatedUmbraSource', 0, 'integrite', () => balanceData.generatedUmbraStats.sources.integrite.ratios.source],
      ['integrite', 'generatedUmbraSource', 1, 'intelligence', () => balanceData.generatedUmbraStats.sources.integrite.ratios.attribute],
      ['weaponMastery', 'weaponMasteryChargeBonus', 1, 'strength', () => 1 / balanceData.weaponMastery.charge.strengthDivisor],
      ['weaponMastery', 'weaponMasteryTrophyChance', 1, 'strength', () => balanceData.weaponMastery.trophy.strengthMaxPercent / balanceData.weaponMastery.trophy.strengthCap],
      ['haste', 'hasteCDReduc', 0, 'intelligence', () => balanceData.attackTime.hasteRatios.intelligenceCooldownMaxPercent / balanceData.attackTime.hasteRatios.statCap],
      ['haste', 'hasteExecutionReduc', 0, 'strength', () => balanceData.attackTime.hasteRatios.strengthExecutionMaxPercent / balanceData.attackTime.hasteRatios.statCap],
      ['ambidextry', 'ambidextryTotalChance', 1, 'agility', (_points, probe) => D.ambidextryResult(probe).attribute.compact.multiplier.value],
      ['hypercognition', 'hypercognitionBonus', 1, 'intelligence', points => .5 * globalThis.umbraProgression.getProgressiveRatio(points, 'intelligence', 150)],
    ];
    for (const points of [0, 1, 19, 20, 25, 39, 40, 99]) for (const [stat, key, index, source, coefficient] of simpleCases) {
      const probeEntity = structuredClone(entity);
      probeEntity.stats[source] = points;
      probeEntity.baseStats[source] = points;
      const model = D.calculateStatsDisplay(stat, probeEntity).umbraHelperCalculations[key];
      if (key === 'generatedUmbraSource' && source === stat && points === 0) {
        check(model.value === 0, `${stat}: inactive Umbra grants no generated stat`);
        continue;
      }
      const ratioModel = key === 'generatedUmbraSource' ? model.parts.find(part => part.calculation)?.calculation || model : model;
      const part = ratioModel.parts[index];
      check(part.compact.source.value === points, `${stat}/${points}: actual input`);
      check(Math.abs(part.compact.multiplier.value - coefficient(points, probeEntity)) < 1e-12, `${stat}/${points}: coefficient comes from balance, independent of rounding`);
      if (stat === 'weaponMastery' && key === 'weaponMasteryChargeBonus') {
        check(part.value === Math.floor(points / balanceData.weaponMastery.charge.strengthDivisor), 'Charge rounding is untouched');
        if (points === 25) {
          check(part.compact.multiplier.value === .05 && part.value === 1, 'Screenshot regression: 25 times .05, not the fabricated .04');
        }
      }
    }
    const chargeConfig = balanceData.weaponMastery.charge;
    const originalDivisor = chargeConfig.strengthDivisor;
    try {
      chargeConfig.strengthDivisor = 40;
      const changed = D.calculateStatsDisplay('weaponMastery', entity).umbraHelperCalculations.weaponMasteryChargeBonus.parts[1];
      check(changed.compact.multiplier.value === .025, 'The displayed ratio updates when its configured divisor changes');
    } finally { chargeConfig.strengthDivisor = originalDivisor; }
    const ratio = balanceData.hypercognition;
    check(!!ratio, 'Hypercognition config remains available');
    document.querySelectorAll('.stat-hover').forEach(node => node.remove());
    document.getElementById('armor-bars-regression').style.display = 'none';
    const root = document.createElement('div');
    root.className = 'codex-entity-scan';
    root.id = 'umbra-layer-test';
    root.style.cssText = 'position:fixed;left:16px;top:20px;width:300px;height:130px;display:block;z-index:100000;overflow:visible;';
    for (const key of new Set(['hypercognition', 'haste', 'ambidextry', 'robustness', 'strength', 'integrite', 'weaponMastery', 'esprit', 'transcendence', 'astrality', 'mysticism', 'equilibre', 'occultism',
      'vitality', 'criticalPower', 'indestructibility', 'resilience', 'brutality', 'esoterism', 'precision', 'bloodFury', 'movement', ...D.getGeneratedUmbraSourceKeys()])) {
      UI.createUmbraBlock(root, key, () => entity.stats[key], entity, key);
      const trigger = root.lastElementChild;
      trigger.tabIndex = 0;
      trigger.style.cssText = 'display:block;position:relative;height:24px;width:130px;';
      check(trigger.hasAttribute('data-helper-text'), 'Real Codex host exercises the cached helper path');
    }
    document.body.appendChild(root);
    _UI4.bindHelperEntity(root, entity);
    window.__umbraLayerTest = { root, entity };
    return checks;
  });
  const pin = async key => {
    await page.locator(`#umbra-layer-test > [data-stat="${key}"]`).dispatchEvent('click');
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  for (const key of ['vigueur', 'esprit', 'finesse', 'brutality', 'inflexion', 'constitution', 'integrite', 'adresse', 'vivacite']) {
    await pin(key);
    const helper = page.locator(`[data-umbra-pinned][data-stat="${key}"]`);
    assert.ok(await helper.locator('.helper-calculation-detail').count() > 0, `${key}: calculation detail remains visible`);
    assert.equal(await helper.locator('[data-autonomous-calculation]').count(), 2, `${key}: own grant is separate from the entity total`);
    await helper.locator('[data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
    assert.doesNotMatch(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), /×|arrondi/);
    if (key === 'vigueur') {
      await helper.locator('[data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]').focus();
      assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Détail du calcul');
      assert.ok(await page.locator('[data-umbra-detail] [data-autonomous-kind="umbra"]').count(), 'Total hover separates Vigueur from normal PP');
    }
    await page.keyboard.press('Escape');
  }
  for (const key of ['robustness', 'brutality', 'criticalPower']) {
    assert.match(await page.locator(`#umbra-layer-test > [data-stat="${key}"] .picto-stat.${key}`).first()
      .evaluate(node => getComputedStyle(node).filter), /drop-shadow/, `${key}: the existing stat pictogram receives its aura`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#umbra-layer-test > [data-stat="haste"]').dispatchEvent('mouseover');
  assert.equal(await page.locator('.stat-hover[data-stat="haste"]').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
  const transientSource = page.locator('.stat-hover[data-stat="haste"] [data-umbra-calculation]').first();
  await transientSource.dispatchEvent('mouseover');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0, 'Transient hover never opens layer 3');
  await pin('haste');
  await page.locator('#umbra-layer-test > [data-stat="haste"]').dispatchEvent('mouseout');
  await page.waitForTimeout(1400);
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Pinned helper survives the old fade timers');
  const pinnedSource = page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="hastePreparation"][data-umbra-part="1"]');
  await pinnedSource.hover();
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Pinned source opens its calculation');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du ratio : Intelligence');
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat').count(), 1, 'Only the input has a pictogram');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Sub-helper preserves its parent');
  await pinnedSource.dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Clicking inside the pinned helper keeps it open');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Clicking a contribution preserves its detail');
  assert.match(await page.locator('[data-umbra-detail]').innerText(), /10/);
  await page.screenshot({ path: resolve(output, 'umbra-layers-desktop.png') });
  const staleRatioDetail = await page.locator('[data-umbra-detail]').elementHandle();
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    entity.stats.intelligence = 50;
    entity.baseStats.intelligence = 50;
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await staleRatioDetail.evaluate(node => node.isConnected), true, 'Refresh keeps the existing ratio sub-helper');
  assert.match(await staleRatioDetail.innerText(), /50/, 'Open ratio updates before another hover');
  await staleRatioDetail.dispose();
  assert.equal(await page.locator('[data-umbra-pinned="true"][data-stat="haste"] .helper-calculation').first()
    .locator('.helper-calculation-result .helper-figure').innerText(), '21.6 %', 'Pinned main total refreshes despite cached host HTML');
  await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="hastePreparation"][data-umbra-part="1"]').hover();
  assert.match(await page.locator('[data-umbra-detail]').innerText(), /50/, 'Ratios read current inputs');
  await pin('hypercognition');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'A new pin replaces the previous helper');
  assert.equal(await page.locator('.stat-hover[data-stat="haste"], [data-umbra-detail]').count(), 0, 'Replacement removes the old helper and its detail');
  assert.equal(await page.locator('#umbra-layer-test > [data-stat="haste"]').getAttribute('aria-expanded'), null);
  await page.locator('#umbra-layer-test > [data-stat="strength"]').dispatchEvent('mouseover');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Ordinary stat hover preserves the pinned helper');
  assert.equal(await page.locator('.stat-hover:not([data-umbra-detail])').count(), 1, 'No second main helper appears on hover');
  await page.locator('#umbra-layer-test > [data-stat="strength"]').dispatchEvent('mouseout');
  await pin('ambidextry');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Only one pinned helper');
  assert.equal(await page.locator('[data-umbra-pinned="true"][data-stat="hypercognition"]').count(), 0, 'Third pin replaces the second');
  await pin('ambidextry');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 0, 'Clicking same Umbra unpins it');
  await pin('robustness');
  await pin('strength');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Pinning an attribute replaces the previous helper');
  assert.equal(await page.locator('[data-umbra-pinned="true"][data-stat="strength"]').count(), 1, 'Attribute sources are accessible in a pinned helper');
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 0, 'Clicking outside also closes the attribute helper');
  await pin('robustness');
  await page.locator('[data-umbra-pinned="true"][data-stat="robustness"] [data-umbra-part="2"]').hover();
  assert.equal(await page.locator('[data-umbra-detail] .helper-figure').count(), 2, 'Force detail shows its input and curve contribution');
  assert.equal(await page.locator('[data-umbra-detail] .helper-calculation-detail').innerText(), '10 → 36');
  assert.match(await page.locator('[data-umbra-detail] .stat-hover-footer').innerText(), /La valeur finale est arrondie/);
  assert.doesNotMatch(await page.locator('[data-umbra-detail]').innerText(), /Maximum|atténuation|×/);
  assert.equal(await page.locator('[data-umbra-detail] .helper-calculation-result').count(), 0);
  await page.screenshot({ path: resolve(output, 'robustness-layers-desktop.png'), animations: 'disabled' });
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Clicking empty space closes both layers');
  assert.equal(await page.locator('#umbra-layer-test > [data-stat="robustness"]').getAttribute('aria-expanded'), null);
  await pin('hypercognition');
  await page.evaluate(() => {
    const { root } = window.__umbraLayerTest;
    const host = root.querySelector('[data-stat="hypercognition"]');
    host.replaceWith(host.cloneNode(true));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Codex repaint rebinds the same Umbra');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="hypercognitionBonus"][data-umbra-part="1"]').hover();
  for (const locator of ['[data-umbra-pinned="true"]', '[data-umbra-detail]']) {
    const rect = await page.locator(locator).boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 845,
      `${locator}: fits mobile viewport`);
  }
  await page.screenshot({ path: resolve(output, 'umbra-layers-mobile.png') });
  await page.evaluate(() => {
    const blank = window.__umbraLayerTest.root;
    blank.addEventListener('click', event => event.stopPropagation(), { once: true });
    blank.click();
  });
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Empty-space dismissal also works on mobile when bubbling is stopped');
  await page.locator('#umbra-layer-test > [data-stat="hypercognition"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Keyboard pinning still works');
  await page.locator('#umbra-layer-test > [data-stat="haste"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Keyboard pinning also replaces the previous helper');
  await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="hastePreparation"][data-umbra-part="1"]').hover();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Escape closes both layers');
  await pin('robustness');
  await page.locator('[data-umbra-pinned="true"] [data-umbra-part="2"]').hover();
  await page.screenshot({ path: resolve(output, 'robustness-layers-mobile.png'), animations: 'disabled' });
  for (const selector of ['[data-umbra-pinned="true"]', '[data-umbra-detail]']) {
    const rect = await page.locator(selector).boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 845, 'Robustness layers fit mobile');
  }
  await page.keyboard.press('Escape');
  await pin('esprit');
  assert.equal(await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation]').count(), 2, 'Esprit separates its own contribution from the entity total');
  assert.equal(await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="generatedUmbraSource"]').innerText(), '+ 50');
  assert.match(await page.locator('[data-umbra-pinned="true"] [data-umbra-inline-detail]').innerText(), /25 × 1.*50 × 0.5/s);
  await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="generatedUmbraSource"]').hover();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du calcul');
  assert.equal(await page.locator('[data-umbra-detail] [data-autonomous-kind="umbra"]').getAttribute('data-contribution-value'), '50');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    for (const stats of [entity.stats, entity.baseStats]) Object.assign(stats, { integrite: 3, intelligence: 6 });
  });
  await pin('integrite');
  const integrityHelper = page.locator('[data-umbra-pinned="true"][data-stat="integrite"]');
  assert.equal(await integrityHelper.locator('[data-umbra-calculation="generatedUmbraSource"]').innerText(), '+ 8 %');
  assert.equal(await integrityHelper.locator('[data-autonomous-calculation]').count(), 2, 'Integrity separates its converted contribution from the total');
  const integrityFormula = integrityHelper.locator('[data-umbra-inline-detail]');
  assert.match(await integrityFormula.innerText(), /3 × 1.*6 × 0.5.*→ 8 %/s);
  for (const stat of ['integrite', 'intelligence']) {
    assert.equal(await integrityFormula.locator(`.picto-stat.${stat}`).count(), 1, 'Converted ratio preserves its source pictograms');
    assert.equal(await integrityFormula.locator(`.helper-figure[data-helper-stat="${stat}"]`).count(), 2, 'Source and coefficient retain the correct stat color');
  }
  await integrityHelper.locator('[data-umbra-calculation="generatedUmbraSource"]').hover();
  assert.equal(await page.locator('[data-umbra-detail] [data-autonomous-kind="umbra"]').getAttribute('data-contribution-value'), '8');
  await page.screenshot({ path: resolve(output, 'integrity-layers-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await integrityHelper.locator('[data-umbra-calculation="generatedUmbraSource"]').hover();
  await page.screenshot({ path: resolve(output, 'integrity-layers-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__umbraLayerTest.entity.stats.strength = 25; });
  await pin('weaponMastery');
  await page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="weaponMasteryChargeBonus"][data-umbra-part="1"]').hover();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), '25 × 0.05 → 1');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du ratio : Force');
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat').count(), 2, 'Rounded detail identifies its input and output');
  await page.screenshot({ path: resolve(output, 'true-ratio-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await pin('hypercognition');
  assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Pinning still works after full cleanup');
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    entity.stats.hypercognition = 100;
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const generatorSource = page.locator('[data-umbra-pinned="true"] [data-umbra-calculation="hypercognitionEssences"]');
  await generatorSource.focus();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du ratio : Hypercognition');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), 'Palier 8 : 100 → 8');
  assert.equal(await generatorSource.innerText(), '100', 'The source shows Hypercognition points, not the essence count');
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat.essence-hyperco').count(), 1);
  assert.equal(await page.locator('[data-umbra-detail] .helper-figure[data-helper-stat="hyperco"]').count(), 1);
  for (const [width, height, filename] of [[1280, 900, 'cognitive-generator-desktop.png'], [390, 844, 'cognitive-generator-mobile.png']]) {
    await page.setViewportSize({ width, height });
    await generatorSource.hover();
    const rect = await page.locator('[data-umbra-detail]').boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
      'Cognitive milestones fit desktop and mobile viewports');
    await page.screenshot({ path: resolve(output, filename), animations: 'disabled' });
  }
  const staleMilestoneDetail = await page.locator('[data-umbra-detail]').elementHandle();
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    entity.stats.hypercognition = 150;
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await staleMilestoneDetail.evaluate(node => node.isConnected), true, 'Changing Hypercognition keeps the milestone detail open');
  assert.match(await staleMilestoneDetail.innerText(), /Palier 10 : 150 → 10/);
  await staleMilestoneDetail.dispose();
  await generatorSource.hover();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), 'Palier 10 : 150 → 10');
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Clicking outside closes the generator and its milestone detail');
  await page.evaluate(() => { window.__umbraLayerTest.entity.stats.transcendence = 50; });
  await pin('transcendence');
  const lifeHelper = page.locator('[data-umbra-pinned="true"][data-stat="transcendence"]');
  const lifeSource = lifeHelper.locator('[data-umbra-calculation="transcendenceExBonus"]');
  assert.match(await lifeHelper.innerText(), /l'entité peut obtenir un maximum de 4 \( 4 \) vies supplémentaires/);
  assert.equal(await lifeHelper.locator('.helper-calculation-result .helper-figure').first().innerText(), '4');
  await lifeSource.focus();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du ratio : Transcendance');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), 'Palier 4 : 34 → 4');
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat.transcendence').count(), 1);
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat.extraLife').count(), 1);
  assert.equal(await page.locator('[data-umbra-detail] .helper-figure[data-helper-stat="extraLife"]').count(), 1);
  for (const [width, height, filename] of [[1280, 900, 'transcendence-milestones-desktop.png'], [390, 844, 'transcendence-milestones-mobile.png']]) {
    await page.setViewportSize({ width, height });
    await lifeSource.hover();
    for (const selector of ['[data-umbra-pinned="true"]', '[data-umbra-detail]']) {
      const rect = await page.locator(selector).boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
        'Transcendence milestones fit desktop and mobile viewports');
    }
    await page.screenshot({ path: resolve(output, filename), animations: 'disabled' });
  }
  for (const [points, expected] of [[58, 'Palier 5 : 58 → 5'], [150, 'Palier 7 : 150 → 7']]) {
    const oldDetail = await page.locator('[data-umbra-detail]').elementHandle();
    await page.evaluate(points => {
      const { entity } = window.__umbraLayerTest;
      entity.stats.transcendence = points;
      window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
    }, points);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await oldDetail.evaluate(node => node.isConnected), true, 'Changing Transcendence updates the existing milestone detail');
    assert.ok((await oldDetail.innerText()).includes(expected), 'Milestone updates without another hover');
    await oldDetail.dispose();
    await lifeSource.hover();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), expected);
  }
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Clicking outside closes Transcendence and its milestone detail');
  await page.evaluate(() => Object.assign(window.__umbraLayerTest.entity.stats, { transcendence: 150, intelligence: 30 }));
  await pin('transcendence');
  const intelProtectionSource = lifeHelper.locator('[data-umbra-calculation="transcendenceConsoProtectionPercent"][data-umbra-part="1"]');
  assert.match(await lifeHelper.innerText(), /6\.8 % \( 5 % \+ 1\.8 % \) de chance de ne pas consommer de ressource de résurrection lors d'une utilisation/);
  await intelProtectionSource.focus();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du ratio : Intelligence');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), '30 → 1.8 %');
  assert.equal(await page.locator('[data-umbra-detail] .picto-stat.intelligence').count(), 1);
  assert.equal(await page.locator('[data-umbra-detail] .helper-figure[data-helper-stat="intelligence"]').count(), 2);
  assert.equal(await page.locator('[data-umbra-detail] .helper-figure > span.intelligence:not(.picto-stat)')
    .evaluateAll(nodes => nodes.every(node => getComputedStyle(node).color === 'rgb(0, 152, 255)')), true);
  for (const [width, height, filename] of [[1280, 900, 'transcendence-intelligence-desktop.png'], [390, 844, 'transcendence-intelligence-mobile.png']]) {
    await page.setViewportSize({ width, height });
    await intelProtectionSource.hover();
    const rect = await page.locator('[data-umbra-detail]').boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
      'The Intelligence curve preview fits desktop and mobile viewports');
    await page.screenshot({ path: resolve(output, filename), animations: 'disabled' });
  }
  for (const [intelligence, expected] of [[0, '0 → 0 %'], [300, '300 → 5 %']]) {
    const oldDetail = await page.locator('[data-umbra-detail]').elementHandle();
    await page.evaluate(intelligence => {
      const { entity } = window.__umbraLayerTest;
      entity.stats.intelligence = intelligence;
      window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
    }, intelligence);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await oldDetail.evaluate(node => node.isConnected), true, 'A changed Intelligence value keeps the curve preview open');
    assert.ok((await oldDetail.innerText()).includes(expected), 'Curve updates without another hover');
    await oldDetail.dispose();
    await intelProtectionSource.hover();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), expected);
  }
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Clicking outside closes the curve preview with its parent');
  await page.evaluate(() => Object.assign(window.__umbraLayerTest.entity.stats, { astrality: 26, intelligence: 30 }));
  await pin('astrality');
  const astralityHelper = page.locator('[data-umbra-pinned="true"][data-stat="astrality"]');
  const astralitySources = astralityHelper.locator('[data-umbra-calculation="astralityTotal"]');
  assert.equal(await astralitySources.count(), 2, 'Both Astrality contributions have a detail');
  assert.match(await astralityHelper.innerText(), /42\.6 % \( 21 % \+ 21\.6 % \) de chance de survivre à un coup fatal avec 1 HP/);
  for (const [index, stat, name, expected] of [
    [0, 'astrality', 'Astralité', '26 → 21 %'],
    [1, 'intelligence', 'Intelligence', '30 → 21.6 %'],
  ]) {
    await astralitySources.nth(index).focus();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), `Détail du ratio : ${name}`);
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), expected);
    assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Switching Astrality sources replaces the detail');
    assert.equal(await page.locator(`[data-umbra-detail] .picto-stat.${stat}`).count(), 1);
    assert.equal(await page.locator(`[data-umbra-detail] .helper-figure[data-helper-stat="${stat}"]`).count(), 2);
    const sourceColor = await astralitySources.nth(index).locator(`span.${stat}:not(.picto-stat)`).evaluate(node => getComputedStyle(node).color);
    assert.equal(await page.locator(`[data-umbra-detail] .helper-figure > span.${stat}:not(.picto-stat)`)
      .evaluateAll((nodes, color) => nodes.every(node => getComputedStyle(node).color === color), sourceColor), true);
    for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width, height });
      await astralitySources.nth(index).hover();
      const rect = await page.locator('[data-umbra-detail]').boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
        'Both Astrality curves fit desktop and mobile viewports');
      await page.screenshot({ path: resolve(output, `astrality-${stat}-${viewport}.png`), animations: 'disabled' });
    }
  }
  const oldAstralityDetail = await page.locator('[data-umbra-detail]').elementHandle();
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    Object.assign(entity.stats, { astrality: 101, intelligence: 150 });
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await oldAstralityDetail.evaluate(node => node.isConnected), true, 'Astrality refresh updates the existing detail');
  assert.match(await oldAstralityDetail.innerText(), /150 → 60 %/);
  assert.doesNotMatch(await oldAstralityDetail.innerText(), /Max atteint/);
  await oldAstralityDetail.dispose();
  assert.equal(await astralityHelper.locator('.helper-calculation-result .helper-figure').innerText(), '100 %');
  for (const [index, expected] of [[0, '101 → 40 %'], [1, '150 → 60 %']]) {
    await astralitySources.nth(index).hover();
    assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), expected);
  }
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Clicking outside closes both Astrality layers');
  const curveCases = await page.evaluate(() => window.__umbraCurveCases);
  for (const stat of ['mysticism', 'occultism']) {
    await page.evaluate(stat => Object.assign(window.__umbraLayerTest.entity.stats, { [stat]: 25, intelligence: 30, agility: 30 }), stat);
    await pin(stat);
    const helper = page.locator(`[data-umbra-pinned="true"][data-stat="${stat}"]`);
    const cases = curveCases.filter(test => test.stat === stat);
    assert.ok(await helper.locator('[data-umbra-calculation]').count() >= cases.length,
      `${stat}: curved contributions and fixed bases have details`);
    for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width, height });
      for (const { key, source, index, example, maximum, unit } of cases) {
        const trigger = helper.locator(`[data-umbra-calculation="${key}"][data-umbra-part="${index}"]`);
        await trigger.focus();
        await trigger.hover();
        const detail = page.locator('[data-umbra-detail]');
        await detail.waitFor({ state: 'visible' });
        assert.equal(await detail.count(), 1, 'Switching contributions replaces the sub-helper');
        assert.equal(await detail.locator('.stat-hover-header .umbra-description').innerText(),
          `Détail du ratio : ${source === 'intelligence' ? 'Intelligence' : 'Agilité'}`);
        assert.equal(await detail.locator('.stat-hover-body').innerText(), `30 → ${example}${unit}`);
        assert.equal(await detail.locator(`.picto-stat.${source}`).count(), 1);
        assert.equal(await detail.locator(`.helper-figure[data-helper-stat="${source}"]`).count(), 2);
        const color = await trigger.locator(`span.${source}:not(.picto-stat)`).evaluate(node => getComputedStyle(node).color);
        assert.equal(await detail.locator(`.helper-figure > span.${source}:not(.picto-stat)`)
          .evaluateAll((nodes, color) => nodes.every(node => getComputedStyle(node).color === color), color), true);
        const rect = await detail.boundingBox();
        assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
          `${key}: the detail fits ${viewport}`);
      }
      await page.screenshot({ path: resolve(output, `${stat}-curves-${viewport}.png`), animations: 'disabled' });
    }
    const staleDetail = await page.locator('[data-umbra-detail]').elementHandle();
    await page.evaluate(() => {
      const { entity } = window.__umbraLayerTest;
      Object.assign(entity.stats, { intelligence: 0, agility: 0 });
      window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await staleDetail.evaluate(node => node.isConnected), true, `${stat}: a live update retains the open detail`);
    assert.match(await staleDetail.innerText(), /0 → 0/, `${stat}: detail refreshes without another hover`);
    await staleDetail.dispose();
    await page.mouse.move(1, 1);
    for (const { key, index, maximum, unit } of cases) {
      await helper.locator(`[data-umbra-calculation="${key}"][data-umbra-part="${index}"]`).focus();
      assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), `0 → 0${unit}`);
    }
    await page.locator('body').dispatchEvent('click');
    assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, `${stat}: clicking outside closes both layers`);
  }
  await page.evaluate(() => Object.assign(window.__umbraLayerTest.entity.stats, {
    vitality: 12, haste: 20, hypercognition: 20, criticalPower: 50, indestructibility: 80, resilience: 25,
    strength: 25, intelligence: 6, agility: 10,
  }));
  for (const [stat, key, index, fixed, rounded] of [
    ['vitality', 'vitalityBonus', 0, false, true],
    ['haste', 'hastePreparation', 0, false, true],
    ['haste', 'hasteProjectilSpeed', 0, false, true],
    ['hypercognition', 'hypercognitionBonus', 0, false, false],
    ['hypercognition', 'hypercognitionBonus', 1, false, true],
    ['criticalPower', 'critDamageBonus', 0, true, false],
    ['criticalPower', 'critTotalChance', 1, false, true],
    ['criticalPower', 'critDamageBonus', 2, false, true],
    ['indestructibility', 'indestructibilityBonus', 0, false, true],
    ['indestructibility', 'hpBattleRegenPercent', 0, false, true],
    ['indestructibility', 'hpBattleRegenPercent', 1, false, true],
    ['indestructibility', 'hpBattleRegenPercent', 3, false, true],
    ['resilience', 'resilienceCritTotalBonus', 0, false, true],
    ['resilience', 'resilienceAlteTotalBonus', 0, false, true],
    ['resilience', 'resilienceAlteTotalBonus', 1, false, true],
    ['resilience', 'resilienceTotalCancelBonus', 0, false, true],
    ['ambidextry', 'ambidextryTotalChance', 0, false, false],
    ['ambidextry', 'ambidextryDamageBonus', 1, false, false],
    ['esoterism', 'esoterismBonus', 0, false, false],
    ['esoterism', 'esoterismTotalReduction', 1, false, false],
    ['precision', 'precisionBonus', 0, false, true],
    ['weaponMastery', 'weaponMasteryChargeBonus', 0, false, true],
    ['weaponMastery', 'weaponOrfevreBonus', 0, false, true],
    ['weaponMastery', 'weaponOrfevreBonus', 1, false, true],
    ['weaponMastery', 'weaponMasteryTrophyChance', 0, false, true],
    ['bloodFury', 'bloodFuryExecutionBonus', 1, false, true],
    ['bloodFury', 'bloodFuryExecDamage', 1, false, true],
  ]) {
    await page.keyboard.press('Escape');
    await pin(stat);
    const source = page.locator(`[data-umbra-pinned] [data-umbra-calculation="${key}"][data-umbra-part="${index}"]`);
    await source.dispatchEvent('mouseover');
    const detail = page.locator('[data-umbra-detail]');
    await detail.waitFor({ state: 'visible' });
    assert.equal(await detail.count(), 1, `${stat}/${key}/${index}: the missing contribution opens`);
    if (fixed) assert.equal(await detail.locator('.umbra-description').innerText(), 'Valeur fixe');
    else assert.match(await detail.locator('.umbra-description').innerText(), /^Détail du ratio : /);
    assert.equal((await detail.locator('.stat-hover-footer').innerText()).trim(),
      rounded ? 'La valeur finale est arrondie.' : '', `${key}: rounding belongs only in the footer and only when applied`);
    if (stat === 'vitality') assert.match(await detail.locator('.stat-hover-body').innerText(), /12 → 88/);
    if (stat === 'hypercognition' && index === 0) assert.equal(await detail.locator('.stat-hover-body').innerText(), '20 × 1');
    if (fixed) {
      assert.equal(await detail.locator('.picto-stat').count(), 0);
      assert.equal(await detail.locator('.helper-figure').getAttribute('data-helper-stat'), 'neutral');
    }
    for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(1, 1);
      await source.dispatchEvent('mouseover');
      const bounds = await detail.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1
        && bounds.y + bounds.height <= height + 1, `${key}: complete sub-helper fits ${viewport}`);
      await detail.screenshot({ path: resolve(output, `${key}-${index}-detail-${viewport}.png`), animations: 'disabled' });
    }
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => Object.assign(window.__umbraLayerTest.entity.stats, { movement: 10, agility: 30 }));
  await pin('movement');
  const movementCard = page.locator('[data-umbra-pinned="true"]');
  assert.equal(await movementCard.locator('[data-umbra-calculation="movementStartingCharges"]').innerText(), '7 / 10');
  for (const [key, index, title, text, rounded] of [
    ['movementStartingTotalCurrent', 0, 'Valeur fixe', '30 %', false],
    ['movementStartingTotalCurrent', 1, 'Détail du ratio : Agilité', '30 → 32 %', true],
    ['movementStartingCharges', 0, 'Détail du ratio : Mouvement', '10 × 0.62 → 7', true],
  ]) {
    const source = movementCard.locator(`[data-umbra-calculation="${key}"][data-umbra-part="${index}"]`);
    for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width, height });
      await source.dispatchEvent('mouseover');
      const detail = page.locator('[data-umbra-detail]');
      await detail.waitFor({ state: 'visible' });
      assert.equal(await detail.locator('.umbra-description').innerText(), title);
      assert.equal(await detail.locator('.stat-hover-body').innerText(), text);
      assert.equal((await detail.locator('.stat-hover-footer').innerText()).trim(),
        rounded ? 'La valeur finale est arrondie.' : '');
      assert.doesNotMatch(await detail.innerText(), /Maximum|Max atteint|palier/);
      const rect = await detail.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1
        && rect.y + rect.height <= height + 1, `Movement detail fits ${viewport}`);
      await detail.screenshot({ path: resolve(output, `${key}-${index}-${viewport}.png`), animations: 'disabled' });
    }
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => Object.assign(window.__umbraLayerTest.entity.stats, {
    transcendence: 30, extraLife: { current: 2, max: 3 }, HP: { current: 20, max: 100 }, intelligence: 25,
  }));
  await pin('transcendence');
  const transcendenceCard = page.locator('[data-umbra-pinned="true"]');
  const lifePictogram = transcendenceCard.locator('[data-helper-picto-stat="extraLife"]').first();
  assert.ok(await lifePictogram.count(), 'Extra lives open their existing helper from Transcendence');
  assert.equal(await lifePictogram.getAttribute('aria-hidden'), null, 'Interactive pictograms are not hidden from accessibility');
  for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await lifePictogram.focus();
    await lifePictogram.dispatchEvent('mouseover');
    const detail = page.locator('[data-umbra-detail][data-helper-picto-subject="extraLife"]');
    await detail.waitFor({ state: 'visible' });
    assert.equal(await detail.count(), 1);
    assert.equal(await detail.locator('.umbra-description').innerText(), 'Statistique : Vie supplémentaire +');
    const expectedLifeHelper = await page.evaluate(async () => {
      const D = await import("/js/ui/statistics/details.js");
      return D.calculateStatsDisplay('extraLife', window.__umbraLayerTest.entity).helpContent;
    });
    assert.equal(await detail.locator('.stat-hover-body').innerHTML(), `\n      ${expectedLifeHelper}\n    `);
    assert.equal(await detail.locator('[data-helper-picto-stat]').count(), 0, 'A tertiary description cannot create recursive helper chains');
    const ownIcon = transcendenceCard.locator('.picto-stat.transcendence').first();
    assert.equal(await ownIcon.getAttribute('data-helper-picto-stat'), null, 'The original Umbra cannot reopen its own description');
    const rect = await detail.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1
      && rect.y + rect.height <= height + 1, `Extra-life description fits ${viewport}`);
    await detail.screenshot({ path: resolve(output, `extra-life-nested-${viewport}.png`), animations: 'disabled' });
  }
  await page.evaluate(() => {
    const { entity } = window.__umbraLayerTest;
    entity.stats.HP.max = 200;
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'A third-party helper stays open when its parent text is unchanged');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').evaluate(async node => {
    const D = await import("/js/ui/statistics/details.js");
    return node.innerHTML.trim() === D.calculateStatsDisplay('extraLife', window.__umbraLayerTest.entity).helpContent;
  }), true, 'Already-open third-party helpers refresh from current entity stats without another hover');
  const transcendenceRatio = transcendenceCard.locator('[data-umbra-calculation="transcendenceExBonus"]').first();
  await transcendenceRatio.dispatchEvent('mouseover');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Ratios and third-party descriptions share one detail slot');
  assert.match(await page.locator('[data-umbra-detail] .umbra-description').innerText(), /^Détail du ratio : Transcendance/);
  await page.keyboard.press('Escape');
  await pin('robustness');
  const robustCard = page.locator('[data-umbra-pinned="true"]');
  await robustCard.locator('[data-helper-effect="day"][data-helper-picto-stat="day"]').dispatchEvent('mouseover');
  assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Statistique : Début de la journée');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(),
    "Après chaque visite d'une zone, une nouvelle journée commence. À chaque nouvelle journée, des actions se produisent. Les ennemis progressent, la vie devient plus chère, certaines entités pansent leurs blessures, d'autres non, etc.");
  await robustCard.locator('[data-helper-picto-stat="solarArmor"]').first().focus();
  assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Statistique : Armure solaire');
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), 'Armure solaire', 'Unmapped calculation effects have a named fallback');
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned], [data-umbra-detail]').count(), 0, 'Clicking outside closes the parent and third-party helper');
  await page.evaluate(() => window.__umbraLayerTest.root.remove());
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-umbra-pinned="true"], [data-umbra-detail]').count(), 0, 'Closing Codex removes both layers');
  console.log(`PASS: ${layeredChecks} Umbra source/formula checks, pinning, live refresh, scope and desktop/mobile interactions`);
  console.log('Remaining nonlinear details: ' + JSON.stringify(await page.evaluate(() => window.__remainingUmbraDetails)));
  await page.evaluate(() => document.getElementById('armor-bars-regression').remove());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/codex/index.js"), _UI5 = await import("/js/ui/statistics/helpers.js");
    const Upgrade = await import("/js/entities/progression.js");
    const entity = { id: 987191, name: 'Level helper preview', side: 'A', type: 'sbire', class: 'TestHelpers', level: 1,
      baseStats: { strength: 6, agility: 6, intelligence: 6, integrite: 3, HP: 100, will: 150 },
      attacks: [{ functionName: 'autoAttack', attacknature: ['physicalDamage'], attackRange: ['melee'] }] };
    E.enrichEntityStats(entity);
    Upgrade.setPlayerExperience(1000000);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    localStorage.setItem('ArmyA', JSON.stringify({ entities: [entity] }));
    const host = document.createElement('main');
    host.id = 'level-helper-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:100000;';
    document.body.appendChild(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    const menu = [...host.querySelectorAll('.codex-inner-menu')];
    const titles = menu.map(button => [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim()).join(''));
    if (JSON.stringify(titles) !== JSON.stringify(['Profil', 'Attaques', 'Stats', 'Soul', 'Informations'])) {
      throw Error(`Unexpected Codex menu order: ${titles}`);
    }
    menu[1].click();
    if (!host.querySelector('.section-content.attaques') || !menu[1].classList.contains('active')) {
      throw Error('The second Codex tab must open Attaques');
    }
    menu[2].click();
    if (!host.querySelector('.section-content.stats') || !menu[2].classList.contains('active')) {
      throw Error('The third Codex tab must open Stats');
    }
    host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
    const sidebar = host.querySelector('.umbra-submenu.entity-stats-section');
    const draft = _UI5.helperEntityByRoot.get(sidebar);
    if (!draft) throw Error('The level-up Umbra sidebar must bind the active draft');
    window.__levelHelperTest = { host, draft, originalStats: JSON.stringify(draft.stats), baseStats: JSON.stringify(draft.baseStats) };
  });
  const levelHost = page.locator('#level-helper-test');
  const levelStat = key => levelHost.locator(`.umbra-submenu .stat-container[data-stat="${key}"]`).first();
  const levelAction = async (attribute, direction = 'right') => {
    await levelHost.locator(`.axis-line[data-key="${attribute}"] .${direction}-arrow`).dispatchEvent('click');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('.stat-hover, .shop-item-card.item-description-card').count(), 0,
      'Adding or removing a level closes hover, pinned, nested and item helpers');
  };
  const pinLevelStat = async key => {
    await levelStat(key).dispatchEvent('click');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator(`[data-umbra-pinned="true"][data-stat="${key}"]`).count(), 1);
  };
  const assertDraftHelper = async key => {
    const previewCheck = await page.evaluate(async key => {
      const D = await import("/js/ui/statistics/details.js");
      const UI = await import("/js/ui/statistics/helpers.js");
      const { host, draft, originalStats, baseStats } = window.__levelHelperTest;
      const beforeRead = JSON.stringify(draft);
      const block = host.querySelector(`.umbra-submenu .stat-container[data-stat="${key}"]`);
      const helper = document.querySelector(`.stat-hover[data-stat="${key}"]`);
      const view = UI.getBoundHelperEntity(block);
      const expected = D.calculateStatsDisplay(key, draft);
      return {
        sameModels: JSON.stringify(helper._umbraCalculations) === JSON.stringify(expected.umbraHelperCalculations),
        sameStats: JSON.stringify(view.stats) === JSON.stringify(draft.modifierStats?.preview?.total || draft.stats),
        permanentUntouched: [...new Set([...Object.keys(JSON.parse(originalStats)), ...Object.keys(draft.stats)])]
          .every(key => JSON.stringify(JSON.parse(originalStats)[key] ?? 0) === JSON.stringify(draft.stats[key] ?? 0))
          && JSON.stringify(draft.baseStats) === baseStats,
        readOnly: JSON.stringify(draft) === beforeRead,
        text: helper.querySelector('.stat-hover-body').textContent,
        total: expected.umbraHelperCalculations.generatedUmbraSource?.value,
      };
    }, key);
    assert.equal(previewCheck.sameModels, true, `${key}: helper and contributions read the full preview`);
    assert.equal(previewCheck.sameStats, true, `${key}: the preview is a complete calculation view`);
    assert.equal(previewCheck.permanentUntouched, true, 'The preview does not apply its points to permanent stats or base stats');
    assert.equal(previewCheck.readOnly, true, 'Reading helper calculations never mutates the draft');
    return previewCheck;
  };
  await pinLevelStat('integrite');
  assert.ok(await page.locator('[data-umbra-pinned] .helper-calculation-detail').count(), 'Umbra calculations are visible in the main helper again');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
  assert.match(await page.locator('[data-umbra-pinned] [data-umbra-inline-detail]').innerText(), /3 × 1.*6 × 0.5.*→ 8 %/s);
  await levelAction('strength');
  assert.equal(await levelStat('vigueur').count(), 1, 'A newly acquired Umbra appears in the preview sidebar');
  await levelStat('vigueur').dispatchEvent('mouseover');
  const newUmbra = await assertDraftHelper('vigueur');
  assert.equal(newUmbra.total, 5, 'First Vigueur point grants its ratio and preview Force 7, without flat');
  await pinLevelStat('vigueur');
  const assertRelatedPowerHelper = async () => {
    await page.locator('[data-umbra-pinned] [data-helper-picto-stat="physicalDamage"]').first().dispatchEvent('mouseover');
    const matches = await page.evaluate(async () => {
      const D = await import("/js/ui/statistics/details.js");
      const UI = await import("/js/ui/statistics/helpers.js");
      const parent = document.querySelector('[data-umbra-pinned]');
      const view = UI.getBoundHelperEntity(parent._helperHost);
      const expected = D.calculateStatsDisplay('physicalDamage', view).statSystem.value;
      const body = document.querySelector('[data-umbra-detail] .stat-hover-body');
      const amount = Number(body.querySelector('.helper-calculation-result').textContent.replace(/\s/g, ''));
      return amount === expected && !body.querySelector('.helper-calculation-detail')
        && /Renforce les dégâts/.test(body.textContent);
    });
    assert.equal(matches, true, 'The related Power helper reads the same live Stats or Level-up preview as its parent');
  };
  await assertRelatedPowerHelper();
  const previewPowerTotal = page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]');
  await previewPowerTotal.focus();
  assert.equal(await page.locator('[data-umbra-detail] .stat-hover-header .umbra-description').innerText(), 'Détail du calcul');
  assert.match(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), /Puissance physique X.*5/s);
  assert.doesNotMatch(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), /×|arrondi/);
  for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(1, 1);
    await previewPowerTotal.dispatchEvent('mouseover');
    for (const selector of ['[data-umbra-pinned]', '[data-umbra-detail]']) {
      const rect = await page.locator(selector).boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1,
        `Level-up ${selector} fits ${viewport}`);
    }
    await page.screenshot({ path: resolve(output, `level-up-preview-${viewport}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await levelAction('strength', 'left');
  assert.equal(await levelStat('vigueur').count(), 0, 'Undo removes a preview-only Umbra');
  await levelStat('integrite').dispatchEvent('mouseover');
  assert.equal(await page.locator('.stat-hover').count(), 1);
  await levelAction('intelligence');
  await pinLevelStat('integrite');
  const unchangedUmbra = await assertDraftHelper('integrite');
  assert.equal(unchangedUmbra.total, 10, 'Unchanged Integrity points use newly invested Intelligence without a target flat');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
  assert.match(await page.locator('[data-umbra-pinned] [data-umbra-inline-detail]').innerText(), /3 × 1.*7 × 0.5.*→ 10 %/s);
  await levelAction('intelligence');
  await pinLevelStat('integrite');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
  await levelHost.locator('.confirm-button.clear').dispatchEvent('click');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.stat-hover').count(), 0, 'Clearing the draft closes both helper layers');
  await pinLevelStat('integrite');
  const cleared = await assertDraftHelper('integrite');
  assert.equal(cleared.total, 8, 'Cleared draft helpers return to the permanent values');
  await levelAction('strength');
  await pinLevelStat('vigueur');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]').focus();
  await page.evaluate(() => {
    const card = document.createElement('div');
    card.className = 'shop-item-card item-description-card persistent';
    document.querySelector('.Game-helper').appendChild(card);
  });
  await levelHost.locator('.confirm-button.yes').dispatchEvent('click');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.stat-hover, .shop-item-card.item-description-card').count(), 0, 'Confirm closes all open helpers');
  const committed = await page.evaluate(() => {
    const { draft } = window.__levelHelperTest;
    const saved = JSON.parse(localStorage.getItem('selectedArmyA')).find(entity => entity.id === draft.id);
    window.__levelHelperTest.originalStats = JSON.stringify(draft.stats);
    return { level: draft.level.current, vigor: draft.stats.vigueur, strength: draft.stats.strength,
      savedLevel: saved.level.current, savedVigor: saved.stats.vigueur };
  });
  assert.deepEqual(committed, { level: 2, vigor: 1, strength: 7, savedLevel: 2, savedVigor: 1 });
  await pinLevelStat('vigueur');
  assert.equal((await assertDraftHelper('vigueur')).total, 5, 'After confirmation the helper agrees with the committed result');
  await levelAction('intelligence');
  await pinLevelStat('integrite');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
  await levelHost.locator('.codex-inner-menu:has(.codex-stat)').dispatchEvent('click');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.stat-hover').count(), 0, 'Leaving Soul closes a pinned preview helper and its detail');
  await levelHost.locator('.section-content.stats [data-mode="umbra"]').dispatchEvent('click');
  const statsVigor = levelHost.locator('.codex-substat-panel--umbra .stat-container[data-stat="vigueur"]');
  await statsVigor.dispatchEvent('mouseover');
  await page.locator('.stat-hover').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.stat-hover .helper-calculation-result .helper-figure').first().innerText(), '+ 5',
    'Stats reads the confirmed Vigueur, not the original Codex snapshot or cancelled draft');
  await statsVigor.dispatchEvent('click');
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]').focus();
  const openPowerCalculation = await page.locator('[data-umbra-detail]').elementHandle();
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js"), _UI6 = await import("/js/ui/codex/stats.js");
    const block = window.__levelHelperTest.host.querySelector('.codex-substat-panel--umbra .stat-container[data-stat="vigueur"]');
    const updated = structuredClone(UI.getBoundHelperEntity(block));
    for (const [key, value] of Object.entries({ strength: 11, vigueur: 4 })) updated.baseStats[key] = (updated.baseStats[key] || 0) + value - (updated.stats[key] || 0);
    const E = await import("/js/entities/runtime.js");
    E.recomputeEntityStats(updated, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    _UI6.refreshCodexUmbraPanel(updated);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await statsVigor.locator('.entite-stat:not(.preview)').innerText(), '4');
  assert.equal(await page.locator('[data-umbra-pinned] .helper-calculation-result .helper-figure').first().innerText(), '+ 10',
    'Vigueur 4 and Force 11 give 10 ratio points without flat');
  assert.equal(await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]').innerText(), '10',
    'Stats separates the live entity total from its visible Umbra calculation');
  assert.equal(await openPowerCalculation.evaluate(node => node.isConnected), true, 'The open total calculation refreshes without closing');
  assert.match(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), /Puissance physique X.*10/s);
  await assertRelatedPowerHelper();
  const statsPowerTotal = page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="physicalDamageTotal"]');
  for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(1, 1);
    await statsPowerTotal.dispatchEvent('mouseover');
    assert.match(await page.locator('[data-umbra-detail] .stat-hover-body').innerText(), /Puissance physique X.*10/s);
    await page.screenshot({ path: resolve(output, `stats-vigueur-${viewport}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await levelHost.locator('.codex-inner-menu:has(.codex-soul)').dispatchEvent('click');
  const reopened = await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const sidebar = window.__levelHelperTest.host.querySelector('.umbra-submenu.entity-stats-section');
    const draft = UI.helperEntityByRoot.get(sidebar);
    window.__levelHelperTest.draft = draft;
    window.__levelHelperTest.originalStats = JSON.stringify(draft.stats);
    return { preview: draft.modifierStats?.preview?.statLeveled || {}, intelligence: draft.stats.intelligence, vigor: draft.stats.vigueur };
  });
  assert.deepEqual(reopened, { preview: {}, intelligence: 6, vigor: 1 }, 'Reopening uses saved progression without the cancelled preview');
  await pinLevelStat('integrite');
  assert.equal((await assertDraftHelper('integrite')).total, 8);
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]').focus();
  await page.evaluate(() => window.__levelHelperTest.host.remove());
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.stat-hover').count(), 0, 'Removing the level-up screen clears its helpers');
  console.log('PASS: real Soul preview helpers, new/unchanged Umbras, sub-helpers, undo, clear, confirmation, reopen and desktop/mobile bounds');
  const autonomousChecks = await page.evaluate(async () => {
    const D = await import("/js/combat/statistics.js"), _D3 = await import("/js/ui/statistics/details.js");
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/codex/index.js");
    let checks = 0;
    const check = (condition, message) => { checks++; if (!condition) throw Error(message); };
    for (const points of [0, 1, 15, 100, 300]) for (const autonomous of [0, 5, 17]) {
      const entity = { stats: { movement: points, agility: 15, hypercognition: points, intelligence: 10,
        cognitiveExplosion: autonomous, cognitiveGenerator: autonomous, transcendence: points, transcendenceTotal: autonomous } };
      const expectedMarathon = points > 0 ? 9 : 0;
      check(D.calculateMovementMarathonChance(entity) === expectedMarathon, 'Marathon uses floor(5 + agility * .3)');
      check(D.calculateMovementTrailerChance(entity) === (points > 0 ? Math.min(100, Math.floor(3 + points * .6)) : 0), 'Trailer uses floor(3 + movement * .6)');
      check(D.calculateCognitiveExplosionTotal(entity) === D.calculateHypercognitionBonus(entity) + autonomous, 'Autonomous explosion is added after Umbra ratios');
      check(D.calculateHypercognitionEssences(entity) === Math.min(10, D.calculateHypercognitionEssences({ stats: { hypercognition: points } }) + autonomous), 'Generated essences share a cap of ten');
      check(Math.abs(D.calculateTranscendenceConsoProtectionTotal(entity)
        - Math.min(100, D.calculateTranscendenceUmbraProtection(entity) + autonomous)) < .011, 'Total transcendence adds autonomous chance');
      const restricted = { ...entity, archetypeFrozen: true };
      check(D.calculateCognitiveExplosionTotal(restricted) === autonomous, 'Frozen entities retain autonomous explosion only');
      check(D.calculateHypercognitionEssences(restricted) === Math.min(10, autonomous), 'Frozen entities retain autonomous generator only');
      check(D.calculateTranscendenceConsoProtectionTotal(restricted) === autonomous, 'Frozen entities retain autonomous protection only');
      for (const key of ['cognitiveExplosion', 'cognitiveGenerator', 'transcendenceTotal']) {
        const before = JSON.stringify(entity);
        const display = _D3.calculateStatsDisplay(key, entity);
        check(JSON.stringify(entity) === before, `${key}: helper is read-only`);
        check(display.umbraHelperCalculations.autonomousTotal.parts.at(-1).value === autonomous, `${key}: autonomous amount is unchanged`);
        check(/data-umbra-calculation/.test(display.helpContent), `${key}: source details are linked`);
        check(!/undefined|NaN/.test(display.helpContent), `${key}: no invalid helper values`);
      }
    }
    const entity = { id: 987192, name: 'Autonomous stat helpers', side: 'A', type: 'sbire', level: 1,
      baseStats: { strength: 10, agility: 15, intelligence: 10, vigueur: 15, physicalDamage: 5,
        cognitiveExplosion: 5, cognitiveGenerator: 2, transcendenceTotal: 7, HP: 100, will: 150 },
      attacks: [{ functionName: 'autoAttack', attacknature: ['physicalDamage'], attackRange: ['melee'] }] };
    E.enrichEntityStats(entity);
    check(entity.stats.physicalDamage === 25, 'Vigueur 15 ratio + Force 10 ratio + autonomous power 5 gives 25');
    const detail = _D3.calculateStatsDisplay('physicalDamage', entity).umbraHelperCalculations.generatedUmbraTarget;
    check(detail.system.state === 'X' && detail.system.normalApplied === 5 && detail.system.enhanced === 20,
      'Mixed power separates 5 normal from 20 Umbra ratio points');
    check(JSON.stringify(detail.improvement.parts.map(part => [part.stat, part.value])) === '[["vigueur",15],["strength",5]]',
      'The improved contribution retains its Umbra and attribute inputs');
    const H = await import('/js/data/helpers.js');
    const sourced = structuredClone(entity);
    sourced.modifierStats.durable.stuff = {
      byId: { 'helper-equipment': { physicalDamage: { flat: 4, percent: 10 } } },
      orfevre: {
        effectiveById: { 'helper-equipment': { physicalDamage: { flat: 6, percent: 15 } } },
        byId: { 'helper-equipment': { physicalDamage: { raw: { flat: 4, percent: 10 }, bonus: { flat: 2, percent: 5 }, activePercent: 50 } } },
      },
    };
    sourced.battleBoosts = { physicalDamage: [{ value: 7, mode: 'flat', source: 'Buff <test>', id: 'source-boost' }] };
    const sourceSnapshot = JSON.stringify(sourced);
    const sourceModel = _D3.calculateStatsDisplay('physicalDamage', sourced).umbraHelperCalculations.generatedUmbraTarget;
    const sourceHTML = H.buildAutonomousCalculationHelper(sourceModel, '');
    const sourceProbe = document.createElement('div');
    sourceProbe.innerHTML = sourceHTML;
    check(JSON.stringify([...sourceProbe.querySelectorAll('.helper-calculation-result')].map(node => Number(node.textContent.replace(/\s/g, '')))) === '[20,20]',
      'The sub-helper separates autonomous PP from Vigueur without repeating the final total');
    check(!sourceProbe.querySelector('.helper-calculation-detail'), 'PP total shows only exclusive amounts');
    const totals = _D3.getStatisticSourceTotals(sourced, 'physicalDamage', _D3.calculateStatsDisplay('physicalDamage', sourced));
    check(JSON.stringify(totals.map(source => [source.category, source.value])) === '[["umbra",20],["fixed",20]]',
      'Normal PP includes base 5, equipment 8 and combat 7 once, apart from Umbra');
    check(H.buildStatisticOrigins({ compact: true, totals, statName: '<Power>' }).includes('&lt;Power&gt;'), 'Source stat labels are escaped');
    check(JSON.stringify(sourced) === sourceSnapshot, 'Source decomposition does not modify gameplay state');
    const context = { stats: { mysticism: 15, occultism: 15, criticalPower: 0, adresse: 0 } };
    for (const [source, effect, visual] of [
      ['mysticism', 'mysticismPreparationAcceleration', 'preparationTime'],
      ['mysticism', 'mysticismDamageBonus', 'mysticism'],
      ['occultism', 'occultismCritChanceBonus', 'criticalChance'],
      ['occultism', 'occultismDodgeBonus', 'dodge'],
    ]) {
      check(_D3.getStatImprovement(context, source, effect)?.stat === visual, `${effect}: contextual + uses the effect's stat color`);
      check(!_D3.getStatImprovement({ ...context, archetypeFrozen: true }, source, effect), `${effect}: restricted Umbra cannot grant +`);
    }
    check(!_D3.getStatImprovement(context, 'dodge'), 'Owning Occultism alone does not improve permanent dodge');
    context.battleBoosts = { dodge: [{ source: 'occultismInvisible', value: 5, mode: 'flat' }] };
    check(_D3.getStatImprovement(context, 'dodge')?.source === 'occultism', 'Active invisible dodge boost supplies its contextual +');
    delete context.battleBoosts.dodge;
    check(!_D3.getStatImprovement(context, 'dodge'), 'The + disappears when the temporary boost ends');
    const essences = await import("/js/items/essences.js");
    check(essences.resolveAttackNatureFromEssenceurConfig({ slots: [] })[0] === 'inerte', 'Empty essence configuration actually resolves to Inert');
    for (const key of ['attackEssenceRed', 'attackEssenceBlue', 'attackEssenceYellow', 'attackEssenceEmpty']) {
      const text = _D3.calculateStatsDisplay(key, entity).helpContent;
      check(text.includes('Inerte') && !text.includes('toujours conserver'), `${key}: bound helper agrees with the Inert state`);
    }
    const preview = { ...entity, modifierStats: { ...entity.modifierStats,
      preview: { statLeveled: { strength: 10 }, total: { ...entity.stats, strength: 20, physicalDamage: 30 } } } };
    check(_D3.calculateStatsDisplay('physicalDamage', preview).umbraHelperCalculations.autonomousTotal.improvement.parts
      .find(part => part.stat === 'strength').value === 10,
      'Autonomous helper reads preview attribute ratios');
    const moving = structuredClone(entity);
    moving.Archetype = { current: { key: 'mage' } };
    Object.assign(moving.baseStats, { movement: 10, marathon: 2, trailer: 4 });
    E.recomputeEntityStats(moving);
    check(D.getMarathonChance(moving) === 11 && D.getTrailerChance(moving) === 13,
      'Movement gameplay reads Umbra contribution followed by autonomous chance');
    E.recomputeEntityStats(moving);
    check(moving.stats.marathon === 11 && moving.stats.trailer === 13, 'Recomputation never stacks the generated bonus twice');
    moving.baseStats.movement = 0;
    E.recomputeEntityStats(moving);
    check(D.getMarathonChance(moving) === 2 && D.getTrailerChance(moving) === 4,
      'Removing Movement leaves only autonomous probabilities');
    const { attemptExtraLife } = await import("/js/combat/vitals.js");
    for (const pool of ['extraLife', 'fadedLife', 'eternalLife']) {
      const revived = { id: 987195, name: 'Autonomous protection', archetypeFrozen: true, isDEAD: true,
        stats: { HP: { current: 0, max: 100 }, transcendenceTotal: 100, [pool]: { current: 1, max: 1 } },
        extraLifeRegen: { progress: 2 }, eternalLifeRegen: { progress: 1 } };
      const regen = JSON.stringify([revived.extraLifeRegen, revived.eternalLifeRegen]);
      check(attemptExtraLife(revived, { pool }), `${pool}: autonomous protection permits resurrection`);
      check(revived.stats[pool].current === 1, `${pool}: autonomous protection prevents consumption`);
      check(JSON.stringify([revived.extraLifeRegen, revived.eternalLifeRegen]) === regen, `${pool}: no regeneration is restarted`);
      check(revived.archetypeFrozen && revived.stats.HP.current > 0, `${pool}: resurrection preserves frozen status`);
    }
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const host = document.createElement('main');
    host.id = 'autonomous-helper-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:100000;';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    host.querySelector('.section-content.stats [data-mode="stat"]').click();
    window.__autonomousHelperTest = { entity, host };
    return checks;
  });
  const autonomousHost = page.locator('#autonomous-helper-test');
  const powerRow = autonomousHost.locator('.codex-attack-stat-block .stat-container[data-stat="physicalDamage"]');
  assert.match(await powerRow.locator('.stat-name').innerText(), /Puissance Physique X/);
  assert.equal(await powerRow.locator('.stat-name [data-stat-state="X"]').evaluate(node =>
    getComputedStyle(node).backgroundImage.startsWith('linear-gradient(')), true);
  assert.equal((await powerRow.locator('.entite-stat').innerText()).trim(), '25');
  await powerRow.locator('.stat-name').dispatchEvent('mouseover');
  await page.locator('.stat-hover').waitFor({ state: 'visible' });
  assert.doesNotMatch(await page.locator('.stat-hover .stat-hover-body').innerText(), /version améliorée/);
  assert.match(await page.locator('.stat-hover .stat-hover-body').innerText(), /Renforce les dégâts des attaques qui utilisent la puissance physique de 25/);
  await powerRow.dispatchEvent('click');
  assert.deepEqual(await page.locator('[data-umbra-pinned] [data-umbra-calculation]').allInnerTexts(), ['25']);
  assert.equal(await page.locator('[data-umbra-pinned] .helper-calculation-detail').count(), 0);
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').dispatchEvent('mouseover');
  assert.deepEqual(await page.locator('[data-umbra-detail] [data-autonomous-kind]').evaluateAll(nodes => nodes.map(node => [node.dataset.autonomousKind, Number(node.querySelector('.helper-calculation-result').textContent.replace(/\s/g, ''))])),
    [['umbra', 20], ['normal', 5]]);
  assert.equal(await page.locator('[data-umbra-detail] .helper-calculation-detail').count(), 0);
  assert.equal(await page.locator('[data-umbra-detail] .stat-source-details').count(), 0);
  assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Détail du calcul');
  for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').dispatchEvent('mouseover');
    const bounds = await page.locator('[data-umbra-detail]').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Autonomous helper fits ${viewport}`);
    await page.screenshot({ path: resolve(output, `autonomous-stats-${viewport}.png`), animations: 'disabled' });
  }
  await autonomousHost.locator('.stat-container[data-stat="cognitiveExplosion"]').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned]').count(), 1, 'Autonomous helpers replace the existing pinned card');
  assert.doesNotMatch(await autonomousHost.locator('[data-stat="cognitiveExplosion"] .stat-name').innerText(), /\+/, 'A standalone effect has no Umbra + label');
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned], [data-umbra-detail]').count(), 0, 'Clicking outside closes autonomous helpers');
  await page.evaluate(() => window.__autonomousHelperTest.host.remove());
  console.log(`PASS: ${autonomousChecks} autonomous/combined/restricted stat checks, colored + names, source ratios and desktop/mobile helpers`);
  const sourceTotalChecks = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js"), _D4 = await import("/js/combat/statistics.js");
    const H = await import('/js/data/helpers.js');
    let count = 0;
    const check = (ok, message) => { if (!ok) throw Error(message); count++; };
    const inspect = (entity, key, expected) => {
      const before = JSON.stringify(entity);
      const display = D.calculateStatsDisplay(key, entity, _D4.getSafe(entity, key));
      const totals = D.getStatisticSourceTotals(entity, key, display);
      check(Math.abs(totals.reduce((sum, entry) => sum + entry.value, 0) - expected) < .011, `${key}: sources sum to the final displayed amount`);
      check(new Set(totals.map(entry => entry.category)).size === totals.length, `${key}: one total per category`);
      check(JSON.stringify(entity) === before, `${key}: calculating sources never mutates gameplay or previews`);
      const html = H.buildStatisticOrigins({ compact: true, totals });
      const content = document.createElement('template');
      content.innerHTML = html;
      for (const detail of content.content.querySelectorAll('template[data-helper-source-detail]')) {
        const category = detail.parentElement.dataset.helperSource;
        if (category === 'malus') continue;
        const entries = totals.filter(total => (total.family || total.category) === category);
        const expectedLines = entries.some(total => total.normalValue != null || total.improvedValue != null)
          ? [entries.reduce((sum, total) => sum + (total.normalValue ?? total.value), 0), entries.reduce((sum, total) => sum + (total.improvedValue || 0), 0)].filter(value => value)
          : [entries.reduce((sum, total) => sum + total.value, 0)];
        const figures = [...detail.content.querySelectorAll('.helper-figure:not(.helper-calculation-detail *, .stat-source-provenance *)')];
        check(JSON.stringify(figures.map(node => Number(node.textContent.replace(/[^0-9.+-]/g, '')))) === JSON.stringify(expectedLines),
          'Source hover lists the final contributions, with normal and improved amounts separated');
        check(figures.every(node => node.querySelector('.picto-stat')), 'Every source amount has its stat pictogram');
        check(!detail.content.querySelector('template'), 'Source details contain no recursive sources');
        check(detail.content.querySelectorAll('.stat-source-details > .helper-calculation > .helper-calculation-detail').length <= expectedLines.length,
          'Each source line has at most one inline calculation');
      }
      return Object.fromEntries(totals.map(entry => [entry.category, entry.value]));
    };
    const entity = { baseStats: { vigueur: 15, strength: 20, physicalDamage: 5 },
      stats: { vigueur: 15, strength: 20, physicalDamage: 30 }, modifierStats: { durable: { derived: { physicalDamage: 25 } } } };
    const simple = inspect(entity, 'physicalDamage', 30);
    check(simple.umbra === 25 && simple.fixed === 5, '15 Vigueur with 20 Strength contributes 25 ratio points without flat');
    entity.modifierStats.durable.level = { physicalDamage: 3 };
    entity.modifierStats.durable.stuff = { byId: { first: { physicalDamage: { flat: 4, percent: 10 } }, second: { physicalDamage: { flat: 6, percent: 10 } } } };
    entity.stats.physicalDamage = 47;
    const equipped = inspect(entity, 'physicalDamage', 47);
    check(equipped.umbra === 25 && equipped.fixed === 22,
      'Equipment scales the pooled normal inputs (18 * 1.2 rounded to 22), not the Umbra contribution');
    const orfevre = structuredClone(entity);
    orfevre.modifierStats.durable.stuff = {
      byId: { item: { physicalDamage: { flat: 4, percent: 10 } } },
      orfevre: { effectiveById: { item: { physicalDamage: { flat: 6, percent: 15 } } },
        byId: { item: { physicalDamage: { raw: { flat: 4, percent: 10 }, bonus: { flat: 2, percent: 5 }, activePercent: 50 } } } },
    };
    orfevre.stats.physicalDamage = 41;
    const improvedEquipment = inspect(orfevre, 'physicalDamage', 41);
    check(improvedEquipment.umbra === 25 && improvedEquipment.fixed === 16, 'Normal PP includes effective Orfevre equipment instead of its raw bonus, never both');
    entity.modifierStats.preview = { statLeveled: { physicalDamage: 12 }, total: { ...entity.stats, physicalDamage: 59 } };
    const preview = inspect(entity, 'physicalDamage', 59);
    check(preview.fixed === 34, 'Normal PP preview adds 12 to 22, without multiplying the preview again by equipment');
    entity.battleBoosts = { physicalDamage: [{ mode: 'flat', value: 2 }, { mode: 'percent', value: 10 }] };
    const boosted = inspect(entity, 'physicalDamage', 64.6);
    check(Math.abs(boosted.fixed - 39.6) < .00001, 'Normal PP includes combat percentage as damage points, not percentage units');
    const inactive = { baseStats: { cognitiveExplosion: 4, hypercognition: 20, intelligence: 40 }, stats: { cognitiveExplosion: 4, hypercognition: 20, intelligence: 40 }, archetypeFrozen: true };
    check(!inspect(inactive, 'cognitiveExplosion', 4).umbra, 'Inactive Umbra contributes nothing');
    const capped = { baseStats: { cognitiveGenerator: 20, hypercognition: 20 }, stats: { cognitiveGenerator: 20, hypercognition: 20 } };
    const cappedTotals = inspect(capped, 'cognitiveGenerator', 10);
    check(cappedTotals.umbra === 2 && cappedTotals.fixed === 8, 'Only actual essence gains before the cap are counted');
    for (const finalSpeed of [650, 700, 950]) {
      const speed = { baseStats: { speed: 1000 }, stats: { speed: finalSpeed, velocity: 30 } };
      check(inspect(speed, 'speed', finalSpeed).fixed === 1000, 'A neutral base already in the source pipeline is not counted twice');
    }
    const penalty = { baseStats: { vigueur: 15, strength: 20, physicalDamage: 5 },
      stats: { vigueur: 15, strength: 20, physicalDamage: 20 }, modifierStats: { durable: { level: { physicalDamage: -10 } } } };
    check(inspect(penalty, 'physicalDamage', 20).fixed === -5, 'Normal PP retains base 5 and penalty -10 separately in its calculation');
    for (const key of ['physicalResistance', 'magicalResistance', 'physicalPen', 'magicalPen', 'dodge', 'velocity']) {
      const probe = { baseStats: { [key]: 30 }, stats: { [key]: 30, speed: 1000 } };
      const display = D.calculateStatsDisplay(key, probe);
      const conversion = display.umbraHelperCalculations.autonomousConversion;
      if (conversion) inspect(probe, key, conversion.value);
    }
    return count;
  });
  console.log(`PASS: ${sourceTotalChecks} source totals, final units, equipment, percentages, caps, previews and inactive Umbras`);
  await page.setViewportSize({ width: 1280, height: 900 });
  const effectKeys = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js");
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/codex/index.js"), _UI7 = await import("/js/ui/statistics/helpers.js");
    const H = await import('/js/data/helpers.js');
    const entity = structuredClone(window.__autonomousHelperTest.entity);
    entity.id = 987197;
    entity.Archetype = { current: { key: 'mage' } };
    Object.assign(entity.baseStats, { strength: 25, agility: 30, intelligence: 30,
      indestructibility: 80, ambidextry: 30, resilience: 30, occultism: 30, mysticism: 30, equilibre: 30, esoterism: 30, velocity: 45 });
    entity.battleBoosts = {
      strength: [{ value: 4, mode: 'flat', source: 'Renfort Force', id: 'helper-force' }],
      agility: [{ value: 3, mode: 'flat', source: 'Renfort Agilite', id: 'helper-agility' }],
    };
    E.recomputeEntityStats(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const host = document.createElement('main');
    host.id = 'dedicated-helper-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:100000';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const rows = [...host.querySelectorAll('.codex-attack-stat-block [data-stat-effect]')];
    for (const row of rows) {
      const bound = _UI7.getBoundHelperEntity(row);
      const before = JSON.stringify(bound);
      const original = D.calculateStatsDisplay(row.dataset.stat, bound);
      const projected = H.selectStatisticHelper(original, row.dataset.statEffect);
      if (Object.keys(projected.umbraHelperCalculations).join() !== row.dataset.statEffect) throw Error(`Unrelated model: ${row.dataset.statEffect}`);
      if (!projected.helpContent || projected.helpContent !== original.statEffectHelpers[row.dataset.statEffect]) {
        throw Error(`Wrong dedicated effect description: ${row.dataset.statEffect}`);
      }
      if (JSON.stringify(bound) !== before) throw Error('A helper changed gameplay state');
    }
    const ambiguous = ['ambidextry', 'indestructibility', 'resilience', 'occultism', 'equilibre', 'mysticism', 'esoterism'];
    if (host.querySelectorAll('.codex-attack-stat-block .stat-container').length === 0) throw Error('Missing Stats');
    for (const row of host.querySelectorAll('.codex-attack-stat-block .stat-container')) {
      if (ambiguous.includes(row.dataset.stat) && !row.dataset.statEffect) throw Error(`General helper remains: ${row.dataset.stat}`);
    }
    window.__dedicatedHelperTest = { entity, host };
    return rows.map(row => row.dataset.statEffect);
  });
  const dedicatedHost = page.locator('#dedicated-helper-test');
  for (const key of effectKeys) {
    const row = dedicatedHost.locator(`[data-stat-effect="${key}"]`);
    await row.dispatchEvent('click');
    const card = page.locator('[data-umbra-pinned]');
    assert.equal(await card.count(), 1, `One pinned helper for ${key}`);
    assert.equal(await card.getAttribute('data-stat-effect'), key);
    assert.match(await card.locator('.umbra-description').first().innerText(), /^Statistique :/);
    const modelKeys = await card.locator('[data-umbra-calculation]').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.umbraCalculation))]);
    assert.deepEqual(modelKeys, [key], `${key}: only this effect has calculation links`);
    if (key !== 'levelMaximum') {
      assert.match(await readSourceDetails(), /\+ : \+?\s*[\d.]+/);
      assert.match(await card.locator('.stat-source-details').innerText(), /^Source\s*:\s*(?:Umbra|Progression|Stuff|Effet|Base)(?:\s*\+\s*(?:Umbra|Progression|Stuff|Effet|Base))*$/, 'Only source categories are shown');
      assert.equal(await card.locator('.stat-source-details').evaluate(node => getComputedStyle(node).color), 'rgb(255, 155, 0)');
      for (const anchor of await card.locator('[data-umbra-calculation]').all()) {
        await anchor.dispatchEvent('mouseover');
        assert.equal(await page.locator('[data-umbra-detail]').count(), 1, `The ${key} contribution is wired`);
        assert.doesNotMatch(await page.locator('[data-umbra-detail]').innerText(), /Maximum\s*:|Prochain palier|undefined|NaN/);
      }
    }
  }
  const essentialChecks = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js"), _D5 = await import("/js/combat/statistics.js");
    const E = await import("/js/entities/runtime.js");
    const H = await import('/js/data/helpers.js');
    const { balanceData } = await import('/js/data/balanceData.js');
    let count = 0;
    const check = (ok, label) => { if (!ok) throw Error(label); count++; };
    const signedSum = model => model.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0);
    const inspect = (key, probe, modelKey) => {
      const before = JSON.stringify(probe);
      const display = D.calculateStatsDisplay(key, probe);
      const model = display.umbraHelperCalculations[modelKey];
      check(!!model && display.helpContent.includes(`data-umbra-calculation="${modelKey}"`), `${key}: model linked`);
      check(!/NaN|undefined|Maximum\s*:|Prochain palier/.test(display.helpContent), `${key}: clean body, no future caps`);
      for (let index = 0; index < model.parts.length; index++) {
        const detail = H.buildUmbraContributionHelper(model, index);
        check(!!detail && !/NaN|undefined|Maximum\s*:|Prochain palier/.test(detail), `${key}: valid contribution`);
      }
      check(before === JSON.stringify(probe), `${key}: read-only helper`);
      return { display, model };
    };
    for (const base of [65, 100, 170, 300]) {
      for (const will of [0, 1, 30, 79, 80, 81, 120, 149, 150, 200]) {
        for (const granted of [0, 130, 250]) {
          const probe = { level: { current: 1, baseMax: base }, stats: { will },
            ...(granted ? { summonOrigin: { type: 'profanation', generatedLevel: granted } } : {}) };
          const { model } = inspect('will', probe, 'levelMaximum');
          const bonus = E.calculateLvlMaxBonus(will, { baseMaxLevel: base });
          check(model.value === _D5.calculateLvlMaxEntiteWithWill(probe, will), 'Max level uses real engine and custom base');
          check(model.parts[1].curvePreview.current.value === bonus, 'Will contribution is signed, not a made-up ratio');
          check(model.value === Math.max(0, Math.min(signedSum(model), balanceData.level.will.hardMaxLevel)), 'Max level parts explain the final cap');
          check(model.maximumReached === (model.value >= balanceData.level.will.hardMaxLevel), 'Only attained level cap is marked');
        }
      }
    }
    const equipped = { baseStats: { speed: 1000 }, modifierStats: { durable: {
      level: { speed: 50 }, stuff: { byId: { eTest: { speed: { flat: 50, percent: 10 } } },
        orfevre: { effectiveById: { eTest: { speed: { flat: 100, percent: 20 } } } } },
    } } };
    check(E.getStatBeforeGeneration(equipped, 'speed') === 1380, 'Speed uses the effective equipment once, including percentages');
    for (const velocity of [0, 1, 15, 30, 31, 60, 149, 150, 300]) {
      for (const base of [0, 1, 17, 1000, 1380]) {
        const reduction = E.calculateVelocityReduction(velocity, base);
        const adjusted = velocity > 0 && base ? reduction.adjustedSpeed : base;
        const probe = { baseStats: { speed: base }, stats: { speed: adjusted, velocity } };
        const { model } = inspect('speed', probe, 'speedTotal');
        check(model.value === adjusted && signedSum(model) === adjusted, 'Speed contributions reconstruct exact milliseconds');
        check(Number(model.parts[1].arithmetic.terms.at(-1).value) === Number(reduction.percentage.toPrecision(6)),
          'Velocity percentage comes from its curve, not rounded duration');
      }
    }
    equipped.stats = { velocity: 60, speed: E.calculateVelocityReduction(60, 1380).adjustedSpeed };
    equipped.battleBoosts = {
      velocity: [{ mode: 'flat', value: 99 }], speed: [{ mode: 'flat', value: 10 }, { mode: 'percent', value: -10 }],
    };
    const speed = inspect('speed', equipped, 'speedTotal').model;
    check(speed.parts[0].value === 1380 && speed.parts[1].arithmetic.terms[0].value === 60, 'Transient velocity is not applied a second time');
    check(Math.abs(signedSum(speed) - _D5.getSafe(equipped, 'speed')) < 1e-9, 'Post-generation buffs match displayed duration');
    equipped.modifierStats.preview = { total: { ...equipped.stats, velocity: 30, speed: 700 },
      meta: { derived: { speedFromVelocity: true } } };
    const previewSpeed = inspect('speed', equipped, 'speedTotal').model;
    check(previewSpeed.parts[0].value === 1000 && previewSpeed.parts[1].value === 300, 'Preview follows the existing preview speed basis');
    const inspectWeight = probe => {
      const before = JSON.stringify(probe);
      const display = D.calculateStatsDisplay('weight', probe);
      const movement = D.calculateStatsDisplay('shift', probe);
      const weight = E.getMovementWeightMalus(probe);
      for (const [key, helper] of [['weight', display], ['shift', movement]]) {
        const content = document.createElement('template');
        content.innerHTML = helper.helpContent;
        const category = content.content.querySelector(`[data-helper-stat="${weight.weightClass}"]`);
        check(category?.textContent.includes(weight.label) && category.textContent.includes(String(weight.weight)), `${key}: current weight and category are visible`);
        check(!!category.querySelector(`.picto-stat.${weight.weightClass}`), `${key}: category pictogram and color classes are retained`);
        const cost = [...content.content.querySelectorAll('[data-helper-stat="shift"]')]
          .find(node => node.textContent === `${1 + weight.malus} charge${weight.malus ? 's' : ''}`);
        check(!!cost, `${key}: charge cost agrees with combat, with singular/plural`);
        check(helper.shiftWeightScore === weight.weight && !/NaN|undefined/.test(helper.helpContent), `${key}: real weight field, no missing values`);
      }
      check(!display.umbraHelperCalculations?.weightTotal, 'No reconstructed weight formula remains in the helper');
      check(movement.shiftWeightClass === weight.weightClass && movement.shiftWeightLabel === weight.label
        && movement.shiftWeightMalus === weight.malus, 'Movement reads the engine category and penalty');
      check(before === JSON.stringify(probe), 'Weight and movement helpers are read-only');
      return weight;
    };
    const cfg = balanceData.movement.weight;
    for (const strength of [0, 1, 12, 60]) for (const agility of [0, 1, 4, 50]) {
      for (const intelligence of [0, 30]) for (const hp of [1, 80, 10000]) {
        const probe = { level: { current: 3 }, stats: { strength, agility, intelligence, HP: { current: 1, max: hp } } };
        const generated = E.calculateGeneratedWeight(probe);
        const force = Math.max(1, strength);
        const agi = Math.max(1, agility);
        const relay = agi <= force / cfg.strengthRelayThreshold ? force * cfg.strengthRelayRatio : 0;
        const carrying = Math.max(cfg.minCarryingPower, Math.max(agi, relay)
          + intelligence * cfg.intelligenceRatio + force * cfg.strengthPassiveRatio);
        const expected = Math.max(0, Math.min(100, Math.round(hp / 3 / carrying * cfg.weightMultiplier)));
        check(generated === expected, 'Original weight formula still uses HP max, level and attribute relay');
        probe.stats.weight = generated - 5;
        check(inspectWeight(probe).weight === Math.max(0, generated - 5), 'Weight modifiers are applied once');
      }
    }
    const missingWeight = { level: 2, stats: { strength: 1, agility: 10, intelligence: 20, HP: { max: 100 } } };
    check(inspectWeight(missingWeight).weight === E.calculateGeneratedWeight(missingWeight), 'Missing stored weight uses the engine fallback');
    for (const [value, category, malus] of [[0, 'feather-weight', 0], [19, 'feather-weight', 0],
      [20, 'light-weight', 0], [39, 'light-weight', 0], [40, 'middle-weight', 1], [59, 'middle-weight', 1],
      [60, 'heavy-weight', 2], [79, 'heavy-weight', 2], [80, 'super-heavy-weight', 3], [100, 'super-heavy-weight', 3]]) {
      const probe = { ...missingWeight, stats: { ...missingWeight.stats, weight: value } };
      const state = inspectWeight(probe);
      check(state.weightClass === category && state.malus === malus, 'Original category boundaries and penalties remain unchanged');
      probe.modifierStats = { preview: { total: { weight: 40 } } };
      check(inspectWeight(probe).weightClass === 'middle-weight', 'The shared weight reader respects previews');
    }
    const oldRatio = cfg.intelligenceRatio;
    try {
      cfg.intelligenceRatio = .5;
      const probe = { level: 2, stats: { strength: 1, agility: 10, intelligence: 20, HP: { max: 100 } } };
      probe.stats.weight = E.calculateGeneratedWeight(probe);
      check(inspectWeight(probe).weight === 50, 'Weight uses the live balance values');
    } finally { cfg.intelligenceRatio = oldRatio; }
    return count;
  });
  const weightVisualChecks = await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js"), _UI8 = await import("/js/ui/statistics/components.js");
    const E = await import("/js/entities/runtime.js");
    const row = window.__dedicatedHelperTest.host.querySelector('.codex-attack-stat-block .stat-container[data-stat="weight"]');
    const original = UI.getBoundHelperEntity(row);
    const before = JSON.stringify(original);
    let count = 0;
    const check = (ok, label) => { if (!ok) throw Error(label); count++; };
    for (const [values, category, color, iconFile, qualifier] of [
      [[0, 19], 'feather-weight', 'rgb(91, 207, 0)', 'light', 'Plume'],
      [[20, 39], 'light-weight', 'rgb(91, 207, 0)', 'light', 'Léger'],
      [[40, 59], 'middle-weight', 'rgb(255, 220, 41)', 'middle', 'Moyen'],
      [[60, 79], 'heavy-weight', 'rgb(255, 116, 0)', 'heavy', 'Lourd'],
      [[80, 100], 'super-heavy-weight', 'rgb(164, 0, 0)', 'super-heavy', 'Grotesque'],
    ]) for (const weight of values) {
      const probe = { stats: { weight } };
      const snapshot = JSON.stringify(probe);
      _UI8.syncStatCurseMarker(row, probe, 'weight');
      const picto = row.querySelector('.stat-picto-valeur > .picto-stat');
      check(picto.classList.contains(category) && !picto.classList.contains('weight'), 'Weight uses its engine category, not the generic icon');
      check(getComputedStyle(picto).backgroundImage.includes(`picto-weight-${iconFile}.svg`), 'Weight icon matches its category');
      const image = new Image();
      image.src = getComputedStyle(picto).backgroundImage.slice(5, -2);
      await image.decode();
      check(image.naturalWidth > 0, 'Weight SVG loads');
      check(row.querySelector('.entite-stat').textContent === qualifier, 'Weight label follows live category changes');
      check(getComputedStyle(row.querySelector('.stat-name > span')).color === color
        && getComputedStyle(row.querySelector('.entite-stat')).color === color, 'Weight label and value use the category color');
      check(!row.querySelector('[data-stat-state]'), 'The normal/+ color treatment must not override a weight category');
      check(snapshot === JSON.stringify(probe), 'Rendering weight never modifies its value');
    }
    _UI8.syncStatCurseMarker(row, { stats: { weight: 0 }, modifierStats: { preview: { total: { weight: 80 } } } }, 'weight');
    check(row.querySelector('.picto-stat').classList.contains('super-heavy-weight'), 'Weight preview changes the icon and category');
    const example = { level: 10, stats: { HP: { max: 300, current: 1 }, strength: 30, agility: 8, intelligence: 6 } };
    check(E.calculateGeneratedWeight(example) === 35 && E.getMovementWeightMalus(example).weightClass === 'light-weight', 'Documented numerical example matches the engine');
    _UI8.syncStatCurseMarker(row, original, 'weight');
    check(JSON.stringify(original) === before, 'Original entity is unchanged after weight display checks');
    return count;
  });
  console.log(`PASS: ${weightVisualChecks} weight category icons, colors, live previews and engine-example checks`);
  await page.evaluate(async () => {
    const { buildStatHoverCard } = await import('/js/data/helpers.js');
    for (const [family, color] of [['', 'rgb(217, 155, 0)'], ['force', 'rgb(172, 0, 0)'],
      ['intelligence', 'rgb(0, 152, 255)'], ['agilite', 'rgb(255, 174, 0)']]) {
      const card = document.createElement('div');
      card.className = `stat-hover ${family}`;
      card.style.cssText = 'position:fixed;visibility:hidden;width:300px;';
      card.innerHTML = buildStatHoverCard({ umbraHTML: 'Stat', helperHTML: 'Valeur', ambianceHTML: '' });
      document.body.append(card);
      try {
        const line = card.querySelector('.stat-hover-header > .separation-line');
        if (!getComputedStyle(line).backgroundImage.includes(color)) throw Error(`Header separator color: ${family || 'autonomous'}`);
        if (line.getBoundingClientRect().height !== 1 || line.getBoundingClientRect().width <= 0) throw Error('Header separator must be visible');
      } finally { card.remove(); }
    }
  });
  await dedicatedHost.locator('.codex-attack-stat-block .stat-container[data-stat="weight"]').dispatchEvent('click');
  const weightCard = page.locator('[data-umbra-pinned]');
  assert.match(await weightCard.locator('.stat-hover-body').innerText(), /Poids .* : \d+.*déplacements.*charges?/s);
  assert.doesNotMatch(await weightCard.locator('.stat-hover-body').innerText(), /HP max|Intelligence|arrondi|capacité de déplacement/);
  assert.equal(await weightCard.locator('.helper-calculation, [data-autonomous-calculation]').count(), 0);
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const bounds = await weightCard.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    await page.screenshot({ path: resolve(output, `weight-movement-${width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const stat of ['weight', 'shift']) {
    await page.evaluate(async stat => {
      const UI = await import("/js/ui/statistics/helpers.js"), _UI9 = await import("/js/ui/statistics/components.js");
      const row = window.__dedicatedHelperTest.host.querySelector(`.codex-attack-stat-block .stat-container[data-stat="${stat}"]`);
      const original = UI.getBoundHelperEntity(row);
      const scope = row.closest('.codex-substat-panel--umbra') || row.closest('.codex-entity-scan');
      const preview = structuredClone(original);
      // Isolate this synthetic preview from the real army's live stock lookup.
      preview.id = 987209;
      const originalId = row.dataset.entityId;
      row.dataset.entityId = String(preview.id);
      preview.stats.weight = 80;
      preview.stats.shift = { current: 1, max: 10 };
      preview.baseStats.shift = 10;
      preview.modifierStats = { ...preview.modifierStats, preview: { statLeveled: { shift: 10 },
        total: { ...preview.stats, weight: 67, shift: { current: 11, max: 20 } } } };
      window.__weightHelperPreview = { scope, original, originalId, snapshot: JSON.stringify(preview), preview };
      UI.bindHelperEntity(scope, preview);
      _UI9.syncStatCurseMarker(row, preview, stat);
    }, stat);
    await page.locator('body').dispatchEvent('click');
    const row = dedicatedHost.locator(`.codex-attack-stat-block .stat-container[data-stat="${stat}"]`);
    await row.dispatchEvent('click');
    const body = page.locator('[data-umbra-pinned] .stat-hover-body');
    const headerLine = page.locator('[data-umbra-pinned] .stat-hover-header > .separation-line');
    assert.match(await headerLine.evaluate(node => getComputedStyle(node).backgroundImage), /rgb\(217, 155, 0\)/);
    assert.equal((await headerLine.boundingBox()).height, 1);
    assert.match(await body.innerText(), /Poids lourd/);
    assert.match(await body.innerText(), /3 charges/);
    const category = body.locator('[data-helper-stat="heavy-weight"]');
    assert.match(await category.innerText(), /67/);
    assert.equal(await category.locator('span.heavy-weight:not(.picto-stat)').evaluate(node => getComputedStyle(node).color), 'rgb(255, 116, 0)');
    assert.match(await category.locator('.picto-stat').evaluate(node => getComputedStyle(node).backgroundImage), /picto-weight-heavy\.svg/);
    if (stat === 'shift') assert.match(await body.innerText(), /Déplacements disponibles : 11.*Déplacements max : 20.*Poids actuel : 67 · Poids lourd/s);
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const bounds = await page.locator('[data-umbra-pinned]').boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      await page.screenshot({ path: resolve(output, `${stat}-preview-${width}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      const test = window.__weightHelperPreview;
      if (JSON.stringify(test.preview) !== test.snapshot) throw Error('Weight helper mutated preview stats');
      delete test.preview.modifierStats.preview;
    });
    await page.locator('body').dispatchEvent('click');
    await row.dispatchEvent('click');
    assert.match(await body.innerText(), /Poids grotesque/);
    assert.match(await body.innerText(), /4 charges/);
    assert.match(await body.locator('[data-helper-stat="super-heavy-weight"]').innerText(), /80/);
    if (stat === 'shift') assert.match(await body.innerText(), /Déplacements disponibles : 1.*Déplacements max : 10/s);
    await page.evaluate(async stat => {
      const UI = await import("/js/ui/statistics/helpers.js"), _UI0 = await import("/js/ui/statistics/components.js");
      const { scope, original, originalId } = window.__weightHelperPreview;
      const row = window.__dedicatedHelperTest.host.querySelector(`.codex-attack-stat-block .stat-container[data-stat="${stat}"]`);
      row.dataset.entityId = originalId;
      UI.bindHelperEntity(scope, original);
      _UI0.syncStatCurseMarker(row, original, stat);
      delete window.__weightHelperPreview;
    }, stat);
  }
  console.log('PASS: weight/movement helpers show preview category, icon, color and cost, then restore committed values; desktop/mobile bounds');
  for (const [stat, modelKey] of [['speed', 'speedTotal'], ['will', 'levelMaximum']]) {
    const row = dedicatedHost.locator(stat === 'will' ? '[data-stat-effect="levelMaximum"]' : `.codex-attack-stat-block .stat-container[data-stat="${stat}"]`);
    await row.dispatchEvent('click');
    assert.equal(await page.locator('[data-umbra-pinned]').count(), 1);
    const card = page.locator('[data-umbra-pinned]');
    for (const anchor of await card.locator(`[data-umbra-calculation="${modelKey}"]`).all()) {
      await anchor.dispatchEvent('mouseover');
      assert.equal(await page.locator('[data-umbra-detail]').count(), 1, `${stat}: contribution opens`);
      assert.doesNotMatch(await page.locator('[data-umbra-detail]').innerText(), /Maximum\s*:|Prochain palier|NaN|undefined/);
    }
    for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width, height });
      await card.locator(`[data-umbra-calculation="${modelKey}"]`).last().dispatchEvent('mouseover');
      for (const selector of ['[data-umbra-pinned]', '[data-umbra-detail]']) {
        const bounds = await page.locator(selector).boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${stat}: ${viewport} bounds`);
      }
      await page.screenshot({ path: resolve(output, `${stat}-layered-${viewport}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.locator('body').dispatchEvent('click');
  console.log(`PASS: ${essentialChecks} weight/turn speed/max-level checks, live ratios, equipment, previews and layered desktop/mobile helpers`);
  await dedicatedHost.locator('[data-stat-effect="indestructibilityBonus"]').dispatchEvent('click');
  assert.doesNotMatch(await page.locator('[data-umbra-pinned] .stat-hover-body').innerText(), /Peau indestructible|Régénération de Combat|HP max/);
  await dedicatedHost.locator('[data-stat-effect="indestructibilityReductionTotal"]').dispatchEvent('click');
  assert.match(await page.locator('[data-umbra-pinned] .stat-hover-body').innerText(), /L'entité réduit tous les dégâts subis de/);
  assert.doesNotMatch(await page.locator('[data-umbra-pinned] .stat-hover-body').innerText(), /chance d'annuler|Régénération de Combat/);
  const reductionSources = await readSourceDetails();
  assert.match(reductionSources, /\+ : \+ [\d.]+ %/);
  assert.doesNotMatch(reductionSources, /Renfort|Force|Agilite/);
  await dedicatedHost.locator('[data-stat-effect="ambidextryDamageBonus"]').dispatchEvent('click');
  const secondHitSources = await readSourceDetails();
  assert.match(secondHitSources, /\+ : \+ [\d.]+ %/);
  assert.match(secondHitSources, /Dégâts du deuxième coup : \+ 20 %/);
  assert.doesNotMatch(secondHitSources, /Ambidextrie|Agilité|Valeur fixe/);
  await dedicatedHost.locator('[data-stat-effect="indestructibilityReductionTotal"]').dispatchEvent('click');
  const previewCheck = await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const D = await import("/js/ui/statistics/details.js");
    const row = window.__dedicatedHelperTest.host.querySelector('[data-stat-effect="indestructibilityReductionTotal"]');
    const bound = UI.getBoundHelperEntity(row);
    const committed = JSON.stringify(bound.stats);
    bound.modifierStats.preview = { total: { ...bound.stats, strength: 90 } };
    const expected = D.calculateStatsDisplay('indestructibility', bound).umbraHelperCalculations.indestructibilityReductionTotal;
    window.__dedicatedHelperTest.previewOriginal = committed;
    return expected;
  });
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').dispatchEvent('mouseover');
  assert.ok((await page.locator('[data-umbra-detail] .stat-hover-body').innerText())
    .includes(`${previewCheck.parts[1].compact.source.value} ×`), 'Detail reads live preview inputs including the active buff');
  await page.evaluate(() => window.dispatchEvent(new Event('selectedArmyAUpdated')));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-umbra-pinned]').evaluate(node => node._umbraCalculations.indestructibilityReductionTotal.value), previewCheck.value);
  for (const [width, height, viewport] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').dispatchEvent('mouseover');
    for (const selector of ['[data-umbra-pinned]', '[data-umbra-detail]']) {
      const bounds = await page.locator(selector).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Dedicated helper fits ${viewport}`);
    }
    await page.screenshot({ path: resolve(output, `dedicated-stats-${viewport}.png`), animations: 'disabled' });
  }
  await page.locator('body').dispatchEvent('click');
  assert.equal(await page.locator('[data-umbra-pinned], [data-umbra-detail]').count(), 0);
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const row = window.__dedicatedHelperTest.host.querySelector('[data-stat-effect="indestructibilityReductionTotal"]');
    if (JSON.stringify(UI.getBoundHelperEntity(row).stats) !== window.__dedicatedHelperTest.previewOriginal) throw Error('Preview helper changed committed stats');
    window.__dedicatedHelperTest.host.remove();
  });
  console.log(`PASS: ${effectKeys.length} dedicated statistic helpers, isolated effects, pin replacement, sources, previews and mobile bounds`);
  await page.setViewportSize({ width: 1280, height: 900 });
  const conversions = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js");
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/codex/index.js"), _UI1 = await import("/js/ui/statistics/helpers.js");
    const H = await import('/js/data/helpers.js');
    const entity = structuredClone(window.__autonomousHelperTest.entity);
    entity.id = 987199;
    entity.Archetype = { current: { key: 'mage' } };
    Object.assign(entity.baseStats, { strength: 25, intelligence: 10, agility: 15,
      constitution: 8, integrite: 3, inflexion: 4, finesse: 5, adresse: 22, vivacite: 5,
      physicalResistance: 80, magicalResistance: 7, physicalPen: 2, magicalPen: 3,
      velocity: 10, movement: 10, marathon: 2, trailer: 4, vitality: 12, robustness: 30,
      haste: 8, precision: 20, criticalPower: 35, bloodFury: 20, hypercognition: 20,
      transcendence: 30, weaponMastery: 20, indestructibility: 40, resilience: 30,
      occultism: 30, mysticism: 30, equilibre: 30, esoterism: 30, astrality: 20,
      criticalChance: 2, criticalDamage: 3, hpBattleRegen: 1 });
    E.recomputeEntityStats(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const root = document.createElement('main');
    root.id = 'conversion-helper-test';
    root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:100000';
    document.body.append(root);
    UI.createCodexEntityScan(entity, root, `codex-entity_${entity.id}`);
    root.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    root.querySelector('.section-content.stats [data-mode="stat"]').click();
    // These values have other HUD surfaces; exercise their reusable stat helpers too.
    for (const [stat, name] of [['velocity', 'Vélocité'], ['armor', 'Armure']]) {
      const row = document.createElement('div');
      row.className = 'stat-container';
      Object.assign(row.dataset, { stat, autonomousHelper: 'true', hover: 'true', entityId: String(entity.id) });
      row.innerHTML = `<span class="stat-name">${name}</span>`;
      _UI1.bindHelperEntity(row, entity);
      root.querySelector('.codex-attack-stat-block').append(row);
    }
    window.__conversionHelperTest = { entity, root, original: JSON.stringify(entity) };
    return ['physicalResistance', 'magicalResistance', 'physicalPen', 'magicalPen', 'dodge', 'velocity'].map(key => {
      const calculated = D.calculateStatsDisplay(key, entity);
      const model = calculated.umbraHelperCalculations.autonomousTotal;
      return { key, final: model.value, parts: model.contributions.filter(part => part.value !== 0).map(part => Math.abs(part.value)) };
    });
  });
  const conversionRoot = page.locator('#conversion-helper-test');
  for (const [effect, colorClass] of [['mysticismPreparationAcceleration', 'preparationTime'],
    ['mysticismDamageBonus', 'mysticism'], ['occultismCritChanceBonus', 'criticalChance']]) {
    const name = conversionRoot.locator(`[data-stat-effect="${effect}"] .stat-name`);
    assert.match(await name.innerText(), /\+/, `${effect}: contextual bonus is marked + in Stats`);
    assert.equal(await name.locator(`.${colorClass}`).count(), colorClass === 'mysticism' ? 2 : 1,
      `${effect}: name retains its own stat color with Umbra fallback`);
  }
  assert.equal(await conversionRoot.locator('[data-stat-improvement], [data-stat="improvedStatistic"]').count(), 0);
  for (const key of ['physicalResistance', 'marathon', 'trailer']) {
    const label = conversionRoot.locator(`.codex-attack-stat-block .stat-container[data-stat="${key}"] .stat-name`);
    const state = key === 'physicalResistance' ? 'X' : '◇';
    assert.ok((await label.innerText()).includes(state));
    assert.equal(await label.locator(`[data-stat-state="${state}"]`).count(), 1, `${key}: normal and Umbra use the expected state`);
  }
  assert.equal(await conversionRoot.locator('.stat-name .trailer').evaluate(node => {
    const original = node.className;
    node.className = 'helper-stat-without-color';
    const same = getComputedStyle(node).color === getComputedStyle(node.parentElement).color;
    node.className = original;
    return same;
  }), true, 'An absent stat color inherits its Umbra color');
  const stateColorChecks = await conversionRoot.locator('.stat-name [data-stat-state]').evaluateAll(nodes => {
    const reference = document.createElement('span');
    document.body.append(reference);
    for (const node of nodes) {
      const actual = getComputedStyle(node), state = node.dataset.statState;
      const base = actual.getPropertyValue('--stat-color').trim();
      if (!base) throw Error(`${node.textContent}: missing stat color`);
      reference.style.color = state === 'normal' ? '#dce1e6' : state === 'umbra' ? base : `hsl(from ${base} h s calc(l + 20))`;
      reference.style.backgroundImage = `linear-gradient(to right, hsl(from ${base} h s calc(l + 20)), ${base})`;
      const expected = getComputedStyle(reference);
      if (['X', '◇', '◆', 'Ω'].includes(state)) {
        if (actual.backgroundImage !== expected.backgroundImage || actual.webkitTextFillColor !== 'rgba(0, 0, 0, 0)') {
          throw Error(`${node.textContent}: gradient must run from lightened stat to its base color`);
        }
      } else if (actual.color !== expected.color) throw Error(`${node.textContent}: wrong ${state} text color`);
    }
    reference.remove();
    return nodes.length;
  });
  assert.ok(stateColorChecks > 20, 'Stat families retain their normal, +, X or Umbra color treatment');
  for (const conversion of conversions) {
    const row = conversionRoot.locator(`.codex-attack-stat-block .stat-container[data-stat="${conversion.key}"]`).first();
    await row.dispatchEvent('click');
    const card = page.locator('[data-umbra-pinned]');
    const summary = card.locator('[data-autonomous-calculation][data-umbra-calculation="autonomousTotal"]');
    assert.equal(await summary.innerText(), `${conversion.final} %`);
    assert.equal(await card.locator('.helper-calculation-detail').count(), 0,
      `${conversion.key}: point conversion no longer repeats in the main helper`);
    await summary.focus();
    assert.deepEqual(await page.locator('[data-umbra-detail] [data-autonomous-kind] .helper-calculation-result')
      .evaluateAll(nodes => nodes.map(node => parseFloat(node.textContent.replace(/\s/g, '')))), conversion.parts);
    assert.equal(await page.locator('[data-umbra-detail] .helper-calculation-detail').count(), 0,
      'The compact detail gives exclusive Umbra, Stat+ and fixed contributions without repeating the point-conversion formula');
    assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Détail du calcul');
    assert.equal((await page.locator('[data-umbra-detail]').innerText()).includes('La valeur finale est arrondie'), false,
      'The compact detail does not repeat the parent rounding notice');
  }
  await page.locator('body').dispatchEvent('click');
  const autonomousRows = await page.evaluate(async () => {
    const D = await import("/js/ui/statistics/details.js"), _D6 = await import("/js/combat/statistics.js");
    const H = await import('/js/data/helpers.js');
    const UI = await import("/js/ui/statistics/helpers.js");
    const rows = [...window.__conversionHelperTest.root.querySelectorAll('[data-autonomous-helper="true"]')];
    const prose = html => {
      const root = document.createElement('div');
      root.innerHTML = html;
      root.querySelectorAll('template, .stat-source-details, .helper-calculation, .helper-figure').forEach(node => node.remove());
      return root.textContent.replace(/\s+/g, ' ').trim();
    };
    window.__conversionHelperTest.prose = prose;
    return rows.map((row, index) => {
      row.dataset.auditStat = String(index);
      const entity = UI.getBoundHelperEntity(row);
      const raw = D.calculateStatsDisplay(row.dataset.stat, entity, _D6.getSafe(entity, row.dataset.stat));
      const calculated = row.dataset.statEffect ? H.selectStatisticHelper(raw, row.dataset.statEffect) : raw;
      const root = document.createElement('div');
      root.innerHTML = calculated.helpContent || '';
      const visibleModels = new Set([...root.querySelectorAll('[data-umbra-calculation]')].map(node => node.dataset.umbraCalculation));
      if (visibleModels.has('autonomousConversion')) visibleModels.add('generatedUmbraTarget');
      const sourceDisplay = { ...calculated, umbraHelperCalculations: Object.fromEntries(
        Object.entries(calculated.umbraHelperCalculations || {}).filter(([key]) => visibleModels.has(key))) };
      const before = JSON.stringify(entity);
      const totals = D.getStatisticSourceTotals(entity, row.dataset.stat, sourceDisplay);
      const modelKey = row.dataset.stat === 'shift' ? null : ['autonomousConversion', 'generatedUmbraTarget', 'autonomousTotal']
        .find(key => sourceDisplay.umbraHelperCalculations[key]) || Object.keys(sourceDisplay.umbraHelperCalculations)[0];
      const rawValue = _D6.getSafe(entity, row.dataset.stat, 0);
      const timingTotal = { cooldownTime: _D6.getFinalAttackCooldownReduc, preparationTime: _D6.getFinalAttackPreparationReduc,
        executionTime: _D6.getFinalAttackExecutionReduc, recuperationTime: _D6.getFinalAttackRecoveryReduc,
        projectileTime: _D6.getFinalAttackProjectileSpeed }[row.dataset.stat];
      const expected = timingTotal ? timingTotal(entity) : modelKey ? Number(sourceDisplay.umbraHelperCalculations[modelKey].value)
        : row.dataset.stat === 'weight' ? calculated.shiftWeightScore : Number(rawValue?.max ?? rawValue?.current ?? rawValue) || 0;
      if (Math.abs(totals.reduce((sum, total) => sum + total.value, 0) - expected) > .011) {
        throw Error(`${row.dataset.stat}/${row.dataset.statEffect || ''}: source totals ${JSON.stringify(totals)} do not match displayed ${expected}`);
      }
      if (JSON.stringify(entity) !== before) throw Error('Source totals changed entity state');
      const results = [...root.querySelectorAll('.helper-calculation > .helper-calculation-result')]
        .filter(node => !node.parentElement.parentElement?.closest('.helper-calculation'))
        .map(node => node.textContent.trim());
      return { index, key: row.dataset.stat, effect: row.dataset.statEffect, prose: prose(calculated.helpContent), results, sourceTotal: expected };
    });
  });
  let autonomousDetails = 0;
  const sourceMatrix = await page.evaluate(async rows => {
    const D = await import("/js/ui/statistics/details.js"), _D7 = await import("/js/combat/statistics.js");
    const E = await import("/js/entities/runtime.js");
    const H = await import('/js/data/helpers.js');
    const { getDisplayStatKey } = await import("/js/entities/rules.js");
    const Upgrade = await import("/js/entities/progression.js");
    const { stats } = await import('/js/data/statsData.js');
    const { isUmbraRestricted } = await import('/js/procedural/proc-bareme.js');
    let checks = 0;
    const failures = [];
    const capacity = value => Number(value?.max ?? value?.current ?? value) || 0;
    const number = text => Number(text.replace(/\s/g, '').replace(',', '.').match(/[+-]?[\d.]+/)?.[0]) || 0;
    const audit = (entity, label) => {
      const before = JSON.stringify(entity);
      for (const { key, effect } of rows) {
        const raw = D.calculateStatsDisplay(key, entity, _D7.getSafe(entity, key));
        const display = effect ? H.selectStatisticHelper(raw, effect) : raw;
        const body = document.createElement('div');
        body.innerHTML = display.helpContent || '';
        const visible = new Set([...body.querySelectorAll('[data-umbra-calculation]')].map(node => node.dataset.umbraCalculation));
        if (visible.has('autonomousConversion')) visible.add('generatedUmbraTarget');
        const calculated = { ...display, umbraHelperCalculations: Object.fromEntries(
          Object.entries(display.umbraHelperCalculations || {}).filter(([name]) => visible.has(name))) };
        const totals = D.getStatisticSourceTotals(entity, key, calculated);
        const footer = document.createElement('div');
        footer.innerHTML = H.buildStatisticOrigins({ compact: true, totals });
        const rendered = [...footer.querySelectorAll('[data-helper-source-detail]')]
          .flatMap(template => [...template.content.querySelectorAll('.helper-figure:not(.helper-calculation-detail *, .stat-source-provenance *, .stat-source-malus *)')])
          .reduce((sum, figure) => sum + number(figure.textContent), 0);
        const result = [...body.querySelectorAll('.helper-calculation > .helper-calculation-result .helper-figure')]
          .find(node => effect || node.dataset.helperStat === getDisplayStatKey(key));
        const displayed = result ? number(result.textContent)
          * (totals.some(total => total.unit === ' ms') && /\bs$/.test(result.textContent.trim()) ? 1000 : 1) : null;
        const expected = key === 'shift' ? capacity(_D7.getSafe(entity, 'shift'))
          : key === 'weight' ? E.getMovementWeightMalus(entity).weight
          : key === 'extraLife' ? display.extraLifeMax
          : result ? displayed : capacity(_D7.getSafe(entity, key));
        if (Math.abs(rendered - expected) > .001) failures.push({ label, key, effect, expected, rendered, totals });
        if (new Set(totals.map(entry => entry.category)).size !== totals.length) throw Error('Repeated source category');
        if (isUmbraRestricted(entity, key) && totals.some(entry => entry.category === 'umbra' && entry.value)) {
          failures.push({ label, key, effect, inactiveUmbra: totals });
        }
        checks++;
      }
      if (JSON.stringify(entity) !== before) throw Error(`${label}: source audit changed gameplay or preview data`);
    };
    for (const points of [0, 15, 300]) for (const state of ['active', 'egare', 'frozen']) {
      const entity = structuredClone(window.__conversionHelperTest.entity);
      entity.Archetype = { current: { key: state === 'egare' ? 'egare' : 'mage' } };
      entity.archetypeFrozen = state === 'frozen';
      for (const stat of stats.filter(stat => stat.nature === 'umbra')) entity.baseStats[stat.key] = points;
      Object.assign(entity.baseStats, { strength: points + 11, intelligence: points + 7, agility: points + 3 });
      E.recomputeEntityStats(entity);
      const label = `${state}/${points}`;
      audit(entity, label);
      const keys = ['physicalDamage', 'magicalDamage', 'physicalResistance', 'magicalResistance', 'physicalPen', 'magicalPen',
        'dodge', 'criticalChance', 'criticalDamage', 'cognitiveExplosion', 'cognitiveGenerator', 'transcendenceTotal',
        'attackCooldownReduc', 'attackPreparationReduc', 'attackExecutionReduc', 'attackRecoveryReduc', 'attackProjectileSpeed'];
      entity.modifierStats.durable.stuff = { byId: { audit: {} } };
      entity.battleBoosts = {};
      for (const key of keys) {
        entity.modifierStats.durable.level[key] = { flat: 3, percent: 7 };
        entity.modifierStats.durable.stuff.byId.audit[key] = { flat: 2, percent: 13 };
        entity.stats[key] = E.getStatBeforeGeneration(entity, key);
        entity.battleBoosts[key] = [{ mode: 'flat', value: -1.25 }, { mode: 'percent', value: 12.5 }];
      }
      audit(entity, `${label}/equipment-buffs`);
      const committed = JSON.stringify(entity.stats);
      entity.modifierStats.preview = { statLeveled: { strength: 9, intelligence: 13, agility: 7, vigueur: 2,
        hypercognition: 11, movement: 3, criticalPower: 4, indestructibility: 2, transcendence: 5 } };
      Upgrade.ComputeStatPreview(entity);
      audit(entity, `${label}/preview`);
      audit({ ...entity, stats: entity.modifierStats.preview.total }, `${label}/level-up-view`);
      entity.modifierStats.preview = null;
      if (JSON.stringify(entity.stats) !== committed) throw Error('Preview modified committed stats');
      audit(entity, `${label}/cancelled`);
    }
    const fallbackWeight = { stats: { HP: { current: 100, max: 100 }, strength: 10, agility: 20, intelligence: 10 }, level: 1 };
    audit(fallbackWeight, 'missing-stored-weight');
    return { checks, failures };
  }, autonomousRows);
  await writeFile(resolve(output, 'source-totals-audit.json'), JSON.stringify(sourceMatrix, null, 2));
  const uniqueSourceFailures = [...new Map(sourceMatrix.failures.map(failure =>
    [`${failure.key}/${failure.effect || ''}/${failure.inactiveUmbra ? 'inactive' : 'sum'}`, failure])).values()];
  assert.deepEqual(uniqueSourceFailures, [], 'Rendered sources must add up to the visible final value in every state');
  console.log(`PASS: ${sourceMatrix.checks} rendered source sums across active, restricted, zero, capped, buffed, preview and cancelled states`);
  for (const row of autonomousRows) {
    await conversionRoot.locator(`[data-audit-stat="${row.index}"]`).dispatchEvent('click');
    const card = page.locator('[data-umbra-pinned]');
    assert.equal(await card.count(), 1, `${row.key}: single pinned card`);
    assert.equal(await card.locator('.helper-calculation-detail').count(), 0, `${row.key}: no calculation detail in the main helper`);
    assert.deepEqual(await card.locator('.helper-calculation > .helper-calculation-result').allTextContents(), row.results,
      `${row.key}: every final value is preserved`);
    assert.equal(await card.locator('.stat-hover-body').evaluate(node => window.__conversionHelperTest.prose(node.innerHTML)), row.prose,
      `${row.key}: existing player text is preserved`);
    const renderedSourceTotal = await card.locator('template[data-helper-source-detail]').evaluateAll(templates =>
      templates.flatMap(template => [...template.content.querySelectorAll('.helper-figure:not(.helper-calculation-detail *, .stat-source-provenance *, .stat-source-malus *)')])
        .reduce((sum, figure) => sum + Number(figure.textContent
        .replace(/\s/g, '').match(/[+-]?[\d.]+/)?.[0] || 0), 0));
    assert.ok(Math.abs(renderedSourceTotal - row.sourceTotal) < .011, `${row.key}: actual pinned footer sums to the final result`);
    for (const anchor of await card.locator('[data-autonomous-calculation], [data-umbra-summary]').all()) {
      await anchor.dispatchEvent('mouseover');
      const detail = page.locator('[data-umbra-detail]');
      assert.equal(await detail.count(), 1, `${row.key}: final value opens its detail`);
      assert.equal(await detail.locator('.umbra-description').innerText(), 'Détail du calcul');
      assert.doesNotMatch(await detail.innerText(), /undefined|NaN|Maximum\s*:|Prochain palier/);
      const picto = anchor.locator('.picto-stat').first();
      if (await picto.count()) {
        await picto.dispatchEvent('mouseover');
        assert.equal(await page.locator('[data-umbra-detail] .umbra-description').innerText(), 'Détail du calcul',
          `${row.key}: pictogram does not replace the calculation with a general stat helper`);
      }
      autonomousDetails++;
    }
    const source = card.locator('.stat-source-details');
    if (await source.count()) {
      assert.equal(await source.evaluate(node => getComputedStyle(node).color), 'rgb(255, 155, 0)');
      assert.equal(await source.evaluate(node => getComputedStyle(node).fontStyle), 'italic');
      assert.ok(await source.evaluate(node => parseFloat(getComputedStyle(node).fontSize) < parseFloat(getComputedStyle(node.parentElement).fontSize)));
      assert.equal(await source.locator('[data-helper-sources], [data-helper-picto-stat]').count(), 0);
      assert.match(await source.innerText(), /^Source\s*:\s*(?:Umbra|Progression|Stuff|Effet|Base|Stat fixe|Stat \+)(?:\s*\+\s*(?:Umbra|Progression|Stuff|Effet|Base|Stat fixe|Stat \+))*$/, `${row.key}: category names only`);
      const sourceLabels = await source.locator('[data-helper-source]').allTextContents();
      assert.equal(new Set(sourceLabels).size, sourceLabels.length, `${row.key}: each source category appears once`);
      assert.equal(await source.locator('.picto-stat').count(), 0, `${row.key}: no icons in the compact source line`);
    }
    assert.equal(await card.locator('[data-helper-improved]').count(), 0, 'No generic improved-stat hover');
  }
  assert.ok(autonomousRows.length >= 40 && autonomousDetails >= 40, 'Audit covers all autonomous stat families');
  await page.locator('body').dispatchEvent('click');
  await conversionRoot.locator('.stat-container[data-stat="criticalDamage"]').dispatchEvent('click');
  const criticalSources = await readSourceDetails();
  assert.equal(await page.locator('[data-umbra-pinned] [data-helper-source="umbra"]').count(), 1, 'Different Umbras are combined into one source category');
  assert.match(criticalSources, /Dégâts des coups critiques \+ : \+ [\d.]+ %/);
  assert.doesNotMatch(criticalSources, /Coup critique|Précision/);
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const row = window.__conversionHelperTest.root.querySelector('.stat-container[data-stat="criticalDamage"]');
    const entity = UI.getBoundHelperEntity(row);
    window.__conversionHelperTest.sourceEntity = entity;
    window.__conversionHelperTest.oldSourceModifiers = structuredClone(entity.modifierStats);
    const durable = entity.modifierStats.durable;
    Object.assign(durable, { level: { criticalDamage: 1 }, adminLevel: { criticalDamage: 2 },
      archetype: { criticalDamage: 3 }, statLeveled: { criticalDamage: 4 } });
    durable.stuff.byId = { 'source-test': { criticalDamage: 5 } };
    // This fixture tests final source amounts, not an unfinished equipment-efficiency preview.
    delete durable.stuff.orfevre;
    entity.modifierStats.preview = { statLeveled: { criticalDamage: 2 }, total: { ...entity.stats, criticalDamage: entity.stats.criticalDamage + 17 } };
  });
  await page.locator('body').dispatchEvent('click');
  await conversionRoot.locator('.stat-container[data-stat="criticalDamage"]').dispatchEvent('click');
  const completeSources = await readSourceDetails();
  assert.deepEqual(await page.locator('[data-umbra-pinned] [data-helper-source]').allInnerTexts(), ['Umbra', 'Base', 'Progression']);
  assert.equal((completeSources.match(/Dégâts des coups critiques/g) || []).length, 4, 'Each source identifies the contributed stat exactly once');
  assert.doesNotMatch(completeSources, /Niveaux|Archétype|Progression|Prévisualisation|source-test/);
  const equipmentSource = page.locator('[data-umbra-pinned] [data-helper-source="fixed"]');
  assert.equal(await equipmentSource.innerText(), 'Base', 'Equipment belongs to the normal stat family');
  await equipmentSource.focus();
  assert.match(await page.locator('[data-umbra-detail] [data-provenance="equipment"]').innerText(), /Stuff.*\+ 5 %/, 'Keyboard focus identifies the equipment contribution within its family');
  assert.doesNotMatch(await page.locator('[data-umbra-detail]').innerText(), /Niveaux admin|Prévisualisation/, 'Only the hovered source is described');
  await page.evaluate(() => {
    window.__conversionHelperTest.sourceEntity.modifierStats.durable.stuff.byId['source-test'].criticalDamage = 9;
    window.__conversionHelperTest.sourceEntity.modifierStats.preview.total.criticalDamage += 4;
  });
  await equipmentSource.dispatchEvent('mouseover');
  assert.match(await page.locator('[data-umbra-detail] [data-provenance="equipment"]').innerText(), /Stuff.*\+ 9 %/, 'Source contributions are read again on hover');
  await equipmentSource.dispatchEvent('mouseout');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0, 'Leaving a source closes its detail');
  assert.equal(await page.locator('[data-umbra-pinned]').count(), 1, 'The parent stat helper remains pinned');
  await page.evaluate(() => {
    const probe = window.__conversionHelperTest;
    probe.sourceEntity.modifierStats = probe.oldSourceModifiers;
  });
  await page.locator('body').dispatchEvent('click');
  await conversionRoot.locator('.codex-attack-stat-block .stat-container[data-stat="physicalDamage"]').dispatchEvent('click');
  const constantPower = await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').innerText();
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').focus();
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    const probe = window.__conversionHelperTest;
    const row = probe.root.querySelector('.codex-attack-stat-block .stat-container[data-stat="physicalDamage"]');
    const entity = UI.getBoundHelperEntity(row);
    probe.previewEntity = entity;
    probe.previousPreview = entity.modifierStats.preview;
    probe.hadPreview = Object.hasOwn(entity.modifierStats, 'preview');
    entity.modifierStats.preview = { statLeveled: { strength: 10, vigueur: -5 }, total: { ...entity.stats, strength: 35, vigueur: 10 } };
    probe.root.classList.add('helper-preview-test');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1,
    'Unchanged compact totals keep their detail open while the underlying inputs refresh');
  assert.equal(await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').innerText(), constantPower);
  await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').dispatchEvent('mouseover');
  assert.deepEqual(await page.locator('[data-umbra-pinned]').evaluate(node =>
    node._umbraCalculations.autonomousTotal.improvement.parts.map(part => [part.stat, part.value])),
    [['vigueur', 10], ['strength', 17.5]], 'Refresh reads the unrounded inputs even when their final rounded sum stays constant');
  assert.equal(await page.locator('[data-umbra-detail] .helper-calculation-detail').count(), 0, 'PP total retains only exclusive amounts after live refresh');
  await page.evaluate(() => {
    const probe = window.__conversionHelperTest;
    if (probe.hadPreview) probe.previewEntity.modifierStats.preview = probe.previousPreview;
    else delete probe.previewEntity.modifierStats.preview;
    probe.root.classList.remove('helper-preview-test');
  });
  await page.locator('body').dispatchEvent('click');
  for (const key of ['HP', 'armor', 'criticalChance', 'marathon', 'cognitiveGenerator']) {
    await conversionRoot.locator(`.codex-attack-stat-block .stat-container[data-stat="${key}"]`).first().dispatchEvent('click');
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-umbra-pinned] [data-autonomous-calculation]').first().focus();
      await page.locator('[data-umbra-detail]').waitFor({ state: 'visible' });
      const bounds = await page.locator('[data-umbra-detail]').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      await page.screenshot({ path: resolve(output, `compact-${key}-${width}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  console.log(`PASS: ${autonomousRows.length} autonomous stat rows and ${autonomousDetails} hover calculations, unchanged values/text, sources and icon priority`);
  await conversionRoot.locator('.codex-attack-stat-block .stat-container[data-stat="physicalResistance"]').dispatchEvent('click');
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [anchor, kind] of [['[data-autonomous-calculation]', 'calculation']]) {
      await page.locator(`[data-umbra-pinned] ${anchor}`).dispatchEvent('mouseover');
      await page.locator('[data-umbra-detail]').waitFor({ state: 'visible' });
      const bounds = await page.locator('[data-umbra-detail]').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      assert.equal(await page.locator('[data-umbra-pinned] [data-helper-source="umbra"]').innerText(), 'Umbra');
      assert.equal(await page.locator('[data-umbra-pinned] .stat-source-details').evaluate(node => getComputedStyle(node).color), 'rgb(255, 155, 0)');
      await page.screenshot({ path: resolve(output, `conversion-${kind}-${width}.png`), animations: 'disabled' });
    }
    await page.locator('[data-umbra-pinned] [data-helper-source="umbra"]').dispatchEvent('mouseover');
    assert.match(await page.locator('[data-umbra-detail]').innerText(), /Réduction dégats physiques X : \+ [\d.]+ %/);
    const sourceBounds = await page.locator('[data-umbra-detail]').boundingBox();
    assert.ok(sourceBounds.x >= 0 && sourceBounds.y >= 0 && sourceBounds.x + sourceBounds.width <= width + 1 && sourceBounds.y + sourceBounds.height <= height + 1);
    await page.screenshot({ path: resolve(output, `source-labels-${width}.png`), animations: 'disabled' });
  }
  await page.locator('body').dispatchEvent('click');
  await page.evaluate(() => {
    const probe = window.__conversionHelperTest;
    if (JSON.stringify(probe.entity) !== probe.original) throw Error('Conversion helpers mutated gameplay state');
    probe.root.remove();
  });
  console.log('PASS: 6 compact conversions, source category labels with live hover details, lighter HSL stat+ names, keyboard access and mobile bounds');
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    UI.closeOpenHelpers();
    const previousGame = document.getElementById('game-windows');
    if (previousGame) previousGame.id = 'helper-layout-previous-game';
    const root = document.createElement('main');
    root.id = 'helper-layout-probe';
    root.className = 'codex-entity-scan';
    const host = document.createElement('div');
    host.className = 'stat-container';
    Object.assign(host.dataset, { stat: 'hypercognition', hover: 'true', entityId: '987198', helperKey: 'layout-probe' });
    host.style.cssText = 'position:fixed;width:24px;height:24px;z-index:99999';
    host.innerHTML = '<span class="picto-stat hypercognition"></span>';
    const entity = structuredClone(window.__dedicatedHelperTest.entity);
    entity.id = 987198;
    entity.stats.hypercognition = 20;
    UI.bindHelperEntity(root, entity);
    root.append(host);
    document.body.append(root);
    window.__helperLayoutProbe = { root, host, previousGame };
  });
  let layoutCases = 0;
  for (const [width, height] of [[1280, 900], [390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    for (const insetGame of [false, true]) {
      for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        for (const mode of ['hover', 'pinned', 'detail']) {
          const report = await page.evaluate(async ({ corner, mode, insetGame }) => {
            const UI = await import("/js/ui/statistics/helpers.js");
            UI.closeOpenHelpers();
            const { host, root } = window.__helperLayoutProbe;
            document.body.append(root);
            document.getElementById('game-windows')?.remove();
            const bounds = insetGame
              ? { left: 32, top: 40, right: innerWidth - 24, bottom: innerHeight - 32 }
              : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
            if (insetGame) {
              const game = document.createElement('div');
              game.id = 'game-windows';
              game.style.cssText = `position:fixed;opacity:1;pointer-events:none;left:${bounds.left}px;top:${bounds.top}px;width:${bounds.right - bounds.left}px;height:${bounds.bottom - bounds.top}px`;
              document.body.append(game);
              game.append(root);
            }
            const left = corner.endsWith('right') ? bounds.right - 25 : bounds.left + 1;
            const top = corner.startsWith('bottom') ? bounds.bottom - 25 : bounds.top + 1;
            Object.assign(host.style, { left: `${left}px`, top: `${top}px` });
            // Exercise both a short ratio detail and a very tall, wrapping main helper.
            host.dataset.helperSuffix = mode === 'hover' && corner.endsWith('right')
              ? `<br>${'<p>Une longue contribution avec ses sources et ses pictogrammes.</p>'.repeat(24)}${'W'.repeat(120)}` : '';
            host.dispatchEvent(new MouseEvent(mode === 'hover' ? 'mouseover' : 'click', { bubbles: true }));
            if (mode === 'detail') {
              const parent = document.querySelector('[data-umbra-pinned]');
              const anchor = parent.querySelector('[data-umbra-calculation][data-umbra-part="1"]');
              if (!anchor) throw Error('Missing detail anchor');
              Object.assign(anchor.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, width: '24px', height: '24px' });
              anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            }
            const selector = mode === 'detail' ? '[data-umbra-detail]'
              : mode === 'pinned' ? '[data-umbra-pinned]' : '.stat-hover[data-helper-key="layout-probe"]';
            const frames = [];
            const sample = () => {
              const node = document.querySelector(selector);
              if (!node) throw Error(`${mode}: helper disappeared`);
              const style = getComputedStyle(node);
              if (style.visibility !== 'visible' || Number(style.opacity) <= 0) return;
              const rect = node.getBoundingClientRect();
              frames.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
            };
            sample();
            for (let frame = 0; frame < 12; frame++) {
              await new Promise(requestAnimationFrame);
              sample();
              if (frame === 3 && mode === 'pinned') window.dispatchEvent(new Event('selectedArmyAUpdated'));
            }
            return { frames, bounds };
          }, { corner, mode, insetGame });
          const label = `${mode}/${corner}/${width}/${insetGame ? 'game bounds' : 'viewport'}`;
          assert.ok(report.frames.length >= 6, `${label}: capture the first visible frames`);
          const first = report.frames[0];
          for (const frame of report.frames) {
            assert.ok(frame.x >= report.bounds.left + 7.5 && frame.y >= report.bounds.top + 7.5
              && frame.x + frame.width <= report.bounds.right - 7.5
              && frame.y + frame.height <= report.bounds.bottom - 7.5, `${label}: inside bounds from first paint`);
            assert.ok(frame.scrollWidth <= frame.clientWidth + 1, `${label}: no overflowing text`);
            for (const dimension of ['x', 'y', 'width', 'height']) {
              assert.ok(Math.abs(frame[dimension] - first[dimension]) < .1, `${label}: ${dimension} never jumps between frames`);
            }
          }
          if (corner === 'bottom-right' && !insetGame) {
            await page.screenshot({ path: resolve(output, `placement-${mode}-${width}.png`), animations: 'disabled' });
          }
          layoutCases++;
        }
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    UI.closeOpenHelpers();
    document.body.append(window.__helperLayoutProbe.root);
    document.getElementById('game-windows')?.remove();
    const { host } = window.__helperLayoutProbe;
    Object.assign(host.style, { left: 'auto', top: 'auto', right: '1px', bottom: '1px' });
    host.dataset.helperSuffix = '';
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-umbra-pinned] [data-umbra-calculation][data-umbra-part="1"]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const resized = await page.evaluate(async () => {
    const frames = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(['[data-umbra-pinned]', '[data-umbra-detail]'].map(selector => {
        const node = document.querySelector(selector);
        if (!node) throw Error(`Resize removed ${selector}`);
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }));
    }
    return frames;
  });
  for (const frame of resized) {
    for (let index = 0; index < frame.length; index++) {
      const box = frame[index];
      assert.ok(box.x >= 7.5 && box.y >= 7.5 && box.x + box.width <= 382.5 && box.y + box.height <= 836.5,
        'Open parent and detail fit immediately after resize');
      assert.deepEqual(box, resized[0][index], 'Resize does not start successive positioning corrections');
    }
  }
  await page.route('**/EBGaramond-Regular.ttf?helper-layout-test', async route => {
    await new Promise(done => setTimeout(done, 200));
    await route.continue();
  });
  const delayedFont = await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    UI.closeOpenHelpers();
    const font = new FontFace('HelperLateLayoutTest', 'url("/media/typo/EBGaramond-Regular.ttf?helper-layout-test")');
    document.fonts.add(font);
    const style = document.createElement('style');
    style.textContent = '.stat-hover[data-helper-key="layout-probe"] { font-family: HelperLateLayoutTest, monospace; }';
    document.head.append(style);
    const { host } = window.__helperLayoutProbe;
    host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const helper = document.querySelector('.stat-hover[data-helper-key="layout-probe"]');
    const initial = { status: document.fonts.status, visibility: getComputedStyle(helper).visibility };
    await document.fonts.ready;
    const frames = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      const computed = getComputedStyle(helper);
      if (computed.visibility !== 'visible' || Number(computed.opacity) <= 0) continue;
      const { x, y, width, height } = helper.getBoundingClientRect();
      frames.push({ x, y, width, height });
    }
    UI.closeOpenHelpers();
    style.remove();
    document.fonts.delete(font);
    return { initial, frames };
  });
  assert.equal(delayedFont.initial.status, 'loading', 'The font test exercises a genuine pending font');
  assert.equal(delayedFont.initial.visibility, 'hidden', 'Do not paint temporary fallback-font dimensions');
  assert.ok(delayedFont.frames.length > 5, 'Delayed-font helper becomes visible');
  for (const box of delayedFont.frames) {
    assert.ok(box.x >= 7.5 && box.y >= 7.5 && box.x + box.width <= 382.5 && box.y + box.height <= 836.5,
      'First visible font-loaded frame fits');
    assert.deepEqual(box, delayedFont.frames[0], 'Late font never causes a visible placement jump');
  }
  await page.evaluate(async () => {
    const UI = await import("/js/ui/statistics/helpers.js");
    UI.closeOpenHelpers();
    const { root, previousGame } = window.__helperLayoutProbe;
    root.remove();
    document.getElementById('game-windows')?.remove();
    if (previousGame) previousGame.id = 'game-windows';
  });
  console.log(`PASS: ${layoutCases} first-paint/stable-frame helper placements, four corners, game bounds, tall content, resize and delayed fonts`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async snapshot => {
    const { buildStatHoverCard } = await import('/js/data/helpers.js');
    const gallery = document.createElement('div');
    gallery.id = 'helper-color-gallery';
    gallery.style.cssText = 'position:absolute;inset:0 auto auto 0;width:1200px;padding:16px;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:#151515;z-index:9999999';
    for (const key of ['hypercognition', 'indestructibility', 'ambidextry', 'weaponMastery', 'haste', 'mysticism', 'adresse',
      'armor', 'robustness', 'bloodFury', 'criticalPower', 'occultism', 'movement', 'extraLife', 'cooldownTimeDetail', 'executionRangeTimeDetail']) {
      const card = document.createElement('div');
      card.className = 'stat-hover';
      card.style.cssText = 'position:relative;opacity:1;min-width:0;max-width:100%;width:100%;box-sizing:border-box;padding:12px;overflow-wrap:anywhere';
      card.dataset.stat = key;
      card.innerHTML = buildStatHoverCard({ umbraHTML: key, helperHTML: key === 'robustness' ? snapshot.robustnessExample : snapshot[`stat:2:${key}`].helpContent,
        ambianceHTML: snapshot[`stat:2:${key}`].ambianceContent });
      gallery.append(card);
    }
    document.body.append(gallery);
  }, snapshot);
  await page.locator('#helper-color-gallery').screenshot({ path: resolve(output, 'colors-desktop.png') });
  for (const key of ['bloodFury', 'haste', 'robustness', 'mysticism', 'cooldownTimeDetail', 'executionRangeTimeDetail']) {
    await page.locator(`#helper-color-gallery [data-stat="${key}"]`).screenshot({ path: resolve(output, `${key}-desktop.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const gallery = document.getElementById('helper-color-gallery');
    gallery.style.width = '390px';
    gallery.style.gridTemplateColumns = 'minmax(0,1fr)';
    if ([...gallery.children].some(card => card.scrollWidth > card.clientWidth + 1)) throw new Error('Helper text overflows on mobile');
  });
  await page.locator('#helper-color-gallery').screenshot({ path: resolve(output, 'colors-mobile.png') });
  for (const key of ['bloodFury', 'haste', 'robustness', 'mysticism']) {
    await page.locator(`#helper-color-gallery [data-stat="${key}"]`).screenshot({ path: resolve(output, `${key}-mobile.png`) });
  }
  await page.evaluate(async html => {
    const { buildStatHoverCard } = await import('/js/data/helpers.js');
    const card = document.querySelector('#helper-color-gallery [data-stat="robustness"]');
    card.innerHTML = buildStatHoverCard({ umbraHTML: 'robustness', helperHTML: html });
    if (card.scrollWidth > card.clientWidth + 1) throw new Error('Soft-cap formula overflows on mobile');
  }, snapshot.robustnessSoftCapExample);
  await page.locator('#helper-color-gallery [data-stat="robustness"]').screenshot({ path: resolve(output, 'robustness-soft-cap-mobile.png') });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  const snapshotPath = resolve(output, 'baseline.json');
  let baselineStatus = 'not-compared';
  if (process.argv.includes('--record')) {
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    baselineStatus = 'recorded';
    console.log(`Recorded ${Object.keys(snapshot).length} helper cases`);
  } else {
    let baseline;
    // Smoke runs all assertions; only the explicit record mode replaces the catalogue reference.
    try { if (!process.argv.includes('--smoke')) baseline = JSON.parse(await readFile(snapshotPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' || process.argv.includes('--compare')) throw error; }
    if (baseline) {
      for (const key of Object.keys(baseline)) assert.deepEqual(snapshot[key], baseline[key], `Helper changed: ${key}`);
      assert.deepEqual(Object.keys(snapshot), Object.keys(baseline));
      baselineStatus = 'compared';
      console.log(`PASS: ${Object.keys(snapshot).length} helper cases unchanged`);
    }
    console.log('PASS: helper module isolation, catalog rendering, activation, pictograms and escaped essence state');
  }
  await writeFile(resolve(output, 'historical-suite-report.json'), JSON.stringify({
    result: 'passed', baseline: baselineStatus, catalogCases: Object.keys(snapshot).length,
    modules: auditedModules, colorChecks: colorAudit.checked, presentationChecks,
    arithmeticChecks: snapshot.formulaArithmeticChecks, combatChecks: snapshot.combatParityChecks,
    umbraChecks: layeredChecks, autonomousChecks, sourceTotalChecks, essentialChecks, weightVisualChecks,
    sourceMatrixChecks: sourceMatrix.checks, sourceMatrixFailures: sourceMatrix.failures,
    dedicatedHelpers: effectKeys.length, autonomousRows: autonomousRows.length, autonomousDetails, layoutCases, errors,
  }, null, 2));
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
