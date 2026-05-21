export const itemEffects = [
  {
    effectId: 'ie1',
    effectDisplay: 'itemHeal',
	effectDescription:'Soigne {HealAmount} points de vie à la cible qui consomme cet objet.',
    effectName: 'itemHeal',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: '../media/assets/effects/heal-green.gif',
	VFXduration: '1500',
  },  {
    effectId: 'ie2',
    effectDisplay: 'itemDamage',
	effectDescription:'Inflige {TotalDamages} points de dégats à la cible qui consomme cet objet.',
    effectName: 'itemDamage',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: '../media/assets/effects/death-blood.gif',
	VFXduration: '1500',
	  },  {
    effectId: 'ie3',
    effectDisplay: 'itemRez',
	effectDescription:'Réssucite la cible qui consomme cet objet, et lui restitue {HealAmount} points de vie.',
    effectName: 'itemRez',
    effectDuration: 0,
	effectDot: 0, 
	effectStack: 0,
	effectVFX: '../media/assets/effects/heal.gif',
	VFXduration: '1500',
	  }
];