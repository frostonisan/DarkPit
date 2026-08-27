import { saveToLocalStorage, loadFromLocalStorage, getCurrentLevel } from './GameStorage.js';

let currentBattleLogKey = null;
let currentBattleLogStageId = null;
let battleLogClosed = false;

export function battleLogs(type, data = {}) {
    ensureBattleLogSession();
if (battleLogClosed) {
    return;
}
    const message = buildBattleLogMessage(type, data);
    if (!message) return;

    const entry = {
        type,
        message,
        time: getSimpleTime()
    };

    saveBattleLogEntry(entry);
	updateBattleLogStatutFromType(type);
    renderBattleLogEntry(entry);
}

function buildBattleLogMessage(type, data = {}) {
	    switch (type) {
// GAME PREPARATION
        case "level_loaded":
            return logLevelLoaded(data);

        case "battle_start":
            return logBattleStart(data);
// GAME STATE
        case "battle_victory":
            return logBattleVictory(data);

        case "battle_defeat":
            return logBattleDefeat(data);
// DEATH
		case "entity_already_dead":
			return logEntityAlreadyDead(data);

		case "entity_death":
			return logEntityDeath(data);
			
		case "extra_life_used":
			return logExtraLifeUsed(data);
// RUNAWAY
        case "battle_escape":
            return logBattleEscape(data);
		
		case "runaway_order_launched":
			return logRunawayOrderLaunched(data);
			
		case "battle_escape_partial":
			return logBattleEscapePartial(data);

		case "battle_escape_total":
			return logBattleEscapeTotal(data);
			
		case "runaway_success":
			return logRunawaySuccess(data);

		case "runaway_fail":
			return logRunawayFail(data);
// Attack			
		case "attack_success":
			return logAttackSuccess(data);
			
		case "damage_resolution":
			return logDamageResolution(data);

		case "attack_damage_with_armor": // Compat ancien nom
			return logDamageResolution(data);
			
		case "attack_missed":
			return logAttackMissed(data);

		case "attack_dead_body":
			return logAttackDeadBody(data);

		case "attack_cancelled_dead_target":
			return logAttackCancelledDeadTarget(data);

		case "attack_reduced":
			return logAttackReduced(data);

		case "attack_dodged":
			return logAttackDodged(data);
// BATTLE REGEN
		case "entity_battle_regen":
			return logEntityBattleRegen(data);
// MOVEMENT
		case "entity_move":
			return logEntityMove(data);

		case "entity_swap_move":
			return logEntitySwapMove(data);

		case "entity_move_marathon":
			return logEntityMoveMarathon(data);
		 
		case "trail_move_generated":
			return logTrailMoveGenerated(data); 

        default:
            console.warn(`Type de battleLog inconnu : ${type}`, data);
            return null;
    }
}
function logDamageResolution({
    attacker,
    target,
    attack,
    damage,
    damageSources,
    armorAbsorbed,
    modifiers = {}
} = {}) {
    const prefix = [];
    const variant = attack?.logVariant || "normal";

    if (modifiers.execution) prefix.push("EXÉCUTION !");
    if (modifiers.critical) prefix.push("COUP CRITIQUE !");

    if (modifiers.indestructible) {
        return `${entityLabel(target)} résiste à l'attaque ${attackLabel(attack)} de ${entityLabel(attacker)} grâce à Indestructibilité.`;
    }

    let text = "";

    if (armorAbsorbed > 0 && damage > 0) {
        text = `${entityLabel(attacker)} inflige ${safeNumber(damage)} dégâts ${damagePicto(damageSources)} avec ${attackLabel(attack)} sur ${entityLabel(target)}. L'armure absorbe ${safeNumber(armorAbsorbed)} dégâts.`;
    } else if (armorAbsorbed > 0 && damage <= 0) {
        text = `${entityLabel(attacker)} attaque ${entityLabel(target)} avec ${attackLabel(attack)}. L'armure absorbe ${safeNumber(armorAbsorbed)} dégâts.`;
    } else {
        text = `${entityLabel(attacker)} inflige ${safeNumber(damage)} dégâts ${damagePicto(damageSources)} avec ${attackLabel(attack)} sur ${entityLabel(target)}.`;
    }

    if (modifiers.mysticism) text += " Boostée par Mysticisme.";
    if (modifiers.armorBypass) text += ` L'attaque transperce l'armure de ${entityLabel(target)}.`;
    if (modifiers.esoterism) text += " Ésotérisme réduit les dégâts magiques.";
    if (modifiers.occultismFragility) text += " Fragilité des ombres augmente les dégâts reçus.";
    if (modifiers.astrality) text += " Astralité maintient la cible à 1 HP.";
	const bloodThirstyHeal =
  modifiers.bloodThirstyHeal ??
  modifiers.bloodFuryHeal ??
  0;

if (bloodThirstyHeal) {
  text += ` Soif de sang +${safeNumber(bloodThirstyHeal)} HP.`;
}
	if (modifiers.overkill) { text += ` OVERKILL !`; }
	if (modifiers.bloodGlutony) { text += ` Voracité sanguinaire restaure tous les HP de ${entityLabel(attacker)}.`; }
	if (modifiers.bloodCrazySuccess) {
  text += " Démence sanguinaire réussit : l'exécution est déclenchée.";
}

if (modifiers.bloodCrazyFail) {
  if (modifiers.bloodCrazyFailReason === "incompatible_attack") {
    text += " Démence sanguinaire échoue : l'attaque n'est pas compatible avec l'exécution.";
  } else if (modifiers.bloodCrazyFailReason === "proc_failed") {
    text += " Démence sanguinaire échoue : l'exécution ne se déclenche pas.";
  } else {
    text += " Démence sanguinaire échoue.";
  }
}

if (modifiers.bloodCrazyGain) {
  text += " Démence sanguinaire s'active pour la prochaine attaque.";
}
	
    const finalText = `${prefix.join(" ")} ${text}`.trim();

    switch (variant) {
        case "ambidextry_second_hit":
            return `Ambidextrie ! Deuxième attaque de ${attackLabel(attack)} par ${entityLabel(attacker)} sur ${entityLabel(target)} pour ${safeNumber(damage)} dégâts ${damagePicto(damageSources)}.`;

        case "normal":
        default:
            return finalText;
    }
}

function ensureBattleLogSession() {
    const levelId = getCurrentLevel() || "unknown";

if (
    currentBattleLogKey &&
    String(currentBattleLogStageId) === String(levelId) &&
    !battleLogClosed
) {
    return;
}

    currentBattleLogStageId = levelId;
    battleLogClosed = false;

    const stageName = getCurrentStageName(levelId);
    const stageStatut = getCurrentStageStatut(levelId);
    const date = getSimpleDate();

    const attemptNumber = getNextBattleLogAttemptNumber(levelId);
currentBattleLogKey = `battleLog_${levelId}_try_${attemptNumber}_${date}`;

const battleLogData = {
    id: currentBattleLogKey,
    levelId,
    stageName,
    statut: stageStatut,
    createdAt: date,
    attemptNumber,
    entries: []
};

    saveToLocalStorage(currentBattleLogKey, battleLogData);

registerBattleLogInIndex(
    currentBattleLogKey,
    levelId,
    date,
    stageName,
    stageStatut,
    attemptNumber
);
    console.log(`📜 Nouveau rapport de bataille : ${currentBattleLogKey}`);
}
function getNextBattleLogAttemptNumber(levelId) {
    const index = loadFromLocalStorage("BattleLogsIndex", { logs: [] });

    if (!Array.isArray(index.logs)) return 1;

    return index.logs.filter(log => {
        return String(log.stageId) === String(levelId);
    }).length + 1;
}

function registerBattleLogInIndex(key, stageId, createdAt, stageName, statut, attemptNumber = 1) {
    const index = loadFromLocalStorage("BattleLogsIndex", { logs: [] });

    if (!Array.isArray(index.logs)) {
        index.logs = [];
    }

    const alreadyExists = index.logs.some(log => log.key === key);

    if (!alreadyExists) {
        index.logs.push({
            key,
            stageId,
            stageName,
            statut,
            createdAt,
            attemptNumber
        });

        saveToLocalStorage("BattleLogsIndex", index);
    }
}
function updateCurrentBattleLogStatut(statut) {
    if (!currentBattleLogKey) return;

    const battleLogData = loadFromLocalStorage(currentBattleLogKey, null);
    if (!battleLogData) return;

    battleLogData.statut = statut;
    saveToLocalStorage(currentBattleLogKey, battleLogData);

    const index = loadFromLocalStorage("BattleLogsIndex", { logs: [] });

    if (Array.isArray(index.logs)) {
        const logIndex = index.logs.find(log => log.key === currentBattleLogKey);

        if (logIndex) {
            logIndex.statut = statut;
            saveToLocalStorage("BattleLogsIndex", index);
        }
    }
}
function saveBattleLogEntry(entry) {
    const battleLogData = loadFromLocalStorage(currentBattleLogKey, null);

    if (!battleLogData) {
        console.warn(`Aucun battleLog trouvé pour la clé : ${currentBattleLogKey}`);
        return;
    }

    if (!Array.isArray(battleLogData.entries)) {
        battleLogData.entries = [];
    }

    battleLogData.entries.push(entry);

    saveToLocalStorage(currentBattleLogKey, battleLogData);
}

export function renderCurrentBattleLog() {
    const container = document.querySelector(".battle-log-list");
    if (!container) return;

    ensureBattleLogSession();

    const battleLogData = loadFromLocalStorage(currentBattleLogKey, null);
    if (!battleLogData) return;

    container.innerHTML = "";

    if (!Array.isArray(battleLogData.entries)) return;

    battleLogData.entries.forEach(entry => {
        renderBattleLogEntry(entry);
    });
}

function renderBattleLogEntry(entry) {
    const container = document.querySelector(".battle-log-list");
    if (!container) return;

    const entryDiv = document.createElement("div");
    entryDiv.className = `battle-log-entry battle-log-${entry.type}`;
    entryDiv.textContent = `[${entry.time}] ${entry.message}`;

    container.appendChild(entryDiv);
}

export function getBattleLogsIndex() {
    return loadFromLocalStorage("BattleLogsIndex", { logs: [] });
}

export function loadBattleLogByKey(key) {
    return loadFromLocalStorage(key, null);
}

export function renderBattleBookList() {
    const listContainer = document.querySelector('.battle-book-list');
    if (!listContainer) return;

    const index = getBattleLogsIndex();
    const logs = Array.isArray(index.logs) ? normalizeBattleLogsAttempts(index.logs) : [];

    listContainer.innerHTML = "";

    if (logs.length === 0) {
        listContainer.innerHTML = `<div class="battle-book-empty">Aucun rapport disponible.</div>`;
        return;
    }

    const latestLogsByStage = getLatestBattleLogByStage(logs);

    latestLogsByStage.forEach(log => {
        const logButton = document.createElement('div');
        logButton.className = 'battle-book-log-item';
        logButton.dataset.stageId = log.stageId;
        logButton.dataset.logKey = log.key;

        const attemptsCount = logs.filter(item => String(item.stageId) === String(log.stageId)).length;
        logButton.textContent = `${log.stageName || `Stage ${log.stageId}`} - ${attemptsCount} essai${attemptsCount > 1 ? "s" : ""} - ${formatStageStatut(log.statut)} - ${formatBattleLogDate(log.createdAt)}`;

        logButton.addEventListener('click', () => {
            renderBattleBookReport(log.key);

            document.querySelectorAll('.battle-book-log-item').forEach(item => {
                item.classList.remove('active');
            });

            logButton.classList.add('active');
        });

        listContainer.appendChild(logButton);
    });

    const firstLogButton = listContainer.querySelector('.battle-book-log-item');
    if (firstLogButton) {
        firstLogButton.classList.add('active');
        renderBattleBookReport(firstLogButton.dataset.logKey);
    }
}

export function renderBattleBookReport(logKey) {
    const reportContainer = document.querySelector('.battle-book-report-content');
    if (!reportContainer) return;

    const index = getBattleLogsIndex();
    const logs = Array.isArray(index.logs) ? normalizeBattleLogsAttempts(index.logs) : [];
    const selectedLogMeta = logs.find(log => log.key === logKey);

    if (!selectedLogMeta) {
        reportContainer.innerHTML = `<div class="battle-book-empty">Rapport introuvable.</div>`;
        return;
    }

    const stageLogs = logs
        .filter(log => String(log.stageId) === String(selectedLogMeta.stageId))
        .sort(compareBattleLogAttemptsAscending);

    const selectedLogKey = logKey || stageLogs[stageLogs.length - 1]?.key;

    // Le dernier essai sera affiché en premier.
    const displayedStageLogs = [...stageLogs].reverse();

    reportContainer.innerHTML = "";

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'battle-book-attempt-tabs';

    const contentContainer = document.createElement('div');
    contentContainer.className = 'battle-book-attempt-content';

    reportContainer.appendChild(tabsContainer);
    reportContainer.appendChild(contentContainer);

    displayedStageLogs.forEach(log => {
        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.className = 'battle-book-attempt-tab';
        tabButton.dataset.logKey = log.key;
        tabButton.textContent = `Essai ${log.attemptNumber || 1}`;

        tabButton.addEventListener('click', () => {
            renderBattleBookAttempt(log.key, contentContainer);

            tabsContainer.querySelectorAll('.battle-book-attempt-tab').forEach(tab => {
                tab.classList.remove('active');
            });

            tabButton.classList.add('active');
        });

        tabsContainer.appendChild(tabButton);
    });

    const defaultTab =
        tabsContainer.querySelector(
            `.battle-book-attempt-tab[data-log-key="${cssEscape(selectedLogKey)}"]`
        ) ||
        tabsContainer.firstElementChild;

    if (defaultTab) {
        defaultTab.classList.add('active');
        renderBattleBookAttempt(defaultTab.dataset.logKey, contentContainer);
    }
}
function renderBattleBookAttempt(logKey, contentContainer) {
    const logData = loadBattleLogByKey(logKey);

    if (!logData || !Array.isArray(logData.entries)) {
        contentContainer.innerHTML = `<div class="battle-book-empty">Rapport introuvable.</div>`;
        return;
    }

    contentContainer.innerHTML = "";

    const reportHeader = document.createElement('div');
    reportHeader.className = 'battle-book-report-header';
    reportHeader.textContent = `${logData.stageName || `Stage ${logData.levelId}`} - Essai ${logData.attemptNumber || 1} - ${formatStageStatut(logData.statut)} - ${formatBattleLogDate(logData.createdAt)}`;

    contentContainer.appendChild(reportHeader);

    logData.entries.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = `battle-book-entry battle-book-${entry.type}`;
        entryDiv.textContent = `[${entry.time}] ${entry.message}`;

        contentContainer.appendChild(entryDiv);
    });
}

function normalizeBattleLogsAttempts(logs) {
    const countersByStage = {};

    return logs.map(log => {
        const stageId = String(log.stageId ?? log.levelId ?? "unknown");
        countersByStage[stageId] = (countersByStage[stageId] || 0) + 1;

        return {
            ...log,
            stageId,
            attemptNumber: Number(log.attemptNumber) || countersByStage[stageId]
        };
    });
}

function getLatestBattleLogByStage(logs) {
    const latestByStage = new Map();

    logs.forEach(log => {
        const existingLog = latestByStage.get(String(log.stageId));

        if (!existingLog || compareBattleLogAttemptsAscending(existingLog, log) < 0) {
            latestByStage.set(String(log.stageId), log);
        }
    });

    return Array.from(latestByStage.values()).sort(compareBattleLogAttemptsDescending);
}

function compareBattleLogAttemptsAscending(a, b) {
    const attemptDiff = (Number(a.attemptNumber) || 1) - (Number(b.attemptNumber) || 1);
    if (attemptDiff !== 0) return attemptDiff;

    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

function compareBattleLogAttemptsDescending(a, b) {
    return compareBattleLogAttemptsAscending(b, a);
}

function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"');
}
function logEntityBattleRegen({ entity, hpRestored } = {}) {
  const restored = Math.max(0, safeNumber(hpRestored));
  if (restored <= 0) return null;
  return `${entityLabel(entity)} : Régénération de Combat +${restored} HP.`;
}
export function resetCurrentBattleLogSession() {
    currentBattleLogKey = null;
    currentBattleLogStageId = null;
    battleLogClosed = false;
}
function logEntityMove({
  entity,
  to,
  previousRole,
  newRole,
  movementCheck = null,
} = {}) {
  const entityName = entityLabel(entity);
  const destination = to || "une position inconnue";

  const oldRole = normalizeRoleLabel(previousRole);
  const finalRole = normalizeRoleLabel(newRole);
const weight = movementCheck?.weight;
const weightText = weight?.label
  ? ` Déplacement ${String(weight.label).replace(/^Poids\s+/i, "").toLowerCase()}`
  : "";
 if (oldRole !== finalRole) {
  return `${entityName} se déplace en ${destination}${weightText} et devient un ${finalRole}.`;
}

return `${entityName} se déplace en ${destination}${weightText} et reste un ${finalRole}.`;
}

function logEntitySwapMove({
  entity,
  target,
  to,
  previousRole,
  newRole,
} = {}) {
  const entityName = entityLabel(entity);
  const targetName = entityLabel(target);
  const destination = to || "une position inconnue";

  const oldRole = normalizeRoleLabel(previousRole);
  const finalRole = normalizeRoleLabel(newRole);

  if (oldRole !== finalRole) {
    return `${entityName} échange sa place avec ${targetName} en ${destination} et devient un ${finalRole}.`;
  }

  return `${entityName} échange sa place avec ${targetName} en ${destination} et reste un ${finalRole}.`;
}
function logTrailMoveGenerated({ entity } = {}) {
  return `Trail de ${entityLabel(entity)} ! + 1 déplacement généré !`;
}
function logEntityMoveMarathon({ entity } = {}) {
  return `Marathon ! Le déplacement de ${entityLabel(entity)} est gratuit.`;
}

function normalizeRoleLabel(role) {
  if (Array.isArray(role)) return normalizeRoleLabel(role[0]);

  const value = String(role || "gueux").toLowerCase();

  const labels = {
    tank: "tank",
    mage: "mage",
    fantassin: "fantassin",
    gueux: "gueux",
    sbire: "sbire",
    lord: "lord",
    support: "support",
    invocateur: "invocateur",
  };

  return labels[value] || value;
}


function logAttackSuccess({ attacker, target, attack, damage, damageSources } = {}) {
    return `${entityLabel(attacker)} inflige ${safeNumber(damage)} dégâts ${damagePicto(damageSources)} avec ${attackLabel(attack)} sur ${entityLabel(target)}.`;
}


function logAttackMissed({ attacker, target, attack } = {}) {
    return `${entityLabel(attacker)} rate son attaque ${attackLabel(attack)} sur ${entityLabel(target)}.`;
}
function logAttackDodged({ attacker, target, attack } = {}) {
    return `${entityLabel(target)} ESQUIVE ${attackLabel(attack)} de ${entityLabel(attacker)}.`;
}
function logAttackDeadBody({ attacker, target } = {}) {
    return `${entityLabel(attacker)} attaque le cadavre de ${entityLabel(target)}. Il n'a pas eu le temps de changer de cible.`;
}

function logAttackCancelledDeadTarget({ attacker, target } = {}) {
    return `${entityLabel(attacker)} annule son attaque sur ${entityLabel(target)} : la cible est déjà morte.`;
}
function logEntityAlreadyDead({ entity } = {}) {
    return `${entityLabel(entity)} est déjà mort au début du combat.`;
}

function logEntityDeath({ entity } = {}) {
    return `${entityLabel(entity)} meurt !`;
}

function logExtraLifeUsed({ entity, lifeType, hpRestored } = {}) {
    return `${entityLabel(entity)} est tué, mais utilise ${formatLifeType(lifeType)} pour rester en vie avec ${hpRestored} PV.`;
}

function logRunawayOrderLaunched() {
    return "Ordre de fuite lancé !";
}

function logRunawaySuccess({ entity } = {}) {
    return `Fuite réussie pour ${entityLabel(entity)}.`;
}
function logBattleEscapePartial() {
    return "Au moins une entité a fui, vous survivez... pour le moment.";
}

function logBattleEscapeTotal() {
    return "Toutes vos entités ont pu fuir. Bravo à vous.";
}
function logRunawayFail({ entity } = {}) {
    return `${entityLabel(entity)} n'arrive pas à fuir, il retente sa chance !`;
}
function logLevelLoaded() {
    return "Les entités sont prêtes à se battre.";
}

function logBattleStart() {
    return "Le combat commence.";
}

function logBattleVictory() {
    return "Victoire.";
}

function logBattleDefeat() {
    return "Défaite.";
}

function logBattleEscape() {
    return "Fuite réussie.";
}
function formatLifeType(lifeType) {
    switch (lifeType) {
        case "fadedLife":
            return "une vie fanée";

        case "extraLife":
            return "une vie supplémentaire";

        case "eternalLife":
            return "une vie éternelle";

        default:
            return "une vie supplémentaire";
    }
}
function getSimpleDate() {
    const now = new Date();

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");

    return `${y}-${m}-${d}_${h}-${min}-${s}`;
}

function getSimpleTime() {
    const now = new Date();

    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");

    return `${h}:${m}:${s}`;
}

function formatBattleLogDate(dateString) {
    if (!dateString) return "date inconnue";

    return String(dateString).replace("_", " ");
}
function getCurrentStageName(levelId) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });

    const stage = gameStages.stages.find(stage => {
        return String(stage.id) === String(levelId);
    });

    return stage?.levelName || "Stage inconnu";
}

function getCurrentStageStatut(levelId) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });

    const stage = gameStages.stages.find(stage => {
        return String(stage.id) === String(levelId);
    });

    return stage?.statut || "unknown";
}

function updateBattleLogStatutFromType(type) {
    switch (type) {
        case "battle_victory":
            battleLogClosed = true;
            updateCurrentBattleLogStatut("finished");
            break;

        case "battle_defeat":
        case "battle_escape_partial":
        case "battle_escape_total":
            battleLogClosed = true;
            updateCurrentBattleLogStatut("visited");
            break;

        default:
            break;
    }
}

function formatStageStatut(statut) {
    switch (statut) {
        case "finished":
            return "Terminé";

        case "visited":
            return "En cours";

        case "unknown":
        default:
            return "Non visité";
    }
}
export function clearAllBattleLogs() {
    const index = loadFromLocalStorage("BattleLogsIndex", { logs: [] });

    if (Array.isArray(index.logs)) {
        index.logs.forEach(log => {
            if (log?.key) {
                localStorage.removeItem(log.key);
            }
        });
    }

localStorage.removeItem("BattleLogsIndex");

currentBattleLogKey = null;
currentBattleLogStageId = null;
battleLogClosed = false;

console.log("📜 Tous les battle logs ont été supprimés.");
}
function entityLabel(entity) {
    if (!entity) return "Une entité";

    const name = entity.name || "Entité";
    const nickname = entity.nickname || entity.nickName || null;

    return nickname ? `${name} - ${nickname}` : name;
}
function attackLabel(attack) {
    return (
        attack?.label ||
        attack?.displayName ||
        attack?.name ||
        attack?.dotname ||
        attack?.attackName ||
        attack?.functionName ||
        attack?.id ||
        "attaque inconnue"
    );
}

function damagePicto(damageSources = {}) {
    const pictos = [];

    if (damageSources.physical > 0 || damageSources.physicalDamage > 0) {
        pictos.push("🩸");
    }

    if (damageSources.magical > 0 || damageSources.magicalDamage > 0) {
        pictos.push("🔮");
    }

    if (damageSources.piercing > 0 || damageSources.piercingDamage > 0) {
        pictos.push("🗡️");
    }

    if (damageSources.hybrid > 0 || damageSources.hybridalDamage > 0) {
        pictos.push("⚡");
    }

    return pictos.join("");
}

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
}