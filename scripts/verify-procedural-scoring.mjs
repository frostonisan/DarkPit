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
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const P = await import('/js/procedural/proc-bareme.js');
    const D = await import("/js/combat/statistics.js"), _D = await import("/js/ui/statistics/details.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const U = await import("/js/ui/statistics/components.js"), _U = await import("/js/ui/codex/index.js");
    const R = await import("/js/entities/archetypes.js");
    const I = await import('/js/items/items.js');
    const { attackDetails } = await import('/js/data/attackList.js');
    const { stats } = await import('/js/data/statsData.js');
    const Rules = await import("/js/entities/rules.js");
    const Gear = await import('/js/items/armor.js');
    const Manager = await import('/js/items/itemManager.js');
    const { ItemDetails } = await import('/js/data/itemList.js');
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const equal = (a, b, label) => check(Math.abs(a - b) < 0.00001, `${label}: ${a} / ${b}`);
    const buff = (stat, value, extra = {}) => ({ type: 'stat-buff', stat, value, ...extra });
    equal(P.evaluatePowerEffects([buff('vitality', 3)]).score,
      P.evaluatePowerEffects([buff('vitality', 1), buff('vitality', 1), buff('vitality', 1)]).score, 'Equivalent lines have the same linear score');
    equal(P.evaluatePowerEffects([buff('strength', 3)]).score, 60, 'Linear attribute cost');
    equal(P.evaluatePowerEffects([buff('strength', 3, { mode: 'percent' })]).score, 600, 'Percent cost is distinct and configurable');
    equal(P.evaluatePowerEffects([buff('strength', 3), { type: 'stat-malus', stat: 'strength', value: 2 }]).score, 20, 'Full malus subtraction');
    equal(P.normalizePowerEffects([buff('strength', 1), buff('strength', 1, { condition: 'night' })]).length, 2, 'Different conditions are not merged');
    const durableStats = { level: { strength: 1 }, adminLevel: { agility: 1 },
      archetype: { intelligence: 1 }, statLeveled: { will: 1, unknown: 2 } };
    const durableEntity = { baseStats: { HP: 10 }, modifierStats: { durable: durableStats } };
    const durableScore = P.evaluateEntityPower(durableEntity);
    equal(durableScore.score, 110, 'All four gameplay modifier sources are valued, including unknown actual stats');
    const withMetadata = structuredClone(durableEntity);
    withMetadata.modifierStats.durable.archetypeMeta = {
      source: 'reverseArchetype', requestedLevel: 35, level: 35, budget: 34,
      pointsSpent: 34, awakeningSteps: 10,
    };
    withMetadata.modifierStats.durable.audit = { level: 999 };
    const metadataBefore = JSON.stringify(withMetadata);
    const metadataScore = P.evaluateEntityPower(withMetadata);
    equal(metadataScore.score, durableScore.score, 'Generation metadata never contributes phantom power');
    check(!metadataScore.details.some(row => ['requestedLevel', 'level', 'budget', 'pointsSpent', 'awakeningSteps'].includes(row.stat)),
      'Exported breakdown excludes generation bookkeeping');
    check(JSON.stringify(withMetadata) === metadataBefore, 'Metadata remains intact after scoring');
    check(P.getPowerStatDefinition('unknown', { parentStat: 'strength' }).path.includes('strength'), 'Fallback follows explicit lineage');
    check(P.getPowerStatDefinition('unknown').fallback && P.getPowerStatDefinition('unknown').coefficient > 0, 'Unknown effect is diagnosed and never free');
    const armor = { equippedId: 'e-armor', itemType: ['stuff'], Stuffeffets: [buff('armor', 80)], armorReserve: { max: 80, current: 20 } };
    equal(P.evaluateItemPower(armor).score, 90, 'Armor scores current reserve plus one equipment premium');
    equal(P.evaluateItemPower({ ...armor, armorReserve: { max: 80, current: 0 } }).score, 10, 'Destroyed armor scores zero armor, not its max');
    equal(P.evaluateItemPower({ ...armor, Stuffeffets: [{ type: 'stat-buff', stats: { armor: 80 } }] }).score, 90, 'Armor map and line formats agree');
    equal(P.getScoredItemQuality({ ...armor, itemQuality: 0 }), 0, 'Explicit quality zero wins');
    const qualityItem = I.applyItemPower(structuredClone(armor));
    const quality = P.getScoredItemQuality(qualityItem);
    qualityItem.armorReserve.current = 0;
    I.applyItemPower(qualityItem);
    equal(P.getScoredItemQuality(qualityItem), quality, 'Wear changes power, not creation quality');
    const baseAction = { key: 'hit', damage: 10, healing: 0, busyMs: 1000, impactMs: 500, cooldownMs: 0 };
    equal(P.evaluateActionRates([baseAction]).dps, 10, 'Single action shares one clock');
    equal(P.evaluateActionRates([baseAction, { ...baseAction, key: 'hit2' }]).dps, 10, 'Two attacks do not double the actor clock');
    check(P.evaluateActionRates([{ ...baseAction, impactMs: 2000 }]).dps > 9, 'Projectile travels while subsequent actions run');
    const bounded = P.evaluateActionRates([{ ...baseAction, busyMs: 1, impactMs: 0 }, { ...baseAction, cooldownMs: 1e9 }]);
    check(bounded.incomplete && bounded.durationMs < bounded.requestedDurationMs && bounded.dps > 100, 'Bounded evaluation uses the evaluated duration');
    const rank2 = stats.find(stat => stat.nature === 'umbra' && stat.type.endsWith('-2'));
    check(!!rank2, 'Rank two fixture exists');
    const entity = { id: 99101, name: 'Scoring', type: 'sbire', level: { current: 10 },
      baseStats: { HP: 100, physicalDamage: 20, piercingDamage: 20, speed: 1000, strength: 10, agility: 5, intelligence: 4 },
      Archetype: { current: { key: 'egare', step: 0 }, achieve: [], inProgress: {} },
      attacks: ['autoAttack'], stuff: {}, modifierStats: {} };
    equal(P.filterRestrictedUmbras(entity, { [rank2.key]: 20, physicalDamage: 20 })[rank2.key], 0, 'Egare blocks rank two Umbras');
    equal(P.filterRestrictedUmbras(entity, { [rank2.key]: 20, physicalDamage: 20 }).physicalDamage, 20, 'Direct stats stay allowed');
    check(!P.isUmbraRestricted({ ...entity, Archetype: { current: { key: 'tank' } } }, rank2.key), 'Awakening unlocks original Umbra sources');
    const frozen = { ...entity, level: { current: 250 }, reverseArchetype: 'tank', archetypeFrozen: true };
    const plan = R.buildReverseArchetypePlan(frozen, { preview: true });
    check(plan?.archetypeState?.current?.key === 'egare', 'Frozen reverse progression remains Egare at 250');
    const bad = Object.keys(plan.delta).filter(key => P.isUmbraRestricted(frozen, key));
    check(bad.length === 0, 'Frozen reverse progression never grants rank two or three Umbras');
    const projected = E.projectEntityForPower(entity);
    const prof = attackDetails.find(attack => attack.functionName === 'profanation');
    check(!!prof, 'Profanation fixture exists');
    const summoner = { ...projected, attackDetails: [prof] };
    const before = JSON.stringify([projected, summoner, armor]);
    const saved = JSON.stringify({ ...localStorage });
    const random = Math.random;
    Math.random = () => { throw new Error('Scoring consumed a random roll'); };
    let score, summonScore;
    try {
      score = D.calculateEntityPower(projected, { equipment: [] });
      summonScore = D.calculateEntityPower(summoner, { equipment: [] });
      equal(D.calculateEntityPower(projected, { equipment: [] }).score, score.score, 'Repeated evaluation is deterministic');
    } finally { Math.random = random; }
    check(score.score > 0 && score.rates.dps > 0, 'Entity receives positive power and DPS');
    check(summonScore.rates.summonNonRatePower > 0 && summonScore.rates.assumptions[0].samples > 0, 'Profanation includes deterministic reverse-archetype potential, even without usable damage ratios');
    check(JSON.stringify([projected, summoner, armor]) === before, 'Scoring does not mutate entities or armor');
    check(JSON.stringify({ ...localStorage }) === saved, 'Scoring does not write storage');
    const catalogSaved = JSON.stringify({ ...localStorage });
    const catalogBefore = JSON.stringify(E.entitesNestUp);
    Math.random = () => { throw new Error('Catalog scoring consumed a random roll'); };
    try {
      for (const candidate of E.entitesNestUp) {
        const evaluated = D.calculateEntityPower(candidate);
        check(Number.isFinite(evaluated.score), `Catalog entity has a finite score: ${candidate.name}`);
      }
    } finally { Math.random = random; }
    check(JSON.stringify(E.entitesNestUp) === catalogBefore && JSON.stringify({ ...localStorage }) === catalogSaved, 'Full catalog evaluation is read-only');
    const { attackEffects } = await import('/js/data/attackEffects.js');
    const { getAttackEffectHandler } = await import("/js/combat/vitals.js");
    const { inheritSummonEssences } = await import("/js/combat/summons.js");
    const tacticalBefore = JSON.stringify([attackDetails, attackEffects, projected]);
    for (const attack of attackDetails) {
      const power = D.calculateAttackPower(attack, projected);
      check(Array.isArray(attack.tacticalConsequence) || attack.effets.every(key => Array.isArray(attackEffects.find(effect => effect.effectName === key)?.tacticalConsequence)), `Tactical metadata exists on the attack or its composed effects: ${attack.functionName}`);
      check(Number.isInteger(power.score) && power.details.every(row => Number.isInteger(row.score)), `Integer attack score and ledger: ${attack.functionName}`);
      equal(power.details.reduce((sum, row) => sum + row.score, 0), power.score, `Ledger matches total: ${attack.functionName}`);
      check(!power.rates.tactical.incomplete, `All effect mechanics are recognized: ${attack.functionName}`);
    }
    check(JSON.stringify([attackDetails, attackEffects, projected]) === tacticalBefore, 'All attack evaluations preserve the original definitions');
    const profPower = D.calculateAttackPower(prof, projected);
    equal(profPower.rates.tactical.floor, 150, 'Profanation adds corpse suppression and reinforcement floors once');
    equal(profPower.rates.tactical.rows.find(row => row.keyword === 'suppression').coefficient, 0.95, 'Corpse denial multiplier');
    equal(profPower.rates.tactical.rows.find(row => row.keyword === 'generation_entite').coefficient, 0.25, 'Reinforcement multiplier');
    check(P.getPowerBreakdownLines(profPower).some(line => line.includes('mechanic:summonProfanation')), 'Profanation trace reaches its real mechanic');
    const weakSummoner = E.projectEntityForPower({ ...entity, level: { current: 1 },
      baseStats: { HP: 45, intelligence: 0, speed: 1000 }, attacks: ['profanation'] });
    const weakPower = D.calculateAttackPower(prof, weakSummoner);
    equal(weakPower.rates.summonDps, 0, 'No fictitious piercing damage after inheriting magical essences');
    check(weakPower.score >= 150, 'Tactical potential remains valued with zero DPS');
    const inherited = E.projectEntityForPower(inheritSummonEssences(P.getProfanationTemplate(1), prof));
    equal(D.calculateEntityRates(inherited).dps, weakPower.rates.assumptions[0].dps, 'Summon estimate uses the actual essence inheritance');
    const rezPower = D.calculateAttackPower(attackDetails.find(a => a.functionName === 'resurrection'), projected);
    equal(rezPower.score, P.TACTICAL_RULES.consequences.resurrection.floor, 'Resurrection has exactly one source premium');
    check(!rezPower.details.some(row => row.stat === 'resurrectionSpell'), 'Legacy resurrection tariff is not added again');
    const healPower = D.calculateAttackPower(attackDetails.find(a => a.functionName === 'soin'), projected);
    equal(healPower.score, P.integerPower(healPower.rates.hps * P.POWER_RULES.hpsCoefficient), 'Healing keyword does not duplicate HPS');
    const poisonPower = D.calculateAttackPower(attackDetails.find(a => a.functionName === 'venin'), projected);
    check(poisonPower.rates.dps > 0 && poisonPower.rates.unmeasured.some(key => key.endsWith(':poison')), 'Poison impact is measured and its DOT is explicitly provisional');
    const collect = root => P.collectTacticalConsequences(root, { effects: attackEffects, mechanicFor: getAttackEffectHandler });
    const dup = collect({ attackTarget: ['enemy'], tacticalConsequence: ['blocage_total', 'blocage_total'],
      tacticalEffects: [{ tacticalConsequence: ['blocage_total'] }] });
    equal(dup.rows.length, 1, 'Repeated keyword across declarations counts once');
    equal(dup.rows[0].sources.length, 2, 'Deduplication preserves both source paths');
    const genericHeal = collect({ attackTarget: ['ally'], tacticalConsequence: ['direct'], effets: ['heal'] });
    check(!genericHeal.incomplete && genericHeal.rows.filter(row => row.keyword === 'direct').length === 1, 'Generic and specific declarations merge without a false conflict');
    const twinTargets = collect({ tacticalEffects: [
      { target: 'ally', tacticalConsequence: ['renforcement'] },
      { target: 'self', tacticalConsequence: ['renforcement'] },
    ] });
    equal(twinTargets.rows.length, 2, 'Independent recipients retain separate consequences');
    const fixedAndRatio = collect({ tacticalConsequence: ['fixe', 'proportionnel'] });
    equal(fixedAndRatio.rows.length, 2, 'Fixed and proportional properties coexist');
    const cycle = { tacticalConsequence: ['blocage_total'] };
    cycle.tacticalEffects = [cycle];
    check(collect(cycle).diagnostics.some(row => row.reason === 'reference-circulaire'), 'Cyclic metadata stops safely');
    const largeGraph = { tacticalEffects: Array.from({ length: 600 }, () => ({ tacticalConsequence: ['direct'] })) };
    check(collect(largeGraph).diagnostics.some(row => row.reason === 'limite-parcours'), 'Oversized metadata is bounded');
    function forbiddenMechanic() { throw new Error('Scoring executed combat'); }
    forbiddenMechanic.tacticalConsequence = ['suppression'];
    const inspected = P.collectTacticalConsequences({ tacticalMechanics: ['test'] }, { mechanicFor: () => forbiddenMechanic });
    equal(inspected.rows.length, 1, 'Mechanic metadata is inspected without executing combat');
    const rule = P.TACTICAL_RULES.consequences.blocage_total;
    const oldRule = { ...rule };
    try {
      Object.assign(rule, { floor: 100, coefficient: 0.5 });
      const evaluation = P.evaluateTacticalPower(dup, { attack: 20 });
      equal(evaluation.score, 110, 'Only quantitative power is multiplied; floor stays outside');
      const scoped = collect({ tacticalScope: 'damage', tacticalConsequence: ['blocage_total'] });
      equal(P.evaluateTacticalPower(scoped, { damage: 20, healing: 2000, attack: 2020 }).bonus, 10, 'Offensive consequence cannot multiply unrelated healing');
      rule.coefficient = 1e20;
      check(P.evaluateTacticalPower(dup, { attack: 20 }).saturated, 'Huge tactical coefficients are capped');
      equal(P.evaluateTacticalPower(dup, { attack: 20 }).score, 999999999, 'Tactical ceiling is an integer');
      rule.coefficient = -1;
      const badRuleAttack = { ...attackDetails[0], tacticalConsequence: ['blocage_total'] };
      const invalid = D.calculateAttackPower(badRuleAttack, projected);
      check(invalid.rates.incomplete && invalid.rates.tactical.diagnostics.some(row => row.reason.startsWith('bareme-invalide')), 'Invalid tariff is reported and falls back safely');
    } finally { Object.assign(rule, oldRule); }
    const unknownTactical = D.calculateAttackPower({ ...attackDetails[0], tacticalConsequence: ['__proto__', 'not-a-keyword'] }, projected);
    check(unknownTactical.rates.incomplete && unknownTactical.details.some(row => row.fallback), 'Unknown keywords are neither trusted nor silently free');
    const rounded = P.finishPower([{ stat: 'a', score: 1.4 }, { stat: 'b', score: 1.4 }]);
    equal(rounded.score, 3, 'Round aggregate power, not each intermediate contribution');
    equal(rounded.details.reduce((sum, row) => sum + row.score, 0), 3, 'Rounding adjustment keeps integer ledger coherent');
    const capped = P.finishPower([{ stat: 'a', score: 8e8 }, { stat: 'b', score: 8e8 }]);
    equal(capped.score, 999999999, 'Final entity/item/army score uses the same ceiling');
    equal(capped.details.reduce((sum, row) => sum + row.score, 0), capped.score, 'Saturation adjustment reconciles the ledger');
    equal(capped.negativeScore, 0, 'Score ceiling never invents a malus');
    const nestedMalus = P.finishPower([{ stat: 'item', score: 20, breakdown: P.finishPower([{ score: 40 }, { score: -20 }]) }]);
    equal(nestedMalus.negativeScore, 20, 'Nested item maluses remain visible in the entity balance');
    const tacticalItem = { itemType: ['consommable'], effets: ['itemRez'], HealAmount: 20, tacticalConsequence: ['resurrection'] };
    equal(P.evaluateItemPower(tacticalItem).score, 30, 'Item resurrection metadata replaces its old premium, not healing amount');
    check(P.evaluateItemPower({ tacticalConsequence: ['unknown-item-consequence'] }).tactical.incomplete, 'Optional item consequences use the same validation');
    const prism = D.calculateAttackPower({ ...attackDetails.find(a => a.functionName === 'soin'),
      attacknature: ['hybridalPiercingDamage'], essenceSlots: undefined, essenceProfile: undefined }, projected);
    check(prism.rates.unmeasured.some(key => key.includes('nature:effusion')) &&
      prism.rates.tactical.rows.some(row => row.identity === 'nature:effusion'), 'Target-dependent nature signatures have explicit tactical provenance and a provisional tariff');
    const globalDamageRule = P.TACTICAL_RULES.consequences.degats;
    const savedDamageRule = { ...globalDamageRule };
    try {
      Object.assign(globalDamageRule, { floor: 500, coefficient: 2 });
      const single = D.calculateAttackPower(attackDetails[0], projected);
      equal(single.rates.tactical.floor + single.rates.tactical.bonus, 0, 'Already measured damage cannot acquire a second quantitative tariff');
    } finally { Object.assign(globalDamageRule, savedDamageRule); }
    const sharedRule = P.TACTICAL_RULES.consequences.blocage_partiel;
    const oldSharedRule = { ...sharedRule };
    try {
      Object.assign(sharedRule, { floor: 0, coefficient: 0.5 });
      const pair = [0, 1].map(index => ({ ...attackDetails[0], entityAttackId: `tactical-clock-${index}`,
        tacticalConsequence: ['blocage_partiel'], tacticalScope: 'damage' }));
      const rates = D.calculateEntityRates({ ...projected, attackDetails: pair });
      equal(rates.tactical.bonus, rates.dps * P.POWER_RULES.dpsCoefficient * 0.5, 'Tactical coefficients use each action share, not summed independent maximum DPS');
    } finally { Object.assign(sharedRule, oldSharedRule); }
    const auto = attackDetails.find(a => a.functionName === 'autoAttack');
    const autoEffects = auto.effets;
    try {
      auto.effets = ['summonProfanation'];
      const recursive = D.calculateAttackPower(prof, weakSummoner);
      check(recursive.rates.incomplete && Number.isInteger(recursive.score) && recursive.score <= 999999999, 'Recursive summons terminate with a bounded partial score');
      check(recursive.rates.assumptions[0].tacticalSamples.some(sample => sample.incomplete), 'Nested incompleteness survives the summon trace');
    } finally { auto.effets = autoEffects; }
    const own = P.evaluateEntityPower(projected, { rates: score.rates });
    const equipped = P.evaluateEntityPower(projected, { rates: score.rates, equipment: [armor, armor] });
    equal(equipped.score - own.score, 90, 'Each equipped item is counted exactly once');
    const encounter = P.evaluateEncounterPower([
      { entity: summoner, power: summonScore },
      { entity: { ...projected, id: 99102, summonOrigin: { casterId: summoner.id } }, power: score },
    ]);
    equal(encounter.score, summonScore.score, 'Army does not count summons already priced in their caster');
    equal(D.calculateStatGraphValue({ HP: { current: 20, max: 30 }, armor: { current: 10, max: 500 } }, stats).force.defense, 40, 'Graph uses current armor and the shared scoring coefficient');
    localStorage.removeItem('currentGameID');
    localStorage.removeItem('proceduralAdmin');
    S.saveToLocalStorage('playerExperience', 100);
    S.setAdminMode(true);
    equal(S.getAvailablePlayerExperience(), 1000000000100, 'Separate admin XP reserve');
    const payment = S.spendPlayerExperience(50);
    equal(payment.admin, 50, 'Admin reserve spent first');
    equal(S.getNormalPlayerExperience(), 100, 'Normal XP remains intact');
    S.setAdminMode(false);
    equal(S.getAvailablePlayerExperience(), 100, 'Leaving admin hides its reserve');
    S.creditPlayerExperience(20);
    S.setAdminMode(true);
    equal(S.getAvailablePlayerExperience(), 1000000000070, 'Toggle never repeats the grant and retains legitimate gains');
    S.creditPlayerExperience(25, { admin: true });
    S.setAdminMode(false);
    equal(S.getAvailablePlayerExperience(), 120, 'Admin refunds cannot become normal XP');
    check(S.spendPlayerExperience(121) === null, 'Insufficient balance cannot be spent');
    window.levelRunning = 'worldmap';
    const potion = ItemDetails.find(item => item.serial === 'i0');
    const inventoryBefore = localStorage.getItem('IngameItems');
    check(Manager.BuyItems(potion) === false && localStorage.getItem('IngameItems') === inventoryBefore, 'Insufficient shop balance creates no item');
    S.creditPlayerExperience(1000);
    const xpBefore = S.getNormalPlayerExperience();
    check(Manager.BuyItems(potion) === true, 'Normal shop purchase succeeds');
    equal(S.getNormalPlayerExperience(), xpBefore - potion.itemCost, 'Shop debits the displayed XP price');
    S.setAdminMode(true);
    const adminBefore = S.getAvailablePlayerExperience();
    check(Manager.BuyItems(potion) === true, 'Admin shop purchase succeeds');
    equal(S.getAvailablePlayerExperience(), adminBefore, 'Admin shop purchase is free');
    S.setAdminMode(false);
    S.creditPlayerExperience(20000);
    const info = S.loadPlayerInfo();
    info.battleSlotCount = 24;
    S.savePlayerInfo(info);
    const beforeFailure = S.getNormalPlayerExperience();
    check(Manager.BuyItems(ItemDetails.find(item => item.battleSlotBonus)) === false, 'Failed acquisition is rejected');
    equal(S.getNormalPlayerExperience(), beforeFailure, 'Failed acquisition refunds the normal wallet');
    const protectedEntity = structuredClone(E.entitesNestUp[0]);
    Object.assign(protectedEntity, { id: 99104, reverseArchetype: undefined, archetypeFrozen: true,
      baseStats: { HP: 100, strength: 20, intelligence: 20, agility: 20, charge: 3, speed: 1000, physicalDamage: 20 },
      level: { current: 1 }, Archetype: { current: { key: 'egare', step: 0 }, achieve: [], inProgress: [] },
      modifierStats: {}, stuff: { slot1: ['e-scoring-blocked'] } });
    const blockedGear = { serial: 'i42', equippedId: 'e-scoring-blocked', itemId: 'i42-scoring-blocked',
      itemType: ['stuff'], equippedTo: protectedEntity.id, armorReserve: { current: 20, max: 80 },
      Stuffeffets: [buff('armor', 80), buff('robustness', 100), buff('brutality', 100), buff('physicalResistance', 20)] };
    E.recomputeEntityStats(protectedEntity, { persistEquipment: false, equippedItems: [blockedGear] });
    equal(protectedEntity.stats.robustness, 0, 'Equipped rank two Umbra is inactive on Frozen entity');
    equal(protectedEntity.stats.armor.current, 20, 'No derived Robustness armor leaks through the restriction');
    equal(protectedEntity.stats.physicalResistance, 20, 'Ordinary equipment resistance stays active');
    protectedEntity.battleBoosts = { brutality: [{ mode: 'flat', value: 50 }], physicalDamage: [{ mode: 'flat', value: 7 }] };
    equal(Rules.getSafe(protectedEntity, 'brutality'), 0, 'Battle buffs cannot bypass the Umbra restriction');
    equal(Rules.getSafe(protectedEntity, 'physicalDamage'), 27, 'Ordinary battle buffs remain active');
    const restrictedHelp = _D.calculateStatsDisplay('robustness', protectedEntity);
    check(restrictedHelp.helpContent.includes('doit être éveillée'), 'Umbra helper explains the awakening requirement');
    const beforeWear = D.calculateEntityPower(protectedEntity, { equipment: [blockedGear] }).score;
    Gear.consumeEntityArmor(protectedEntity, 5);
    blockedGear.armorReserve.current = protectedEntity.armorLayers.stuff['e-scoring-blocked'].reserve.current;
    const afterWear = D.calculateEntityPower(protectedEntity, { equipment: [blockedGear] }).score;
    equal(beforeWear - afterWear, 20, 'Real armor wear decreases the entity score once, by current armor lost');
    check(protectedEntity.archetypeFrozen, 'Combat resource changes preserve Frozen');
    const graphForward = D.calculateStatGraphValue({ armor: { current: 10, max: 500 }, robustness: 1 }, stats);
    const graphReverse = D.calculateStatGraphValue({ robustness: 1, armor: { current: 10, max: 500 } }, stats);
    check(JSON.stringify(graphForward) === JSON.stringify(graphReverse), 'Graph scoring is independent of key order');
    const Upgrade = await import("/js/ui/codex/stats.js"), _Upgrade = await import("/js/entities/progression.js");
    const levelFixture = { id: 99109, name: 'Frozen XP test', type: 'sbire', side: 'A', level: 1,
      archetypeFrozen: true, baseStats: { HP: 100, will: 20, strength: 1, agility: 1, intelligence: 1 },
      attacks: ['autoAttack'] };
    E.enrichEntityStats(levelFixture);
    E.entites.push(levelFixture);
    S.saveToLocalStorage('selectedArmyA', [levelFixture]);
    S.saveToLocalStorage('ArmyA', { entities: [levelFixture] });
    S.saveToLocalStorage('playerExperience', 0);
    S.setAdminMode(true);
    const form = Upgrade.createLevelUpForm(levelFixture);
    document.body.appendChild(form);
    form.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
    const oldLevel = levelFixture.level.current;
    S.setAdminMode(false);
    form.querySelector('.confirm-button.yes').click();
    equal(levelFixture.level.current, oldLevel, 'Leaving admin during preview cannot commit unpaid levels');
    S.setAdminMode(true);
    const reserveBeforeLevel = S.getAdminSettings().experience;
    form.querySelector('.confirm-button.yes').click();
    equal(levelFixture.level.current, oldLevel + 1, 'The same preview commits when funding is restored');
    const spent = reserveBeforeLevel - S.getAdminSettings().experience;
    equal(levelFixture.adminExperienceSpent, spent, 'Confirmed levels remember the admin XP origin');
    check(spent > 0 && levelFixture.archetypeFrozen && levelFixture.Archetype.current.key === 'egare', 'Manual progression preserves Frozen');
    S.setAdminMode(false);
    const reserveBeforeReset = S.getAdminSettings().experience;
    const reset = await _Upgrade.resetEntityProgression(levelFixture);
    check(reset.ok && levelFixture.archetypeFrozen, 'Umbilical reset preserves Frozen');
    equal(S.getNormalPlayerExperience(), 0, 'Umbilical refund does not launder admin XP');
    equal(S.getAdminSettings().experience - reserveBeforeReset, reset.refundXP, 'Umbilical refund returns to the original reserve');
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].adminExperienceSpent, 0, 'Refunded admin spending is cleared in the save');
    const unknown = D.calculateEntityPower({ ...projected, attacks: ['unknown-test-spell'], attackDetails: undefined }, { equipment: [] });
    check(unknown.rates.incomplete && unknown.details.some(row => row.stat === 'attackEffect' && row.score > 0), 'Unknown attack receives a diagnosed fallback instead of disappearing');
    S.setAdminMode(false);
    const normalRates = U.createEntityRateSummary(projected);
    check(normalRates.textContent.includes('DPS') && !normalRates.hidden, 'Entity DPS/HPS are available outside admin');
    const panel = U.createEntityPowerValue(projected);
    document.body.append(panel);
    check(panel.hidden, 'Power starts hidden outside admin');
    S.setAdminMode(true);
    check(!panel.hidden && panel.textContent === P.roundPower(D.calculateEntityPower(projected).score).toLocaleString('fr-FR'), 'Live toggle exposes only the numeric score');
    check(panel.tagName === 'SPAN' && !panel.querySelector('details, pre, summary'), 'Entity power has no expanded detail');
    S.setAdminMode(false);
    check(panel.hidden, 'Live toggle hides power again');
    S.setAdminMode(true);
    const refreshed = structuredClone(projected);
    refreshed.baseStats.strength += 5;
    panel._refreshPower(refreshed);
    check(panel.textContent === P.roundPower(D.calculateEntityPower(refreshed).score).toLocaleString('fr-FR'), 'Numeric power refreshes after entity changes');
    const codex = document.createElement('div');
    _U.createEntityCodex(projected, codex);
    const nameRow = codex.querySelector('.entity-power-name-row');
    check(nameRow?.querySelector('.codex-entity-name')?.nextElementSibling?.classList.contains('entity-power-value'), 'Codex score sits next to the name');
    nameRow.querySelector('.codex-entity-name').textContent = 'Nouveau surnom';
    check(!!nameRow.querySelector('.entity-power-value'), 'Renaming does not erase the score');
    const exportArmy = [projected, { ...projected, id: 99102, summonOrigin: { casterId: projected.id } }];
    const exportBefore = JSON.stringify(exportArmy);
    const exportSaved = JSON.stringify({ ...localStorage });
    const report = U.createArmyPowerReport(exportArmy, 'A');
    equal(report.power.score, D.calculateEntityPower(projected).score, 'Export respects summoned entity deduplication');
    check(report.entities[1].includedInTotal === false && report.entities[1].countedThroughSummoner === projected.id, 'Export explains summon exclusion');
    check(report.entities[0].name === projected.name && report.entities[0].calculation.length > 0 && report.entities[0].power.rates, 'Export includes identity, calculation and rates');
    check(JSON.stringify(exportArmy) === exportBefore && JSON.stringify({ ...localStorage }) === exportSaved, 'Export is read-only');
    const Admin = await import("/js/debug/admin.js");
    Admin.AdminButtons();
    const buttons = ['A', 'B'].map(side => document.getElementById(`PowerArmy${side}`));
    check(buttons.every(Boolean), 'Both army power download buttons exist');
    S.setAdminMode(false);
    check(buttons.every(button => button.disabled), 'Power downloads disabled outside admin');
    S.setAdminMode(true);
    check(buttons.every(button => !button.disabled), 'Power downloads enabled live');
    E.entites.splice(0, E.entites.length, { ...projected, side: 'A' }, { ...refreshed, id: 99202, side: 'B', name: 'Adversaire' });
    window.powerExportExpected = { A: D.calculateEntityPower(E.entites[0]).score, B: D.calculateEntityPower(E.entites[1]).score };
    const heading = document.createElement('h2');
    heading.append(projected.name, panel);
    const listName = document.createElement('div');
    listName.className = 'codex-entite-infos';
    listName.style.width = '260px';
    listName.append(nameRow);
    const downloads = document.createElement('div');
    downloads.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    downloads.append(...buttons);
    document.body.replaceChildren(heading, listName, downloads);
    document.documentElement.style.cssText = 'width:100%;min-width:0';
    document.body.style.cssText = 'margin:0;padding:20px;background:#111;color:#eee;min-height:100vh;box-sizing:border-box;width:100%;min-width:0';
    return { checks, score: score.score, rates: score.rates, summonRates: summonScore.rates };
  });
  console.log(result.checks.join('\n'));
  console.log(JSON.stringify({ power: result.score, dps: result.rates.dps, invocation: result.summonRates.summonDps }));
  assert.deepEqual(errors, [], 'Browser runtime errors');
  for (const side of ['A', 'B']) {
    const downloading = page.waitForEvent('download');
    await page.locator(`#PowerArmy${side}`).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), `PowerArmy${side}.json`);
    const report = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(report.side, side);
    assert.equal(report.power.score, await page.evaluate(side => window.powerExportExpected[side], side));
    assert.equal(report.entities.length, 1);
    assert.equal(report.entities[0].name, side === 'A' ? 'Scoring' : 'Adversaire');
    assert.ok(report.entities[0].calculation.length > 0);
  }
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { 'custom-army': { entities: [E.entites[1]] } } });
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'power-test', ArmyB_id: 'custom-army' }] });
    window.currentStageId = 'power-test';
    E.entites.splice(0);
  });
  for (const side of ['A', 'B']) {
    const downloading = page.waitForEvent('download');
    await page.locator(`#PowerArmy${side}`).click();
    const report = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
    assert.equal(report.power.score, await page.evaluate(side => window.powerExportExpected[side], side), 'Export falls back to the selected stored army');
  }
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    S.saveToLocalStorage('ArmyB', { armies: {} });
  });
  const emptyDownload = page.waitForEvent('download');
  await page.locator('#PowerArmyB').click();
  const emptyReport = JSON.parse(await readFile(await (await emptyDownload).path(), 'utf8'));
  assert.equal(emptyReport.power.score, 0);
  assert.deepEqual(emptyReport.entities, []);
  await mkdir('outputs/scoring', { recursive: true });
  await page.screenshot({ path: 'outputs/scoring/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/scoring/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile horizontal overflow');
  assert.deepEqual(errors, [], 'No browser errors during exports');
  console.log(`PASS: ${result.checks.length} scoring checks, 5 army downloads and responsive numeric preview`);
  const tilesPage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  tilesPage.on('pageerror', error => errors.push(error.message));
  await tilesPage.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const tileChecks = await tilesPage.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const U = await import("/js/ui/application.js"), _U2 = await import("/js/ui/inventory.js");
    const M = await import('/js/items/itemManager.js');
    const I = await import('/js/items/items.js');
    const D = await import("/js/combat/statistics.js");
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    window.levelRunning = 'worldmap';
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], items: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    S.saveToLocalStorage('IngameItemsData', { items: [], Playerinventory: [] });
    S.setAdminMode(false);
    const mosaic = document.createElement('div');
    mosaic.className = 'shop-item-mosaic';
    const potion = ItemDetails.find(item => item.serial === 'i0');
    const upgrade = ItemDetails.find(item => item.battleSlotBonus);
    const gear = ItemDetails.find(item => item.itemType?.includes('stuff'));
    const shopItem = M.createAllItems(potion, { source: 'worldmap-shop', showCost: true });
    const shopEntity = M.createAllItems(entitesNestUp[0], { source: 'worldmap-shop', showCost: true });
    mosaic.append(shopItem, M.createAllItems(upgrade, { source: 'worldmap-shop', showCost: true }),
      M.createAllItems(gear, { source: 'worldmap-shop', showCost: true }), shopEntity);
    document.body.append(mosaic);
    const price = shopItem.querySelector('[data-shop-price]');
    const caption = shopItem.querySelector('.item-admin-caption');
    check(!price.hidden && price.textContent === `${potion.itemCost} XP`, 'Normal shop retains its XP price');
    check(caption.hidden, 'Admin name/power caption starts hidden outside admin');
    S.setAdminMode(true);
    check(price.hidden && getComputedStyle(price).display === 'none', 'Admin shop hides prices instead of writing free');
    check(!caption.hidden && caption.querySelector('.item-admin-name').textContent === potion.displayName, 'Admin shop shows the item name');
    check(Number(caption.querySelector('.item-power-value').textContent) === I.calculateItemPower(potion).score, 'Admin shop shows the calculated item power');
    check(!mosaic.textContent.includes('Gratuit'), 'No free-admin label remains in shop tiles');
    check(shopEntity.querySelector('.item-admin-name').textContent === entitesNestUp[0].name &&
      shopEntity.querySelector('.entity-power-value').textContent === D.calculateEntityPower(entitesNestUp[0]).score.toLocaleString('fr-FR'), 'Shop entities use entity power, not item power');
    U.createGameContainer(); U.GameUi();
    _U2.createInventory();
    const owned = M.acquireItem(potion, 'power-ui-test');
    M.acquireItem(gear, 'power-ui-test');
    const inventory = document.querySelector('.inventory-interface');
    check(!!inventory, 'Real inventory opens');
    const card = inventory.querySelector(`[data-item-id="${owned.itemId}"]`);
    check(card?.textContent.includes(potion.displayName) && !card.querySelector('.item-power-value').hidden, 'Inventory displays name and numeric power');
    check(Number(card.querySelector('.item-power-value').textContent) === I.calculateItemPower(owned).score, 'Inventory uses the same item calculation');
    S.setAdminMode(false);
    check(!price.hidden && caption.hidden && card.querySelector('.item-power-value').hidden, 'Leaving admin restores prices and hides all tile powers live');
    S.setAdminMode(true);
    check(price.hidden && !caption.hidden && !card.querySelector('.item-power-value').hidden, 'Returning to admin restores captions without rebuilding cards');
    const worn = { ...structuredClone(gear), itemId: 'i-power-worn', equippedId: 'e-power-worn',
      Stuffeffets: [{ type: 'stat-buff', stat: 'armor', value: 80 }], armorReserve: { current: 20, max: 80 } };
    S.saveToLocalStorage('equippedItems', [worn]);
    const armorValue = M.createItemPowerValue(worn);
    check(Number(armorValue.textContent) === 90, 'Compact armor value uses current armor');
    worn.armorReserve.current = 0;
    S.saveToLocalStorage('equippedItems', [worn]);
    const player = S.loadFromLocalStorage('PlayerSave', {});
    player.equippedItems = [worn]; S.saveToLocalStorage('PlayerSave', player);
    const data = S.loadFromLocalStorage('IngameItemsData', {});
    data.equippedItems = [worn]; S.saveToLocalStorage('IngameItemsData', data);
    armorValue._refreshPower();
    check(Number(armorValue.textContent) === 10, 'Compact armor power refreshes after reserve loss');
    const zero = M.createItemPowerValue({ itemType: ['consumable'], itemEffect: [] });
    check(zero.textContent === '0' && !zero.hidden, 'Zero power remains visible in admin');
    const shopTitle = document.createElement('h2'); shopTitle.textContent = 'Boutique';
    const inventoryTitle = document.createElement('h2'); inventoryTitle.textContent = 'Inventaire';
    const contents = inventory.querySelector('.inventory-content');
    document.body.replaceChildren(shopTitle, mosaic, inventoryTitle, contents);
    document.documentElement.style.cssText = 'width:100%;min-width:0';
    document.body.style.cssText = 'margin:0;padding:20px;box-sizing:border-box;background:#111;color:#eee;min-height:100vh;width:100%;min-width:0';
    mosaic.style.cssText = 'max-width:600px;padding:12px 0';
    contents.style.cssText = 'max-width:600px;padding:12px 0';
    window.checkTileLayout = () => [...document.querySelectorAll('.item-admin-caption, .item-power-value')].every(node => {
      const box = node.getBoundingClientRect();
      const parent = node.parentElement.getBoundingClientRect();
      return box.left >= parent.left - 1 && box.right <= parent.right + 1 && node.scrollWidth <= node.clientWidth + 1;
    });
    return checks;
  });
  await tilesPage.screenshot({ path: 'outputs/scoring/shop-inventory-desktop.png', fullPage: true });
  assert.equal(await tilesPage.evaluate(() => window.checkTileLayout()), true, 'Desktop item captions fit their tiles');
  await tilesPage.setViewportSize({ width: 390, height: 844 });
  await tilesPage.screenshot({ path: 'outputs/scoring/shop-inventory-mobile.png', fullPage: true });
  assert.equal(await tilesPage.evaluate(() => window.checkTileLayout()), true, 'Mobile item captions fit their tiles');
  assert.equal(await tilesPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No tile horizontal overflow');
  assert.deepEqual(errors, [], 'No shop/inventory browser errors');
  console.log(tileChecks.join('\n'));
  console.log(`PASS: ${tileChecks.length} shop/inventory power checks and desktop/mobile tiles`);
  const livePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  livePage.on('pageerror', error => errors.push(error.message));
  await livePage.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await livePage.bringToFront();
  const liveChecks = await livePage.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const U = await import("/js/ui/statistics/components.js"), _U3 = await import("/js/ui/attacks.js");
    const M = await import('/js/items/itemManager.js');
    const I = await import('/js/items/items.js');
    const D = await import("/js/combat/statistics.js");
    const E = await import("/js/entities/runtime.js");
    const Armor = await import('/js/items/armor.js');
    const P = await import('/js/procedural/proc-bareme.js');
    const { attackDetails } = await import('/js/data/attackList.js');
    const { ItemDetails } = await import('/js/data/itemList.js');
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const wait = () => new Promise(resolve => setTimeout(resolve, 450));
    const format = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
    const template = name => structuredClone(attackDetails.find(attack => attack.functionName === name));
    let owner = E.projectEntityForPower({ id: 99191, name: 'Actualisation Power', type: 'sbire', side: 'A',
      level: { current: 10 }, baseStats: { HP: 100, physicalDamage: 20, magicalDamage: 20, piercingDamage: 20,
        strength: 10, agility: 5, intelligence: 8, speed: 1000, charge: 3 }, stuff: {}, modifierStats: {},
      attackDetails: [
        { ...template('autoAttack'), attackKey: 'autoAttack', entityAttackId: 'power-live-auto', physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 },
        { ...template('soin'), attackKey: 'soin', entityAttackId: 'power-live-soin', physicalRatio: 0, magicalRatio: 1, piercingRatio: 0 },
      ], Archetype: { current: { key: 'tank' } } });
    E.entites.splice(0, E.entites.length, owner);
    S.setAdminMode(false);
    const name = document.createElement('h2');
    const entityValue = U.createEntityPowerValue(owner);
    name.append(owner.name, entityValue);
    const helper = _U3.createAttackLightDescription(owner.attackDetails[0], owner);
    const value = helper.querySelector('.attack-power-value');
    const multi = _U3.MultiAttackDisplay(owner, { codexLayout: true });
    const armyPanel = U.createArmyPowerSummary(() => E.entites, 'Power de test');
    armyPanel.open = true;
    document.body.append(name, helper, multi, armyPanel);
    check(value?.hidden && entityValue.hidden, 'Attack powers start hidden outside admin');
    S.setAdminMode(true);
    const checkAttack = label => check(value.textContent === format(D.calculateAttackPower(owner.attackDetails[0], owner).score), label);
    const checkEntity = label => check(entityValue.textContent === format(D.calculateEntityPower(owner).score), label);
    const checkArmy = label => check(armyPanel.querySelector('pre').textContent.startsWith(`Power : ${D.calculateArmyPower(E.entites).score}\n`), label);
    check(value.parentElement.classList.contains('combat-attack-helper-name') && !value.textContent.includes('Power'), 'Attack power is numeric and sits beside the name');
    check(multi.querySelectorAll('.attack-browser-thumb .attack-loot-name > .attack-power-value').length === 2 &&
      multi.querySelector('.attack-details .attack-loot-name > .attack-power-value'), 'Multi-attack thumbnails and detail both show inline power');
    check(!document.querySelector('.attack-power-preview'), 'Old separate attack power row is removed');
    checkAttack('Initial inline attack power matches the calculator');
    owner.stats.physicalDamage += 12;
    owner.baseStats.physicalDamage += 12;
    await wait();
    checkAttack('Direct stat changes update attack power without reopening');
    checkEntity('Direct stat changes update entity power without reopening');
    checkArmy('Open army breakdown updates after a stat change');
    owner.battleBoosts = { physicalDamage: [{ mode: 'flat', value: 20 }] };
    await wait();
    checkAttack('Temporary buff application updates attack power');
    owner.battleBoosts = {};
    await wait();
    checkAttack('Temporary buff removal updates attack power');
    owner.attackDetails[0] = { ...owner.attackDetails[0], cooldown: 10000, attacknature: ['magicalDamage'],
      essenceSlots: [{ slotId: 'slot-1', color: 'blue', kind: 'open', essenceSource: 'linked', linkedColor: 'blue' }],
      essenceProfile: { red: 0, yellow: 0, blue: 1, total: 1 }, essences: ['blue'] };
    window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', { detail: { entity: owner, entityId: owner.id, attack: owner.attackDetails[0] } }));
    await wait();
    checkAttack('Replacing the owned attack and essence updates an existing helper');
    checkEntity('Changed attack definition updates entity power');
    owner = { ...owner, stats: { ...owner.stats, physicalDamage: owner.stats.physicalDamage + 30 } };
    E.entites[0] = owner;
    await wait();
    checkAttack('Replacing the live entity does not leave stale power closures');
    const gear = { ...structuredClone(ItemDetails.find(item => item.serial === 'i2')),
      itemId: 'i-live-power', equippedId: 'e-live-power', equippedTo: owner.id,
      Stuffeffets: [{ type: 'stat-buff', stat: 'armor', value: 80 }], armorReserve: { current: 20, max: 80 } };
    const saveGear = () => {
      S.saveToLocalStorage('equippedItems', [gear]);
      S.saveToLocalStorage('IngameItems', [gear]);
      const player = S.loadFromLocalStorage('PlayerSave', {});
      player.equippedItems = [gear]; S.saveToLocalStorage('PlayerSave', player);
      const items = S.loadFromLocalStorage('IngameItemsData', {});
      items.equippedItems = [gear]; items.items = [gear]; S.saveToLocalStorage('IngameItemsData', items);
    };
    owner.stuff = { slot1: [gear.equippedId] };
    saveGear();
    E.recomputeEntityStats(owner, { persistEquipment: false, equippedItems: [gear] });
    const itemValue = M.createItemPowerValue(structuredClone(gear));
    document.body.append(itemValue);
    if (!document.querySelector('.Game-helper')) {
      const helperHost = document.createElement('div');
      helperHost.className = 'Game-helper';
      document.body.append(helperHost);
    }
    const itemHelper = M.createItemDescription(structuredClone(gear), gear.itemId, itemValue);
    const itemBreakdown = itemHelper.querySelector('[data-item-power-debug]');
    itemBreakdown.open = true;
    window.dispatchEvent(new CustomEvent('equippedItemsUpdated'));
    await wait();
    checkEntity('Equipping an item updates entity power');
    checkAttack('Equipping an item updates attack power');
    const beforeArmor = Number(itemValue.textContent);
    Armor.consumeEntityArmor(owner, 5);
    const changedGear = Armor.applyArmorLayersToEquippedItems(owner, [gear]);
    Object.assign(gear, changedGear[0]);
    saveGear();
    await wait();
    check(Number(itemValue.textContent) === I.calculateItemPower(gear).score && Number(itemValue.textContent) < beforeArmor, 'Armor wear updates item power without manual refresh');
    checkEntity('Armor wear updates entity power without reopening');
    check(itemBreakdown.querySelector('summary').textContent.startsWith(`Power : ${I.calculateItemPower(gear).score} `), 'Open item helper updates after armor wear');
    checkArmy('Open army breakdown updates after armor wear');
    const directRule = P.TACTICAL_RULES.consequences.direct;
    const oldDirectRule = { ...directRule };
    const beforeTariff = value.textContent;
    try {
      directRule.floor = 37;
      await wait();
      check(value.textContent !== beforeTariff, 'Changing the tactical tariff invalidates the live cached power');
      checkAttack('Edited tactical tariff reaches the inline attack score');
      checkEntity('Edited tactical tariff reaches the entity score');
      checkArmy('Edited tactical tariff reaches the army score');
    } finally { Object.assign(directRule, oldDirectRule); }
    await wait();
    check(value.textContent === beforeTariff, 'Restoring the tariff refreshes the original power without reopening');
    const reference = value._powerResult;
    await wait();
    check(value._powerResult === reference, 'Idle refresh reuses the cached calculation');
    const oldSignature = value._powerSignature;
    S.setAdminMode(false);
    owner.stats.physicalDamage += 10;
    await wait();
    check(value.hidden && itemValue.hidden && entityValue.hidden && value._powerSignature === oldSignature, 'Normal mode hides powers and stops their calculations');
    S.setAdminMode(true);
    checkAttack('Returning to admin immediately calculates the latest values');
    S.saveToLocalStorage('selectedArmyA', [owner]);
    E.entites.splice(0);
    delete window.selectedArmyA;
    owner = { ...owner, stats: { ...owner.stats, physicalDamage: owner.stats.physicalDamage + 7 } };
    S.saveToLocalStorage('selectedArmyA', [owner]);
    await wait();
    checkAttack('Stored army replacement refreshes an open attack helper');
    checkEntity('Stored army replacement refreshes an open entity label');
    const titles = [...multi.querySelectorAll('.attack-loot-name')];
    const gallery = document.createElement('div');
    gallery.style.cssText = 'max-width:900px;line-height:1.5';
    gallery.append(name, helper, ...titles);
    document.body.replaceChildren(gallery);
    document.documentElement.style.cssText = 'width:100%;min-width:0';
    document.body.style.cssText = 'margin:0;padding:20px;background:#111;color:#eee;min-height:100vh;box-sizing:border-box;width:100%;min-width:0';
    return checks;
  });
  await livePage.screenshot({ path: 'outputs/scoring/live-attack-desktop.png', fullPage: true });
  await livePage.setViewportSize({ width: 390, height: 844 });
  await livePage.screenshot({ path: 'outputs/scoring/live-attack-mobile.png', fullPage: true });
  assert.equal(await livePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Inline attack power fits on mobile');
  assert.deepEqual(errors, [], 'No live power browser errors');
  console.log(liveChecks.join('\n'));
  console.log(`PASS: ${liveChecks.length} live power checks and inline attack desktop/mobile previews`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
