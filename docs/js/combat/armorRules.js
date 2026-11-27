// Armor arithmetic operates on pool snapshots, with no entity writes, storage, DOM or RNG.

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toNonNegativeInt(value) {
  return Math.max(0, Math.round(toNumber(value, 0)));
}

export function clampPoolCurrent(current, max) {
  const cap = toNonNegativeInt(max);
  return Math.max(0, Math.min(toNonNegativeInt(current), cap));
}

export function clampPrecisePoolCurrent(current, max) {
  const cap = toNonNegativeInt(max);
  const value = Math.max(0, toNumber(current, 0));
  if (value < 0.000001) return 0;
  return Math.min(value, cap);
}

export function normalizePool(pool, max, fallbackCurrent = max) {
  const cap = toNonNegativeInt(max);
  const currentSource = pool && typeof pool === "object" && Number.isFinite(Number(pool.current))
    ? pool.current
    : fallbackCurrent;

  return {
    current: clampPoolCurrent(currentSource, cap),
    max: cap,
  };
}

export function normalizeReserveArmorPool(pool, maxFallback = 0, currentFallback = maxFallback) {
  const max = toNonNegativeInt(pool?.max ?? maxFallback);
  const preciseCurrent = clampPrecisePoolCurrent(
    pool?.preciseCurrent ?? pool?.current ?? currentFallback,
    max
  );

  return {
    current: clampPoolCurrent(preciseCurrent, max),
    preciseCurrent,
    max,
  };
}

export function buildEffectiveStuffArmorPool(reserve, percent = 0) {
  const reservePool = normalizeReserveArmorPool(reserve);
  const activePercent = Math.max(0, toNumber(percent, 0));
  const multiplier = 1 + activePercent / 100;
  const max = toNonNegativeInt(reservePool.max * multiplier);
  const preciseCurrent = Math.min(max, reservePool.preciseCurrent * multiplier);

  return {
    current: clampPoolCurrent(preciseCurrent, max),
    preciseCurrent,
    max,
    percent: activePercent,
    multiplier,
    baseMax: reservePool.max,
  };
}

export function composeStuffArmorLayer(reserve, percent = 0) {
  const reservePool = normalizeReserveArmorPool(reserve, reserve?.max ?? 0, reserve?.current ?? 0);
  const effectivePool = buildEffectiveStuffArmorPool(reservePool, percent);
  const orfevreCurrent = Math.max(0, effectivePool.current - reservePool.current);
  const orfevreMax = Math.max(0, effectivePool.max - reservePool.max);

  return {
    current: effectivePool.current,
    max: effectivePool.max,
    reserve: reservePool,
    effective: effectivePool,
    // Derived compatibility fields used by descriptions/debug tools.
    orfevre: {
      current: orfevreCurrent,
      max: orfevreMax,
      percent: effectivePool.percent,
      multiplier: effectivePool.multiplier,
      baseMax: reservePool.max,
    },
    reserveCurrent: reservePool.current,
    reserveMax: reservePool.max,
    effectiveCurrent: effectivePool.current,
    effectiveMax: effectivePool.max,
    orfevreCurrent,
    orfevreMax,
  };
}

export function normalizeStuffArmorLayer(layer) {
  if (!layer || typeof layer !== "object") {
    return composeStuffArmorLayer({ current: 0, max: 0 }, 0);
  }

  const reserve = layer.reserve && typeof layer.reserve === "object"
    ? layer.reserve
    : {
        current: layer.reserveCurrent ?? layer.current ?? 0,
        preciseCurrent: layer.reservePreciseCurrent ?? layer.preciseCurrent,
        max: layer.reserveMax ?? layer.max ?? 0,
      };
  const percent = layer.effective?.percent
    ?? layer.orfevre?.percent
    ?? layer.orfevrePercent
    ?? 0;

  return composeStuffArmorLayer(reserve, percent);
}

export function calculateStuffArmorConsumption(layer, amount) {
  const normalized = normalizeStuffArmorLayer(layer);
  const absorbed = Math.min(
    Math.max(0, toNumber(amount, 0)),
    toNonNegativeInt(normalized.current)
  );
  if (absorbed <= 0) return { absorbed: 0, layer };

  const nextEffectivePrecise = Math.max(0, normalized.effective.preciseCurrent - absorbed);
  const multiplier = Math.max(1, toNumber(normalized.effective.multiplier, 1));
  const nextReservePrecise = clampPrecisePoolCurrent(
    nextEffectivePrecise / multiplier,
    normalized.reserve.max
  );
  const nextReserve = {
    ...normalized.reserve,
    preciseCurrent: nextReservePrecise,
    current: clampPoolCurrent(nextReservePrecise, normalized.reserve.max),
  };

  return { absorbed, layer: { ...layer, ...composeStuffArmorLayer(nextReserve, normalized.effective.percent) } };
}

export function calculateArmorPoolConsumption(pool, amount) {
  const damage = Math.max(0, toNumber(amount, 0));
  const before = toNonNegativeInt(pool?.current ?? 0);
  const absorbed = Math.min(before, damage);
  return { absorbed, current: before - absorbed };
}

export function calculateArmorAggregate(input) {
  const layers = { ...input, stuff: { ...input.stuff } };
  let stuffCurrent = 0, stuffMax = 0;
  for (const [id, layer] of Object.entries(layers.stuff)) {
    const normalized = normalizeStuffArmorLayer(layer);
    layers.stuff[id] = normalized;
    stuffCurrent += normalized.current;
    stuffMax += normalized.max;
  }
  const external = normalizePool(layers.external, layers.external?.max ?? 0, 0);
  const robustness = normalizePool(layers.robustness, layers.robustness?.max ?? 0, 0);
  layers.external = external;
  layers.robustness = robustness;
  const totalCurrent = layers.consumable.current + external.current + layers.spell.current + stuffCurrent + robustness.current;
  const totalMax = layers.consumable.max + external.max + layers.spell.max + stuffMax + robustness.max;
  const armor = totalMax > 0 ? { current: totalCurrent, max: robustness.max, totalMax,
    externalMax: external.max + layers.consumable.max + layers.spell.max, stuffMax,
    robustnessMax: robustness.max, regenMax: robustness.max } : null;
  return { layers, armor };
}

export function calculateArmorConsumption(input, equippedIds, armorCurrent, amount) {
  const layers = { ...input, consumable: { ...input.consumable }, spell: { ...input.spell },
    external: { ...input.external }, robustness: { ...input.robustness }, stuff: { ...input.stuff } };
  let remaining = Math.max(0, toNumber(amount, 0));
  const before = toNonNegativeInt(armorCurrent ?? 0);
  const consume = pool => {
    const next = calculateArmorPoolConsumption(pool, remaining);
    pool.current = next.current;
    remaining -= next.absorbed;
    return next.absorbed;
  };
  const consumable = consume(layers.consumable);
  const stuffDamage = {};
  let stuff = 0;
  for (const id of equippedIds) {
    if (!layers.stuff[id] || remaining <= 0) continue;
    const next = calculateStuffArmorConsumption(layers.stuff[id], remaining);
    if (next.absorbed > 0) {
      layers.stuff[id] = next.layer;
      stuffDamage[id] = next.absorbed;
      stuff += next.absorbed;
      remaining -= next.absorbed;
    }
  }
  const spell = consume(layers.spell);
  const natural = consume(layers.external);
  const external = consumable + spell + natural;
  const robustness = consume(layers.robustness);
  const state = calculateArmorAggregate(layers);
  return { ...state, outcome: { before, after: state.armor?.current ?? 0,
    absorbed: external + stuff + robustness, remainingDamage: Math.max(0, remaining),
    layers: { external, consumable, spell, natural, stuff, robustness }, stuffDamage } };
}
