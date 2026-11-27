// Corruption truncates capacity, without scaling or healing the current resource.
export function corruptHealthCapacity(hp, loss, uncorruptedMax = hp.uncorruptedMax ?? hp.max) {
  const maximum = Math.max(1, Number(uncorruptedMax) || 1);
  const amount = Math.max(0, Number(loss) || 0);
  const max = Math.max(1, maximum - amount);
  return { ...hp, max, current: Math.min(Math.max(0, Number(hp.current) || 0), max),
    ...(amount > 0 ? { corruptionLoss: amount, uncorruptedMax: maximum } : { corruptionLoss: 0, uncorruptedMax: undefined }) };
}
