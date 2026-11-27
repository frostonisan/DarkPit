import { getAttackEssenceColorsFromNatures } from '../combat/attackResolution.js';

// The same nature colors as the combat damage feedback. Resolved only at launch.
const tones = [
  ['inerte', '#b9b9b9'], ['physicalDamage', '#ff6864'],
  ['magicalDamage', '#7300ff'], ['hybridalDamage', '#ff64ee'],
  ['transpiercingDamage', '#f5dd67'], ['physicalPiercingDamage', '#ffab57'],
  ['magicalPiercingDamage', '#93db75'], ['hybridalPiercingDamage', '#b295e7'],
].map(([nature, color]) => ({ nature, color }));
const energyTextures = new Map();
const trailTextures = new Map();

export function attackTone(natures = []) {
  const colors = getAttackEssenceColorsFromNatures(natures);
  return tones[(colors.includes('red') ? 1 : 0)
    | (colors.includes('blue') ? 2 : 0) | (colors.includes('yellow') ? 4 : 0)];
}

function energyTexture(color) {
  if (energyTextures.has(color)) return energyTextures.get(color);
  // The round core and the static tail are cached once per nature.
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const core = ctx.createRadialGradient(20, 20, 0, 20, 20, 18);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.18, '#efffff');
  core.addColorStop(0.4, `${color}bb`);
  core.addColorStop(0.7, `${color}33`);
  core.addColorStop(1, `${color}00`);
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 40, 40);
  const url = canvas.toDataURL('image/png');
  energyTextures.set(color, url);
  return url;
}

export function projectileColor(child, natures) {
  const tone = attackTone(natures);
  return child.classList.contains('heal-fx') ? '#8bdcff'
    : child.classList.contains('rez-fx') ? '#ccfff3'
    : child.classList.contains('poison-fx') ? '#76ff04'
    : child.classList.contains('brulure-fx') ? '#ff542b'
    : tone.nature === 'inerte' ? '#8bdcff' : tone.color;
}

export function createMagicProjectileTrail(child, natures) {
  const color = projectileColor(child, natures);
  if (!trailTextures.has(color)) {
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2); ctx.translate(84, 16); ctx.scale(4, .5);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 21);
    gradient.addColorStop(0, `${color}cc`);
    gradient.addColorStop(.25, `${color}88`);
    gradient.addColorStop(.65, `${color}22`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient; ctx.fillRect(-21, -21, 42, 42);
    trailTextures.set(color, canvas.toDataURL('image/png'));
  }
  const trail = document.createElement('div');
  trail.className = 'projectile-magic-trail';
  trail.setAttribute('aria-hidden', 'true');
  trail.style.backgroundImage = `url("${trailTextures.get(color)}")`;
  return trail;
}

export function applyEnergyProjectile(parent, child, natures, flightMode) {
  const tone = attackTone(natures);
  const magical = ['magicalDamage', 'hybridalDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].includes(tone.nature)
    || flightMode === 'magical';
  // These attacks own an explicit illustrated projectile, not the default orb.
  if (!magical || ['jarret-fx', 'deadshot-fx', 'profanation-fx'].some(c => child.classList.contains(c))) return false;
  const color = projectileColor(child, natures);
  parent.classList.add('energy-projectile');
  child.style.setProperty('--energy-texture', `url("${energyTexture(color)}")`);
  child.dataset.attackNature = tone.nature;
  return true;
}

export function colorMeleeTrail(trail, natures) {
  const tone = attackTone(natures), color = tone.color;
  trail.dataset.attackNature = tone.nature;
  trail.style.background = tone.nature === 'hybridalPiercingDamage'
    ? 'linear-gradient(90deg, #ff4d4800 0%, #ff4d4840 34%, #b295e7aa 70%, #ffda24dd 100%)'
    : `linear-gradient(90deg, ${color}00 0%, ${color}30 34%, ${color}aa 78%, ${color}ee 100%)`;
  for (const filament of trail._filaments || []) {
    filament.style.background = `linear-gradient(90deg, ${color}00 0%, ${color}aa 68%, #ffffff 100%)`;
  }
  return tone;
}
