import { entites } from "../entities/runtime.js";
import { gameStorage } from "../storage/sessionStorage.js";
import { gameStarted } from "../app/state.js";
import { getPermanentStatChoices } from "../items/permanentItems.js";
import { balanceData } from "../data/balanceData.js";
import { getSafe, normalizeStatKey } from "../entities/rules.js";
import { readAttackDefinitionsForEntity } from "../combat/attackResolution.js";
import { cloneCombatSnapshot } from "../combat/snapshot.js";
import { attackDetails } from "../data/attackList.js";
import { attackEffects } from "../data/attackEffects.js";

let panel, controller, lastReport = null;
const fmt = value => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const copy = value => JSON.parse(JSON.stringify(value, (_key, entry) => typeof entry === 'function' ? undefined : entry));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const flatten = (value, prefix = '', out = {}) => {
  for (const [key, item] of Object.entries(value || {})) {
    if (key === 'lifetime') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' && Number.isFinite(item)) out[path] = item;
    else if (item && typeof item === 'object') flatten(item, path, out);
  }
  return out;
};
const capacity = value => Number(value?.totalMax ?? value?.max ?? value?.current ?? value) || 0;

export function simulationStats() {
  const result = new Map();
  for (const stat of getPermanentStatChoices()) {
    const key = normalizeStatKey(stat.key);
    if (key && !result.has(key)) result.set(key, { key, name: stat.name || key, unit: stat.unit || '' });
  }
  for (const entity of entites) for (const key of Object.keys(entity.stats || {})) {
    if (!result.has(key) && /Plus$/.test(key)) {
      const base = result.get(key.slice(0, -4)); result.set(key, { key, name: `${base?.name || key.slice(0, -4)} +` });
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function captureSimulationBoard() {
  if (gameStarted) throw new Error('Stoppez le combat avant de capturer les entités du board.');
  const actors = entites.filter(entity => document.getElementById(`Box_Entite_${entity.id}`)?.closest('#hexGrid .hex'));
  const alive = entity => !entity.isDEAD && Number(entity.stats?.HP?.current) > 0;
  if (!actors.some(e => e.side === 'A' && alive(e)) || !actors.some(e => e.side === 'B' && alive(e))) throw new Error('Placez au moins une entité vivante dans chaque camp A et B.');
  const board = document.getElementById('game-container')?.cloneNode(true);
  if (!board) throw new Error('Board admin introuvable.');
  board.querySelectorAll('script, iframe, #admin-entity-form, #admin-combat-simulation, .Game-helper, .loading-screen, .GameOverMessage, .projectile-parent, .entity-footprint-smoke').forEach(node => node.remove());
  const entities = actors.map(entity => {
    // Runtime references and circular links are stripped by the game's snapshot utility.
    const snapshot = cloneCombatSnapshot(entity);
    snapshot.attackDetails = cloneCombatSnapshot(readAttackDefinitionsForEntity(snapshot, attackDetails));
    return copy(snapshot);
  });
  const storage = Array.from({ length: gameStorage.length }, (_, i) => gameStorage.key(i))
    .filter(key => key && !key.startsWith('BattleLog')).map(key => [key, gameStorage.getItem(key)]);
  const stats = simulationStats();
  return { entities, stats, storage, epoch: Date.now(), stageId: window.currentStageId,
    balance: structuredClone(balanceData), boardHtml: `<div id="game-windows">${board.outerHTML}</div>`,
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href),
    // Warm the frame's module graph in parallel rather than discovering each
    // import one network round-trip at a time. Modules still get a fresh realm.
    modules: [...new Set(performance.getEntriesByType('resource').filter(entry =>
      entry.initiatorType === 'script' && /\/js\/.*\.js(?:[?#]|$)/.test(entry.name)).map(entry => entry.name))],
    viewport: { width: innerWidth, height: innerHeight },
    bodyClass: document.body.className,
    reserves: Object.fromEntries(actors.map(e => [e.id, Object.fromEntries(['HP', 'armor', 'extraLife', 'fadedLife', 'eternalLife', 'shift']
      .map(key => [key, { current: Number(e.stats[key]?.current ?? e.stats[key]) || 0, max: capacity(e.stats[key]) }]))])),
    boardStats: Object.fromEntries(actors.map(e => [e.id, Object.fromEntries(stats.map(s => [s.key, capacity(getSafe(e, s.key, 0))]))])),
  };
}

export async function simulateTrial(snapshot, options, { signal } = {}) {
  const startedAt = performance.now();
  if (signal?.aborted) throw new DOMException('Simulation annulée', 'AbortError');
  const frame = document.createElement('iframe');
  frame.title = 'Calcul isolé'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${snapshot.viewport.width}px;height:${snapshot.viewport.height}px;opacity:0;pointer-events:none;border:0`;
  // No game startup script: storage is replaced before the first game import.
  frame.srcdoc = `<!doctype html><html><head><base href="${escape(new URL("../../", import.meta.url).href)}">${(snapshot.modules || []).map(href => `<link rel="modulepreload" href="${escape(href)}">`).join('')}${snapshot.styles.map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('')}</head><body></body></html>`;
  let timer, abort, lastProgress = { phase: 'chargement' };
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(new DOMException('Simulation annulée', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        const error = new Error('Délai de calcul de 120 secondes dépassé.');
        error.code = 'SIMULATION_TRIAL_TIMEOUT';
        error.elapsedMs = performance.now() - startedAt;
        error.progress = lastProgress;
        reject(error);
      }, 120000);
      frame.onload = async () => {
        try {
          // Dynamic import executes in the disposable frame's realm.
          frame.contentWindow.__input = structuredClone({ ...snapshot, ...options });
          frame.contentWindow.__progress = value => { lastProgress = structuredClone(value); };
          // Return plain data in the parent realm, so reports cannot retain an
          // entire detached game document through foreign object prototypes.
          frame.contentWindow.__success = value => {
            const result = structuredClone(value);
            result.timings.elapsedMs = performance.now() - startedAt;
            resolve(result);
          };
          frame.contentWindow.__failure = error => {
            // Firefox stacks omit the error message; keep the readable reason
            // in the UI and retain the full stack in the downloadable report.
            const reason = new Error(error?.message || String(error));
            reason.name = error?.name || 'Error';
            if (error?.stack) reason.stack = `${reason.name}: ${reason.message}\n${error.stack}`;
            reject(reason);
          };
          const script = frame.contentDocument.createElement('script'); script.type = 'module';
          script.textContent = `import { runSimulationTrial } from ${JSON.stringify(new URL("./simulationRuntime.js", import.meta.url).href)};\nrunSimulationTrial(window.__input).then(window.__success, window.__failure);`;
          script.onerror = () => reject(new Error('Impossible de charger le moteur de simulation.'));
          frame.contentDocument.body.append(script);
        } catch (error) { reject(error); }
      };
      document.body.append(frame);
    });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); frame.remove(); }
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const avg = mean(values), variance = n > 1 ? values.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1) : 0;
  return { mean: avg, min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : 0,
    standardDeviation: Math.sqrt(variance), standardError: Math.sqrt(variance / Math.max(1, n)) };
}
function numericMeans(objects) {
  const keys = new Set(objects.flatMap(value => Object.keys(value || {})));
  return Object.fromEntries([...keys].map(key => [key, mean(objects.map(value => Number(value?.[key]) || 0))]));
}
function sumCounters(rows) {
  const totals = {};
  for (const row of rows) for (const [key, value] of Object.entries(flatten(row.details))) totals[key] = (totals[key] || 0) + value;
  return totals;
}
export function summarizeTrials(trials) {
  const ids = new Set(trials.flatMap(t => t.entities.map(e => e.id)));
  const entities = [...ids].map(id => {
    const rows = trials.map(t => t.entities.find(e => e.id === id)).filter(Boolean), first = rows[0];
    const result = { id, name: first.name, side: first.side, appearances: rows.length };
    for (const key of ['hpStart', 'hpEnd', 'armorStart', 'armorEnd', 'damage', 'heal', 'turns', 'actions']) result[key] = distribution(rows.map(row => row[key] || 0));
    result.deathRate = mean(rows.map(row => Number(row.dead)));
    result.fleeRate = mean(rows.map(row => Number(Boolean(row.hasFled))));
    result.sizeInCells = distribution(rows.map(row => row.sizeInCells || 1));
    result.initialSizeInCells = distribution(rows.map(row => row.initialSizeInCells || row.sizeInCells || 1));
    result.survivalRate = mean(rows.map(row => Number(row.hpEnd > 0 && !row.dead)));
    result.winRate = trials.filter(t => t.winner === first.side && t.entities.some(e => e.id === id)).length / Math.max(1, rows.length);
    result.dps = distribution(trials.filter(t => t.entities.some(e => e.id === id))
      .map(t => (t.entities.find(e => e.id === id)?.damage || 0) / Math.max(.001, t.durationMs / 1000)));
    result.details = numericMeans(rows.map(row => flatten(row.details)));
    result.phases = numericMeans(rows.map(row => row.phases));
    result.stats = Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.initialStats)))].map(key => [key, {
      initial: distribution(rows.map(row => row.initialStats[key] || 0)), final: distribution(rows.map(row => row.finalStats[key] || 0)),
    }]));
    return result;
  });
  const stats = {};
  const statKeys = new Set(entities.flatMap(entity => Object.keys(entity.stats)));
  for (const key of statKeys) stats[key] = {
    initialSum: mean(trials.map(t => t.entities.reduce((sum, e) => sum + (e.initialStats[key] || 0), 0))),
    finalMeanSum: mean(trials.map(t => t.entities.reduce((sum, e) => sum + (e.finalStats[key] || 0), 0))),
  };
  // Sum within each battle first, then average those army totals. This keeps
  // changing rosters, summons and correlated results in the right denominator.
  const armyKeys = ['hpStart', 'hpEnd', 'armorStart', 'armorEnd', 'damage', 'heal', 'turns', 'actions'];
  const armies = ['A', 'B'].map(side => {
    const groups = trials.map(t => t.entities.filter(e => e.side === side));
    const result = { side, count: trials.length,
      wins: trials.filter(t => t.winner === side).length,
      losses: trials.filter(t => t.winner && t.winner !== side).length,
      draws: trials.filter(t => t.end === 'draw').length,
      unresolved: trials.filter(t => !t.winner && t.end !== 'draw').length };
    result.winRate = result.wins / Math.max(1, trials.length);
    for (const key of armyKeys) result[key] = distribution(groups.map(rows => rows.reduce((sum, row) => sum + (row[key] || 0), 0)));
    result.dps = distribution(groups.map((rows, index) => rows.reduce((sum, row) => sum + (row.damage || 0), 0) / Math.max(.001, trials[index].durationMs / 1000)));
    result.survivors = distribution(groups.map(rows => rows.filter(e => e.hpEnd > 0 && !e.dead).length));
    result.deaths = distribution(groups.map(rows => rows.filter(e => e.dead).length));
    result.fled = distribution(groups.map(rows => rows.filter(e => e.hasFled).length));
    result.details = numericMeans(groups.map(sumCounters));
    return result;
  });
  return { count: trials.length, winsA: trials.filter(t => t.winner === 'A').length, winsB: trials.filter(t => t.winner === 'B').length,
    draws: trials.filter(t => t.end === 'draw').length,
    timeouts: trials.filter(t => t.end === 'timeout').length, durationMs: distribution(trials.map(t => t.durationMs)),
    damage: distribution(trials.map(t => t.entities.reduce((sum, e) => sum + (e.damage || 0), 0))),
    heal: distribution(trials.map(t => t.entities.reduce((sum, e) => sum + (e.heal || 0), 0))),
    totalDamage: trials.reduce((sum, t) => sum + t.entities.reduce((n, e) => n + e.damage, 0), 0),
    totalHeal: trials.reduce((sum, t) => sum + t.entities.reduce((n, e) => n + e.heal, 0), 0), entities, armies, stats };
}
export async function runCombatSimulation(snapshot, options, { signal, onProgress = () => {} } = {}) {
  const { count, durationSeconds, seed = crypto.getRandomValues(new Uint32Array(1))[0] } = options;
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Nombre total de combats : 1–10 000.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86400) throw new Error('Durée simulée : plus de 0 et au maximum 86 400 s.');
  const report = { format: 'dark-pit-combat-analysis-1', createdAt: new Date().toISOString(), status: 'running',
    options: { count, durationSeconds, seed },
    budget: { requested: count, attempted: 0, completed: 0, skipped: 0 },
    method: 'Chaque combat repart des mêmes entités, positions, statistiques, attaques et réserves du board. Seule la graine du hasard change entre les combats. Le moteur du jeu applique les attaques, effets et déclenchements jusqu’à la victoire d’un camp ou la durée maximale.',
    snapshot: { entities: snapshot.entities, balance: snapshot.balance, stats: snapshot.stats, boardStats: snapshot.boardStats, viewport: snapshot.viewport },
    trials: [], skippedTrials: [] };
  const progress = label => onProgress({ completed: report.budget.completed, skipped: report.budget.skipped,
    processed: report.budget.completed + report.budget.skipped, total: count, label, report });
  const seedAt = index => (seed + Math.imul(index + 1, 2654435761)) >>> 0;
  try {
    for (let index = 0; index < count; index++) {
      if (signal?.aborted) throw new DOMException('Simulation annulée', 'AbortError');
      const label = `Combat ${index + 1} / ${count}`;
      progress(label);
      report.budget.attempted++;
      const seed = seedAt(index);
      try {
        const trial = await simulateTrial(snapshot, { seed, durationMs: durationSeconds * 1000, trace: true }, { signal });
        trial.run = index + 1;
        report.trials.push(trial);
        report.budget.completed++;
        progress(label);
      } catch (error) {
        if (error.code !== 'SIMULATION_TRIAL_TIMEOUT') throw error;
        report.skippedTrials.push({ run: index + 1, seed, reason: error.message, elapsedMs: error.elapsedMs, progress: error.progress });
        report.budget.skipped++;
        progress(`${label} : délai de calcul dépassé`);
      }
    }
    report.status = 'complete';
  } catch (error) {
    report.status = error.name === 'AbortError' ? 'cancelled' : 'error'; report.error = error.message;
    report.errorDetails = error.stack;
  }
  report.summary = summarizeTrials(report.trials);
  progress(report.status === 'complete' ? `Rapport terminé${report.budget.skipped ? ` · ${report.budget.skipped} hors délai` : ''}` : report.error);
  return report;
}

const table = (headers, rows) => `<div class="sim-table"><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const phaseNames = { 'Entite Turn': 'Attente du tour', attack_1: 'Préparation', attack_2: 'Lancement à distance', attack_3: 'Exécution', attack_5: 'Récupération',
  'target-search': 'Recherche de cible', 'target-search-recovery': 'Récupération après recherche', cooldown: 'Attente de recharge', 'cooldown-wait': 'Attente de recharge', attente: 'Attente' };
const metricNames = { hpDamageDealt: 'Dégâts aux HP infligés', armorDamageDealt: 'Dégâts à l’armure infligés', hpDamageReceived: 'Dégâts aux HP reçus',
  damageReceived: 'Dégâts reçus', armorDamageReceived: 'Dégâts à l’armure reçus', healingReceived: 'Soins reçus', lifeStealHealed: 'HP rendus par vol de vie',
  battleHpRegenerated: 'HP régénérés en combat', dailyHpRecovered: 'HP régénérés par jour', criticalDamage: 'Dégâts des coups critiques', criticalBonusDamage: 'Dégâts supplémentaires des critiques',
  executionDamage: 'Dégâts des exécutions', ambidextryDamage: 'Dégâts du deuxième coup', ambidextryHealing: 'Soins du deuxième coup', hypercognitionDamage: 'Dégâts d’Hypercognition',
  inertResistanceInput: 'Dégâts inertes avant résistance', inertPhysicalReduction: 'Dégâts inertes réduits physiquement', inertMagicalReduction: 'Dégâts inertes réduits magiquement',
  defenseHp: 'HP préservés', procs: 'Déclenchements', livesUsed: 'Vies consommées', damageByNature: 'Dégâts par nature', damageByRange: 'Dégâts par portée', healingByRange: 'Soins par portée',
  roles: 'Rôles', summons: 'Invocations', entities: 'Entités', consumables: 'Consommables', battles: 'Combats', damageDealt: 'Dégâts infligés', durationMs: 'Durée (ms)',
  melee: 'Corps à corps', ranged: 'Distance', physical: 'Physique', magical: 'Magique', piercing: 'Perçant',
  inerte: 'Inerte', physicalPiercingDamage: 'Cinétique', magicalPiercingDamage: 'Spectral', hybridalPiercingDamage: 'Prismatique',
  movements: 'Déplacements', marathonMovements: 'Déplacements gratuits', forcedMovements: 'Déplacements forcés',
  fleeAttempts: 'Tentatives de fuite', fleeSuccesses: 'Fuites réussies', fleeFailures: 'Fuites échouées', trailerCharges: 'Charges de Traînard',
  blockedMovements: 'Déplacements bloqués', negativeMovements: 'Déplacements à crédit', physicalProjectilesAvoided: 'Projectiles physiques évités',
  consumablesUsed: 'Consommables utilisés', consumablesGround: 'Consommables au sol', consumablesPouch: 'Consommables de sacoche', consumablesInventory: 'Consommables d’inventaire',
  consumablesCombatGround: 'Consommables au sol en combat', consumablesCombatPouch: 'Consommables de sacoche en combat', consumablesHostile: 'Consommables offensifs',
  consumablesSupport: 'Consommables de soutien', consumableDamageReceived: 'Dégâts de consommables reçus', consumableHealingReceived: 'Soins de consommables reçus',
  count: 'Nombre', consumed: 'Consommées', expired: 'Expirées', lost: 'Perdues', kills: 'Éliminations', deaths: 'Morts', healingDone: 'Soins prodigués',
  unclassified: 'Non classé', critical: 'Critique', execution: 'Exécution', resistance: 'Résistance', physicalResistance: 'Résistance physique', magicalResistance: 'Résistance magique',
  gueux: 'Gueux', tank: 'Tank', fantassin: 'Fantassin', mage: 'Mage', other: 'Autres',
  astralReturn: 'Retour astral', astralBody: 'Corps astral', astralBodyAvoidance: 'Sorts ratés : Corps astral',
  bloodCrazy: 'Démence sanguinaire', indestructible: 'Indestructibilité', resilienceCrit: 'Résilience contre les critiques', resilienceCancel: 'Résilience : effet annulé', hindranceResistance: 'Entraves résistées',
  armorBypass: 'Armure ignorée', overkill: 'Surplus de dégâts fatal', bloodCrazySuccess: 'Démence sanguinaire réussie', bloodCrazyFail: 'Démence sanguinaire échouée',
  bloodThirstyHeal: 'Soif de sang', bloodFuryHeal: 'Soif de sang', astrality: 'Survie fatale',
  alterationResistance: 'Altérations résistées', weightResistance: 'Résistance au poids', weight: 'Poids',
  occultismSlow: 'Occultisme : ralentissement', occultismFragility: 'Occultisme : fragilité', brokenSpell: 'Sort brisé', bloodGlutony: 'Voracité sanguinaire' };
const endings = { draw: 'Double KO — Match nul', victory: 'Victoire d’un camp', timeout: 'Non terminé : durée maximale atteinte', escape: 'Fuite', 'game-end': 'Fin sans vainqueur', complete: 'Terminé', cancelled: 'Annulé', error: 'Interrompu', running: 'En cours' };
function readableJournal(trial, labels, definitions) {
  const names = new Map(trial.entities.map(entity => [String(entity.id), entity.name]));
  const nameOf = id => names.get(String(id)) || 'Entité';
  const attackName = event => typeof event.attack === 'string' ? event.attack
    : event.attack?.displayName || event.attack?.label || definitions.find(a =>
      (event.attack?.functionName && a.functionName === event.attack.functionName) ||
      (event.attack?.attackId && a.attackId === event.attack.attackId))?.displayName || 'Attaque';
  return trial.journal.map((event, index) => {
    let kind = 'Événement', detail = '';
    if (event.type === 'phase') { kind = 'Phase'; detail = phaseNames[event.phase] || 'Attente'; }
    else if (event.type === 'resources') {
      kind = 'Ressources';
      detail = Object.entries({ hp: 'HP', armor: 'Armure', damage: 'Dégâts infligés cumulés', heal: 'Soins cumulés' })
        .filter(([key]) => event.before[key] !== event.after[key]).map(([key, label]) => `${label} : ${fmt(event.before[key])} → ${fmt(event.after[key])}`).join(' ; ');
    } else if (event.type === 'damage_resolution') {
      kind = attackName(event);
      detail = `Dégâts calculés : ${fmt(event.damage)} ; armure absorbée : ${fmt(event.armorAbsorbed)}. ${Object.entries(event.modifiers || {}).filter(([, v]) => v === true).map(([key]) => metricLabel(key, labels)).join(', ')}`;
      const effects = (event.effects?.applied || []).filter(key => key !== 'none');
      if (effects.length) detail += ` · Effets de l’attaque : ${effects.map(key => labels[key] || 'Effet non répertorié').join(', ')}`;
    } else if (event.type === 'entity_death') { kind = 'Mort définitive'; }
    else if (event.type === 'extra_life_used') { kind = 'Vie consommée'; detail = `${labels[event.lifeType] || 'Vie supplémentaire'} ; ${fmt(event.hpRestored)} HP restaurés`; }
    else if (event.type === 'attack_dodged') { kind = event.partial ? 'Esquive partielle' : 'Attaque esquivée'; detail = `${attackName(event)}${event.partial ? ' · la partie magique peut encore toucher' : ''}`; }
    else if (event.type === 'attack_missed') { kind = 'Attaque ratée'; detail = `${attackName(event)}${event.reason ? ` · ${event.reason}` : ''}`; }
    else if (event.type === 'entity_battle_regen') { kind = 'Régénération en combat'; detail = `+${fmt(event.hpRestored ?? event.healed ?? event.amount)} HP`; }
    else if (['entity_move', 'entity_swap_move', 'entity_move_marathon'].includes(event.type)) {
      kind = event.type === 'entity_swap_move' ? 'Échange de places' : event.type === 'entity_move_marathon' ? 'Déplacement gratuit' : 'Déplacement';
      detail = `Case ${event.from ?? '—'} → ${event.to ?? '—'}`;
    } else if (event.type === 'runaway_success' || event.type === 'runaway_fail') { kind = event.type === 'runaway_success' ? 'Fuite réussie' : 'Fuite échouée'; }
    else if (event.type === 'trail_move_generated') { kind = 'Traînard'; detail = 'Récupération de mouvement'; }
    else if (event.type === 'attack_success' || event.type === 'attack_damage_with_armor') { kind = attackName(event); detail = `${fmt(event.damage)} dégâts · ${fmt(event.armorAbsorbed)} absorbés par l’armure`; }
    else { kind = { battle_victory: 'Victoire', battle_defeat: 'Défaite', battle_draw: 'Double KO — Match nul', battle_start: 'Début du combat',
      battle_escape: 'Fin par fuite', battle_escape_partial: 'Fuite partielle', battle_escape_total: 'Fuite de toute l’armée', runaway_order_launched: 'Ordre de fuite',
      entity_already_dead: 'Entité déjà morte au départ', level_loaded: 'Arrivée sur le terrain', attack_dead_body: 'Attaque sur un cadavre',
      attack_reduced: 'Attaque atténuée', attack_cancelled_dead_target: 'Attaque annulée : cible morte' }[event.type] || 'Effet du combat'; }
    return [index + 1, Number(event.timeMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 }), event.attacker?.name || event.entity?.name || (event.entityId ? nameOf(event.entityId) : '—'), event.target?.name || '—', kind, detail];
  });
}
function metricLabel(key, labels) {
  if (key === 'defenseHp.occultismFragility') return 'Fragilité des ombres · HP supplémentaires perdus';
  if (key === 'procs.astrality') return 'Déclenchements · Survie fatale';
  // Summon record keys contain a JSON identity, not a stat code. Preserve the
  // creature/consumable's actual name, including dots in that name.
  const match = /^summons\.(entities|consumables)\.(\[.*\])\.(.+)$/.exec(key);
  if (match) {
    try { return `Invocations · ${JSON.parse(match[2])[1]} · ${metricLabel(match[3], labels)}`; } catch { /* Unrecognized record remains in JSON. */ }
  }
  return key.split('.').map(part => labels[part] || metricNames[part] || 'Effet non répertorié').join(' · ');
}
export function simulationReportHtml(report, { standalone = false } = {}) {
  const summary = report.summary || summarizeTrials(report.trials);
  const skipped = report.skippedTrials || [];
  const labels = Object.fromEntries([...attackEffects.map(e => [e.effectName, e.effectDisplay]), ...report.snapshot.stats.map(s => [s.key, s.name])]);
  const countersTable = counters => table(['Compteur du jeu', 'Moyenne par combat'], Object.entries(counters).filter(([, value]) => value !== 0).map(([key, value]) => [metricLabel(key, labels), fmt(value)]));
  const rangesTable = result => table(['Résultat', 'Moyenne', 'Minimum', 'Maximum'], [
    ['Dégâts infligés', result.damage], ['DPS observé', result.dps], ['Soins prodigués', result.heal],
    ['HP restants', result.hpEnd], ['Armure restante', result.armorEnd], ['Actions', result.actions],
  ].map(([name, value]) => [name, fmt(value.mean), fmt(value.min), fmt(value.max)]));
  let body = `<h2>Rapport de simulation</h2><p>${escape(new Date(report.createdAt).toLocaleString('fr-FR'))} · ${summary.count} / ${report.options.count} combats terminés · durée maximale ${fmt(report.options.durationSeconds)} s · ${escape(endings[report.status])}</p>
  ${report.error ? `<p class="sim-error">${escape(report.error)}</p>` : ''}
  ${skipped.length ? `<p class="sim-error">${skipped.length} combat(s) interrompu(s) après dépassement du délai de calcul de 120 secondes. La série a continué avec les combats suivants. Ces tentatives sont exclues des moyennes et des taux de victoire.</p>` : ''}
  <p>Même affrontement, hasard différent à chaque combat. Les moyennes portent sur ${summary.count} combats conservés ; une durée maximale atteinte compte sans vainqueur.</p>
  <h3>Résultats globaux</h3>
  ${table(['Victoires A', 'Victoires B', 'Doubles KO', 'Durée maximale atteinte', 'Durée moyenne'], [[summary.winsA, summary.winsB, summary.draws, summary.timeouts, `${fmt(summary.durationMs.mean / 1000)} s`]])}
  <h3>Moyennes par armée</h3>
  ${table(['Armée', 'Taux de victoire', 'Dégâts', 'Soins', 'Survivants', 'Pertes', 'Entités échappées'], summary.armies.map(a => [`Camp ${a.side}`, `${fmt(a.winRate * 100)} %`, fmt(a.damage.mean), fmt(a.heal.mean), fmt(a.survivors.mean), fmt(a.deaths.mean), fmt(a.fled?.mean)]))}
  <h3>Moyennes par entité</h3>
  ${table(['Entité', 'Camp', 'Survie', 'Dégâts infligés', 'Dégâts reçus', 'Soins', 'HP restants'], summary.entities.map(e => [e.name, e.side, `${fmt(e.survivalRate * 100)} %`, fmt(e.damage.mean), fmt(e.details.damageReceived), fmt(e.heal.mean), fmt(e.hpEnd.mean)]))}
  <p>La survie inclut les entités échappées encore vivantes. Les invocations sont incluses dans leur camp. Les moyennes d’une entité concernent ses seules présences.</p>
  <details><summary>Comment lire les résultats</summary><p>${escape(report.method)}</p><p>Les dégâts comprennent les HP et l’armure. Les soins incluent les soins personnels enregistrés par le moteur, dont Retour astral ; la régénération en combat est comptée séparément. Les déclenchements et les HP préservés décrivent ce qui s’est produit, pas un gain théorique par point investi.</p>
  <p>Durée médiane : ${fmt(summary.durationMs.median / 1000)} s · minimum–maximum : ${fmt(summary.durationMs.min / 1000)}–${fmt(summary.durationMs.max / 1000)} s.</p></details>`;
  for (const army of summary.armies) {
    body += `<details><summary>Armée ${escape(army.side)} · résultats et compteurs</summary>${rangesTable(army)}${countersTable(army.details)}</details>`;
  }
  for (const entity of summary.entities) {
    const source = report.snapshot.entities.find(e => String(e.id) === String(entity.id));
    const size = entity.sizeInCells || { mean: source?.sizeInCells || 1, min: source?.sizeInCells || 1, max: source?.sizeInCells || 1 };
    body += `<details><summary>${escape(entity.name)} · camp ${escape(entity.side)} · résultats, statistiques et capacités</summary>
      <p>${entity.appearances} présences · fuite réussie dans ${fmt(entity.fleeRate * 100)} % des combats · ${fmt(entity.turns.mean)} tours en moyenne.</p>
      <p>Occupation : ${fmt(entity.initialSizeInCells?.mean || size.mean)} case(s) au départ · ${fmt(size.mean)} à la fin (${fmt(size.min)}–${fmt(size.max)}). Les groupements et leur taille restent ceux du plateau.</p>${rangesTable(entity)}
      <details><summary>Statistiques de départ et de fin</summary>
      ${table(['Statistique', 'Départ moyen', 'Fin moyenne', 'Fin min', 'Fin max'], Object.entries(entity.stats).filter(([, v]) => v.initial.max !== 0 || v.final.max !== 0).map(([key, value]) => [labels[key] || 'Statistique non répertoriée', fmt(value.initial.mean), fmt(value.final.mean), fmt(value.final.min), fmt(value.final.max)]))}
      <p>Pour les HP et l’armure, ce tableau indique la capacité totale. Les réserves restantes figurent dans les résultats du combat.</p>
      </details><details><summary>Capacités, défenses, déplacements et invocations</summary>${countersTable(entity.details)}</details>
      ${source?.attackDetails?.length ? `<details><summary>Attaques au départ</summary>${table(['Attaque', 'Nature', 'Effets configurés', 'Préparation', 'Exécution', 'Récupération', 'Recharge'], source.attackDetails.map(a => [
        String(a.displayName || a.name || 'Attaque').replace(/<[^>]*>/g, ''), (a.attacknature || []).map(key => labels[key] || metricNames[key] || 'Nature non répertoriée').join(', '),
        (a.resolvedEffects || []).filter(e => e.effectName !== 'none').map(e => e.effectDisplay || labels[e.effectName] || 'Effet non répertorié').join(', ') || '—',
        `${fmt(a.preparationTime / 1000)} s`, `${fmt(a.executionTime / 1000)} s`, `${fmt(a.recoveryTime / 1000)} s`, `${fmt(a.cooldown / 1000)} s`]))}</details>` : ''}
      <details><summary>Temps par phase</summary>${table(['Phase', 'Temps moyen (s)'], Object.entries(entity.phases).map(([key, value]) => [phaseNames[key] || 'Autre phase', fmt(value / 1000)]))}</details></details>`;
  }
  const outcomes = [...report.trials.map(trial => [trial.run, trial.seed, fmt(trial.durationMs / 1000), endings[trial.end], trial.winner || '—']),
    ...skipped.map(trial => [trial.run, trial.seed, '—', trial.reason, '—'])].sort((a, b) => a[0] - b[0]);
  body += `<details><summary>Résultat de chaque combat</summary>${table(['Combat', 'Graine du hasard', 'Durée simulée (s)', 'Fin', 'Camp vainqueur'], outcomes)}</details>`;
  if (!standalone) return body + '<p>Le téléchargement contient aussi le journal détaillé de chaque combat et les données JSON.</p>';
  body += `<h3>Échanges chronologiques</h3><p>Les lignes Ressources donnent les variations réellement appliquées. Les dégâts calculés peuvent dépasser les HP restants. Le numéro conserve l’ordre des événements, y compris à temps égal.</p>${report.trials.map((trial, index) => `<details data-trial-index="${index}"><summary>Combat ${trial.run} · ${trial.journal.length} événements</summary><div data-journal></div></details>`).join('')}`;
  const json = JSON.stringify(report, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Résultats des combats</title>
  <style>body{background:#11171b;color:#e8e6df;font:15px system-ui;max-width:1400px;margin:32px auto;padding:0 20px}h2,h3,summary{color:#dfc187}summary{cursor:pointer;padding:14px 0}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:8px;text-align:left;border-bottom:1px solid #39434a;white-space:nowrap}th{color:#aac7d9}.sim-table{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:600px;overflow:auto}.sim-error{color:#ff9292}button{padding:10px;margin:12px 0}</style>
  <button id="json-export">Télécharger les données JSON</button>${body}<script type="application/json" id="simulation-data">${json}</script>
  <script>
  const fmt=${fmt.toString()}, escape=${escape.toString()}, table=${table.toString()};
  const metricNames=${JSON.stringify(metricNames)}, phaseNames=${JSON.stringify(phaseNames)}, labels=${JSON.stringify(labels).replace(/</g, '\\u003c')};
  ${metricLabel.toString()}
  ${readableJournal.toString()}
  let report;
  document.addEventListener('toggle', event => {
    const detail=event.target;
    if(!detail.open || !detail.hasAttribute('data-trial-index') || detail.dataset.loaded) return;
    report ||= JSON.parse(document.getElementById('simulation-data').textContent);
    const trial=report.trials[Number(detail.dataset.trialIndex)];
    detail.querySelector('[data-journal]').innerHTML=table(['N°','Temps (s)','Entité','Cible','Action','Détail'],readableJournal(trial,labels,report.snapshot.entities.flatMap(e=>e.attackDetails || [])));
    detail.dataset.loaded='true';
  },true);
  document.getElementById('json-export').onclick=()=>{const url=URL.createObjectURL(new Blob([document.getElementById('simulation-data').textContent],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='simulation-combats.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};</script></html>`;
}
export function unmountCombatSimulation() {
  controller?.abort(); controller = null; panel?.remove(); panel = null;
  document.getElementById('simulation-report-dialog')?.remove();
}
export function mountCombatSimulation() {
  if (panel?.isConnected) return panel;
  if (!document.getElementById('combat-simulation-style')) {
    const style = document.createElement('style'); style.id = 'combat-simulation-style';
    style.textContent = `#admin-combat-simulation{position:fixed;left:12px;top:90px;width:310px;max-height:75vh;overflow:auto;z-index:1800;background:rgba(12,18,22,.96);color:#e8e6df;border:1px solid #b99a57;border-radius:5px;padding:12px;font:14px system-ui;box-sizing:border-box}#admin-combat-simulation summary{cursor:pointer;color:#e2c58b}#admin-combat-simulation label{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:10px 0}#admin-combat-simulation input,#admin-combat-simulation select{width:125px;background:#202b31;color:white;border:1px solid #52616b;border-radius:3px;padding:5px}#admin-combat-simulation button{padding:6px;margin:4px;background:#273239;color:#eee;border:1px solid #9b844f;cursor:pointer}#admin-combat-simulation button:disabled{opacity:.4;cursor:default}#admin-combat-simulation progress{width:100%}#admin-combat-simulation small{display:block;color:#b5c8d2}#simulation-report-dialog{width:min(1300px,94vw);max-height:88vh;overflow:auto;background:#11191f;color:#eee;border:1px solid #b99a57;font:14px system-ui}#simulation-report-dialog::backdrop{background:#000a}#simulation-report-dialog .sim-table{overflow:auto}#simulation-report-dialog table{border-collapse:collapse;width:100%}#simulation-report-dialog th,#simulation-report-dialog td{padding:8px;text-align:left;border-bottom:1px solid #34434b;white-space:nowrap}#simulation-report-dialog summary{padding:12px;color:#e2c58b;cursor:pointer}.sim-error{color:#ff9292}`;
    style.textContent += '\nbody:has(.army-codex-list, .codex-entity-scan) #admin-combat-simulation{display:none}';
    document.head.append(style);
  }
  panel = document.createElement('div'); panel.id = 'admin-combat-simulation';
  panel.innerHTML = `<details open><summary>Simulation · rapport analytique</summary>
    <label>Durée maximale (s)<input data-sim="duration" type="number" min="0.01" max="86400" step="any" value="180"></label>
    <label>Nombre total de combats<input data-sim="count" type="number" min="1" max="10000" step="1" value="100"></label>
    <p><small>Entités du board, avec au moins un vivant en A et B. Combat jusqu’à la victoire d’un camp ou la durée maximale. L’invincibilité admin est désactivée dans les essais.</small></p>
    <p data-sim="estimate"><small></small></p>
    <button type="button" data-sim="run">Calculer le rapport</button><button type="button" data-sim="cancel" disabled>Annuler</button>
    <progress data-sim="progress" value="0" max="1" hidden></progress><p data-sim="status" role="status" aria-live="polite"></p>
    <button type="button" data-sim="view" disabled>Voir le rapport</button><button type="button" data-sim="download" disabled>Télécharger le rapport</button></details>`;
  const ownPanel = panel, q = key => ownPanel.querySelector(`[data-sim="${key}"]`);
  const estimate = () => {
    const count = Number(q('count').value);
    q('estimate').firstElementChild.textContent = Number.isInteger(count) && count >= 1 && count <= 10000
      ? `${count} combats du même affrontement. État de départ identique, tirages aléatoires différents.`
      : 'Nombre total de combats : 1–10 000.';
  };
  q('count').addEventListener('input', estimate);
  const ready = () => { q('view').disabled = q('download').disabled = !lastReport?.budget.attempted; };
  q('cancel').onclick = () => controller?.abort();
  q('run').onclick = async () => {
    let job;
    try {
      const snapshot = captureSimulationBoard();
      const count = Number(q('count').value);
      controller = job = new AbortController();
      q('run').disabled = true; q('cancel').disabled = false; q('progress').hidden = false;
      lastReport = null; ready();
      const computed = await runCombatSimulation(snapshot, { count, durationSeconds: Number(q('duration').value) }, {
        signal: controller.signal,
        onProgress: state => { q('progress').max = state.total; q('progress').value = state.processed;
          q('status').textContent = `${state.label} · ${state.processed} / ${state.total} essais traités · ${state.completed} terminés${state.skipped ? ` · ${state.skipped} hors délai` : ''}`;
        },
      });
      if (controller !== job) return;
      lastReport = computed;
      q('status').textContent = lastReport.status === 'complete'
        ? `Terminé : ${lastReport.budget.attempted} / ${count} combats traités · ${lastReport.budget.completed} terminés${lastReport.budget.skipped ? ` · ${lastReport.budget.skipped} hors délai` : ''}.`
        : `${lastReport.error} — ${lastReport.budget.completed} combats conservés sur ${count}${lastReport.budget.skipped ? ` · ${lastReport.budget.skipped} hors délai` : ''}.`;
    } catch (error) { q('status').textContent = error.message; }
    finally { if (controller === job) controller = null; q('run').disabled = false; q('cancel').disabled = true; ready(); }
  };
  q('view').onclick = () => {
    document.getElementById('simulation-report-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'simulation-report-dialog';
    dialog.innerHTML = '<button type="button">Fermer</button>' + simulationReportHtml(lastReport);
    dialog.querySelector('button').onclick = () => dialog.close();
    document.body.append(dialog); dialog.showModal();
  };
  q('download').onclick = () => {
    const url = URL.createObjectURL(new Blob([simulationReportHtml(lastReport, { standalone: true })], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `rapport-combat-${Date.now()}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  document.body.append(panel); ready(); estimate();
  return panel;
}
