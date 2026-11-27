let isSuspendedByCaptcha = false;
let turnstileWidgetId = null;
let rawClickCount = 0;
let validClicksThisSecond = 0;
let lastValidClickTimestamp = 0;
const MIN_CLICK_INTERVAL_MS = 1000 / 15;
let overLimitSecondsStreak = 0;

function getDrillImage(drill) {
    if (!drill) return '';
    const template = game.drillTemplates[drill.tier];
    return (template && template.image) || drill.image || '';
}

let lastAppliedPickaxeTier = -1;

function updatePickaxeCursor(force = false) {
    if (!force && lastAppliedPickaxeTier === game.pickaxeTier) return;
    lastAppliedPickaxeTier = game.pickaxeTier;

    const cursorData = (game.pickaxeCursors && game.pickaxeCursors[game.pickaxeTier])
        || { src: "/public/StonePickaxe.png", x: 10, y: 4 };
    const cursorValue = `url('${cursorData.src}') ${cursorData.x} ${cursorData.y}, auto`;

    document.documentElement.style.setProperty('--pickaxe-cursor', cursorValue);
    document.documentElement.style.cursor = cursorValue;
    document.body.style.cursor = cursorValue;
}
window.updatePickaxeCursor = updatePickaxeCursor;

function getDrillModulesKey(drill) {
    const m = (drill && drill.modules) || {};
    return `${m.electricite ? '1' : '0'}-${m.solidite ? '1' : '0'}`;
}

function renderDrillModulesBadges(drill) {
    if (!drill || !drill.modules) return '';
    let html = '';
    if (drill.modules.electricite) {
        html += `<img src="${game.moduleTemplates.electricite.image}" alt="Module Électricité" title="Module d'Électricité (-33% conso élec)" class="module-badge-icon">`;
    }
    if (drill.modules.solidite) {
        html += `<img src="${game.moduleTemplates.solidite.image}" alt="Module Solidité" title="Module de Solidité (50% sans perte dura)" class="module-badge-icon">`;
    }
    return html ? `<span class="drill-modules-badges">${html}</span>` : '';
}

function getGlobalDrillCost() {
    const currentTemplate = game.drillTemplates[game.unlockedDrillTier];
    let totalOwned = game.inventory.filter(d => d.tier === game.unlockedDrillTier).length;
    game.phases.forEach(p => {
        totalOwned += p.activeDrills.filter(d => d.tier === game.unlockedDrillTier).length;
    });
    const x = totalOwned + 1;
    const multiplier = (game.unlockedDrillTier + 1) * 1.5; 
    return Math.floor(currentTemplate.costBase + multiplier * Math.pow(x - 1, 5));
}

function getPhaseBgImage(phase) {
    if (phase && Array.isArray(phase.displays) && phase.displays.length > 0) {
        const idx = (phase.selectedDisplay >= 0 && phase.selectedDisplay < phase.displays.length)
            ? phase.selectedDisplay
            : 0;
        return phase.displays[idx].bgImage;
    }
    return (phase && phase.bgImage) || "/public/background2.png";
}

function setPhaseDisplay(phaseId, displayIndex) {
    const phase = game.phases.find(p => p.id === phaseId);
    if (!phase || !phase.unlocked || !Array.isArray(phase.displays) || !phase.displays[displayIndex]) return;
    if (phase.selectedDisplay === displayIndex) return;

    phase.selectedDisplay = displayIndex;
    const newSrc = phase.displays[displayIndex].bgImage;

    const imgEl = document.getElementById(`image-phase-${phaseId}`);
    if (imgEl) {
        imgEl.style.opacity = '0';
        setTimeout(() => {
            const restoreOpacity = () => {
                imgEl.style.opacity = '';
            };
            imgEl.onload = restoreOpacity;
            imgEl.setAttribute('src', newSrc);
            if (imgEl.complete) {
                restoreOpacity();
            }
        }, 220);
    }

    const row = document.getElementById(`phase-${phaseId}`);
    if (row) {
        row.querySelectorAll('.display-opt-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === displayIndex);
        });
    }

    saveGameToServer();
}
window.setPhaseDisplay = setPhaseDisplay;

function initPhases() {
    phasesContainer.innerHTML = '';
    game.phases.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = `phase-row ${p.unlocked ? '' : 'locked'}`;
        row.id = `phase-${p.id}`;

        let displaySwitcherHtml = '';
        if (Array.isArray(p.displays) && p.displays.length > 1) {
            const activeIdx = (p.selectedDisplay >= 0 && p.selectedDisplay < p.displays.length) ? p.selectedDisplay : 0;
            const buttonsHtml = p.displays.map((disp, dIdx) => `
                <button type="button"
                        class="display-opt-btn ${dIdx === activeIdx ? 'active' : ''}"
                        onclick="setPhaseDisplay(${p.id}, ${dIdx})"
                        ${p.unlocked ? '' : 'disabled'}>
                    ${disp.name}
                </button>
            `).join('');
            displaySwitcherHtml = `
                <div class="phase-display-switcher" id="phase-display-switcher-${p.id}" onclick="event.stopPropagation()">
                    ${buttonsHtml}
                </div>
            `;
        }
        
        row.innerHTML = `
            <div class="phase-header" style="cursor: pointer;" onclick="togglePhaseContent(${p.id})">
                <div>
                    <span class="phase-name" id="phase-title-text-${p.id}">${p.name}</span>
                    <span class="phase-blocks">(${p.blocks})</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${displaySwitcherHtml}
                    <div id="phase-unlock-status-${p.id}">
                        ${p.unlocked ? '' : `<button type="button" class="btn-mini btn-action-deploy" id="unlock-phase-btn-${p.id}" disabled>Débloquer (${formatMoney(p.reqMoney)} $)</button>`}
                    </div>
                </div>
            </div>
            <div class="phase-controls" id="controls-${p.id}" style="display: none;">
                <div class="drill-buy-zone">
                    <button class="btn btn-action-deploy" id="deploy-to-${p.id}" ${p.unlocked ? '' : 'disabled'}>
                        ⚙️ Déployer un Drill
                    </button>
                </div>
                <div class="drill-stats-zone">
                    <div class="stat-item">Drills Actifs: <span id="drill-count-${p.id}">0</span></div>
                    <div class="stat-item">Puissance totale: <span id="drill-power-${p.id}">0</span></div>
                    <div class="stat-item">Résistance: <span>${formatMoney(p.baseResist)}</span></div>
                    <div class="stat-item" id="phase-reward-${p.id}">Gain/Bloc: <span>${formatMoney(p.reward)} $</span></div>
                </div>
            </div>  
            <div id="deployed-list-${p.id}" class="drill-deployed-list" style="display: none;"></div>
            <div style="margin-top: 5px;">
                <div style="font-size:0.8rem; margin-bottom:2px;">Progression Minage :</div>
                <div class="progress-container" id="progress-area-${p.id}">
                    <div class="progress-bar" id="drill-progress-${p.id}"></div>
                    <div class="bar-text" id="drill-progress-text-${p.id}">0%</div>
                </div>
            </div>
            <img id="image-phase-${p.id}" src="${getPhaseBgImage(p)}" alt="Fond phases" class="phase-bg-img">
        `;
        phasesContainer.appendChild(row);
        const unlockBtn = document.getElementById(`unlock-phase-btn-${p.id}`);
        if (unlockBtn) {
            unlockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                unlockPhase(p.id);
            });
        }
        document.getElementById(`deploy-to-${p.id}`).addEventListener('click', (e) => {
            e.stopPropagation();
            openDeploymentMenu(p.id)
        });
    });
    updateCosts();
}

let currentDeployPhaseId = null;
let selectedDrillUids = new Set();

function renderDeploymentGrid() {
    const grid = document.getElementById('deployment-drills-grid');
    if (!grid) return;

    const primarySortEl = document.getElementById('deploy-sort-primary');
    const secondarySortEl = document.getElementById('deploy-sort-secondary');
    const primarySort = primarySortEl ? primarySortEl.value : 'tier-desc';
    const secondarySort = secondarySortEl ? secondarySortEl.value : 'none';

    const deployableDrills = game.inventory.filter(d => !d.isHS);

    deployableDrills.sort((a, b) => {
        // 1. Tri principal par Tier
        if (primarySort === 'tier-desc' && b.tier !== a.tier) {
            return (b.tier ?? 0) - (a.tier ?? 0);
        }
        if (primarySort === 'tier-asc' && a.tier !== b.tier) {
            return (a.tier ?? 0) - (b.tier ?? 0);
        }

        // 2. Tri secondaire (Dura, Élec ou Aucun)
        const duraA = a.dura ?? 0;
        const duraB = b.dura ?? 0;
        const elecA = a.elec ?? 0;
        const elecB = b.elec ?? 0;

        switch (secondarySort) {
            case 'dura-desc':
                return duraB - duraA;
            case 'dura-asc':
                return duraA - duraB;
            case 'elec-desc':
                return elecB - elecA;
            case 'elec-asc':
                return elecA - elecB;
            default:
                return 0;
        }
    });

    grid.innerHTML = '';

    deployableDrills.forEach((d) => {
        const card = document.createElement('div');
        card.className = "drill-select-card";
        if (selectedDrillUids.has(d.uid)) {
            card.classList.add('selected');
        }
        card.id = `deploy-card-${d.uid}`;

        card.innerHTML = `
            <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
            <div style="font-weight: bold; font-size: 0.85rem; color: #fff; margin: 4px 0;">${d.name}</div>
            ${renderDrillModulesBadges(d)}
            <div style="font-size: 0.75rem; color: #cbd5e0; line-height: 1.3;">
                ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                ⚡ ${d.elec !== undefined ? Math.ceil(d.elec) : 'N/A'}
            </div>
        `;

        card.addEventListener('click', () => {
            toggleCardSelection(d.uid, card);
        });

        grid.appendChild(card);
    });
}
window.renderDeploymentGrid = renderDeploymentGrid;

function openDeploymentMenu(phaseId) {
    if (game.inventory.length === 0) {
        alert("Votre hangar est vide.");
        return;
    }

    const deployableDrills = game.inventory.filter(d => !d.isHS);
    if (deployableDrills.length === 0) {
        alert("Toutes vos foreuses en stock sont en panne (HS). Réparez-les d'abord dans l'Atelier de Réparation.");
        return;
    }

    currentDeployPhaseId = phaseId;
    selectedDrillUids.clear();

    const primarySortEl = document.getElementById('deploy-sort-primary');
    const secondarySortEl = document.getElementById('deploy-sort-secondary');
    if (primarySortEl) primarySortEl.value = 'tier-desc';
    if (secondarySortEl) secondarySortEl.value = 'none';

    const modal = document.getElementById('deployment-modal');
    const title = document.getElementById('deployment-modal-title');
    const phase = game.phases.find(p => p.id === phaseId);

    if (title) title.innerText = `Déploiement vers : ${phase ? phase.name : 'Phase '+ phaseId}`;

    renderDeploymentGrid();
    updateSelectedCountDisplay();

    if (modal) modal.style.display = 'flex';
}

function toggleCardSelection(uid, cardElement) {
    if (selectedDrillUids.has(uid)) {
        selectedDrillUids.delete(uid);
        cardElement.classList.remove('selected');
    } else {
        selectedDrillUids.add(uid);
        cardElement.classList.add('selected');
    }
    updateSelectedCountDisplay();
}

function toggleSelectAllCardDrills(selectAll) {
    const grid = document.getElementById('deployment-drills-grid');
    const cards = grid.querySelectorAll('.drill-select-card');

    if (selectAll) {
        game.inventory.filter(d => !d.isHS).forEach(d => selectedDrillUids.add(d.uid));
        cards.forEach(card => card.classList.add('selected'));
    } else {
        selectedDrillUids.clear();
        cards.forEach(card => card.classList.remove('selected'));
    }
    updateSelectedCountDisplay();
}
window.toggleSelectAllCardDrills = toggleSelectAllCardDrills;

function updateSelectedCountDisplay() {
    const counter = document.getElementById('deployment-selected-count');
    if (counter) {
        counter.innerText = `${selectedDrillUids.size} drill(s) sélectionnée(s)`;
    }
}

function closeDeploymentModal() {
    const modal = document.getElementById('deployment-modal');
    if (modal) modal.style.display = 'none';
    currentDeployPhaseId = null;
    selectedDrillUids.clear();
}
window.closeDeploymentModal = closeDeploymentModal;

function confirmDeploySelectedDrills() {
    if (!currentDeployPhaseId) return;
    
    const phase = game.phases.find(p => p.id === currentDeployPhaseId);
    if (!phase) return;

    if (selectedDrillUids.size === 0) {
        alert("Veuillez sélectionner au moins un drill à déployer.");
        return;
    }

    const toDeploy = [];
    const remainingInventory = [];

    game.inventory.forEach(d => {
        if (selectedDrillUids.has(d.uid)) {
            toDeploy.push(d);
        } else {
            remainingInventory.push(d);
        }
    });

    game.inventory = remainingInventory;
    phase.activeDrills.push(...toDeploy);
    
    closeDeploymentModal();
    saveGameToServer();
    updateUI();
}
window.confirmDeploySelectedDrills = confirmDeploySelectedDrills;

function togglePhaseContent(phaseId) {
    const phase = game.phases.find(p => p.id === phaseId);
    if (!phase || !phase.unlocked) return; // Empêche l'ouverture si la phase est verrouillée

    const controls = document.getElementById(`controls-${phaseId}`);
    const deployedList = document.getElementById(`deployed-list-${phaseId}`);
    const progressArea = document.getElementById(`progress-area-${phaseId}`);

    // Vérifie l'état actuel pour inverser l'affichage
    if (controls.style.display === "none") {
        controls.style.display = "flex";
        deployedList.style.display = "block";
        progressArea.style.display = "block";
    } else {
        controls.style.display = "none";
        deployedList.style.display = "none";
        progressArea.style.display = "block";
    }
}
window.togglePhaseContent = togglePhaseContent;


function recallDrillFromPhase(drillUid, phaseId) {
    const phase = game.phases.find(p => p.id === phaseId);
    const idx = phase.activeDrills.findIndex(d => d.uid === drillUid);
    if (idx !== -1) {
        game.inventory.push(phase.activeDrills.splice(idx, 1)[0]);
        saveGameToServer();
        updateUI();
    }
    if (phase.activeDrills.length == 0) {
        phase.progress = 0;
    }
}
window.recallDrillFromPhase = recallDrillFromPhase;

let lastRenderedUnlockedTier = -1;

function refreshShopMatSelect() {
    if (!buyMatTypeSelect) return;

    const currentValue = buyMatTypeSelect.value || "T0";
    Array.from(buyMatTypeSelect.options).forEach((opt, index) => {
        const template = game.drillTemplates[index];
        const baseName = template ? template.name : `Tier ${index}`;
        const isUnlocked = index <= game.unlockedDrillTier;
        const count = (game.repairMateriaux && game.repairMateriaux[index]) || 0;
        const text = isUnlocked ? `${baseName} (Stock: ${count})` : `${baseName} (Verrouillé)`;

        if (opt.textContent !== text) opt.textContent = text;
        if (opt.disabled !== !isUnlocked) opt.disabled = !isUnlocked;
    });

    const selectedTierIndex = parseInt(currentValue.replace("T", "")) || 0;
    if (buyMatTypeSelect.options[selectedTierIndex] && buyMatTypeSelect.options[selectedTierIndex].disabled) {
        buyMatTypeSelect.value = `T${game.unlockedDrillTier}`;
    }

    lastRenderedUnlockedTier = game.unlockedDrillTier;
}
window.refreshShopMatSelect = refreshShopMatSelect;

function updateCosts() {
    if (isGameFinished) return;

    game.phases.forEach((p, idx) => {
        if (!p.unlocked) {
            const row = document.getElementById(`phase-${p.id}`);
            const unlockBtn = document.getElementById(`unlock-phase-btn-${p.id}`);
            if (unlockBtn) {
                const isPrevUnlocked = idx === 0 || game.phases[idx - 1].unlocked;
                const canAfford = game.money >= p.reqMoney;
                const isUnlockable = isPrevUnlocked && canAfford;

                unlockBtn.disabled = !isUnlockable || isPurchaseOnCooldown;

                if (isUnlockable) {
                    if (row) row.classList.add('unlockable');
                    unlockBtn.classList.add('btn-unlock-ready');
                    unlockBtn.innerText = `🔓 Débloquer (${formatMoney(p.reqMoney)} $)`;
                } else {
                    if (row) row.classList.remove('unlockable');
                    unlockBtn.classList.remove('btn-unlock-ready');
                    unlockBtn.innerText = isPrevUnlocked
                        ? `🔒 Débloquer (${formatMoney(p.reqMoney)} $)`
                        : `🔒 Phase ${p.id - 1} requise (${formatMoney(p.reqMoney)} $)`;
                }
            }
        }
    });

    // Pioche
    if (game.pickaxeTier < game.pickaxeCosts.length) {
        const cost = game.pickaxeCosts[game.pickaxeTier];
        upgradePickaxeBtn.innerText = `Améliorer Pioche (Coût: ${formatMoney(cost)} $)`;
        upgradePickaxeBtn.disabled = game.money < cost || isPurchaseOnCooldown;
    } else {
        upgradePickaxeBtn.innerText = "Niveau Max Atteint";
        upgradePickaxeBtn.disabled = true;
    }

    // Boutique Drills
    const currentTemplate = game.drillTemplates[game.unlockedDrillTier];
    drillShopTitle.innerText = `Modèle : ${currentTemplate.name}`;
    if (drillShopImg && drillShopImg.getAttribute('src') !== currentTemplate.image) {
        drillShopImg.setAttribute('src', currentTemplate.image);
        drillShopImg.setAttribute('alt', currentTemplate.name);
    }
    const drillCost = getGlobalDrillCost();
    drillShopCost.innerText = formatMoney(drillCost);
    buyDrillGlobalBtn.disabled = game.money < drillCost || isPurchaseOnCooldown;

    // Gestion du module de Recherche (R&D)
    if (game.unlockedDrillTier < game.researchCosts.length) {
        const nextTemplate = game.drillTemplates[game.unlockedDrillTier + 1];
        const resCost = game.researchCosts[game.unlockedDrillTier];
        const resChance = game.researchChances[game.unlockedDrillTier];
        
        researchNextLevelEl.innerText = `Suivant : ${nextTemplate.name}`;
        if (researchDrillImg) {
            researchDrillImg.style.display = '';
            if (researchDrillImg.getAttribute('src') !== nextTemplate.image) {
                researchDrillImg.setAttribute('src', nextTemplate.image);
                researchDrillImg.setAttribute('alt', nextTemplate.name);
            }
        }
        researchCostEl.innerText = formatMoney(resCost);
        researchChanceEl.innerText = resChance;
        researchDrillBtn.disabled = game.money < resCost || isPurchaseOnCooldown;
    } else {
        researchNextLevelEl.innerText = "Technologie maximale atteinte !";
        if (researchDrillImg) researchDrillImg.style.display = 'none';
        researchDrillBtn.innerText = "Recherche Terminée";
        researchDrillBtn.disabled = true;
    }

    // Gestion de l'achat de caisse à outils
    const qty = buyKitQtyInput ? Math.max(1, parseInt(buyKitQtyInput.value) || 1) : 1;
    const totalKitPrice = (game.kitCost || 5000) * qty;
    if (kitTotalCostEl) kitTotalCostEl.innerText = formatMoney(totalKitPrice);
    if (buyKitBtn) buyKitBtn.disabled = game.money < totalKitPrice || isPurchaseOnCooldown;
    const repairKitsStock = game.repairKits || 0;
    if (kitStockCountEl) kitStockCountEl.innerText = repairKitsStock;
    if (kitShopStockCountEl) toogleStockZeroStyle('kit-shop-stock-count', repairKitsStock);

    // Badges de stocks et craft
    const partsCountEl = document.getElementById('parts-stock-count');
    const univCountEl = document.getElementById('univ-stock-count');
    const craftPartsEl = document.getElementById('craft-parts-count');
    const btnCraftKit = document.getElementById('btn-craft-kit');
    const btnCraftKitMax = document.getElementById('btn-craft-kit-max');

    if (partsCountEl) partsCountEl.innerText = game.craftParts || 0;
    if (univCountEl) univCountEl.innerText = game.universalRepairs || 0;
    if (craftPartsEl) craftPartsEl.innerText = game.craftParts || 0;

    const canCraft = (game.craftParts || 0) >= 5;
    if (btnCraftKit) btnCraftKit.disabled = !canCraft;
    if (btnCraftKitMax) btnCraftKitMax.disabled = !canCraft;

    // Mise à jour des stocks de matériaux par tier dans le Hangar
    for (let i = 0; i <= 4; i++) {
        const hangarMatEl = document.getElementById(`hangar-mat-${i}`);
        if (hangarMatEl) {
            hangarMatEl.innerText = (game.repairMateriaux && game.repairMateriaux[i]) || 0;
        }
    }

    // Gestion de l'achat de matériaux & affichage des stocks dans le Magasin
    if (lastRenderedUnlockedTier !== game.unlockedDrillTier) {
        refreshShopMatSelect();
    }

    const selectedType = buyMatTypeSelect ? buyMatTypeSelect.value : "T0";
    const selectedTierIndex = parseInt(selectedType.replace("T", "")) || 0;
    const selectedStock = (game.repairMateriaux && game.repairMateriaux[selectedTierIndex]) || 0;
    
    const selectedStockBadge = document.getElementById('selected-mat-stock-count');
    if (selectedStockBadge) toogleStockZeroStyle('selected-mat-stock-count', selectedStock)

    const activeMatDrillTemplate = game.drillTemplates[selectedTierIndex];
    if (buyMatDrillImg && activeMatDrillTemplate && buyMatDrillImg.getAttribute('src') !== activeMatDrillTemplate.image) {
        buyMatDrillImg.setAttribute('src', activeMatDrillTemplate.image);
        buyMatDrillImg.setAttribute('alt', activeMatDrillTemplate.name);
    }

    const matTemplate = (game.repairMateriauxTemplates && game.repairMateriauxTemplates.find(m => m.type === selectedType)) || { costBase: 100 };
    const qtyMat = buyMatQtyInput ? Math.max(1, parseInt(buyMatQtyInput.value) || 1) : 1;
    const totalMatPrice = matTemplate.costBase * qtyMat;
    if (matTotalCostEl) matTotalCostEl.innerText = formatMoney(totalMatPrice);
    if (buyMatBtn) buyMatBtn.disabled = game.money < totalMatPrice || isPurchaseOnCooldown;

    // Gestion de l'achat et du stock des modules d'amélioration
    const elecStock = (game.modulesStock && game.modulesStock.electricite) || 0;
    const solidStock = (game.modulesStock && game.modulesStock.solidite) || 0;

    const hangarModElecEl = document.getElementById('hangar-mod-elec');
    const hangarModSolidEl = document.getElementById('hangar-mod-solid');
    if (hangarModElecEl) toogleStockZeroStyle('mod-elec-shop-stock', elecStock);
    if (hangarModSolidEl) toogleStockZeroStyle('mod-solid-shop-stock', solidStock);
    if (modElecShopStockEl) toogleStockZeroStyle('mod-elec-shop-stock', elecStock);
    if (modSolidShopStockEl) toogleStockZeroStyle('mod-solid-shop-stock', solidStock);

    const qtyModElec = buyModElecQtyInput ? Math.max(1, parseInt(buyModElecQtyInput.value) || 1) : 1;
    const totalModElecPrice = ((game.moduleTemplates && game.moduleTemplates.electricite.cost) || 5000) * qtyModElec;
    if (modElecTotalCostEl) modElecTotalCostEl.innerText = formatMoney(totalModElecPrice);
    if (buyModElecBtn) buyModElecBtn.disabled = game.money < totalModElecPrice || isPurchaseOnCooldown;

    const qtyModSolid = buyModSolidQtyInput ? Math.max(1, parseInt(buyModSolidQtyInput.value) || 1) : 1;
    const totalModSolidPrice = ((game.moduleTemplates && game.moduleTemplates.solidite.cost) || 15000) * qtyModSolid;
    if (modSolidTotalCostEl) modSolidTotalCostEl.innerText = formatMoney(totalModSolidPrice);
    if (buyModSolidBtn) buyModSolidBtn.disabled = game.money < totalModSolidPrice || isPurchaseOnCooldown;
}

function updateUI() {
    moneyEl.innerText = formatMoney(game.money) + " $";
    pickaxeTitleEl.innerText = "Pioche : " + game.pickaxeNames[game.pickaxeTier];
    
    const mps = calculateMPS();
    if (mpsEl) {
        mpsEl.innerText = `Revenu passif : ${formatMoney(mps)} $/s`;
    }

    // Mise à jour de l'inventaire
    if (game.inventory.length === 0) {
        const emptyHtml = '<span style="color: #6272a4; font-size:0.8rem; grid-column: 1 / -1;">Aucun drill au repos.</span>';
        if (inventoryContainer.innerHTML !== emptyHtml) {
            inventoryContainer.innerHTML = emptyHtml;
        }
    } else {
        const existingCards = inventoryContainer.querySelectorAll('.drill-card');
        const needsRebuild = existingCards.length !== game.inventory.length ||
            game.inventory.some((d, idx) =>
                existingCards[idx].id !== `inv-card${d.uid}` ||
                existingCards[idx].dataset.modules !== getDrillModulesKey(d)
            );
        if (needsRebuild) {
            inventoryContainer.innerHTML = '';
            game.inventory.forEach((d) => {
                const card = document.createElement('div');
                card.className = "drill-card";
                card.id = `inv-card${d.uid}`;
                card.dataset.modules = getDrillModulesKey(d);
                if (d.isHS === true || d.isHS) {
                    card.classList.add('hs-red');
                }
                card.innerHTML = `
                    <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
                    <strong>${d.name}</strong>
                    ${renderDrillModulesBadges(d)}
                    <span class="dura-text">❤️ ${Math.ceil(d.dura)}/${d.maxDura}</span>
                    <span class="elec-text">⚡ ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}</span>
                `;
                inventoryContainer.appendChild(card);
            });
        } else {
            game.inventory.forEach((d) => {
                const card = document.getElementById(`inv-card${d.uid}`);
                if (card) {
                    const duraText = card.querySelector('.dura-text');
                    const elecText = card.querySelector('.elec-text');
                    if (duraText) duraText.innerHTML = `❤️ ${Math.ceil(d.dura)}/${d.maxDura}`;
                    if (elecText) elecText.innerHTML = `⚡ ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}`;
                    if (d.isHS === true || d.isHS) {
                        card.classList.add('hs-red');
                    } else {
                        card.classList.remove('hs-red');
                    }
                }
            });
        }
    }

    // Mise à jour des phases
    game.phases.forEach(p => {
        const countEl = document.getElementById(`drill-count-${p.id}`);
        const powerEl = document.getElementById(`drill-power-${p.id}`);
        const deployedListEl = document.getElementById(`deployed-list-${p.id}`);
        
        let totalPower = 0;
        p.activeDrills.forEach(d => totalPower += d.power);
        if (countEl) countEl.innerText = p.activeDrills.length;
        if (powerEl) powerEl.innerText = formatMoney(totalPower);

        if (deployedListEl) {
            const currentItems = deployedListEl.querySelectorAll('.drill-deployed-item');
            const needsDeployedRebuild = currentItems.length !== p.activeDrills.length ||
                p.activeDrills.some((d, idx) =>
                    currentItems[idx].id !== `deployed-drill-${d.uid}` ||
                    currentItems[idx].dataset.modules !== getDrillModulesKey(d)
                );
            if (needsDeployedRebuild) {
                deployedListEl.innerHTML = '';
                p.activeDrills.forEach(d => {
                    const item = document.createElement('div');
                    item.className = "drill-deployed-item";
                    item.id = `deployed-drill-${d.uid}`;
                    item.dataset.modules = getDrillModulesKey(d);
                    item.innerHTML = `
                        <span class="drill-deployed-info">
                            <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-icon-mini">
                            <strong>${d.name}</strong>
                            ${renderDrillModulesBadges(d)}
                            (<span class="deployed-dura">Dura: ${Math.ceil(d.dura)}/${d.maxDura}</span> | <span class="deployed-elec">Elec: ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}</span> | <span class="isHS">HS: ${d.isHS ? 'Oui' : 'Non'}</span>)
                        </span>
                        <button class="btn-mini btn-recall-action" data-uid="${d.uid}" data-phase="${p.id}">Rappeler</button>
                    `;

                    // Écouteur direct mousedown pour réactivité instantanée
                    const btn = item.querySelector('.btn-recall-action');
                    btn.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        recallDrillFromPhase(d.uid, p.id);
                    });

                    deployedListEl.appendChild(item);
                });
            } else {
                p.activeDrills.forEach(d => {
                    const item = document.getElementById(`deployed-drill-${d.uid}`);
                    if (item) {
                        const duraEl = item.querySelector('.deployed-dura');
                        const elecEl = item.querySelector('.deployed-elec');
                        const hsEl = item.querySelector('.isHS');
                        if (duraEl) duraEl.innerText = `Dura: ${Math.ceil(d.dura)}/${d.maxDura}`;
                        if (elecEl) elecEl.innerText = `Elec: ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}`;
                        if (hsEl) hsEl.innerText = `HS: ${d.isHS ? 'Oui' : 'Non'}`;
                    }
                });
            }
        }
    });
    updateCosts();
}

function triggerPurchaseCooldown() {
    isPurchaseOnCooldown = true;
    updateCosts();

    setTimeout(()=> {
        isPurchaseOnCooldown = false;
        updateCosts();
    }, 1000)
}

function checkVictoryCondition() {
    if (game.money >= MAX_MONEY_LIMIT && !isGameFinished) {
        isGameFinished = true;

        document.getElementById('final-money').innerText =  MAX_MONEY_LIMIT.toLocaleString('fr-FR') + " $";
        document.getElementById('victory-screen').style.display = "flex";

        clickBtn.disabled = true;
        upgradePickaxeBtn.disabled = true;
        buyDrillGlobalBtn.disabled = true;
        researchDrillBtn.disabled = true;

        console.log("Félicitation vous avez gagné !")
    }
}

function updatePhasePaliersVisuals() {
    const phase1 = game.phases.find(p => p.id === 1);
    if (!phase1) return;

    // On parcourt les paliers à l'envers pour trouver le plus haut atteint
    let activePalier = game.paliers[0];
    for (let i = game.paliers.length - 1; i >= 0; i--) {
        if (phase1.blockBrocken >= game.paliers[i].nbBlock) {
            activePalier = game.paliers[i];
            break;
        }
    }

    // Mise à jour du titre textuel de la phase
    const titleEl = document.getElementById(`phase-title-text-1`);
    if (titleEl && titleEl.innerText !== activePalier.displayName) {
        titleEl.innerText = activePalier.displayName;
    }

    // Mise à jour de la reward par bloc cassé
    const reward = document.getElementById(`phase-reward-1`);
    if (reward && reward.innerText !== phase1.reward) {
        reward.innerText = "Gain/Bloc: " + phase1.reward;
    }

    // Mise à jour de l'image de fond
    const imgEl = document.getElementById(`image-phase-1`);
    if (imgEl) {
        // Extrait le nom de fichier actuel pour éviter de recharger l'image en boucle à chaque tick
        const currentSrc = imgEl.getAttribute('src');
        if (currentSrc !== activePalier.bgImage) {
            imgEl.setAttribute('src', activePalier.bgImage);
            console.log(`Palier Visuel Phase 1 changé : ${activePalier.name}`);
        }
    }
}

window.onTurnstileSuccess = function(token) {
    const btn = document.getElementById('btn-close-autoclicker');
    if (btn) {
        btn.disabled = false;
        btn.innerText = "J'ai compris (Reprendre le jeu)";
        btn.style.filter = "none";
    }
};

function triggerAutoclickerAlert() {
    isSuspendedByCaptcha = true;
    const popup = document.getElementById('autoclicker-popup');
    const btn = document.getElementById('btn-close-autoclicker');
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Vérification requise...";
    }

    if (popup) {
        popup.style.display = 'flex';
    }

    if (window.turnstile) {
        window.turnstile.reset('#cf-turnstile-container');
    }

    if (typeof reportAutoclickerWarnToServer === 'function') {
        reportAutoclickerWarnToServer('autoclick_detected');
    }
}

function closeAutoclickerPopup() {
    const popup = document.getElementById('autoclicker-popup');
    if (popup) {
        popup.style.display = 'none';
    }
    isSuspendedByCaptcha = false;
    overLimitSecondsStreak = 0;
    lastClickTimestampForInterval = 0;
    lastIntervalMs = 0;
    consecutiveIdenticalIntervals = 0;
    streakDurationAccumulatorMs = 0;
}
window.closeAutoclickerPopup = closeAutoclickerPopup;

function formatMoney(value) {
    if (value === null || value === undefined || isNaN(value)) return "0";
    if (value < 1000) return value.toFixed(2);

    const suffixes = [
        { threshold: 1e18, symbol: "Tr" },
        { threshold: 1e15, symbol: "Brd" },
        { threshold: 1e12, symbol: "B"  },
        { threshold: 1e9,  symbol: "Md" },
        { threshold: 1e6,  symbol: "M"  },
        { threshold: 1e3,  symbol: "k"  }
    ];

    for (let i = 0; i < suffixes.length; i++) {
        if (value >= suffixes[i].threshold) {
            const formattedValue = (value / suffixes[i].threshold).toFixed(2);
            return `${formattedValue} ${suffixes[i].symbol}`;
        }
    }
    
    return value.toFixed(2);
}

function openShopModal() {
    const modal = document.getElementById('shop-modal');
    if (modal) {
        modal.style.display = 'flex';
        refreshShopMatSelect();
        updateCosts();
    }
}
window.openShopModal = openShopModal;

function closeShopModal() {
    const modal = document.getElementById('shop-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}
window.closeShopModal = closeShopModal;

let currentRepairTab = 'hs';

function switchRepairTab(tabName) {
    currentRepairTab = (tabName === 'univ') ? 'dura' : tabName;
    const btnHs = document.getElementById('tab-repair-hs');
    const btnDura = document.getElementById('tab-repair-dura');
    const btnModules = document.getElementById('tab-repair-modules');
    const craftBox = document.getElementById('repair-craft-box');
    const duraUnivSelector = document.getElementById('repair-dura-univ-selector');
    const modulesSelector = document.getElementById('repair-modules-selector');
    const instructions = document.getElementById('repair-modal-instructions');

    // Réinitialisation visuelle de tous les onglets
    [btnHs, btnDura, btnModules].forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
            btn.style.background = '#231d1b';
            btn.style.borderColor = '#423530';
            btn.style.color = '#cbd5e0';
        }
    });

    if (craftBox) craftBox.style.display = (currentRepairTab === 'hs') ? 'flex' : 'none';
    if (duraUnivSelector) duraUnivSelector.style.display = (currentRepairTab === 'dura') ? 'block' : 'none';
    if (modulesSelector) modulesSelector.style.display = (currentRepairTab === 'modules') ? 'grid' : 'none';

    if (currentRepairTab === 'hs') {
        if (btnHs) {
            btnHs.classList.add('active');
            btnHs.style.background = 'linear-gradient(180deg, var(--copper-main) 0%, var(--copper-dark) 100%)';
            btnHs.style.borderColor = 'var(--brass)';
            btnHs.style.color = '#fff';
        }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse en panne (HS) pour tenter une remise en service (consomme 1 Caisse à outils, ne répare pas la durabilité).";
    } else if (currentRepairTab === 'dura') {
        if (btnDura) {
            btnDura.classList.add('active');
            btnDura.style.background = 'linear-gradient(180deg, var(--copper-main) 0%, var(--copper-dark) 100%)';
            btnDura.style.borderColor = 'var(--brass)';
            btnDura.style.color = '#fff';
        }
    } else if (currentRepairTab === 'modules') {
        if (btnModules) {
            btnModules.classList.add('active');
            btnModules.style.background = 'linear-gradient(180deg, #2b6cb0 0%, #1a365d 100%)';
            btnModules.style.borderColor = '#8be9fd';
            btnModules.style.color = '#fff';
        }
        if (instructions) instructions.innerText = "Cochez les modules souhaités puis cliquez sur une foreuse pour les installer à vie (irréversible).";
    }

    renderRepairGrid();
}
window.switchRepairTab = switchRepairTab;

function openRepairModal() {
    const modal = document.getElementById('repair-modal');
    if (!modal) return;
    switchRepairTab(currentRepairTab);
    modal.style.display = 'flex';
}
window.openRepairModal = openRepairModal;

function closeRepairModal() {
    const modal = document.getElementById('repair-modal');
    if (modal) modal.style.display = 'none';
}
window.closeRepairModal = closeRepairModal;

function renderRepairGrid() {
    const grid = document.getElementById('repair-drills-grid');
    const kitsCountEl = document.getElementById('repair-modal-kits');
    const univCountEl = document.getElementById('repair-modal-univ');
    const modulesCountEl = document.getElementById('repair-modal-modules');
    const modElecModalStockEl = document.getElementById('mod-elec-modal-stock');
    const modSolidModalStockEl = document.getElementById('mod-solid-modal-stock');
    const craftPartsEl = document.getElementById('craft-parts-count');

    const elecStock = (game.modulesStock && game.modulesStock.electricite) || 0;
    const solidStock = (game.modulesStock && game.modulesStock.solidite) || 0;
    const univStock = game.universalRepairs || 0;

    if (kitsCountEl) kitsCountEl.innerText = game.repairKits || 0;
    if (univCountEl) univCountEl.innerText = univStock;
    if (modulesCountEl) modulesCountEl.innerText = elecStock + solidStock;
    if (modElecModalStockEl) modElecModalStockEl.innerText = elecStock;
    if (modSolidModalStockEl) modSolidModalStockEl.innerText = solidStock;
    if (craftPartsEl) craftPartsEl.innerText = game.craftParts || 0;
    if (kitStockCountEl) kitStockCountEl.innerText = game.repairKits || 0;
    if (kitShopStockCountEl) kitShopStockCountEl.innerText = game.repairKits || 0;

    // Gestion de la checkbox Réparation Universelle (active uniquement tant qu'on en a)
    const chkUseUniv = document.getElementById('chk-use-universal');
    const labelUseUniv = document.getElementById('label-use-universal');
    if (chkUseUniv) {
        if (univStock <= 0) {
            chkUseUniv.checked = false;
            chkUseUniv.disabled = true;
            if (labelUseUniv) labelUseUniv.classList.add('disabled-option');
        } else {
            chkUseUniv.disabled = false;
            if (labelUseUniv) labelUseUniv.classList.remove('disabled-option');
        }
    }
    const useUniversal = Boolean(chkUseUniv && chkUseUniv.checked && univStock > 0);

    if (currentRepairTab === 'dura') {
        const instructions = document.getElementById('repair-modal-instructions');
        if (instructions) {
            instructions.innerText = useUniversal
                ? "Mode Universel actif : cliquez sur une foreuse endommagée pour remettre sa durabilité à 100% sans risque d'échec (ne répare pas les pannes HS)."
                : "Cliquez sur une foreuse endommagée pour réparer 50% de sa durabilité (consomme 1 Matériau de son Tier).";
        }
    }

    if (!grid) return;

    grid.innerHTML = '';

    if (game.inventory.length === 0) {
        grid.innerHTML = '<span style="color: #6272a4; font-size:0.85rem; grid-column: 1 / -1; text-align: center;">Aucun drill dans le hangar.</span>';
        return;
    }

    game.inventory.forEach(d => {
        const template = game.drillTemplates[d.tier] || {};
        const chance = template.repairHSChance !== undefined ? template.repairHSChance : 50;
        const card = document.createElement('div');
        card.className = "drill-select-card";

        if (currentRepairTab === 'hs') {
            const canRepair = d.isHS;
            card.style.opacity = canRepair ? "1" : "0.5";
            card.style.cursor = canRepair ? "pointer" : "not-allowed";

            card.innerHTML = `
                <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
                <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                    ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                    Chance: <strong style="color: #50fa7b;">${chance}%</strong>
                </div>
                <button class="btn-mini" style="margin-top: 4px; width: 100%;" ${(!canRepair || (game.repairKits || 0) <= 0) ? 'disabled' : ''}>
                    ${canRepair ? 'Dépanner' : 'Opérationnel'}
                </button>
            `;

            if (canRepair) {
                card.addEventListener('click', () => applyHsRepair(d.uid, chance));
            }
        } else if (currentRepairTab === 'dura') {
            const canRepair = d.dura < d.maxDura;
            if (useUniversal) {
                card.style.opacity = canRepair ? "1" : "0.5";
                card.style.cursor = canRepair ? "pointer" : "not-allowed";

                card.innerHTML = `
                    <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
                    <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                    <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                        ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                        <strong style="color: #50fa7b;">✨ 100% Dura (0% échec)</strong>
                    </div>
                    <button class="btn-mini btn-action-deploy" style="margin-top: 4px; width: 100%;" ${!canRepair ? 'disabled' : ''}>
                        ${canRepair ? '✨ 100% Dura' : 'Intact'}
                    </button>
                `;

                if (canRepair) {
                    card.addEventListener('click', () => applyUniversalRepair(d.uid));
                }
            } else {
                const matStock = (game.repairMateriaux && game.repairMateriaux[d.tier]) || 0;
                const matName = template.name ? template.name.replace("Drill en ", "") : `T${d.tier}`;
                card.style.opacity = canRepair ? "1" : "0.5";
                card.style.cursor = canRepair ? "pointer" : "not-allowed";

                card.innerHTML = `
                    <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
                    <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                    <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                        ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                        Mat T${d.tier} (${matName}) : <strong style="color: ${matStock > 0 ? '#50fa7b' : '#ff5555'};">${matStock} en stock</strong>
                    </div>
                    <button class="btn-mini" style="margin-top: 4px; width: 100%;" ${(!canRepair || matStock <= 0) ? 'disabled' : ''}>
                        ${canRepair ? '+50% Dura' : 'Intact'}
                    </button>
                `;

                if (canRepair) {
                    card.addEventListener('click', () => applyDuraRepair(d.uid, chance));
                }
            }
        } else if (currentRepairTab === 'modules') {
            const chkElec = document.getElementById('chk-module-elec');
            const chkSolid = document.getElementById('chk-module-solid');
            const selectedModules = [];
            if (chkElec && chkElec.checked) selectedModules.push('electricite');
            if (chkSolid && chkSolid.checked) selectedModules.push('solidite');

            const hasElec = Boolean(d.modules && d.modules.electricite);
            const hasSolid = Boolean(d.modules && d.modules.solidite);
            const isFull = hasElec && hasSolid;
            const toInstall = selectedModules.filter(m => !(d.modules && d.modules[m]));
            const hasEnoughStock = toInstall.length > 0 && toInstall.every(m => ((game.modulesStock && game.modulesStock[m]) || 0) > 0);
            const canInstall = !isFull && toInstall.length > 0 && hasEnoughStock;

            let btnLabel = "Équiper";
            if (isFull) {
                btnLabel = "Complet (2/2)";
            } else if (selectedModules.length === 0) {
                btnLabel = "Cocher un module";
            } else if (toInstall.length === 0) {
                btnLabel = "Déjà équipé";
            } else if (!hasEnoughStock) {
                btnLabel = "Stock insuffisant";
            } else if (toInstall.length === 2) {
                btnLabel = "Équiper x2";
            } else {
                btnLabel = toInstall[0] === 'electricite' ? "Équiper Élec" : "Équiper Solidité";
            }

            card.style.opacity = canInstall ? "1" : "0.6";
            card.style.cursor = canInstall ? "pointer" : "not-allowed";

            const badgesHtml = renderDrillModulesBadges(d) || '<span style="font-size: 0.7rem; color: #718096;">Aucun module</span>';
            card.innerHTML = `
                <img src="${getDrillImage(d)}" alt="${d.name}" class="drill-img">
                <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                <div style="min-height: 20px; display: flex; align-items: center; justify-content: center;">
                    ${badgesHtml}
                </div>
                <button class="btn-mini btn-action-deploy" style="margin-top: 4px; width: 100%;" ${!canInstall ? 'disabled' : ''}>
                    ${btnLabel}
                </button>
            `;

            if (canInstall) {
                card.addEventListener('click', () => installSelectedModules(d.uid));
            }
        }

        grid.appendChild(card);
    });
}
window.renderRepairGrid = renderRepairGrid;

function installSelectedModules(drillUid) {
    const drill = game.inventory.find(d => d.uid === drillUid);
    if (!drill) return;

    const chkElec = document.getElementById('chk-module-elec');
    const chkSolid = document.getElementById('chk-module-solid');
    const selectedModules = [];
    if (chkElec && chkElec.checked) selectedModules.push('electricite');
    if (chkSolid && chkSolid.checked) selectedModules.push('solidite');

    if (selectedModules.length === 0) {
        alert("Veuillez cocher au moins un module à installer.");
        return;
    }

    if (!drill.modules) {
        drill.modules = { electricite: false, solidite: false };
    }

    const toInstall = selectedModules.filter(m => !drill.modules[m]);
    if (toInstall.length === 0) {
        alert(`${drill.name} possède déjà les modules cochés.`);
        return;
    }

    if (!game.modulesStock) {
        game.modulesStock = { electricite: 0, solidite: 0 };
    }

    const missing = toInstall.filter(m => (game.modulesStock[m] || 0) <= 0);
    if (missing.length > 0) {
        const names = missing.map(m => game.moduleTemplates[m].name).join(', ');
        alert(`Stock insuffisant pour : ${names}. Achetez-en dans le Magasin.`);
        return;
    }

    toInstall.forEach(m => {
        game.modulesStock[m]--;
        drill.modules[m] = true;
    });

    const installedNames = toInstall.map(m => game.moduleTemplates[m].name).join(' + ');
    alert(`⚙️ ${installedNames} installé(s) à vie sur ${drill.name} !`);

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}
window.installSelectedModules = installSelectedModules;

function applyHsRepair(drillUid, chance) {
    if (!game.repairKits || game.repairKits <= 0) {
        alert("Vous n'avez plus de Caisse à outils disponible.");
        return;
    }

    const drill = game.inventory.find(d => d.uid === drillUid);
    if (!drill || !drill.isHS) return;

    game.repairKits--;
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= chance) {
        drill.isHS = false;
        alert(`🎉 Dépannage réussi sur ${drill.name} ! Il est de nouveau opérationnel.`);
    } else {
        alert(`❌ Échec du dépannage sur ${drill.name} (${roll}/100 > ${chance}% requis). Le kit a été consommé.`);
    }

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}

function applyDuraRepair(drillUid, chance) {
    const drill = game.inventory.find(d => d.uid === drillUid);
    if (!drill || drill.dura >= drill.maxDura) return;

    const drillTier = drill.tier !== undefined ? drill.tier : 0;
    if (!game.repairMateriaux || (game.repairMateriaux[drillTier] || 0) <= 0) {
        alert(`Vous n'avez pas de Matériau de réparation Tier ${drillTier} pour réparer ${drill.name}. Vous pouvez en acheter au Magasin.`);
        return;
    }

    game.repairMateriaux[drillTier]--;
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= chance) {
        const healAmount = drill.maxDura * 0.5; // Gain fixe de 50%
        drill.dura = Math.min(drill.maxDura, drill.dura + healAmount);
        alert(`🎉 Réparation réussie sur ${drill.name} ! (+${Math.ceil(healAmount)} durabilité)`);
    } else {
        alert(`❌ Échec de la réparation sur ${drill.name} (${roll}/100 > ${chance}% requis). Le matériau a été consommé.`);
    }

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}

function applyUniversalRepair(drillUid) {
    if (!game.universalRepairs || game.universalRepairs <= 0) {
        alert("Vous n'avez aucune Réparation Universelle en stock.");
        return;
    }

    const drill = game.inventory.find(d => d.uid === drillUid);
    if (!drill) return;

    if (drill.dura >= drill.maxDura) {
        alert(`${drill.name} a déjà 100% de durabilité !`);
        return;
    }

    game.universalRepairs--;
    drill.dura = drill.maxDura;

    alert(`✨ Réparation Universelle réussie sur ${drill.name} ! Durabilité restaurée à 100%.`);

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}
window.applyUniversalRepair = applyUniversalRepair;

function craftRepairKit(qty = 1) {
    const COST_PER_KIT = 5;
    const requestedQty = Math.max(1, parseInt(qty) || 1);
    const totalCost = requestedQty * COST_PER_KIT;

    if ((game.craftParts || 0) < totalCost) {
        alert(`Vous n'avez pas assez de pièces mécaniques (${totalCost} requises pour ${requestedQty} caisse(s), possédées : ${game.craftParts || 0}).`);
        return;
    }

    game.craftParts -= totalCost;
    game.repairKits = (game.repairKits || 0) + requestedQty;

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}
window.craftRepairKit = craftRepairKit;

function craftRepairKitMax() {
    const maxQty = Math.floor((game.craftParts || 0) / 5);
    if (maxQty <= 0) {
        alert("Vous n'avez pas assez de pièces mécaniques (minimum 5 requises pour fabriquer une caisse).");
        return;
    }
    craftRepairKit(maxQty);
}
window.craftRepairKitMax = craftRepairKitMax;

function checkClickLoot(event) {
    const roll = Math.random() * 100; // Tirage de 0 à 100%

    // 1. Caisse à outils complète : 0.15% (~1 chance sur 660)
    if (roll < 0.15) {
        game.repairKits = (game.repairKits || 0) + 1;
        showFloatingLootText(event, "🧰 +1 Caisse à outils !", "#f1fa8c");
        saveGameToServer();
    }
    // 2. Réparation Universelle : 0.05% (~1 chance sur 2000)
    else if (roll < 0.20) {
        game.universalRepairs = (game.universalRepairs || 0) + 1;
        showFloatingLootText(event, "✨ +1 Réparation Universelle !", "#50fa7b");
        saveGameToServer();
    }
    // 3. Pièces mécaniques de craft : 2.5% (~1 chance sur 40)
    else if (roll < 2.70) {
        game.craftParts = (game.craftParts || 0) + 1;
        showFloatingLootText(event, "⚙️ +1 Pièce mécanique", "#8be9fd");
    }
}
window.checkClickLoot = checkClickLoot;

function showFloatingLootText(event, text, color) {
    const clickArea = document.querySelector('.click-area');
    if (!clickArea) return;

    const popup = document.createElement('div');
    popup.className = 'floating-loot-indicator';
    popup.innerText = text;
    popup.style.color = color || '#fff';

    const areaRect = clickArea.getBoundingClientRect();
    let posX = areaRect.width / 2;
    let posY = areaRect.height / 2 - 30;

    if (event && event.clientX && event.clientY) {
        posX = event.clientX - areaRect.left;
        posY = event.clientY - areaRect.top;
    }

    const jitterX = (Math.random() - 0.5) * 40;
    popup.style.left = `${posX + jitterX}px`;
    popup.style.top = `${posY}px`;

    clickArea.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 1200);
}
window.showFloatingLootText = showFloatingLootText;

async function unlockPhase(phaseId) {
    if (isGameFinished || isPurchaseOnCooldown) return;

    const idx = game.phases.findIndex(p => p.id === phaseId);
    if (idx === -1) return;

    const phase = game.phases[idx];
    const isPrevUnlocked = idx === 0 || game.phases[idx - 1].unlocked;

    if (!phase.unlocked && isPrevUnlocked && game.money >= phase.reqMoney) {
        game.money -= phase.reqMoney;
        phase.unlocked = true;

        const row = document.getElementById(`phase-${phase.id}`);
        if (row) {
            row.classList.remove('locked');
            row.classList.remove('unlockable');
        }

        const status = document.getElementById(`phase-unlock-status-${phase.id}`);
        if (status) status.innerHTML = "";

        const deployBtn = document.getElementById(`deploy-to-${phase.id}`);
        if (deployBtn) deployBtn.disabled = false;

        if (row) {
            row.querySelectorAll('.display-opt-btn').forEach(btn => {
                btn.disabled = false;
            });
        }

        triggerPurchaseCooldown();
        updateUI();
        await saveGameToServer();
    }
}

function toogleStockZeroStyle(elementId, stock) {
    const element = document.getElementById(elementId);
    if (!element) return
    element.innerText = stock;
    if (stock === 0) {
        element.classList.add('stock-zero');
    } else {
        element.classList.remove('stock-zero');
    }
}