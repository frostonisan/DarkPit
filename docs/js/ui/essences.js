// Essence menu and attack-card editing connected to the existing transactions.
import { cachedResourceUrl } from '../data/loaderList.js';
import { attackDetails } from '../data/attackList.js';
import { isAdminMode, loadFromLocalStorage, saveToLocalStorage } from "../storage/gameStorage.js";
import { enrichEntityStats } from "../entities/runtime.js";
import {
  ATTACK_ESSENCE_MAX_SLOTS,
  readAttackDefinitionKey,
  ensureEntityAttackInstances,
  updateEntityAttackDefinition,
} from "../combat/attackResolution.js";
import {
  buildAttackEssenceSocketPatch,
  calculateEntityLinkedEssenceAvailability,
  commitAttackEssenceEquipTransaction,
  createEssenceSpriteHTML,
  createLinkedEssenceHelperHTML,
  createEssenceurInterface,
  createEssenceurTargetOptions,
  getLinkedEssenceHelperClass,
  getAttackEssenceSocketViewModel,
  getEssenceItemDefinition,
  previewAttackEssenceEquipTransaction,
  syncEntityLinkedEssenceInventory,
} from "../items/essences.js";
import { createLinkedEssenceItem } from "../items/essenceInventory.js";
import { getStageAccess, requireSafeMenuAccess } from "../app/state.js";
import { cssEscape } from "./statistics/helpers.js";
import {
  toggleWindowInMenuMap,
  reorderMenuMapChildren,
  MenuContainerDisplayRules,
  enforceMenuDisplayRules,
  getInventoryEntityName,
} from "./navigation.js";

function PlayerEssenceur(menuIcons) {
    if (!getStageAccess().menusAllowed) return;
    if (!menuIcons) {
        console.error("⚠️ Le conteneur menuIcons est manquant !");
        return;
    }

    if (menuIcons.querySelector('.essenceur-icon')) return;

    const essenceurIconImg = document.createElement('img');
    essenceurIconImg.className = 'essenceur-icon';
    essenceurIconImg.src = cachedResourceUrl('./media/assets/ui/picto-mysticism.svg');
    essenceurIconImg.alt = 'Encensseur';
    essenceurIconImg.addEventListener('click', () => {
        toggleWindowInMenuMap('essenceur-interface', (MenuMapContainer) => {
            openEssenceurInterface(MenuMapContainer);
        });
    });

    menuIcons.appendChild(essenceurIconImg);
}

function loadEssenceurArmyA() {
    const storedArmy = loadFromLocalStorage('selectedArmyA', []);
    const usesStoredArmy = Array.isArray(storedArmy) && storedArmy.length > 0;
    const army = usesStoredArmy
        ? storedArmy
        : (Array.isArray(window.selectedArmyA) ? window.selectedArmyA : []);
    army.forEach(entite => {
        enrichEntityStats(entite);
    });

    return army;
}

function refreshVisibleEssenceurCodexEntity(entite, attack) {
    if (!entite?.id || !attack) return;

    const attackKey = String(readAttackDefinitionKey(attack) || '');
    if (!attackKey) return;

    const selector = `[data-attack-essence-sockets][data-entity-id="${cssEscape(entite.id)}"][data-attack-key="${cssEscape(attackKey)}"]`;
    const sockets = getAttackEssenceSocketViewModel(attack);

    document.querySelectorAll(selector).forEach(root => {
        root.querySelectorAll('.attack-essence-socket[data-slot-index]').forEach(dot => {
            const socket = sockets[Number(dot.dataset.slotIndex)];
            if (!socket) return;

            dot.dataset.socketId = socket.socketId || '';
            dot.dataset.color = socket.active ? socket.color : 'empty';
            dot.dataset.active = socket.active ? 'true' : 'false';
            dot.dataset.kind = socket.kind;
            dot.dataset.locked = socket.locked ? 'true' : 'false';
            dot.dataset.source = socket.source;
            dot.dataset.essenceSource = socket.essenceSource;
            dot.dataset.linkedColor = socket.linkedColor;
            dot.dataset.essenceId = socket.essenceId || '';
            dot.dataset.stat = socket.active && socket.color
                ? getEssenceItemDefinition(socket.color).statKey
                : 'attackEssenceEmpty';
            dot.dataset.hover = 'true';
            dot.tabIndex = socket.locked ? -1 : 0;
            dot.setAttribute('aria-label', `Chasse ${socket.index} ${socket.label}`);
            dot.classList.toggle('hyperco', socket.active && socket.hyperco);
            delete dot.dataset.helperText;
            delete dot.dataset.helperClass;
            if (socket.active && socket.hyperco) {
                dot.dataset.helperText = createLinkedEssenceHelperHTML(socket.color, {
                    hyperco: true,
                    entityName: getInventoryEntityName(entite),
                    attackName: attack.displayName || attack.name || attack.functionName || '',
                    slot: socket.index,
                    used: true,
                });
                dot.dataset.helperClass = getLinkedEssenceHelperClass(socket.color);
            }
            dot.innerHTML = socket.active && socket.color
                ? createEssenceSpriteHTML(socket.color, { mini: true, hyperco: socket.hyperco })
                : createEssenceSpriteHTML('', { empty: true, mini: true });
        });
    });
}

const ATTACK_ESSENCE_CARD_COLOR_LABELS = Object.freeze({
    red: 'Rouge',
    blue: 'Bleu',
    yellow: 'Jaune',
});

function findEssenceurEntityStorage(entityRef = {}) {
    const entityId = String(entityRef?.id ?? '');

    if (entityId) {
        const armyA = loadFromLocalStorage('selectedArmyA', []);
        if (Array.isArray(armyA)) {
            const entite = armyA.find(entity => String(entity?.id) === entityId);
            if (entite) {
                return {
                    entite,
                    source: 'selectedArmyA',
                    save(updatedEntity) {
                        saveToLocalStorage('selectedArmyA', armyA);
                        window.selectedArmyA = armyA;
                        if (entityRef && entityRef !== updatedEntity) Object.assign(entityRef, updatedEntity);
                    },
                };
            }
        }

        const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
        const armies = armyBData?.armies && typeof armyBData.armies === 'object'
            ? armyBData.armies
            : {};

        for (const [armyKey, armyData] of Object.entries(armies)) {
            const entities = Array.isArray(armyData?.entities)
                ? armyData.entities
                : Array.isArray(armyData)
                    ? armyData
                    : [];
            const entite = entities.find(entity => String(entity?.id) === entityId);
            if (!entite) continue;

            return {
                entite,
                source: `ArmyB:${armyKey}`,
                save(updatedEntity) {
                    if (Array.isArray(armyData?.entities)) {
                        armyBData.armies[armyKey].entities = entities;
                    } else if (Array.isArray(armyData)) {
                        armyBData.armies[armyKey] = entities;
                    }
                    saveToLocalStorage('ArmyB', armyBData);

                    if (Array.isArray(window.selectedArmyB)) {
                        const live = window.selectedArmyB.find(entity => String(entity?.id) === entityId);
                        if (live && live !== updatedEntity) Object.assign(live, updatedEntity);
                    }
                    if (entityRef && entityRef !== updatedEntity) Object.assign(entityRef, updatedEntity);
                },
            };
        }

        if (Array.isArray(window.selectedArmyA)) {
            const entite = window.selectedArmyA.find(entity => String(entity?.id) === entityId);
            if (entite) {
                return {
                    entite,
                    source: 'window.selectedArmyA',
                    save(updatedEntity) {
                        saveToLocalStorage('selectedArmyA', window.selectedArmyA);
                        if (entityRef && entityRef !== updatedEntity) Object.assign(entityRef, updatedEntity);
                    },
                };
            }
        }

        if (Array.isArray(window.selectedArmyB)) {
            const entite = window.selectedArmyB.find(entity => String(entity?.id) === entityId);
            if (entite) {
                return {
                    entite,
                    source: 'window.selectedArmyB',
                    save(updatedEntity) {
                        if (entityRef && entityRef !== updatedEntity) Object.assign(entityRef, updatedEntity);
                    },
                };
            }
        }
    }

    return {
        entite: entityRef,
        source: 'live',
        save() {},
    };
}

function findEssenceurAttackOnEntity(entite, attackKey, fallbackAttack = {}) {
    ensureEntityAttackInstances(entite, attackDetails);
    const attacks = Array.isArray(entite?.attackDetails)
        ? entite.attackDetails
        : [];
    const key = String(attackKey || readAttackDefinitionKey(fallbackAttack) || '');

    return attacks.find(attack => readAttackDefinitionKey(attack) === key)
        || attacks.find(attack => attack?.functionName === fallbackAttack?.functionName)
        || attacks.find(attack => attack?.attackId === fallbackAttack?.attackId)
        || fallbackAttack
        || null;
}

function formatAttackEssenceTransactionMissing(transaction = {}) {
    const universalMissing = transaction.universal?.missing || {};
    const linkedMissing = transaction.linked?.missing || {};
    const parts = [];

    Object.keys(ATTACK_ESSENCE_CARD_COLOR_LABELS).forEach(color => {
        if (universalMissing[color]) {
            parts.push(`${ATTACK_ESSENCE_CARD_COLOR_LABELS[color]} universelle x${universalMissing[color]}`);
        }
        if (linkedMissing[color]) {
            parts.push(`${ATTACK_ESSENCE_CARD_COLOR_LABELS[color]} liee x${linkedMissing[color]}`);
        }
    });

    return parts.join(' / ') || 'stock insuffisant';
}

async function applyAttackEssenceSocketChoice({
    entity = {},
    attack = {},
    attackKey = '',
    slotIndex = 0,
    color = '',
    essenceSource = '',
    essenceId = '',
    adminInfinite = false,
} = {}) {
    if (adminInfinite && !isAdminMode()) return { ok: false, message: 'Mode Admin requis.' };
    const storage = findEssenceurEntityStorage(entity);
    const entite = storage.entite;
    if (!entite) return { ok: false, message: 'Entite introuvable.' };

    const resolvedAttackKey = String(attackKey || readAttackDefinitionKey(attack) || '');
    const currentAttack = findEssenceurAttackOnEntity(entite, resolvedAttackKey, attack);
    const currentAttackKey = readAttackDefinitionKey(currentAttack) || resolvedAttackKey;

    if (!currentAttack || !currentAttackKey) {
        return { ok: false, message: 'Attaque introuvable.' };
    }

    // Derive availability from the saved sockets, just as the card does.
    calculateEntityLinkedEssenceAvailability(entite);
    if (adminInfinite) {
        const slot = currentAttack.essenceSlots?.[slotIndex];
        if (!slot || slot.locked || !Object.hasOwn(ATTACK_ESSENCE_CARD_COLOR_LABELS, color)) {
            return { ok: false, message: 'Châsse ou couleur invalide.' };
        }
        const items = entite.attackEssenceInventory.linkedItems;
        let item = items.find(candidate => candidate.color === color
            && (candidate.state === 'available' || candidate.id === slot.essenceId));
        if (!item) {
            item = createLinkedEssenceItem(entite.id, color, { origin: 'admin', provenanceSource: 'admin' });
            items.push(item);
        }
        essenceId = item.id;
        essenceSource = 'linked';
    }
    const socketPatch = buildAttackEssenceSocketPatch(
        currentAttack,
        slotIndex,
        color,
        essenceSource,
        entite,
        essenceId
    );

    if (!socketPatch?.patch) {
        return { ok: false, message: socketPatch?.message || 'Chasse introuvable ou verrouillee.' };
    }

    const transaction = previewAttackEssenceEquipTransaction({
        entity: entite,
        attackKey: currentAttackKey,
        previousSlots: socketPatch.previousEssenceSlots,
        nextSlots: socketPatch.nextEssenceSlots,
        stagedNextSlots: socketPatch.stagedNextEssenceSlots,
    });

    if (!transaction.ok) {
        console.warn('[EssenceLedger] Sertissage refuse.', {
            entityId: entite.id, attackKey: currentAttackKey, slotIndex, essenceId, transaction,
        });
        return {
            ok: false,
            message: transaction.message
                || `Essences manquantes : ${formatAttackEssenceTransactionMissing(transaction)}.`,
        };
    }

    const committedTransaction = commitAttackEssenceEquipTransaction({
        entity: entite,
        attackKey: currentAttackKey,
        preparedTransaction: transaction,
        previousSlots: socketPatch.previousEssenceSlots,
        nextSlots: socketPatch.nextEssenceSlots,
        stagedNextSlots: socketPatch.stagedNextEssenceSlots,
    });

    if (!committedTransaction.ok) {
        return {
            ok: false,
            message: committedTransaction.message
                || `Sertissage annule : ${formatAttackEssenceTransactionMissing(committedTransaction)}.`,
        };
    }

    const updatedAttack = updateEntityAttackDefinition(entite, currentAttackKey, {
        ...socketPatch.patch,
        essenceSlots: committedTransaction.finalNextSlots,
    }, attackDetails);
    enrichEntityStats(entite);
    const committedAttack = findEssenceurAttackOnEntity(
        entite,
        currentAttackKey,
        committedTransaction.attack || updatedAttack
    ) || committedTransaction.attack || updatedAttack;
    storage.save(entite);

    window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', {
        detail: {
            source: 'attack-card',
            entityId: entite.id,
            entite,
            attack: committedAttack,
            storage: storage.source,
        },
    }));

    refreshVisibleEssenceurCodexEntity(entite, committedAttack);

    return {
        ok: true,
        message: 'Essence sertie.',
        entity: entite,
        attack: committedAttack,
    };
}

function applyAdminAttackCardChange(entity, attack, field, value) {
    if (!isAdminMode() || !requireSafeMenuAccess() || !Number.isFinite(value) || value < 0) return false;
    if (!['essenceSlotCount', 'physicalRatio', 'magicalRatio', 'piercingRatio'].includes(field)) return false;
    const storage = findEssenceurEntityStorage(entity);
    const owner = storage.entite;
    const current = findEssenceurAttackOnEntity(owner, readAttackDefinitionKey(attack), attack);
    if (!current) return false;
    const previousValue = field === 'essenceSlotCount' ? current.essenceSlots?.length || 0 : Number(current[field]) || 0;
    if (value === previousValue) return true;
    let patch = { [field]: value };
    if (field === 'essenceSlotCount') {
        if (!Number.isInteger(value) || value > ATTACK_ESSENCE_MAX_SLOTS) return false;
        const slots = (current.essenceSlots || []).slice(0, value);
        while (slots.length < value) slots.push({
            slotId: `admin-${crypto.randomUUID()}`, kind: 'open', source: 'admin', color: null,
        });
        patch = { essenceSlots: slots };
    }
    const updated = updateEntityAttackDefinition(owner, current, patch, attackDetails);
    enrichEntityStats(owner);
    syncEntityLinkedEssenceInventory(owner);
    const committed = findEssenceurAttackOnEntity(owner, readAttackDefinitionKey(updated), updated);
    storage.save(owner);
    window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', {
        detail: { source: 'admin-attack-card', entityId: owner.id, entite: owner, attack: committed, storage: storage.source },
    }));
    refreshVisibleEssenceurCodexEntity(owner, committed);
    return true;
}

function applyEssenceurPatchToSelectedArmy({
    entityId,
    attackKey,
    patch,
    previousEssenceSlots = [],
    nextEssenceSlots = [],
    stagedNextEssenceSlots = [],
    essenceTransaction = null,
}) {
    const army = loadEssenceurArmyA();
    const entite = army.find(entity => String(entity.id) === String(entityId));

    if (!entite) {
        return { ok: false, message: 'Entite introuvable.' };
    }

    ensureEntityAttackInstances(entite, attackDetails);

    const committedTransaction = commitAttackEssenceEquipTransaction({
        entity: entite,
        attackKey,
        preparedTransaction: essenceTransaction,
        previousSlots: previousEssenceSlots,
        nextSlots: nextEssenceSlots,
        stagedNextSlots: stagedNextEssenceSlots,
    });

    if (!committedTransaction.ok) {
        return {
            ok: false,
            message: committedTransaction.message
                || `Sertissage annule : ${formatAttackEssenceTransactionMissing(committedTransaction)}.`,
        };
    }

    const updatedAttack = updateEntityAttackDefinition(entite, attackKey, {
        ...patch,
        essenceSlots: committedTransaction.finalNextSlots,
    }, attackDetails);
    enrichEntityStats(entite);
    const committedAttack = findEssenceurAttackOnEntity(
        entite,
        attackKey,
        committedTransaction.attack || updatedAttack
    ) || committedTransaction.attack || updatedAttack;
    saveToLocalStorage('selectedArmyA', army);
    window.selectedArmyA = army;

    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', {
        detail: {
            source: 'essenceur',
            entityId: entite.id,
            entite,
            attack: committedAttack,
        },
    }));

    refreshVisibleEssenceurCodexEntity(entite, committedAttack);

    const range = Array.isArray(committedAttack.attackRange)
        ? committedAttack.attackRange.join(' + ')
        : String(committedAttack.attackRange || '');
    const nature = Array.isArray(committedAttack.attacknature)
        ? committedAttack.attacknature.join(' + ')
        : String(committedAttack.attacknature || '');

    return {
        ok: true,
        message: `Sauvegarde : ${range || 'portee'} / ${nature || 'nature'}.`,
        essenceTransactionCommitted: true,
        entity: entite,
        attack: committedAttack,
    };
}

function openEssenceurInterface(MenuMapContainer = null) {
    if (!requireSafeMenuAccess()) return;
    const GameUiContainer = document.querySelector('.Game-UI');
    if (!GameUiContainer) return console.error("⚠️ '.Game-UI' introuvable.");

    let targetContainer = MenuMapContainer || GameUiContainer.querySelector('.menu-map-container');
    if (!targetContainer) {
        targetContainer = document.createElement('div');
        targetContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(targetContainer);
    }

    const army = loadEssenceurArmyA();
    const essenceurInterface = createEssenceurInterface({
        targets: createEssenceurTargetOptions(army, attackDetails),
        onApply: applyEssenceurPatchToSelectedArmy,
        onClose: (node) => {
            node.remove();
            requestAnimationFrame(() => {
                if (targetContainer.children.length === 0) {
                    targetContainer.remove();
                }
                MenuContainerDisplayRules();
            });
        },
    });

    targetContainer.appendChild(essenceurInterface);
    reorderMenuMapChildren();
    MenuContainerDisplayRules();
    enforceMenuDisplayRules();
}

export { PlayerEssenceur, openEssenceurInterface, applyAttackEssenceSocketChoice, applyAdminAttackCardChange };
