import { stats } from '../data/statsData.js';
import { HELPER_PICTOGRAM_NAMES } from '../data/helpers.js';
import { normalizeStatKey, getDisplayStatKey } from "../entities/rules.js";
import { STAT_SYSTEM_ORIGINS, calculateStatSources } from "../entities/statSystem.js";
import { registerIngameItem } from './items.js';

export function getPermanentStatChoices() {
    const definitions = new Map(stats.map(stat => [normalizeStatKey(stat.key), stat]));
    for (const key of Object.keys(STAT_SYSTEM_ORIGINS)) {
        if (!definitions.has(key)) definitions.set(key, { key, name: HELPER_PICTOGRAM_NAMES[key], nature: 'statistic' });
    }
    return [...definitions].flatMap(([key, definition]) => {
        if (definition.umbraParameter) return [];
        const isUmbra = definition.nature === 'umbra';
        const name = key === 'shift' ? 'Déplacements max' : definition.name;
        const unit = isUmbra ? '' : calculateStatSources({}, key).unit
            || ({ HP: ' HP', speed: ' ms', shift: ' ch.', lifesteal: ' %' })[key] || '';
        const crystalLevel = ['strength', 'agility', 'intelligence', 'will'].includes(key) ? 4 : isUmbra ? 3 : 1;
        const entry = { key, name, icon: getDisplayStatKey(key), unit, isUmbra, crystalLevel };
        return STAT_SYSTEM_ORIGINS[key] && !definition.uniquePassive
            ? [entry, { ...entry, key: `${key}Plus`, name: `${name} +`, crystalLevel: 2 }]
            : [entry];
    });
}

export function getPermanentStatGrant(item) {
    const grant = item?.permanentStat;
    if (!item?.itemType?.includes('permanent') || !Number.isSafeInteger(grant?.amount)
        || grant.amount < 1) return null;
    const definition = getPermanentStatChoices().find(entry => entry.key === grant.key);
    return definition ? { ...definition, amount: grant.amount } : null;
}

export function createUmbraCrystal({ statKey = null, amount = null, random = Math.random, origin = 'stage-victory' } = {}) {
    const choices = getPermanentStatChoices().filter(choice => statKey !== null
      || !stats.some(stat => stat.uniquePassive && [stat.key, `${stat.key}Plus`].includes(choice.key)));
    const choice = statKey === null ? choices[Math.floor(random() * choices.length)]
        : choices.find(entry => entry.key === statKey);
    const rolled = amount === null;
    if (rolled) amount = 1 + Math.floor(random() * 3);
    if (!choice || !Number.isSafeInteger(amount) || amount < 1 || (rolled && amount > 3)) {
        throw new RangeError('Invalid permanent item roll');
    }
    return registerIngameItem({
        serial: 'umbra-crystal',
        displayName: `Crystal d'Umbra : ${choice.name} +${amount}${choice.unit}`,
        itemType: ['consumable', 'permanent'],
        itemQuality: 2,
        groundOnly: true,
        statIcon: choice.icon,
        permanentStat: { ...choice, amount },
        effets: ['itemPermanentStat'],
        itemDescription: "La statistique est acquise définitivement par l'entité qui ramasse ce crystal.",
    }, origin);
}
