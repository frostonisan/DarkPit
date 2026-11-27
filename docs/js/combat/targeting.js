import { normArr } from "./attackResolution.js";
import { getControlState, getCombatSide, isCombatEnemy, isCharmedEnemyTarget } from "./control.js";
import { entites } from "../entities/runtime.js";
import { isHexTarget, getEntityHex } from '../board/targets.js';

export const isAttackEntityAlive = entity => Boolean(entity && !entity.isDEAD && Number(entity.stats?.HP?.current) > 0);

// Camp determines selection only. An in-flight action retains its original function.
export function acceptsImpactTarget(attack, target) {
  const targets = normArr(attack.attackTarget);
  if (isHexTarget(target)) return targets.includes('hexa') && target.isConnected;
  if (!targets.some(type => type === 'ally' || type === 'enemy') || !target || !getEntityHex(target)?.isConnected) return false;
  if (normArr(attack.deadTarget).includes('yes')) {
    return target.isDEAD === true && !target.corpseConsumed && !target.corpseDestroyed;
  }
  return isAttackEntityAlive(target);
}

export function acceptsSelectedTarget(attacker, attack, target) {
  if ((attack.folieTargeting || attacker._folieAtLaunch || getControlState(attacker, 'folie')) && !isHexTarget(target))
    return Boolean(target && !target.hasFled && getEntityHex(target)?.isConnected);
  if (!acceptsImpactTarget(attack, target)) return false;
  if (isHexTarget(target)) return true;
  const targets = normArr(attack.attackTarget);
  return targets.includes('enemy') && isCombatEnemy(attacker, target)
    || targets.includes('ally') && getCombatSide(attacker) === getCombatSide(target);
}

// Recheck the current allegiance and charm priority at the preparation boundary.
// Released attacks keep their launch-time targeting and never use this check.
export function acceptsExecutionTarget(attacker, attack, target) {
  const currentAttack = { ...attack, folieTargeting: false };
  if (target?.hasFled || !acceptsSelectedTarget(attacker, currentAttack, target)) return false;
  if (getControlState(attacker, 'folie') || isHexTarget(target)
      || !normArr(attack.attackTarget).includes('enemy') || !isCharmedEnemyTarget(attacker, target)) return true;
  return !entites.some(candidate => !candidate.hasFled && isAttackEntityAlive(candidate)
    && getCombatSide(candidate) !== getCombatSide(attacker)
    && acceptsSelectedTarget(attacker, currentAttack, candidate));
}
