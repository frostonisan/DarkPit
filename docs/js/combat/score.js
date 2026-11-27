// Battle score accounting is independent of whether the score node is mounted.
let scoreSideA = 0;
let scoreSideB = 0;

export function updateScore(attacker, points) {
  if (attacker.side === 'A') scoreSideA += points;
  else if (attacker.side === 'B') scoreSideB += points;
  return scoreSideA;
}

export function deductScore(target, points) {
  if (target.side === 'A') scoreSideA -= points;
  else if (target.side === 'B') scoreSideB -= points;
  return scoreSideA;
}

export function readCombatScore() {
  return { sideA: scoreSideA, sideB: scoreSideB };
}
