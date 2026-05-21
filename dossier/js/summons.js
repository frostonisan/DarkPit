// summontype : summon-consommable, summon-balise, summon-presence, summon-esprit, summon-entite
export const summons = [
    {
        summonDisplayName: 'Jarret juteux',
		summonEffect:'jarret-summon',
		summonClass: 'effect-jarret',
		summonDescription: 'Un jarret juteux d\'une intense saveur. Un délice',
		summonSprite:"../../media/assets/effects/jarret.png",
		summonPortrait:"../../media/portrait/jarret.jpg",
		summonId: 1, 
		summonType: 'consommable',
        summonPower: 0,
        summonHP: 1,
		summonDuration: 10,
        summonSide: '',
		summonLife: 1,
		summonPosition: '',
		summonDeadSprite: null,
		summonEffet: ['healConsommable']
    },{
	   summonDisplayName: 'Jarret foireux',
		summonEffect:'rottenjarret-summon',
		summonClass: 'effect-jarret',
		summonDescription: 'Un jarret juteux pas très frais. Faites attention.',
		summonSprite:"../../media/assets/effects/jarret-not-so-good.png",
		summonPortrait:"../../media/portrait/jarret.jpg",
		summonId: 1, 
		summonType: 'consommable',
        summonPower: 0,
        summonHP: 1,
		summonDuration: 10,
        summonSide: '',
		summonLife: 1,
		summonPosition: '',
		summonDeadSprite: null,
		summonEffet: ['poisonConsommable']

			},
];

