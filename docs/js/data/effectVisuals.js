// Artwork filenames are independent of the effect keys used by the combat engine.
const artworkNames = { bafouillage: 'baffouillage', effroi: 'effroie' };
export const EFFECT_VISUALS = Object.fromEntries([
  ['poison', 'Poison', '#9be83c'], ['brulure', 'Brûlure', '#ffa735'],
  ['immobilisation', 'Immobilisation', '#86b9fa'], ['stun', 'Stun', '#ffdc63'],
  ['silence', 'Silence', '#78e8f5'], ['interruption', 'Interruption', '#ff5a72'],
  ['bafouillage', 'Bafouillage', '#d493ff'],
  ['lenteur', 'Lenteur', '#6ee6dd'], ['lourdeur', 'Lourdeur', '#f69d61'],
  ['folie', 'Folie', '#f575ec'], ['insolence', 'Insolence', '#ff8fa3'],
  ['confusion', 'Confusion', '#c391ff'], ['charme', 'Charme', '#ff79c9'],
  ['effroi', 'Effroi', '#c0efb1'], ['sommeil', 'Sommeil', '#91b7ff'],
  ['grab', 'Grab', '#eeb474'], ['rupture', 'Rupture', '#ff9863'],
  ['dissolution', 'Dissolution', '#b4ee43'],
].map(([key, label, color]) => [key, {
  key, label, color, src: `./media/assets/statuts/statut-${artworkNames[key] || key}.jpg`,
}]));
