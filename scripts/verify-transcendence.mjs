import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const UI = await import('../docs/js/ui/statistics/details.js');
const H = await import('../docs/js/data/helpers.js');
const Pref = await import('../docs/js/storage/statisticPreferences.js');
const Session = await import('../docs/js/storage/sessionStorage.js');
const { consumeRechargeableLife, consumeFadedLife, addFadedLife } = await import('../docs/js/items/resourceStocks.js');
const { getStatEffectMaximum } = await import('../docs/js/data/balanceData.js');
const P = globalThis.umbraProgression;
let checks = 0;
const near = (actual, expected, message) => { assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} / ${expected}`); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const recompute = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const entity = (t, i, limit = 150) => recompute({ id: 998801, name: 'Transcendance', type: 'sbire', side: 'A', awakening: 3,
  seuilUmbra: limit, level: { current: 1, max: 250 }, stuff: {}, attacks: ['autoAttack'],
  baseStats: { HP: 1000, transcendence: t, intelligence: i, strength: 0, agility: 0 } });

for (const [t, i, limit, lives, chance] of [[1,0,150,1,0.04114095370587562], [50,50,150,4,3.03910699382993],
  [128,0,150,7,null], [150,150,150,7,10.24], [300,300,300,10,24.93965430838899], [1500,1500,1500,20,84.70245539601373]]) {
  const e = entity(t,i,limit);
  near(S.getStatSystemResult(e,'extraLife').value, lives, 'Uncapped whole lives');
  if (chance !== null) near(D.calculateTranscendenceConsoProtectionTotal(e), chance, 'Shared exclusive curve');
  const ui = UI.calculateStatsDisplay('transcendence',e);
  near(ui.transcendenceExBonus,lives,'Display and engine life grant agree');
  near(ui.transcendenceConsoProtectionPercent,D.calculateTranscendenceConsoProtectionTotal(e),'Display and engine chance agree');
  const entries = ui.umbraPresentation.entries;
  assert.deepEqual(entries.filter(entry => entry.exclusive).map(entry => entry.stat).sort(), ['improvedResurrection', 'transcendenceTotal'], 'Both unique passives belong to Transcendence'); checks++;
  near(entries.find(entry => entry.stat === 'transcendentalCooldown').value,D.calculateTranscendentalCooldown(e).seconds,'Cooldown shown is the actual duration');
  ok(!entries.some(entry => entry.state === 'X'), 'Transcendence has no falsely labeled X ability');
  ok(S.getStatSystemResult(e,'transcendenceTotal').state === 'normal','Unique passive has no upgraded name variant');
}
const e = entity(150,150);
near(D.calculateTranscendentalCooldown(e).seconds,3.24181626187962,'Intelligence cooldown at 150');
const chance = D.calculateTranscendenceConsoProtectionTotal(e), cooldown = D.calculateTranscendentalCooldown(e).seconds;
e.baseStats.agility = 150000; e.baseStats.strength = 150000; recompute(e);
near(D.calculateTranscendenceConsoProtectionTotal(e),chance,'Agility/Strength cannot affect level 3 protection');
near(D.calculateTranscendentalCooldown(e).seconds,cooldown,'Agility/Strength cannot affect level 3 cooldown');
for (let used=0;used<5;used++) ok(consumeRechargeableLife(e,'extraLife'),'A ready life is consumed');
e.seuilUmbra = 1500; e.baseStats.transcendence = 1500; e.baseStats.intelligence = 1500; recompute(e);
near(e.stats.extraLife.current,2,'Recomputation never restores spent lives'); near(e.stats.extraLife.max,20,'Raised owner limit increases capacity');
ok(D.calculateTranscendentalCooldown(e).seconds < cooldown,'Intelligence still contributes above 150');
e.seuilUmbra = 150; recompute(e);
near(S.getDirectingStatResult(e,'transcendence').value,285,'Natural overflow is discounted exactly once');
ok(e.stats.extraLife.max < 20,'Old owner limit reduces overflow curve gain');
near(e.baseStats.transcendence,1500,'Raw points remain intact');

const autonomous = entity(0,1500,1500); autonomous.baseStats.transcendenceTotal = 12; recompute(autonomous);
near(D.calculateTranscendenceConsoProtectionTotal(autonomous),12,'Autonomous protection works without Umbra');
near(D.calculateTranscendentalCooldown(autonomous).seconds,5,'Autonomous protection retains base cooldown');
autonomous.baseStats.transcendenceTotalPlus = 7; recompute(autonomous);
near(D.calculateTranscendenceConsoProtectionTotal(autonomous),19,'Direct plus never creates an Intelligence ratio without Umbra');
autonomous.baseStats.transcendenceTotal = 120; recompute(autonomous);
near(D.calculateTranscendenceConsoProtectionTotal(autonomous),99,'All sources share one 99% cap');
for (const points of [-100,0,1,10,150,300,1500,1e12]) {
  const d=P.transcendenceDetails(points,points,undefined,Math.max(150,points));
  ok(d.percent >= 0 && d.percent < 99,'Generated percentage never reaches the asymptote');
  const cd=P.transcendenceCooldownDetails(points,points,undefined,Math.max(150,points));
  ok(cd.seconds >= 2 && cd.seconds <= 5,'Cooldown remains between 2 and 5 seconds');
}
near(P.transcendenceDetails(0,1e8).percent,0,'No Umbra, no generated protection');
near(E.calculateTranscendenceExtraLife(-20),0,'Negative Umbra cannot grant negative lives');
ok(getStatEffectMaximum('transcendenceExBonus') === undefined,'No obsolete seven-life maximum');
ok(!H.statMaximumLabel(20,getStatEffectMaximum('transcendenceExBonus')),'No MAX on uncapped lives');
const manyPoints = 150 * (1001 / 7) ** (1 / .4626);
const manyLives = entity(manyPoints,0,manyPoints);
near(manyLives.stats.extraLife.max,1001,'Life slots can exceed three-digit identifiers');
ok(manyLives.extraLifeRegen['1000'],'Four-digit regeneration slot exists');
manyLives.baseStats.transcendence = 150; recompute(manyLives);
ok(!manyLives.extraLifeRegen['1000'],'Reducing capacity removes obsolete four-digit slots');

const healed = entity(50,20);
healed.baseStats.HP = 1001; recompute(healed);
let healingDisplay = UI.calculateStatsDisplay('transcendence',healed);
ok(healingDisplay.resurrectionHealing.length === 1 && healingDisplay.resurrectionHealing[0].pool === 'extraLife', 'Absent life types are omitted');
near(healingDisplay.resurrectionHealing[0].restoredHP,Math.ceil(healed.stats.HP.max*.4),'Improved resurrection shows the rounded current HP return');
const healingEntry = healingDisplay.umbraPresentation.entries.find(entry => entry.id === 'improvedResurrection');
ok(healingEntry?.exclusive && !healingEntry.passiveOf && !healingEntry.state, 'Improved resurrection is its own unique passive, without an X state');
healed.baseStats.eternalLife = 1; recompute(healed); addFadedLife(healed,2);
healingDisplay = UI.calculateStatsDisplay('transcendence',healed);
ok(healingDisplay.resurrectionHealing.length === 3, 'All three owned life types appear');
near(healingDisplay.resurrectionHealing.find(row=>row.pool==='fadedLife').restoredHP,Math.ceil(healed.stats.HP.max*.5),'Faded life uses the combat healing rule');
near(healingDisplay.resurrectionHealing.find(row=>row.pool==='eternalLife').restoredHP,healed.stats.HP.max,'Eternal life uses the combat healing rule');
while(consumeFadedLife(healed)) {}
while(consumeRechargeableLife(healed,'extraLife')) {}
while(consumeRechargeableLife(healed,'eternalLife')) {}
healingDisplay = UI.calculateStatsDisplay('transcendence',healed);
ok(healingDisplay.resurrectionHealing.length === 2 && healingDisplay.resurrectionHealing.every(row=>row.pool!=='fadedLife'&&row.current===0), 'Rechargeable reserves remain owned; spent faded lives disappear');
healed.baseStats.intelligence = 50; healed.baseStats.HP = 2001; recompute(healed);
near(UI.calculateStatsDisplay('transcendence',healed).resurrectionHealing.find(row=>row.pool==='extraLife').restoredHP,Math.ceil(healed.stats.HP.max*.7),'HP and Intelligence changes refresh the displayed return');
const ordinary = entity(0, 150);
ordinary.baseStats.extraLife = 2; recompute(ordinary);
near(D.calculateExtraLifeIntelPercent(ordinary), 0, 'Intelligence alone cannot grant improved resurrection');
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 20, 'An autonomous extra life keeps its base healing');
near(UI.calculateStatsDisplay('extraLife', ordinary).extraLifeResurrectHP, 200, 'Extra-life helper shows the same base healing');
ordinary.baseStats.transcendence = 1; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 99, 'One active Umbra point unlocks the capped Intelligence bonus');
ordinary.baseStats.intelligence = 20; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 40, 'Intelligence scales healing while the Umbra is active');
ordinary.baseStats.transcendence = 0; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 20, 'Removing the Umbra removes the healing bonus immediately');
ordinary.modifierStats.durable.adminLevel = { transcendence: 1 }; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 40, 'A granted effective Umbra also unlocks the passive');
delete ordinary.modifierStats.durable.adminLevel; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 20, 'Removing the granted Umbra disables the passive');
ordinary.baseStats.transcendence = 1; ordinary.Archetype = { current: { key: 'egare' } }; recompute(ordinary);
near(D.calculateExtraLifeResurrect(ordinary).totalPercent, 20, 'Restricted Umbra points cannot activate the passive');
ok(H.STAT_HELPER_DESCRIPTIONS.criticalResistance.includes('bonus de dégâts des') && H.STAT_HELPER_DESCRIPTIONS.criticalResistance.includes('picto-stat criticalChance'), 'Critical resistance names the damage bonus and includes the critical-hit pictogram');

const lifeKey=Pref.statisticCalculationChoiceKey('transcendence','', 'transcendenceExBonus');
const cdKey=Pref.statisticCalculationChoiceKey('transcendence','', 'transcendentalCooldown');
const otherKey=Pref.statisticCalculationChoiceKey('astrality','', 'astralCooldown');
Pref.saveStatisticCalculationDefault(false);
Pref.saveStatisticCalculationChoice(lifeKey,true); Pref.saveStatisticCalculationChoice(cdKey,false);
ok(Pref.readStatisticCalculationPreferences().choices[lifeKey] === true,'Per-calculation visibility persists');
ok(Pref.readStatisticCalculationPreferences().choices[cdKey] === false,'Explicit closed choice also persists');
ok(Pref.readStatisticCalculationPreferences().choices[otherKey] === undefined,'Independent Umbra has no changed preference');
Session.beginAdminSession(); Pref.saveStatisticCalculationChoice(cdKey,true); Session.endAdminSession();
ok(Pref.readStatisticCalculationPreferences().choices[cdKey] === true,'Display choices survive a temporary admin game session');
Pref.saveStatisticCalculationDefault(true);
ok(Pref.readStatisticCalculationPreferences().expanded && Object.keys(Pref.readStatisticCalculationPreferences().choices).length === 0,'Explicit global action resets individual overrides');
window.localStorage.setItem('statisticCalculationChoices','broken');
ok(Object.keys(Pref.readStatisticCalculationPreferences().choices).length === 0,'Invalid preference data is harmless');
console.log(`Transcendence: ${checks} checks passed.`);
