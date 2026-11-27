import { entites, enrichEntityStats, recomputeEntityStats, generateUniqueID } from "./runtime.js";
import { entitesNest } from "../data/entityTemplates.js";
import { loadFromLocalStorage, saveToLocalStorage } from "../storage/gameStorage.js";
import { previewEntityReset, resetEntityProgression } from "./progression.js";
import * as upgradeApi from "./progression.js";
import { consumeFadedLife } from '../items/resourceStocks.js';

// Run manually on a fresh test game. Fixtures remain in the army for inspection.
export async function runEntityResetBrowserChecks() {
  const checks = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(`Entity reset: ${name}`);
    checks.push(name);
  };
  const makeFixture = () => {
    const entity = structuredClone(entitesNest[0]);
    Object.assign(entity, {
      id: generateUniqueID(), side: 'A', name: 'Reset browser fixture',
      level: { current: 1, baseMax: 100, max: 100 }, experience: 0,
      baseStats: {
        strength: 1, agility: 1, intelligence: 1, will: 20,
        HP: 20, vitality: 10, extraLife: 2, eternalLife: 1, fadedLife: 3, transcendence: 15,
      },
    });
    return enrichEntityStats(entity);
  };
  const entity = makeFixture();
  const other = makeFixture();
  entity.level.current = 12;
  entity.experience = 1001;
  entity.modifierStats.durable.statLeveled = { will: 65, vitality: 80, transcendence: 60 };
  entity.modifierStats.durable.levelUpMeta = { source: 'manualLevelUp', confirmedLevel: 12, reverseBaseLevel: 1 };
  recomputeEntityStats(entity);
  entity.stats.HP.current = 2;
  const fadedCount = entity.stats.fadedLife;
  check(fadedCount === 3, 'fixture starts with three faded lives');
  for (let i = 0; i < fadedCount; i++) check(consumeFadedLife(entity), `consume faded life ${i + 1}`);
  check(!consumeFadedLife(entity) && !entity.stats.fadedLife, 'fixture exhausts the real faded stock');
  for (const key of ['extraLife', 'eternalLife']) {
    entity.stats[key].current = 0;
    Object.entries(entity[`${key}Regen`]).forEach(([slot, value]) => {
      if (/^\d{3}$/.test(slot)) value.currentRegen = 0;
    });
  }
  entity.modifierStats.preview = { total: { will: 999 } };
  const selected = loadFromLocalStorage('selectedArmyA', []);
  saveToLocalStorage('selectedArmyA', [...selected, entity, other]);
  entites.push(entity, other);
  window.selectedArmyA ??= [];
  const runtimeCopy = structuredClone(entity);
  window.selectedArmyA.push(runtimeCopy);

  const fixtureDom = document.createElement('div');
  fixtureDom.hidden = true;
  const label = document.createElement('span');
  label.className = 'entity-level';
  label.dataset.entityId = String(entity.id);
  label.textContent = '12';
  fixtureDom.appendChild(label);
  document.body.appendChild(fixtureDom);

  const before = JSON.stringify(entity);
  const otherBefore = JSON.stringify(other);
  const storageBefore = JSON.stringify(Object.entries(localStorage).sort());
  const preview = previewEntityReset(entity);
  check(preview.ok && preview.refundXP === 1151 && preview.refundPercent === 115, 'uncapped refund ignores unconfirmed preview');
  check(JSON.stringify(entity) === before, 'preview leaves entity unchanged');
  check(JSON.stringify(Object.entries(localStorage).sort()) === storageBefore, 'preview leaves storage unchanged');
  const xpBefore = upgradeApi.playerExperience;
  const result = await resetEntityProgression(entity);
  check(result.ok && upgradeApi.playerExperience === xpBefore + 1151, 'real XP API credits refund');
  check(entity.level.current === 1 && entity.experience === 0, 'progression resets');
  check(entity.stats.HP.current === entity.stats.HP.max, 'HP refilled');
  check(entity.stats.extraLife.current === entity.stats.extraLife.max && entity.stats.eternalLife.current === 1, 'life pools refilled');
  check(!entity.stats.fadedLife, 'depleted faded lives stay depleted');
  check(runtimeCopy.level.current === 1 && !runtimeCopy.modifierStats.preview, 'runtime copies update');
  check(label.textContent === '1', 'real DOM label updates');
  check(JSON.stringify(other) === otherBefore, 'another entity remains unchanged');
  const saved = loadFromLocalStorage('selectedArmyA', []).find(entry => entry.id === entity.id);
  recomputeEntityStats(saved);
  check(saved.level.current === 1 && !saved.stats.fadedLife, 'saved progression survives recomputation');
  check(saved.stats.extraLife.current === saved.stats.extraLife.max && saved.stats.eternalLife.current === 1, 'saved regen stays full');
  const second = await resetEntityProgression(entity);
  check(second.ok && second.refundXP === 0 && upgradeApi.playerExperience === xpBefore + 1151, 'repeat reset cannot refund twice');
  const dead = structuredClone(entity);
  dead.stats.HP.current = 0;
  check(!previewEntityReset(dead).ok && !(await resetEntityProgression(dead)).ok, 'dead entity rejects');
  fixtureDom.remove();
  return { ok: true, entityId: entity.id, otherEntityId: other.id, checks };
}
