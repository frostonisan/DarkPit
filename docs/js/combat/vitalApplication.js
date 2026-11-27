// Commit resource changes at the orchestrator's chosen time; presentation stays separate.
import { battleLogs } from "./journal.js";
import { consumeEntityArmor } from '../items/armor.js';
import { saveEntityArmorState, saveEntityHPToStorage, recordEntityHealingDone,
  recordEntityHealingReceived } from "../storage/entityStorage.js";

export function applyHpChange(entity, outcome) {
  entity.stats.HP.current = outcome.hpAfter;
}

export function applyArmorDamage(entity, amount) {
  const outcome = consumeEntityArmor(entity, amount);
  saveEntityArmorState(entity);
  return outcome;
}

// The orchestrator calculates this outcome inside the deferred healing callback,
// so simultaneous damage and earlier healing are included in the current HP cap.
export function applySupportHealing(attacker, target, outcome, range, attack) {
  attacker.totalHeal = (Number(attacker.totalHeal) || 0) + outcome.healedHP;
  recordEntityHealingDone(attacker, outcome.healedHP, range, {
    summonOrigin: attack.summonStatsOrigin, ambidextry: attack.ambidextryHitIndex === 2,
  });
  recordEntityHealingReceived(target, outcome.healedHP);
  applyHpChange(target, outcome);
  saveEntityHPToStorage(target);
}

function buildDamageResolutionBattleLog(ctx) {
  return {
    attacker: ctx.attackerFull || ctx.attacker,
    target: ctx.targetFull || ctx.target,
    attack: ctx.attack,

    damage: ctx.totals?.finalDamagePreAstrality ?? ctx.hp?.delta ?? 0,
    damageSources:
      ctx.sources?.afterOccultismFragility ||
      ctx.sources?.afterEsoterism ||
      ctx.sources?.afterResistances ||
      {},

    armorAbsorbed: ctx.armor?.absorbedByArmor || 0,

    armor: {
      absorbed: ctx.armor?.absorbedByArmor || 0,
    },

    modifiers: ctx.attackModifiers || {},

    effects: {
      applied: ctx.effectsApplied || [],
      self: ctx.selfEffects || [],
    },
  };
}

export function recordDamageResolution(ctx) {
  const payload = buildDamageResolutionBattleLog(ctx);
  if (payload.damage > 0 || payload.armor.absorbed > 0 || payload.modifiers.indestructible) {
    battleLogs('damage_resolution', payload);
  }
}
