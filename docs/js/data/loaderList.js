import { readAttackDefinitionsForEntity } from "../combat/attackResolution.js";
import { attackDetails } from './attackList.js';
import { entitesNest } from "./entityTemplates.js";
import { eventList } from './eventList.js';
import { levelBiome } from '../biome/level.js';
import { summons } from './summons.js';
import { PERMANENT_CRYSTAL_LEVELS } from './permanentCrystalData.js';
import { EFFECT_VISUALS } from './effectVisuals.js';

export const screenLoadOptions = [
    {
        backgroundColor: 'black',
        titleContent: 'Justice et Chaos',
        textContent: 'Certaines Entités plongèrent le monde dans la dévastation. Sous couvert d\'une cause prétendument noble, la désolation s\'étendait, chacun appliquant sa propre vision de la justice. Mais c\'est un chaos aveugle qui s\'abattait.',
        imageSrc: './media/assets/loading/loader-01.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les maraicages',
        textContent: 'Plonger dans la fange des marécages vous exposera à des dangers sournois et imprévisibles. Vous êtes prévenu.',
        imageSrc: './media/assets/loading/loader-02.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Cibles',
        textContent: 'Cliquez sur une entités pour voir les ennemis qu\'elle pourra prendre pour cible.',
        imageSrc: './media/assets/loading/loader-03.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Priorité de ciblage',
        textContent: 'En fonction de son rôle, l\'Entité se verra attribuer un ordre de ciblage. L\'Entité prend pour cible ses adversaires en fonction de leur rôle. La priorité de ciblage se déploie de gauche à droite, le ciblage actif étant entouré d\'une cible.  Pour le voir, double cliquez sur l\'Entité pour consulter sa fiche d\'Entité.',
        imageSrc: './media/assets/loading/loader-04.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les Lords',
        textContent: 'Ces Entités supérieures sont les leaders des armées. Agressifs et intelligents, les lords sélectionnent leur cible en fonction du degré de menace qu\'elle représente, choisissant toujours celle qui est la plus dangereuse pour eux et leur armée. Peut importe que sa cible soit un Sbire, ou un autre Lord...',
        imageSrc: './media/assets/loading/loader-05.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les Sbires',
        textContent: 'Ces Entités inférieures sont le corps des armées. Dociles et stupides, pour la plupart, les sbires choisissent leur cible selon le rôle qu\'on leur attribut. Cependant, ils ne pourront attaquer le Lord adverse que si ce dernier à lui-même perdu tout ces Sbires.',
        imageSrc: './media/assets/loading/loader-06.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Fiches d\'Entités',
        textContent: 'Toutes les Entitès possèdent une « fiche d\'Entité » qui présente toutes les information de l\'Entité. Pour la consulter, double-cliquez sur la créature de votre choix.',
        imageSrc: './media/assets/loading/loader-07.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Attaques',
        textContent: 'Attaquer prend du temps. Pour attaquer, une Entité va devoir attendre son tour (ATB) et vérifier que l\'attaque est utilisable (cooldown). Si c\'est le cas, elle devra Préparer son attaque pour trouver sa cible, l\'Éxecuter pour toucher sa cible, et finalement Récuperer de son action. Pour en savoir plus sur l\'attaque d\'une Entité, consultez sa fiche d\'Entité.',
        imageSrc: './media/assets/loading/loader-08.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Aide',
        textContent: 'Le bouton d\'aide (?) situé en bas à gauche de l\'écran vous donnera , si besoin, toutes les régles du jeux, et quelques astuces.',
        imageSrc: './media/assets/loading/loader-09.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les Attaquants',
        textContent: 'Les Entités attaquantes cibleront les Entités ennemis.',
        imageSrc: './media/assets/loading/loader-10.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les Supports',
        textContent: 'Les Entités de support cibleront les Entités alliées.',
        imageSrc: './media/assets/loading/loader-11.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Les Invocateurs',
        textContent: 'Les Entités invocatrices cibleront les cases du terrain de jeux.',
        imageSrc: './media/assets/loading/loader-12.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Âmes en peines',
        textContent: 'Dans leur quête de Pureté, certaines Entités ont sacrifié aveuglément ce qu\'elles avaient de plus cher en ce monde.',
        imageSrc: './media/assets/loading/loader-13.jpg',
    },{
        backgroundColor: 'black',
        titleContent: 'Développement',
        textContent: 'Le jeux est développé sur son temps libre par une seule personne ! Avis constructifs, et un peu d\'indulgence, seront les bienvenus. frostonisan@gmail.com',
        imageSrc: './media/assets/loading/loader-14.jpg',
      },{
        backgroundColor: 'black',
        titleContent: 'Déplacement en combat : Échange de position',
        textContent: 'Vous pouvez échanger la position des entités en combat. Réalisez un dragNdrop sur une position occupée par une entité alliée pour le faire. Seule l\'entité à l\'origine du mouvement utilisera une charge de déplacement.',
        imageSrc: './media/assets/loading/loader-15.jpg',
    }
];

const resources = new Map();
const animatedImages = new Map();
const assignments = new WeakMap();
const levelResources = new Set();
const IMAGE_RESOURCE = /\.(?:png|apng|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i;
const RESOURCE_IDLE_MS = 5 * 60 * 1000;
let cacheSweepTimer = null;

function touchResource(source) {
  const entry = resources.get(resourceKey(source));
  if (entry) entry.lastUsed = Date.now();
  return entry;
}

function scheduleCacheSweep() {
  if (cacheSweepTimer !== null) return;
  cacheSweepTimer = setTimeout(() => {
    cacheSweepTimer = null;
    evictUnusedResources();
    if ([...resources.keys()].some(key => IMAGE_RESOURCE.test(key))) scheduleCacheSweep();
  }, 60000);
}

// This cache contains fetched media only. Game data and saves never enter eviction.
export function evictUnusedResources() {
  const now = Date.now();
  const candidates = [...resources].filter(([key, entry]) => IMAGE_RESOURCE.test(key)
    && entry.value && !levelResources.has(key) && now - entry.lastUsed >= RESOURCE_IDLE_MS);
  if (!candidates.length) return 0;
  const references = new Set();
  const collect = value => {
    for (const match of String(value).matchAll(/blob:[^\s"'<>),]+/g)) references.add(match[0].split('#')[0]);
  };
  // Include dormant CSS rules: a later menu opening must never use a revoked URL.
  visitStyles(style => collect(style.cssText), true);
  for (const element of document.querySelectorAll('[src], [srcset], [poster], [href], [style]')) {
    for (const name of ['src', 'srcset', 'poster', 'href', 'style']) collect(element.getAttribute(name) || '');
    if (element.currentSrc) collect(element.currentSrc);
  }
  const animatedKeys = new Set();
  for (const [image, state] of animatedImages) {
    if (image.isConnected || now - state.createdAt < RESOURCE_IDLE_MS) animatedKeys.add(state.key);
    else {
      URL.revokeObjectURL(state.url);
      animatedImages.delete(image);
      assignments.delete(image);
    }
  }
  if (!animatedImages.size) animatedImageObserver?.disconnect();
  let removed = 0;
  for (const [key, entry] of candidates) {
    if (references.has(entry.value.url) || animatedKeys.has(key)) {
      entry.lastUsed = now;
      continue;
    }
    URL.revokeObjectURL(entry.value.url);
    resources.delete(key);
    removed++;
  }
  return removed;
}

window.addEventListener('stageInterfaceClosing', () => {
  for (const key of levelResources) touchResource(key);
  levelResources.clear();
});

export function resourceKey(source, base = document.baseURI) {
  return new URL(source, base).href;
}

export function cachedResourceUrl(source) {
  return source ? touchResource(source)?.value?.url || source : source;
}

export function cachedResourceImage(source) {
  return source ? touchResource(source)?.value?.image || null : null;
}

// Visual lifetimes belong to the combat clock; GIF frames keep looping natively.
// Set the GIF application loop extension without changing any image/frame data.
async function loopingGif(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 13 || String.fromCharCode(...bytes.subarray(0, 3)) !== 'GIF') return blob;
  const signature = new TextEncoder().encode('NETSCAPE2.0');
  for (let i = 13; i + 18 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xff && bytes[i + 2] === 11
      && signature.every((v, j) => bytes[i + 3 + j] === v) && bytes[i + 14] === 3 && bytes[i + 15] === 1) {
      bytes[i + 16] = 0; bytes[i + 17] = 0;
      return new Blob([bytes], { type: 'image/gif' });
    }
  }
  const paletteEnd = 13 + (bytes[10] & 0x80 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0);
  if (paletteEnd > bytes.length) return blob;
  bytes.set(new TextEncoder().encode('GIF89a'));
  return new Blob([bytes.subarray(0, paletteEnd), new Uint8Array([0x21, 0xff, 11, ...signature, 3, 1, 0, 0, 0]),
    bytes.subarray(paletteEnd)], { type: 'image/gif' });
}

export function loadResource(source, { timeout = 20000 } = {}) {
  const key = resourceKey(source);
  if (resources.has(key)) return touchResource(key).promise;
  const entry = { lastUsed: Date.now() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  entry.promise = (async () => {
    let url;
    try {
      const response = await fetch(key, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.blob();
      const blob = /\.gif(?:[?#]|$)/i.test(key) ? await loopingGif(raw) : raw;
      url = URL.createObjectURL(blob);
      const value = { key, blob, url, image: null };
      if (IMAGE_RESOURCE.test(key)) {
        const image = new Image();
        image.src = url;
        await image.decode();
        value.image = image;
      }
      entry.value = value;
      entry.lastUsed = Date.now();
      scheduleCacheSweep();
      return value;
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      resources.delete(key);
      throw Object.assign(new Error(`${key}: ${error.message}`, { cause: error }), { resourceKey: key });
    } finally { clearTimeout(timer); }
  })();
  resources.set(key, entry);
  return entry.promise;
}

export async function preloadResources(sources, { onProgress = () => {}, concurrency = 6, allowFailures = false, exclude = new Set() } = {}) {
  const queue = [...new Set([...sources].filter(Boolean).map(source => resourceKey(source)))].filter(source => !exclude.has(source));
  let cursor = 0, completed = 0;
  const errors = [];
  onProgress({ completed, total: queue.length });
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      const source = queue[cursor++];
      try { await loadResource(source); }
      catch (error) { errors.push(error); }
      completed++;
      onProgress({ completed, total: queue.length, source, failed: errors.length });
    }
  }));
  if (errors.length && !allowFailures) throw new AggregateError(errors, `${errors.length} ressource(s) inaccessible(s)`);
  return errors;
}

// Independent GIF decoders replay cached bytes without new HTTP requests.
export function playCachedGif(image, source, { background = false } = {}) {
  const assignment = {};
  assignments.set(image, assignment);
  const apply = resource => {
    if (assignments.get(image) !== assignment) return;
    const previous = animatedImages.get(image);
    if (previous) URL.revokeObjectURL(previous.url);
    const url = URL.createObjectURL(resource.blob.slice(0, resource.blob.size, resource.blob.type));
    animatedImages.set(image, { url, key: resource.key, connected: image.isConnected, createdAt: Date.now() });
    animatedImageObserver?.observe(document.documentElement, { childList: true, subtree: true });
    image.dataset.effectAsset = new URL(source, document.baseURI).pathname.split('/').pop();
    if (background) image.style.backgroundImage = `url("${url}")`;
    else image.src = url;
  };
  const ready = touchResource(source)?.value;
  if (ready) { apply(ready); return Promise.resolve(); }
  return loadResource(source).then(apply).catch(error => {
    image.dispatchEvent(new Event('error'));
    console.error('[Resource]', error);
  });
}

const animatedImageObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(mutations => {
    if (!mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length)) return;
    for (const [image, state] of animatedImages) {
      if (image.isConnected) state.connected = true;
      else if (state.connected) {
        URL.revokeObjectURL(state.url);
        animatedImages.delete(image);
        assignments.delete(image);
      }
    }
    if (!animatedImages.size) animatedImageObserver.disconnect();
  });

const commonEffects = [
  'blood-impact-1.gif', 'blood-impact-2.gif', 'blood-impact-3.gif', 'blood-impact-4.gif',
  'blood-impact-5.gif', 'blood-impact-6.gif', 'armor-impact.gif', 'death-blood.gif',
  'recovery.gif', 'castingfx-base.gif', 'magic-circle.png', 'dodge.gif', 'dodge-smoke.gif',
  'heal-green.gif', 'poison.gif', 'burn.gif', 'rez.gif', 'blood-loss.gif',
  'ambidextry.gif', 'indestructibility.gif', 'esoterism.gif', 'transcendence.gif',
  'astrality.gif', 'bloodFuryExec.gif', 'damage-execution.gif', 'resilience-cancel.gif',
  'broken-spell.gif', 'balance-strike.gif', 'mysticism.gif', 'mysticism-attack.gif',
  'hypercognition-01.gif', 'hypercognition-02.gif', 'hypercognition-03.gif', 'hp-battle-regen.gif',
  'picto-aura-eternallife.svg', 'picto-aura-extralife.svg', 'picto-aura-fadedlife.svg',
  'life.gif', 'fadedlife.gif', 'eternallife.gif', 'cafard.gif', 'dead-cafard.png',
];
const sourcePattern = /(?:\.{0,2}\/)*media\/[^\s"'<>`]+?\.(?:png|jpe?g|webp|gif|svg|avif|mp3|ogg|woff2?)(?:\?[^\s"'<>`]*)?/gi;
const cssSources = new WeakMap();

function collectValues(value, sources, seen = new WeakSet()) {
  if (typeof value === 'string') {
    for (const source of value.match(sourcePattern) || []) sources.add(resourceKey(source));
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.values(value).forEach(child => collectValues(child, sources, seen));
  }
}

export function collectEntityResources(entity, sources = new Set()) {
  collectValues(entity, sources);
  sources.add(resourceKey('./media/sprites/0-dead.png'));
  const attacks = readAttackDefinitionsForEntity(entity, attackDetails);
  for (const attack of attacks) {
    collectValues(attack, sources);
    if (attack.attackAsset) {
      sources.add(resourceKey(`${attack.attackAsset}-ld.jpg`));
      sources.add(resourceKey(attack.attackAssetHD || `${attack.attackAsset}-hd.jpg`));
    }
    if (attack.effets?.includes('summonJarret')) collectValues(summons, sources);
    if (attack.effets?.includes('summonProfanation')) {
      collectEntityResources({ sprite: './media/sprites/aberration-profanee.png', attacks: ['autoAttack'] }, sources);
    }
  }
  return sources;
}

export function collectLevelResources({ entities = [], biome, stage = {}, inventory = [] } = {}) {
  const sources = new Set(commonEffects.map(file => resourceKey(`./media/assets/effects/${file}`)));
  for (const visual of Object.values(EFFECT_VISUALS)) sources.add(resourceKey(visual.src));
  collectValues(PERMANENT_CRYSTAL_LEVELS, sources);
  sources.add(resourceKey('./media/assets/ui/hexastone.png'));
  for (const file of ['chest-cracked', 'chest-cracked-opened', 'chest-loot', 'chest-cracked-loot',
    'chest-unlocking', 'chest-closed', 'chest-destroyed', 'chest-is-opened', 'chest-opened', 'chest-locked']) {
    sources.add(resourceKey(`./media/assets/misc/${file}.png`));
  }
  entities.forEach(entity => collectEntityResources(entity, sources));
  const environment = levelBiome.find(value => value.classe === biome || String(value.serial) === String(biome));
  collectValues(environment, sources);
  if (environment?.ground_fx?.includes('swampFog')) {
    sources.add(resourceKey('./media/assets/meteo/swampFog-01.png'));
    sources.add(resourceKey('./media/assets/meteo/swampFog-02.png'));
  }
  collectValues(stage, sources);
  collectValues(inventory, sources);
  // These events are global and can trigger during any map session.
  for (const event of eventList) {
    collectValues(event, sources);
    for (const serial of event.preloadEntities || []) {
      const template = entitesNest.find(entity => entity.serial === serial);
      if (template) collectEntityResources(template, sources);
      else throw new Error(`Entite de l'evenement ${event.key} introuvable : ${serial}`);
    }
  }
  return sources;
}

function visitStyles(callback, includeDormant = false) {
  const walk = (rules, base, all) => {
    for (const rule of rules) {
      if (rule.style) {
        let applies = all;
        try { applies ||= Boolean(document.querySelector(rule.selectorText?.replace(/::[\w-]+(?:\([^)]*\))?/g, ''))); }
        catch { /* Keyframes and unsupported selectors have no DOM match. */ }
        if (applies) callback(rule.style, base);
      }
      if (rule.cssRules) walk(rule.cssRules, base, all);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules, sheet.href || document.baseURI, includeDormant || /\/effects\.css(?:\?|$)/.test(sheet.href || '')); }
    catch (error) { if (error.name !== 'SecurityError') throw error; }
  }
}

export async function prepareLevelResources(sources, options = {}) {
  const startedAt = performance.now();
  const retryOnly = options.retryOnly === true;
  const styles = [];
  const collectStyle = (style, base) => {
    const originals = cssSources.get(style) || new Map();
    for (const property of style) {
      const current = style.getPropertyValue(property);
      const value = current.includes('blob:') ? originals.get(property) || current : current;
      if (!value.includes('url(')) continue;
      originals.set(property, value);
      const matches = [...value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)];
      for (const match of matches) {
        if (!retryOnly && !/^(?:data:|blob:|#)/.test(match[1])) sources.add(resourceKey(match[1], base));
      }
      styles.push({ style, property, value, base });
    }
    cssSources.set(style, originals);
  };
  visitStyles(collectStyle);
  document.querySelectorAll('[style]').forEach(element => collectStyle(element.style, document.baseURI));
  if (!retryOnly) document.querySelectorAll('img[src]').forEach(image => {
    // Map and starter-selection artwork cannot be used on the loaded board.
    if (image.matches('.worldmap') || image.closest('.LevelButton, .entitylootContainer')) return;
    if (!/^(?:data:|blob:)/.test(image.src)) sources.add(image.src);
  });
  // Pin the full manifest, including later summons, until this level is closed.
  for (const source of sources) levelResources.add(resourceKey(source));
  const errors = await preloadResources(sources, { concurrency: 12, ...options });
  for (const { style, property, value, base } of styles) {
    style.setProperty(property, value.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g,
      (original, source) => /^(?:data:|blob:|#)/.test(source) ? original : `url("${cachedResourceUrl(resourceKey(source, base))}")`), style.getPropertyPriority(property));
  }
  await document.fonts.ready;
  const requests = performance.getEntriesByType('resource')
    .filter(entry => entry.initiatorType === 'fetch' && entry.startTime >= startedAt && sources.has(entry.name));
  console.info('[LevelLoader] Resources', {
    stageId: window.currentStageId, count: sources.size,
    durationMs: Math.round(performance.now() - startedAt),
    requests: requests.length,
    transferredBytes: requests.reduce((sum, entry) => sum + entry.transferSize, 0),
    slowest: requests.sort((a, b) => b.duration - a.duration).slice(0, 5)
      .map(entry => ({ source: entry.name, durationMs: Math.round(entry.duration), bytes: entry.transferSize })),
  });
  return errors;
}

// Persist source URLs, not blob handles belonging to the old document.
export function persistentMediaMarkup(markup) {
  let result = markup;
  for (const [key, entry] of resources) if (entry.value?.url) result = result.split(entry.value.url).join(key);
  for (const state of animatedImages.values()) result = result.split(state.url).join(state.key);
  return result;
}
