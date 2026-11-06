let isSuspendedByCaptcha = false;
let turnstileWidgetId = null;
let rawClickCount = 0;
let validClicksThisSecond = 0;
let lastValidClickTimestamp = 0;
const MIN_CLICK_INTERVAL_MS = 1000 / 15;
let overLimitSecondsStreak = 0;

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

function initPhases() {
    phasesContainer.innerHTML = '';
    game.phases.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = `phase-row ${p.unlocked ? '' : 'locked'}`;
        row.id = `phase-${p.id}`;
        
        row.innerHTML = `
            <div class="phase-header" style="cursor: pointer;" onclick="togglePhaseContent(${p.id})">
                <div>
                    <span class="phase-name" id="phase-title-text-${p.id}">${p.name}</span>
                    <span class="phase-blocks">(${p.blocks})</span>
                </div>
                <div id="phase-unlock-status-${p.id}" style="font-size:0.9rem; color:#ff5555;">
                    ${p.unlocked ? '' : `Déblocage : ${p.reqMoney} $`}
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
                    <div class="stat-item">Résistance: <span>${p.baseResist}</span></div>
                    <div class="stat-item" id="phase-reward-${p.id}">Gain/Bloc: <span>${p.reward} $</span></div>
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
            <img id="image-phase-${p.id}" src="/public/background2.png" alt="Fond phases" class="phase-bg-img">
        `;
        phasesContainer.appendChild(row);
        document.getElementById(`deploy-to-${p.id}`).addEventListener('click', (e) => {
            e.stopPropagation();
            openDeploymentMenu(p.id)
        });
    });
    updateCosts();
}

let currentDeployPhaseId = null;
let selectedDrillUids = new Set();

function openDeploymentMenu(phaseId) {
    if (game.inventory.length === 0) {
        alert("Votre hangar est vide.");
        return;
    }

    currentDeployPhaseId = phaseId;
    selectedDrillUids.clear();

    const modal = document.getElementById('deployment-modal');
    const title = document.getElementById('deployment-modal-title');
    const grid = document.getElementById('deployment-drills-grid');
    const phase = game.phases.find(p => p.id === phaseId);

    if (title) title.innerText = `Déploiement vers : ${phase ? phase.name : 'Phase '+ phaseId}`;

    if (grid) {
        grid.innerHTML = '';

        game.inventory.forEach((d) => {
        const card = document.createElement('div');
        card.className = "drill-select-card";
        card.id = `deploy-card-${d.uid}`;

        card.innerHTML = `
            <div style="font-size: 1.5rem; line-height: 1;">⚙️</div>
            <div style="font-weight: bold; font-size: 0.85rem; color: #fff; margin: 4px 0;">${d.name}</div>
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
        game.inventory.forEach(d => selectedDrillUids.add(d.uid));
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

function deployDrillToPhase(inventoryIndex, phaseId) {
    const phase = game.phases.find(p => p.id === phaseId);
    const drill = game.inventory.splice(inventoryIndex, 1)[0]; // Retire de l'inventaire
    phase.activeDrills.push(drill);
    saveGameToServer();
    updateUI();
}

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

function updateCosts() {
    if (isGameFinished) return;

    game.phases.forEach(p => {
        if (!p.unlocked && game.money >= p.reqMoney) {
            p.unlocked = true;
            const row = document.getElementById(`phase-${p.id}`);
            if (row) row.classList.remove('locked');
            const status = document.getElementById(`phase-unlock-status-${p.id}`);
            if (status) status.innerText = 'Débloqué !';
        }
    });

    // Pioche
    if (game.pickaxeTier < game.pickaxeCosts.length) {
        const cost = game.pickaxeCosts[game.pickaxeTier];
        upgradePickaxeBtn.innerText = `Améliorer Pioche (Coût: ${cost} $)`;
        upgradePickaxeBtn.disabled = game.money < cost || isPurchaseOnCooldown;
    } else {
        upgradePickaxeBtn.innerText = "Niveau Max Atteint";
        upgradePickaxeBtn.disabled = true;
    }

    // Boutique Drills
    const currentTemplate = game.drillTemplates[game.unlockedDrillTier];
    drillShopTitle.innerText = `Modèle : ${currentTemplate.name}`;
    const drillCost = getGlobalDrillCost();
    drillShopCost.innerText = drillCost;
    buyDrillGlobalBtn.disabled = game.money < drillCost || isPurchaseOnCooldown;

    // Gestion du module de Recherche (R&D)
    if (game.unlockedDrillTier < game.researchCosts.length) {
        const nextTemplate = game.drillTemplates[game.unlockedDrillTier + 1];
        const resCost = game.researchCosts[game.unlockedDrillTier];
        const resChance = game.researchChances[game.unlockedDrillTier];
        
        researchNextLevelEl.innerText = `Suivant : ${nextTemplate.name}`;
        researchCostEl.innerText = resCost;
        researchChanceEl.innerText = resChance;
        researchDrillBtn.disabled = game.money < resCost || isPurchaseOnCooldown;
    } else {
        researchNextLevelEl.innerText = "Technologie maximale atteinte !";
        researchDrillBtn.innerText = "Recherche Terminée";
        researchDrillBtn.disabled = true;
    }

    // Gestion de l'achat de caisse à outils
    const qty = buyKitQtyInput ? Math.max(1, parseInt(buyKitQtyInput.value) || 1) : 1;
    const totalKitPrice = (game.kitCost || 5000) * qty;
    if (kitTotalCostEl) kitTotalCostEl.innerText = formatMoney(totalKitPrice);
    if (buyKitBtn) buyKitBtn.disabled = game.money < totalKitPrice || isPurchaseOnCooldown;
    if (kitStockCountEl) kitStockCountEl.innerText = game.repairKits || 0;

    // Gestion de l'achat de matériaux
    const qtyMat = buyMatQtyInput ? Math.max(1, parseInt(buyMatQtyInput.value) || 1) : 1;
    const totalMatPrice = (game.matCost || 500) * qtyMat;
    if (matTotalCostEl) matTotalCostEl.innerText = formatMoney(totalMatPrice);
    if (buyMatBtn) buyMatBtn.disabled = game.money < totalMatPrice || isPurchaseOnCooldown;
}

function updateUI() {
    moneyEl.innerText = formatMoney(game.money) + " $";
    pickaxeTitleEl.innerText = "Pioche : " + game.pickaxeNames[game.pickaxeTier];
    
    const mps = calculateMPS();
    if (mpsEl) {
        mpsEl.innerText = `Revenu passif : ${formatMoney(mps)} $/s`;
    }

    // Mise à jour de l'inventaire
    inventoryContainer.innerHTML = '';
    if (game.inventory.length === 0) {
        if (inventoryContainer.innerHTML != '<span style="color: #6272a4; font-size:0.8rem;">Aucun drill au repos.</span>') {
            inventoryContainer.innerHTML = '<span style="color: #6272a4; font-size:0.8rem;">Aucun drill au repos.</span>';
        }
    } else {
        const existingCards = inventoryContainer.querySelectorAll('.drill-card');
        if (existingCards.length !== game.inventory.length) {
            inventoryContainer.innerHTML = '';
            game.inventory.forEach((d, i) => {
                const card = document.createElement('div');
                card.className = "drill-card";
                card.id = `inv-card${d.uid}`;
                card.innerHTML = 
                    `<strong>[${i}] ${d.name}</strong><br>
                    <span class="dura-text">❤️ ${Math.ceil(d.dura)}/${d.maxDura}</span><br>
                    <span class="elec-text">⚡ ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}</span>`;
                inventoryContainer.appendChild(card);
            });
        } else {
            game.inventory.forEach((d, i) => {
                const card = document.getElementById(`inv-card${d.uid}`);
                if (card) {
                    const duraText = card.querySelector('.dura-text');
                    const elecText = card.querySelector('.elec-text');
                    if (duraText) duraText.innerHTML = `❤️ ${Math.ceil(d.dura)}/${d.maxDura}`;
                    if (elecText) elecText.innerHTML = `⚡ ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}`;
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
        if (powerEl) powerEl.innerText = totalPower.toFixed(1);

        if (deployedListEl) {
            const currentItems = deployedListEl.querySelectorAll('.drill-deployed-item');
            if (currentItems.length !== p.activeDrills.length) {
                deployedListEl.innerHTML = '';
                p.activeDrills.forEach(d => {
                    const item = document.createElement('div');
                    item.className = "drill-deployed-item";
                    item.id = `deployed-drill-${d.uid}`;
                    item.innerHTML = `
                        <span>🤖 <strong>${d.name}</strong> (<span class="deployed-dura">Dura: ${Math.ceil(d.dura)}/${d.maxDura}</span> | <span class="deployed-elec">Elec: ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}</span> | <span class="isHS"> HS: ${d.isHS ? 'Oui' : 'Non'}</span>)</span>
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
                        if (duraEl) duraEl.innerText = `Dura: ${Math.ceil(d.dura)}/${d.maxDura}`;
                        if (elecEl) elecEl.innerText = `Elec: ${Math.ceil(d.elec !== undefined ? d.elec : 0)}/${d.maxElec !== undefined ? d.maxElec : 0}`;
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
    currentRepairTab = tabName;
    const btnHs = document.getElementById('tab-repair-hs');
    const btnDura = document.getElementById('tab-repair-dura');
    const instructions = document.getElementById('repair-modal-instructions');

    if (currentRepairTab === 'hs') {
        if (btnHs) { btnHs.style.background = '#b85d19'; btnHs.style.borderColor = 'var(--brass)'; }
        if (btnDura) { btnDura.style.background = '#231d1b'; btnDura.style.borderColor = '#423530'; }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse en panne pour tenter une remise en service (consomme 1 Caisse à outils).";
    } else {
        if (btnDura) { btnDura.style.background = '#b85d19'; btnDura.style.borderColor = 'var(--brass)'; }
        if (btnHs) { btnHs.style.background = '#231d1b'; btnHs.style.borderColor = '#423530'; }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse endommagée pour réparer 50% de sa durabilité (consomme 1 Matériau de réparation).";
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
    const matsCountEl = document.getElementById('repair-modal-mats');

    if (kitsCountEl) kitsCountEl.innerText = game.repairKits || 0;
    if (matsCountEl) matsCountEl.innerText = game.repairMetariaux || 0;
    if (kitStockCountEl) kitStockCountEl.innerText = game.repairKits || 0;
    if (!grid) return;

    grid.innerHTML = '';

    if (game.inventory.length === 0) {
        grid.innerHTML = '<span style="color: #6272a4; font-size:0.85rem; grid-column: 1 / -1; text-align: center;">Aucun drill dans le hangar.</span>';
        return;
    }

    game.inventory.forEach(d => {
        const template = game.drillTemplates[d.tier] || {};
        const chance = template.repairChance !== undefined ? template.repairChance : 50;
        const card = document.createElement('div');
        card.className = "drill-select-card";

        if (currentRepairTab === 'hs') {
            const canRepair = d.isHS;
            card.style.opacity = canRepair ? "1" : "0.5";
            card.style.cursor = canRepair ? "pointer" : "not-allowed";

            card.innerHTML = `
                <div style="font-size: 1.3rem;">🔧</div>
                <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                    ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                    Chance: <strong style="color: #50fa7b;">${chance}%</strong>
                </div>
                <button class="btn-mini" style="margin-top: 4px; width: 100%;" ${(!canRepair || game.repairKits <= 0) ? 'disabled' : ''}>
                    ${canRepair ? 'Réparer' : 'Intact'}
                </button>
            `;

            if (canRepair) {
                card.addEventListener('click', () => applyHsRepair(d.uid, chance));
            }
        } else {
            const canRepair = d.dura < d.maxDura;
            card.style.opacity = canRepair ? "1" : "0.5";
            card.style.cursor = canRepair ? "pointer" : "not-allowed";

            card.innerHTML = `
                <div style="font-size: 1.3rem;">❤️</div>
                <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                    ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                    Chance: <strong style="color: #50fa7b;">${chance}%</strong>
                </div>
                <button class="btn-mini" style="margin-top: 4px; width: 100%;" ${(!canRepair || (game.repairMetariaux || 0) <= 0) ? 'disabled' : ''}>
                    ${canRepair ? '+50% Dura' : 'Intact'}
                </button>
            `;

            if (canRepair) {
                card.addEventListener('click', () => applyDuraRepair(d.uid, chance));
            }
        }

        grid.appendChild(card);
    });
}

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
    if (!game.repairMetariaux || game.repairMetariaux <= 0) {
        alert("Vous n'avez plus de Matériaux de réparation disponibles.");
        return;
    }

    const drill = game.inventory.find(d => d.uid === drillUid);
    if (!drill || drill.dura >= drill.maxDura) return;

    game.repairMetariaux--;
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= chance) {
        const healAmount = drill.maxDura * 0.5; // Gain fixe de 50%
        drill.dura = Math.min(drill.maxDura, drill.dura + healAmount);
        alert(`🎉 Réparation réussie sur ${drill.name} ! (+${Math.ceil(healAmount)} durabilité)`);
    } else {
        alert(`❌ Échec de la réparation sur ${drill.name} (${roll}/100 > ${chance}% requis). Les matériaux ont été consommés.`);
    }

    renderRepairGrid();
    updateUI();
    saveGameToServer();
}