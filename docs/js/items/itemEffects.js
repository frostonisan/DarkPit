import { ITEM_EFFECT_HELPERS } from '../data/helpers.js';
export const itemEffects = [
  {
    effectId: 'ie-permanent', effectDisplay: "Crystal d'Umbra", effectName: 'itemPermanentStat',
    effectDescription: '', effectDuration: 0, effectDot: 0, effectStack: 0,
  },
  {
    effectId: 'ie1',
    effectDisplay: 'itemHeal',
	effectDescription:ITEM_EFFECT_HELPERS["itemHeal"],
    effectName: 'itemHeal',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: './media/assets/effects/heal-green.gif',
	VFXduration: '1500',
  },  {
    effectId: 'ie2',
    effectDisplay: 'itemDamage',
	effectDescription:ITEM_EFFECT_HELPERS["itemDamage"],
    effectName: 'itemDamage',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: './media/assets/effects/death-blood.gif',
	VFXduration: '1500',
	  },  {
    effectId: 'ie3',
    effectDisplay: 'itemRez',
	effectDescription:ITEM_EFFECT_HELPERS["itemRez"],
    effectName: 'itemRez',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: './media/assets/effects/heal.gif',
	VFXduration: '1500',
	  }, {
    effectId: 'ie4',
    effectDisplay: 'Anima ombilicale',
    effectDescription: ITEM_EFFECT_HELPERS["itemResetProgression"],
    effectName: 'itemResetProgression',
    effectDuration: 0,
    effectDot: 0,
    effectStack: 0,
  }, {
    effectId: 'ie5',
    effectDisplay: 'Déplacement supplémentaire',
    effectDescription: ITEM_EFFECT_HELPERS.itemMovement,
    effectName: 'itemMovement',
    effectDuration: 0,
    effectDot: 0,
    effectStack: 0,
  }, {
    effectId: 'ie6',
    effectDisplay: 'Vie fanée',
    effectDescription: ITEM_EFFECT_HELPERS.itemFadedLife,
    effectName: 'itemFadedLife',
    effectDuration: 0,
    effectDot: 0,
    effectStack: 0,
  }, {
    effectId: 'ie7', effectDisplay: 'Vie fanée', effectName: 'itemExtraLife',
    effectDescription: ITEM_EFFECT_HELPERS.itemExtraLife, effectDuration: 0, effectDot: 0, effectStack: 0,
  }, {
    effectId: 'ie8', effectDisplay: 'Vie fanée', effectName: 'itemEternalLife',
    effectDescription: ITEM_EFFECT_HELPERS.itemEternalLife, effectDuration: 0, effectDot: 0, effectStack: 0,
  }
];
