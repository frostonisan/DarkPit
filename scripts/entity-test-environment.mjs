import { registerHooks } from 'node:module';

// Keep stats, attacks, essences and persistence real. Browser suites cover rendering.
export async function installEntityTestEnvironment(initialEntries = []) {
  const storage = new Map(initialEntries);
  let writes = 0;
  globalThis.localStorage = {
    get length() { return storage.size; },
    key: index => [...storage.keys()][index] ?? null,
    getItem: key => storage.get(String(key)) ?? null,
    setItem: (key, value) => { writes++; storage.set(String(key), String(value)); },
    removeItem: key => { writes++; storage.delete(String(key)); },
    clear: () => { writes++; storage.clear(); },
  };
  globalThis.localStorageEnabled = true;
  globalThis.window = new EventTarget();
  window.localStorage = globalThis.localStorage;
  const session = new Map();
  window.sessionStorage = {
    getItem: key => session.get(String(key)) ?? null,
    setItem: (key, value) => session.set(String(key), String(value)),
    removeItem: key => session.delete(String(key)),
  };
  globalThis.document = Object.assign(new EventTarget(), {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  });

  const noops = names => names.map(name => `export function ${name}() {}`).join('\n');
  const unexpected = names => names.map(name =>
    `export function ${name}() { throw new Error('Unexpected browser/combat API: ${name}'); }`).join('\n');
  const stubs = new Map(Object.entries({
    "board/controller.js": unexpected(['releaseEntityFootprint', 'getFootprintOccupant']),
    "debug/admin.js": unexpected(['selectAdminEntitiesForSideB']),
    "entities/armies.js": unexpected(['generateArmyA', 'selectRandomEntitiesForSideB', 'selectScriptedEntitiesForSideB']),
    "app/startup.js": unexpected(['getOrCreateWorldMapID', 'initializeArmyConfig', 'ResetGameStages', 'ResetEntitesB',
      'ResetXp', 'ResetGameDay', 'detectPageReload', 'createUmbraBlock', 'syncStatCurseMarker', 'bindHelperEntity', 'closeOpenHelpers']),
    "ui/application.js": unexpected(['getOrCreateWorldMapID', 'initializeArmyConfig', 'ResetGameStages', 'ResetEntitesB',
      'ResetXp', 'ResetGameDay', 'detectPageReload']),
    "ui/statistics/components.js": noops(['refreshResetDom', 'syncDOMWithStats'])
      + '\n' + unexpected(['createUmbraBlock', 'syncStatCurseMarker']),
    "ui/codex/stats.js": noops(['updateExperienceDisplay']),
    "ui/codex/index.js": unexpected(['createCodexEntityScan']),
    "ui/statistics/helpers.js": unexpected(['bindHelperEntity', 'closeOpenHelpers']),
    "storage/entityStorage.js": noops(['recordEntityProgression']) + '\n' + unexpected([
      'saveEntityextraLifeToStorage', 'resetStoredArmorCurrentToMax', 'endEntityBattleRole', 'countCompletedArchetypes']),
    "combat/vitals.js": noops(['updateBonusLifeCounters', 'updateCurrentAttackDisplay', 'updateArmorCounter'])
      + '\n' + unexpected(['applyDamage', 'getAttackEffectHandler']),
    "combat/effects.js": noops(['getAstralityRuntime', 'isAstralReturnActive'])
      + '\nexport const astralCooldownRemaining = () => 0; export const transcendentalCooldownRemaining = () => 0; export const indestructibilityCooldownRemaining = () => 0; export const esoterismCooldownRemaining = () => 0;\n'
      + unexpected(['EffectMessage', 'showHealingFeedback', 'startAstralCooldown', 'startTranscendentalCooldown', 'startIndestructibilityCooldown', 'startEsoterismCooldown']),
    "rendering/animations.js": unexpected(['animationProjectile', 'animateDodge', 'animateIndestructibility', 'animateEsoterism',
      'animateAstrality', 'animateAmbidextry', 'animationMelee', 'animateMysticism', 'animateOccultism', 'damageImpact']),
    "combat/summons.js": unexpected(['inheritSummonEssences']),
    "combat/journal.js": 'export const battleLogs = [];',
    "app/state.js": 'export const requireSafeMenuAccess = () => true;' + unexpected(['StopGame', 'refreshStageAccess']),
    "ui/display.js": String.raw`
      export const isRegenKey = key => /^\d{3,}$/.test(key);
      export const toNonNegInt = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    ` + unexpected(['showGamePopupMessage', 'toRoman', 'EffectMessage', 'showHealingFeedback', 'showStatGainsFromDiff']),
    'biome/meteo.js': unexpected(['startArchup']),
  }).map(([path, source]) => [new URL(`../docs/js/${path}`, import.meta.url).href, source]));
  registerHooks({ load(url, context, nextLoad) {
    if (stubs.has(url)) return { format: 'module', source: stubs.get(url), shortCircuit: true };
    return nextLoad(url, context);
  } });
  // Bootstrap the shared cyclic graph through the same entry as the reset suite.
  await import("../docs/js/entities/runtime.js");
  return { storage, get writes() { return writes; } };
}
