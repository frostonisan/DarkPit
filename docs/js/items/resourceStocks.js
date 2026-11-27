const RESOURCE_KEYS = ['shift', 'fadedLife', 'extraLife', 'eternalLife'];
const RECHARGEABLE_LIVES = ['extraLife', 'eternalLife'];
const integer = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
const positive = value => Math.max(0, integer(value));
const regenKeys = regen => Object.keys(regen || {}).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
const ready = slot => positive(slot?.maxRegen) > 0 && positive(slot?.currentRegen) >= positive(slot.maxRegen);

export function getEffectiveMovementStock(stock, activePercent = 0) {
  const raw = stock?.reserve || stock;
  const max = positive(raw?.max);
  const preciseCurrent = Math.min(max, Math.max(0, Number(raw?.preciseCurrent ?? raw?.current ?? max) || 0));
  const percent = Number.isFinite(Number(activePercent)) ? Math.max(0, Number(activePercent)) : 0;
  const multiplier = 1 + percent / 100;
  return {
    current: positive(preciseCurrent * multiplier + 1e-9), max: positive(max * multiplier),
    reserve: { current: positive(preciseCurrent), preciseCurrent, max },
    activePercent: percent, multiplier,
  };
}

export function getEquipmentResourceIds(entity) {
  return Object.keys(entity?.stuff || {}).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
    .flatMap(key => entity.stuff[key]).filter(id => typeof id === 'string');
}

// Each equipment copy owns its remaining charges and rechargeable life timers.
export function getStuffResourceStocks(item) {
  const maxima = { shift: 0, fadedLife: 0, extraLife: 0, eternalLife: 0 };
  const durations = { extraLife: [], eternalLife: [] };
  for (const effect of item?.Stuffeffets || []) {
    if (effect?.type !== 'stat-buff') continue;
    if (effect.stat === 'shift' && effect.value && typeof effect.value === 'object') {
      maxima.shift += positive(effect.value.current);
    } else if (effect.stat === 'fadedLife') {
      maxima.fadedLife += positive(effect.value?.current ?? effect.value?.max ?? effect.value?.flat ?? effect.value);
    } else if (RECHARGEABLE_LIVES.includes(effect.stat)) {
      const count = positive(effect.value?.max ?? effect.value?.flat ?? effect.value);
      const days = effect.stat === 'eternalLife' ? 1 : Math.max(1, positive(effect.rechargeDays ?? 3));
      maxima[effect.stat] += count;
      durations[effect.stat].push(...Array(count).fill(days));
    }
  }
  return Object.fromEntries(RESOURCE_KEYS.filter(key => maxima[key] > 0).map(key => {
    const max = maxima[key];
    const saved = item?.resourceStocks?.[key];
    if (key === 'shift') return [key, getEffectiveMovementStock({ ...saved, max }).reserve];
    if (RECHARGEABLE_LIVES.includes(key)) {
      const regen = Object.fromEntries(durations[key].map((days, index) => {
        const id = String(index + 1).padStart(3, '0');
        const slot = saved?.regen?.[id];
        return [id, { ...slot, maxRegen: days, currentRegen: slot ? Math.min(days, positive(slot.currentRegen)) : days }];
      }));
      return [key, { max, current: Object.values(regen).filter(ready).length, regen, lastUpdate: saved?.lastUpdate }];
    }
    return [key, { current: saved ? Math.min(max, positive(saved.current)) : max, max }];
  }));
}

export function ensureStuffResourceStocks(item) {
  const stocks = getStuffResourceStocks(item);
  if (Object.keys(stocks).length) item.resourceStocks = stocks;
  return item;
}

export function stripStuffResourceModifiers(delta = {}) {
  const result = { ...delta };
  if (result.shift && typeof result.shift === 'object' && ('current' in result.shift || 'max' in result.shift)) {
    const max = Number(result.shift.max) || 0;
    if (max) result.shift = { current: 0, max };
    else delete result.shift;
  }
  if (Number(result.fadedLife?.flat ?? result.fadedLife?.current ?? result.fadedLife) > 0) delete result.fadedLife;
  return result;
}

export function getEquipmentResourceCurrent(entity, key, activePercent) {
  return Object.values(entity?.resourceStocks?.[key]?.stuff || {}).reduce((sum, stock) => sum
    + (key === 'shift' && activePercent !== undefined ? getEffectiveMovementStock(stock, activePercent).current : positive(stock.current)), 0);
}

export function getEquipmentResourceMax(entity, key) {
  return Object.values(entity?.resourceStocks?.[key]?.stuff || {}).reduce((sum, stock) => sum + positive(stock.max), 0);
}

export function getNaturalMovementCurrent(entity) {
  return integer(entity?.stats?.shift?.current)
    - getEquipmentResourceCurrent(entity, 'shift')
    - positive(entity?.resourceStocks?.shift?.temporary)
    - positive(entity?.resourceStocks?.shift?.spell);
}

export function syncEntityResourceStocks(entity, equippedItems = [], previousStats = entity.stats, day = 1) {
  entity.resourceStocks ??= {};
  const ids = new Set(getEquipmentResourceIds(entity));
  const items = new Map(equippedItems.map(item => [item.equippedId, item]));
  for (const key of RESOURCE_KEYS) {
    const old = entity.resourceStocks[key];
    const oldStuff = getEquipmentResourceCurrent(entity, key);
    const stuff = {};
    for (const id of ids) {
      const stock = getStuffResourceStocks(items.get(id))[key];
      if (!stock) continue;
      // A still-equipped copy owns the live state; previews never write into item inputs.
      stuff[id] = key === 'shift'
        ? getEffectiveMovementStock(old?.stuff?.[id] || stock, entity.modifierStats?.durable?.stuff?.orfevre?.activePercent)
        : structuredClone(old?.stuff?.[id] || stock);
      if (RECHARGEABLE_LIVES.includes(key)) {
        if (!old?.stuff?.[id]) stuff[id].lastUpdate = day;
        for (const slot of Object.values(stuff[id].regen)) {
          if (ready(slot)) slot.readySince ??= day;
        }
      }
    }
    if (RECHARGEABLE_LIVES.includes(key)) {
      entity.resourceStocks[key] = { stuff };
      continue;
    }
    const current = Object.values(stuff).reduce((sum, stock) => sum + stock.current, 0);
    const prior = key === 'shift' ? previousStats?.shift?.current : previousStats?.fadedLife;
    const computed = key === 'shift' ? entity.stats.shift?.current : entity.stats.fadedLife;
    const ordinary = integer(prior ?? computed) - oldStuff;
    if (key === 'shift') {
      entity.resourceStocks.shift = { temporary: positive(old?.temporary), spell: positive(old?.spell), stuff };
      entity.stats.shift ??= { current: 0, max: 1, baseDefault: true };
      entity.stats.shift.current = ordinary + current;
    } else {
      const categories = old?.natural !== undefined
        ? { consumable: positive(old.consumable), spell: positive(old.spell), natural: positive(old.natural) }
        : { consumable: 0, spell: 0, natural: Math.max(0, ordinary) };
      entity.resourceStocks.fadedLife = { ...categories, stuff };
      const total = categories.consumable + categories.spell + categories.natural + current;
      if (total > 0) entity.stats.fadedLife = total;
      else delete entity.stats.fadedLife;
    }
  }
  return entity;
}

export function addMovementCharges(entity, amount, source = 'consumable') {
  const gain = positive(amount);
  if (!gain || !entity?.stats?.shift) return 0;
  entity.resourceStocks ??= {};
  entity.resourceStocks.shift ??= { temporary: 0, stuff: {} };
  const category = source === 'spell' ? 'spell' : 'temporary';
  entity.resourceStocks.shift[category] = positive(entity.resourceStocks.shift[category]) + gain;
  entity.stats.shift.current = integer(entity.stats.shift.current) + gain;
  return gain;
}

export function consumeEquipmentResource(entity, key, amount) {
  let remaining = positive(amount);
  const stocks = entity?.resourceStocks?.[key]?.stuff || {};
  for (const id of getEquipmentResourceIds(entity)) {
    if (!stocks[id]) continue;
    const used = Math.min(remaining, positive(stocks[id].current));
    if (key === 'shift' && used > 0) {
      const stock = stocks[id];
      // Spend the precise base stock so changing owner or efficiency cannot refill it.
      const preciseCurrent = used === stock.current ? 0 : Math.max(0, stock.reserve.preciseCurrent - used / stock.multiplier);
      stocks[id] = getEffectiveMovementStock({ ...stock.reserve, preciseCurrent }, stock.activePercent);
    } else stocks[id].current -= used;
    remaining -= used;
    if (!remaining) break;
  }
  return positive(amount) - remaining;
}

export function spendMovementCharges(entity, amount) {
  const cost = positive(amount);
  const state = entity?.resourceStocks?.shift;
  const consumable = Math.min(cost, positive(state?.temporary));
  if (state) state.temporary = positive(state.temporary) - consumable;
  const equipment = consumeEquipmentResource(entity, 'shift', cost - consumable);
  if (state) state.spell = positive(state.spell) - Math.min(positive(state.spell), cost - consumable - equipment);
  // Keep the game's existing movement debt rule when the cost exceeds the available charges.
  entity.stats.shift.current = integer(entity.stats.shift.current) - cost;
}

export function refillNaturalMovement(entity, amount) {
  const current = integer(entity.stats.shift.current);
  const gain = Math.min(positive(amount), Math.max(0, positive(entity.stats.shift.max) - current));
  entity.stats.shift.current = integer(entity.stats.shift.current) + gain;
  return gain;
}

export function resetDailyMovement(entity, startingCharges) {
  if (!entity?.stats?.shift) return;
  if (entity.resourceStocks?.shift) entity.resourceStocks.shift.temporary = 0;
  if (entity.resourceStocks?.shift) entity.resourceStocks.shift.spell = 0;
  entity.stats.shift.current = positive(startingCharges) + getEquipmentResourceCurrent(entity, 'shift');
}

export function applyResourceStocksToEquippedItems(entity, equippedItems = []) {
  return equippedItems.map(item => {
    const resourceStocks = { ...item.resourceStocks };
    let changed = false;
    for (const key of RESOURCE_KEYS) {
      const stock = entity?.resourceStocks?.[key]?.stuff?.[item.equippedId];
      if (!stock) continue;
      resourceStocks[key] = structuredClone(key === 'shift' ? stock.reserve : stock);
      changed = true;
    }
    return changed ? { ...item, resourceStocks } : item;
  });
}

export function addFadedLife(entity, amount, source = 'consumable') {
  if (!['consumable', 'spell', 'natural'].includes(source)) throw new TypeError('Unknown life source');
  entity.resourceStocks ??= {};
  const state = entity.resourceStocks.fadedLife ??= {
    consumable: 0, spell: 0, natural: positive(entity.stats?.fadedLife), stuff: {},
  };
  state.natural ??= Math.max(0, positive(entity.stats?.fadedLife) - getEquipmentResourceCurrent(entity, 'fadedLife')
    - positive(state.consumable) - positive(state.spell));
  const gain = positive(amount);
  state[source] = positive(state[source]) + gain;
  entity.stats.fadedLife = positive(entity.stats.fadedLife) + gain;
  return gain;
}

export function consumeFadedLife(entity) {
  if (!positive(entity.stats?.fadedLife)) return false;
  if (entity.resourceStocks?.fadedLife?.natural === undefined) addFadedLife(entity, 0);
  const state = entity.resourceStocks.fadedLife;
  if (state.consumable > 0) state.consumable--;
  else if (consumeEquipmentResource(entity, 'fadedLife', 1)) { /* Item stock was consumed. */ }
  else if (state.spell > 0) state.spell--;
  else if (state.natural > 0) state.natural--;
  else return false;
  entity.stats.fadedLife--;
  if (!entity.stats.fadedLife) delete entity.stats.fadedLife;
  return true;
}

export function getLifeSlots(entity, key) {
  const native = entity?.[`${key}Regen`];
  const slots = regenKeys(native).map(id => ({ id, source: 'natural', slot: native[id] }));
  getEquipmentResourceIds(entity).forEach((equippedId, position) => {
    const stock = entity?.resourceStocks?.[key]?.stuff?.[equippedId];
    for (const id of regenKeys(stock?.regen)) {
      slots.push({ id, source: 'stuff', equippedId, position, slot: stock.regen[id] });
    }
  });
  return slots.sort((a, b) => {
    const age = key === 'extraLife' ? (a.slot.readySince ?? Infinity) - (b.slot.readySince ?? Infinity) : 0;
    return (Number.isNaN(age) ? 0 : age) || Number(b.source === 'stuff') - Number(a.source === 'stuff')
      || (a.position ?? Infinity) - (b.position ?? Infinity) || Number(a.id) - Number(b.id);
  });
}

export function syncLifeCurrent(entity, key) {
  const life = entity.stats?.[key];
  if (!life) return false;
  const before = life.current;
  const slots = getLifeSlots(entity, key);
  for (const stock of Object.values(entity.resourceStocks?.[key]?.stuff || {})) {
    stock.current = Object.values(stock.regen).filter(ready).length;
  }
  life.current = Math.min(positive(life.max), slots.filter(entry => ready(entry.slot)).length);
  return before !== life.current;
}

export function consumeRechargeableLife(entity, key) {
  const chosen = getLifeSlots(entity, key).find(entry => ready(entry.slot));
  if (!chosen) return false;
  chosen.slot.currentRegen = 0;
  delete chosen.slot.readySince;
  delete chosen.slot.order;
  syncLifeCurrent(entity, key);
  return true;
}

export function advanceLifeRegen(entity, key, deltaDays, day, alive) {
  let changed = false;
  const native = entity?.[`${key}Regen`];
  const blocks = [native && { regen: native, clock: native },
    ...Object.values(entity.resourceStocks?.[key]?.stuff || {}).map(stock => ({ regen: stock.regen, clock: stock }))].filter(Boolean);
  for (const { regen, clock } of blocks) {
    const last = clock.lastUpdate ?? day;
    const elapsed = Math.min(positive(deltaDays), Math.max(0, day - last));
    if (clock.lastUpdate !== day) { clock.lastUpdate = day; changed = true; }
    if (!alive || !elapsed) continue;
    for (const id of regenKeys(regen)) {
      const slot = regen[id];
      const before = positive(slot.currentRegen);
      slot.currentRegen = Math.min(positive(slot.maxRegen), before + elapsed);
      if (slot.currentRegen !== before) changed = true;
      if (ready(slot) && slot.readySince == null) slot.readySince = day - elapsed + positive(slot.maxRegen) - before;
    }
  }
  return syncLifeCurrent(entity, key) || changed;
}
