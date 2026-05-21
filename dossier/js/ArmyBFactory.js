import { generateUniqueID, assignUniqueIDToEntities, enrichEntityStats } from './entites.js';
import { loadFromLocalStorage, saveToLocalStorage } from './GameStorage.js';
import { createEntiteInDOM } from './createEntity.js';
import { entitesNestUp, entites } from './entites.js';


import { toggleScanEntityListener } from './ui.js';
import { updateRoleInDOM, updateGlobalRoleSbire, TraitementRolesSbires, observeRoleChanges, determineClasse, positionnerEntites } from './load-entity.js';

function assignEntityLevel(power) {
    const powerLevelRanges = [
        { minPower: 1, maxPower: 5, minLevel: 1, maxLevel: 10 },
        { minPower: 6, maxPower: 10, minLevel: 5, maxLevel: 15 },
        { minPower: 11, maxPower: 15, minLevel: 10, maxLevel: 20 },
        { minPower: 16, maxPower: 20, minLevel: 15, maxLevel: 25 },
        { minPower: 21, maxPower: 25, minLevel: 20, maxLevel: 30 },
        { minPower: 26, maxPower: 30, minLevel: 25, maxLevel: 35 },
        { minPower: 31, maxPower: 35, minLevel: 30, maxLevel: 40 },
        { minPower: 36, maxPower: 40, minLevel: 35, maxLevel: 45 },
        { minPower: 41, maxPower: 50, minLevel: 40, maxLevel: 50 },
    ];

    const selectedRange = powerLevelRanges.find(range => power >= range.minPower && power <= range.maxPower);

    if (!selectedRange) {
        console.error("Aucune plage de niveaux trouvée pour le Power donné.");
        return null;
    }

    return Math.floor(Math.random() * (selectedRange.maxLevel - selectedRange.minLevel + 1) + selectedRange.minLevel);
}

export function selectRandomEntitiesForSideB(entitesNestUp, totalPoints, moyennePower, maxUtilisation, pourcentage_variation, difficulte, lordcount) {
    const adjustedTotalPoints = Math.max(1, totalPoints + difficulte);
    const adjustedMoyenneNiveau = Math.max(1, moyennePower + difficulte);

    const maxAllowedPoints = adjustedTotalPoints * 1.15;
    const minAllowedPoints = adjustedTotalPoints * 0.85;
    const maxAllowedMoyenne = adjustedMoyenneNiveau * 1.15;
    const minAllowedMoyenne = adjustedMoyenneNiveau * 0.85;

    let entitesWithIds = entitesNestUp.map((entite, index) => ({
        ...entite,
        id: entite.id || index
    }));

    let selectedEntitiesB = [];
    let entityUsageCount = {};

    let minLevel = Math.floor(adjustedMoyenneNiveau * (1 - pourcentage_variation / 100));
    let maxLevel = Math.ceil(adjustedMoyenneNiveau * (1 + pourcentage_variation / 100));

    let lords = entitesWithIds.filter(entite => entite.type === 'lord');
    let otherEntities = entitesWithIds.filter(entite => entite.type === 'sbire');

    const currentStageId = window.currentStageId;
    if (!currentStageId) {
        console.error("currentStageId est indéfini.");
        return [];
    }

    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const existingArmyB = armyBData.armies[`ArmyB_${currentStageId}`];

    if (existingArmyB) {
        console.log(`Armée B (${currentStageId}) détectée avec la même ID que le stage. L'armée est donc chargée directement depuis le local storage.`);
        return existingArmyB.entities;
    } else {
        console.log(`Armée B (${currentStageId}) non détectée avec la même ID que le stage. L'armée est donc générée et sauvegardée dans le local storage avec l'ID du stage (${currentStageId}).`);
    }

    function selectLordsForSideB() {
        let lordsFiltres = lords.filter(lord => {
            if (!entityUsageCount[lord.id]) entityUsageCount[lord.id] = 0;
            return lord.power >= minLevel && lord.power <= maxLevel && entityUsageCount[lord.id] < maxUtilisation;
        });

        lordsFiltres.sort((a, b) => Math.abs(a.power - adjustedMoyenneNiveau) - Math.abs(b.power - adjustedMoyenneNiveau));

        for (let i = 0; i < lordcount && lordsFiltres.length > 0; i++) {
            let selectedLord = lordsFiltres.shift();
            entityUsageCount[selectedLord.id]++;

            let newLordEntity = { ...selectedLord, id: generateUniqueID(), side: 'B' };
            newLordEntity.level.current = assignEntityLevel(newLordEntity.power);

            // **Application des stats bonus**
            newLordEntity = enrichEntityStats(newLordEntity);

            selectedEntitiesB.push(newLordEntity);

            console.log(`Sélectionné LORD Côté B : ${newLordEntity.name}, Niveau : ${newLordEntity.level.current}, Power : ${newLordEntity.power}, HP : ${newLordEntity.stats.HP}, ID: ${newLordEntity.id}`);
        }
    }

    function addEntitiesForSideB() {
        let totalLevel = selectedEntitiesB.reduce((acc, entity) => acc + entity.power, 0);

        let sortedEntities = otherEntities.sort((a, b) => Math.abs(a.power - adjustedMoyenneNiveau) - Math.abs(b.power - adjustedMoyenneNiveau));

        while (totalLevel < maxAllowedPoints) {
            let entityAdded = false;

            for (let entite of sortedEntities) {
                if (!entityUsageCount[entite.id]) entityUsageCount[entite.id] = 0;

                if (entityUsageCount[entite.id] < maxUtilisation) {
                    let newEntity = { ...entite, id: generateUniqueID(), side: 'B' };
                    newEntity.level.current = assignEntityLevel(newEntity.power);

                    let currentMoyenne = (totalLevel + newEntity.power) / (selectedEntitiesB.length + 1);

                    if (currentMoyenne <= maxAllowedMoyenne && totalLevel + newEntity.power <= maxAllowedPoints) {
                        // **Application des stats bonus**
                        newEntity = enrichEntityStats(newEntity);

                        selectedEntitiesB.push(newEntity);
                        totalLevel += newEntity.power;
                        entityUsageCount[entite.id]++;
                        entityAdded = true;

                        console.log(`Ajouté : ${newEntity.name}, Power : ${newEntity.power}, Level : ${newEntity.level.current}, HP : ${newEntity.stats.HP}, Côté B`);

                        if (currentMoyenne >= minAllowedMoyenne && currentMoyenne <= maxAllowedMoyenne) {
                            break;
                        }
                    }
                }
            }

            if (!entityAdded) {
                console.warn('Aucune entité supplémentaire trouvée pour respecter le total des points.');
                break;
            }
        }
    }

    selectLordsForSideB();
    addEntitiesForSideB();

       const armyBId = `ArmyB_${currentStageId}`;
    armyBData.armies[armyBId] = {
        ArmyB_id: armyBId,
        entities: selectedEntitiesB
    };
    saveToLocalStorage('ArmyB', armyBData);

    console.log(`ArmyB sauvegardée avec l'ID ${armyBId}`);
    return selectedEntitiesB;
}

export function selectScriptedEntitiesForSideB(entitesNestUp) {
    const currentStageId = window.currentStageId;
    if (!currentStageId) {
        console.error("currentStageId est indéfini.");
        return [];
    }

    // Vérifie s'il existe déjà une sauvegarde
    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const existingArmyB = armyBData.armies[`ArmyB_${currentStageId}`];

    if (existingArmyB && Array.isArray(existingArmyB.entities)) {
        console.log(`🔄 Chargement direct des entités sauvegardées (ArmyB_${currentStageId}).`);
        return existingArmyB.entities;
    }

    // Aucune sauvegarde, génération scriptée
    let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    let stage = gameStageData.stages.find(stage => stage.id === currentStageId);

    if (!stage || !stage.scripted_entites) {
        console.error("Aucune donnée d'entités scriptées trouvée pour ce stage.");
        return [];
    }

    let selectedEntitiesB = [];

    function createEntityFromSerial(serial, level, type) {
        let entity = entitesNestUp.find(entite => entite.serial === serial);
        if (entity) {
            let newEntity = { 
                ...entity, 
                id: generateUniqueID(), 
                side: 'B', 
                level, 
                type 
            };
            newEntity = enrichEntityStats(newEntity);
            selectedEntitiesB.push(newEntity);
            console.log(`Scripted ${type.toUpperCase()} : ${newEntity.name}, Niveau : ${level}, ID: ${newEntity.id}`);
        } else {
            console.warn(`Aucune entité trouvée pour le serial ${serial}`);
        }
    }

    stage.scripted_entites.sbires.forEach(sbire => createEntityFromSerial(sbire.serial, sbire.level.current, 'sbire'));
    stage.scripted_entites.lords.forEach(lord => createEntityFromSerial(lord.serial, lord.level.current, 'lord'));

const armyBId = `ArmyB_${window.currentStageId}`; // L'ID exact du niveau en cours

// Stocke DIRECTEMENT en tableau pour éviter tout autre problème
armyBData[armyBId] = selectedEntitiesB;
armyBData.armies[armyBId] = {
    ArmyB_id: armyBId,
    entities: selectedEntitiesB
};
saveToLocalStorage('ArmyB', armyBData);

console.log(`✅ ArmyB scriptée sauvegardée avec l'ID ${armyBId}`);

    console.log(`✅ ArmyB scriptée sauvegardée avec l'ID ${armyBId}`);

    return selectedEntitiesB;
}


function getFocusedEntityIdFromDOM() {
    // 1) Cas principal : l’hex focus contient la box entité
    const box = document.querySelector('.hex.focused .entite-box[id^="Box_Entite_"]');
    if (box?.id) return box.id.replace('Box_Entite_', '');

    // 2) Fallback : certains de tes éléments focus ont un id suffixé _{id}
    const fallback = document.querySelector(
        '[id^="spriteContainer_"].focused, [id^="TargetInfos_"].focused'
    );
    if (fallback?.id) {
        const m = fallback.id.match(/_(\d+)$/);
        if (m) return m[1];
    }

    return null;
}
export function removeEntiteIngame(entiteId) {
    if (!entiteId) return false;

    const box = document.getElementById(`Box_Entite_${entiteId}`);
    const hex = box ? box.closest('.hex') : null;

    // ✅ Libère la case
    if (hex) {
        hex.classList.remove('occupied', 'focused');

        // Si tu utilises un data d’occupation, on le nettoie (optionnel)
        if (hex.dataset.occupiedBy === entiteId) delete hex.dataset.occupiedBy;

        // Remet le socle "normal"
        const socle = hex.querySelector('.socle');
        if (socle) {
            socle.style.opacity = '';
            socle.style.filter = '';
        }
    }

    // ✅ Nettoie les focus descendants liés à cette entité
    const spriteContainer = document.getElementById(`spriteContainer_${entiteId}`);
    if (spriteContainer) {
        spriteContainer.classList.remove('focused');
        spriteContainer.querySelectorAll('.focused').forEach(n => n.classList.remove('focused'));
    }
    const targetInfos = document.getElementById(`TargetInfos_${entiteId}`);
    if (targetInfos) targetInfos.classList.remove('focused');

    // ✅ Supprime du DOM
    if (box) box.remove();

    // ✅ Supprime de la liste globale
    const idx = entites.findIndex(e => String(e.id) === String(entiteId));
    if (idx !== -1) entites.splice(idx, 1);

    return true;
}
export function enableDeleteKeyForFocusedEntity() {
    // évite d'ajouter 20 fois le listener si la fonction est rappelée
    if (window.__deleteKeyBound) return;
    window.__deleteKeyBound = true;

    document.addEventListener('keydown', (e) => {
        // Ignore si on tape dans un champ
        const ae = document.activeElement;
        const isTyping =
            ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
        if (isTyping) return;

        // Touche Suppr
        const isDelete = (e.key === 'Delete' || e.code === 'Delete' || e.keyCode === 46);
        if (!isDelete) return;

        const entiteId = getFocusedEntityIdFromDOM();
        if (!entiteId) return;

        e.preventDefault();
        removeEntiteIngame(entiteId);
    });
}

export async function spawnEntiteIngame(newEntite) {
    console.log(`🛠 spawnEntiteIngame appelé pour ID: ${newEntite.id}, Position: ${newEntite.position}`);
    console.trace(); 

    // 🚨 Annulation si l'ID existe déjà
    if (entites.some(e => e.id === newEntite.id)) {
        console.warn(`⚠️ Annulation : Entité ${newEntite.id} existe déjà.`);
        return;
    }

    // 🚨 Annulation si la position est undefined
    if (!newEntite.position) {
        console.warn(`⚠️ Annulation : Position indéfinie pour l'entité ${newEntite.id}.`);
        return;
    }

newEntite.id = newEntite.id || generateUniqueID();

// 🩸 Normalisation HP
if (typeof newEntite.stats.HP === 'number') {
    newEntite.stats.HP = { current: newEntite.stats.HP, max: newEntite.stats.HP };
} else if (typeof newEntite.stats.HP !== 'object' || newEntite.stats.HP === null) {
    newEntite.stats.HP = { current: 1, max: 1 }; // fallback de secours
} else {
    newEntite.stats.HP.current = newEntite.stats.HP.max;
}

// 💖 Normalisation extraLife
if (typeof newEntite.stats.extraLife === 'number') {
    newEntite.stats.extraLife = { current: newEntite.stats.extraLife, max: newEntite.stats.extraLife };
} else if (typeof newEntite.stats.extraLife === 'undefined') {
    newEntite.stats.extraLife = { current: 0, max: 0 };
} else if (!('current' in newEntite.stats.extraLife) || !('max' in newEntite.stats.extraLife)) {
    console.warn(`⚠️ Annulation : extraLife mal définis pour ${newEntite.id}.`);
    return;
}

    determineClasse(newEntite);

    TraitementRolesSbires(newEntite);
    createEntiteInDOM(newEntite);
    updateGlobalRoleSbire(newEntite);
    observeRoleChanges(newEntite);
    toggleScanEntityListener();

    setTimeout(() => {
		const extralifeElement = document.getElementById(`extraLife_${newEntite.id}`);
if (extralifeElement && newEntite.stats.extraLife.max === 0) {
    extralifeElement.style.display = 'none';
}
        const spawnedElement = document.getElementById(`Box_Entite_${newEntite.id}`);
        if (!spawnedElement) {
            console.error('Impossible de trouver l\'élément créé pour l\'entité.');
            return;
        }

        entites.push(newEntite);

        positionnerEntites(newEntite);

        const targetHex = spawnedElement.closest('.hex');
        if (targetHex) {
            console.log(`Entité ${newEntite.id} placée dans la case ${targetHex.getAttribute('data-position')}`);

            const socle = targetHex.querySelector('.socle');
            if (socle) {
                socle.style.opacity = '1';
            }
        } else {
            console.error('Aucune case hex trouvée après le positionnement.');

            // 🔥 Supprime l'entité si aucune case n'est disponible
            const entiteIndex = entites.findIndex(e => e.id === newEntite.id);
            if (entiteIndex !== -1) {
                entites.splice(entiteIndex, 1);
            }
            const entiteElement = document.getElementById(`Box_Entite_${newEntite.id}`);
            if (entiteElement) {
                entiteElement.remove();
            }

            const existingAlert = document.querySelector('.Game-UI .IngameAlert');
            if (!existingAlert) {
                const alertDiv = document.createElement('div');
                alertDiv.className = 'IngameAlert';
                alertDiv.textContent = 'Plus de places disponibles sur le board !';

                const gameUI = document.querySelector('.Game-UI');
                if (gameUI) {
                    gameUI.appendChild(alertDiv);
                } else {
                    console.error('Élément .Game-UI non trouvé pour afficher l\'alerte.');
                }

                setTimeout(() => {
                    alertDiv.remove();
                }, 3000);
            }
        }
    }, 50);

    return { spawnId: newEntite.id };
}

export function selectAdminEntitiesForSideB(entitesNestUp) {
    const currentStageId = window.currentStageId;
    if (!currentStageId) {
        console.error("currentStageId est indéfini.");
        return { A: [], B: [] };
    }

    const gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const stage = gameStageData.stages.find(s => String(s.id) === String(currentStageId));

    if (!stage || stage.level_type !== 'admin') {
        console.error("Aucune donnée de stage admin trouvée.");
        return { A: [], B: [] };
    }

    const selectedEntitiesA = [];
    const selectedEntitiesB = [];

    // ✅ Nettoie ancien panneau + ancien interceptor
    const existingForm = document.getElementById('admin-entity-form');
    if (existingForm) existingForm.remove();

    if (window.__adminDropInterceptor) {
        document.removeEventListener('drop', window.__adminDropInterceptor, true);
        window.__adminDropInterceptor = null;
    }

    const form = document.createElement('form');
    form.id = 'admin-entity-form';
    form.dataset.activeSide = 'A';
    form.innerHTML = `<h3>Sélectionner les entités (Admin)</h3>`;

    // ✅ Tabs Side A / Side B
    const tabs = document.createElement('div');
    tabs.id = 'admin-side-tabs';
    tabs.style.display = 'flex';
    tabs.style.gap = '8px';
    tabs.style.marginBottom = '8px';

    const tabA = document.createElement('button');
    tabA.type = 'button';
    tabA.textContent = 'Side A';

    const tabB = document.createElement('button');
    tabB.type = 'button';
    tabB.textContent = 'Side B';

    const setActiveSide = (side) => {
        form.dataset.activeSide = side;
        tabA.classList.toggle('active', side === 'A');
        tabB.classList.toggle('active', side === 'B');
    };

    tabA.addEventListener('click', () => setActiveSide('A'));
    tabB.addEventListener('click', () => setActiveSide('B'));

    tabs.appendChild(tabA);
    tabs.appendChild(tabB);
    setActiveSide('A');

    // ✅ Liste draggable (DIVs)
    const list = document.createElement('div');
    list.id = 'admin-entity-list';
list.classList.add('admin-entity-list');

    const selectedBaseSet = new Set(); // sélection au clic (pour bouton)

    const spawnBtn = document.createElement('button');
    spawnBtn.type = 'button';
    spawnBtn.textContent = 'Ajouter Entités Sélectionnées';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fermer';
closeBtn.addEventListener('click', () => {
    // ✅ Ferme le panneau
    form.remove();

    // ✅ Nettoie l'interceptor (comme avant)
    if (window.__adminDropInterceptor) {
        document.removeEventListener('drop', window.__adminDropInterceptor, true);
        window.__adminDropInterceptor = null;
    }

    // ✅ Affiche le bouton "Admin" pour rouvrir
    showAdminLauncherButton();
});

const showAdminLauncherButton = () => {
    if (document.getElementById('admin-open-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'admin-open-btn';
    btn.type = 'button';
    btn.textContent = 'Admin';
	btn.className = 'admin-open-btn';

    btn.addEventListener('click', () => {
        btn.remove();
        // 🔁 Recréation complète du panel (re-run du code)
        selectAdminEntitiesForSideB(window.__adminEntitesNestUpCache || entitesNestUp);
    });

    document.body.appendChild(btn);
};

    form.appendChild(tabs);
    form.appendChild(list);
    form.appendChild(spawnBtn);
    form.appendChild(closeBtn);
    document.body.appendChild(form);

    // ✅ Helpers side
    const sideToHexClass = (side) => (side === 'A' ? 'SideA' : 'SideB');

    const getAvailableHexForSide = (side) => {
        const sideClass = sideToHexClass(side);
        return (
            document.querySelector(`.hex.${sideClass}:not(.occupied)`) ||
            document.querySelector(`.hex.Neutral:not(.occupied)`) ||
            document.querySelector(`.hex:not(.occupied)`)
        );
    };

    // (optionnel mais utile pour ton pipeline DOM)
    const prepareHexForSide = (hex, side) => {
        if (!hex) return;
        hex.classList.remove('SideA', 'SideB');
        hex.classList.add(sideToHexClass(side));
        hex.dataset.side = side;
    };

    const spawnEntity = (entityBase, side, forcedPosition = null) => {
        let newEntity = {
            ...entityBase,
            id: generateUniqueID(),
            side, // ✅ A/B
            level: entityBase.level?.current || entityBase.level || 1,
            position: forcedPosition || null
        };

        newEntity = enrichEntityStats(newEntity);

        if (!newEntity.position) {
            const hex = getAvailableHexForSide(side);
            if (!hex) {
                console.warn("⚠️ Plus de places disponibles sur le board !");
                return null;
            }
            newEntity.position = hex.dataset.position;
        }

        const hex = document.querySelector(`.hex[data-position="${newEntity.position}"]`);
        if (hex) prepareHexForSide(hex, side);

        if (!entites.some(e => e.id === newEntity.id)) {
            spawnEntiteIngame(newEntity);

            if (side === 'A') selectedEntitiesA.push(newEntity);
            else selectedEntitiesB.push(newEntity);

            return newEntity;
        }

        return null;
    };

    // ✅ Build list + dragstart (payload robuste via text/plain)
    entitesNestUp.forEach(entity => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row';
        row.draggable = true;
row.className = 'admin-entity-row';
      

        const label = document.createElement('span');
        label.textContent = `${entity.name}`;

        const lvl = document.createElement('span');
        lvl.style.opacity = '0.7';
        lvl.textContent = `Lv ${entity.level?.current ?? entity.level ?? 1}`;

        row.appendChild(label);
        row.appendChild(lvl);

        const baseRaw = JSON.stringify(entity);

        row.addEventListener('click', () => {
            if (selectedBaseSet.has(baseRaw)) {
                selectedBaseSet.delete(baseRaw);
                row.style.outline = '';
            } else {
                selectedBaseSet.add(baseRaw);
                row.style.outline = '2px solid rgba(255,255,255,0.35)';
            }
        });

        row.addEventListener('dragstart', (event) => {
            const side = form.dataset.activeSide || 'A';

            // 🔥 Préfixe simple => détectable partout
            const adminPayload = {
                __adminSpawn: 1,
                side,
                entity
            };
            const raw = 'ADMIN_SPAWN:' + JSON.stringify(adminPayload);

            // ✅ text/plain est le plus fiable (Firefox inclus)
            event.dataTransfer.setData('text/plain', raw);

            // bonus : certains codes lisent application/json
            event.dataTransfer.setData('application/json', JSON.stringify({ ...entity, side }));

            event.dataTransfer.effectAllowed = 'copy';
            console.log(`🚀 Drag Start - ${entity.name} -> Side ${side}`);
        });

        list.appendChild(row);
    });

    // ✅ Spawn via bouton (side = onglet actif)
    spawnBtn.addEventListener('click', () => {
        const side = form.dataset.activeSide || 'A';

        [...selectedBaseSet].forEach(raw => {
            const entityBase = JSON.parse(raw);
            const created = spawnEntity(entityBase, side);
            if (created) console.log(`🛠 Entité créée via bouton sur ${created.position} (Side ${side})`);
        });

        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
    });

    // ✅ Intercepteur GLOBAL en capture (bypass dragndrop.js)
    const adminDropInterceptor = (event) => {
        // uniquement si form admin ouverte + level admin
        if (window.levelRunning !== 'admin') return;
        if (!document.getElementById('admin-entity-form')) return;

        const hex = event.target?.closest?.('.hex');
        if (!hex) return;

        const txt = event.dataTransfer?.getData?.('text/plain') || '';
        if (!txt.startsWith('ADMIN_SPAWN:')) return;

        event.preventDefault();
        event.stopImmediatePropagation(); // 🔥 empêche dragndrop.js de traiter ce drop

        let payload;
        try {
            payload = JSON.parse(txt.replace('ADMIN_SPAWN:', ''));
        } catch (e) {
            console.error("❌ ADMIN_SPAWN payload invalide :", txt);
            return;
        }

        const side = payload.side || (form.dataset.activeSide || 'A');
        const entityBase = payload.entity;

        prepareHexForSide(hex, side);

        const created = spawnEntity(entityBase, side, hex.dataset.position);
        if (created) {
            console.log(`🔥 Admin drop: ${created.name} -> Side ${side} @ ${created.position} (ID: ${created.id})`);
        }

        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
    };

    window.__adminDropInterceptor = adminDropInterceptor;
    document.addEventListener('drop', adminDropInterceptor, true);

    return { A: selectedEntitiesA, B: selectedEntitiesB };
}
