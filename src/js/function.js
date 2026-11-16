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
    const selectedType = buyMatTypeSelect ? buyMatTypeSelect.value : "T0";
    const selectedTierIndex = parseInt(selectedType.replace("T", "")) || 0;
    const selectedStock = (game.repairMateriaux && game.repairMateriaux[selectedTierIndex]) || 0;
    
    const selectedStockBadge = document.getElementById('selected-mat-stock-count');
    if (selectedStockBadge) {
        selectedStockBadge.innerText = selectedStock;
    }

    if (buyMatTypeSelect) {
        Array.from(buyMatTypeSelect.options).forEach((opt, index) => {
            const template = game.drillTemplates[index];
            const baseName = template ? template.name : `Tier ${index}`;
            const isUnlocked = index <= game.unlockedDrillTier;
            const count = (game.repairMateriaux && game.repairMateriaux[index]) || 0;
            const text = isUnlocked ? `${baseName} (Stock: ${count})` : `${baseName} (Verrouillé)`;

            if (opt.innerText !== text) opt.innerText = text;
            opt.disabled = !isUnlocked;
        });

        if (buyMatTypeSelect.options[selectedTierIndex] && buyMatTypeSelect.options[selectedTierIndex].disabled) {
            buyMatTypeSelect.value = `T${game.unlockedDrillTier}`;
        }
    }

    const matTemplate = (game.repairMateriauxTemplates && game.repairMateriauxTemplates.find(m => m.type === selectedType)) || { costBase: 500 };
    const qtyMat = buyMatQtyInput ? Math.max(1, parseInt(buyMatQtyInput.value) || 1) : 1;
    const totalMatPrice = matTemplate.costBase * qtyMat;
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
    const btnUniv = document.getElementById('tab-repair-univ');
    const instructions = document.getElementById('repair-modal-instructions');

    // Réinitialisation visuelle de tous les onglets
    [btnHs, btnDura, btnUniv].forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
            btn.style.background = '#231d1b';
            btn.style.borderColor = '#423530';
            btn.style.color = '#cbd5e0';
        }
    });

    if (currentRepairTab === 'hs') {
        if (btnHs) {
            btnHs.classList.add('active');
            btnHs.style.background = 'linear-gradient(180deg, var(--copper-main) 0%, var(--copper-dark) 100%)';
            btnHs.style.borderColor = 'var(--brass)';
            btnHs.style.color = '#fff';
        }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse en panne pour tenter une remise en service (consomme 1 Caisse à outils).";
    } else if (currentRepairTab === 'dura') {
        if (btnDura) {
            btnDura.classList.add('active');
            btnDura.style.background = 'linear-gradient(180deg, var(--copper-main) 0%, var(--copper-dark) 100%)';
            btnDura.style.borderColor = 'var(--brass)';
            btnDura.style.color = '#fff';
        }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse endommagée pour réparer 50% de sa durabilité (consomme 1 Matériau de son Tier).";
    } else if (currentRepairTab === 'univ') {
        if (btnUniv) {
            btnUniv.classList.add('active');
            btnUniv.style.background = 'linear-gradient(180deg, #2e7d32 0%, #1b4d21 100%)';
            btnUniv.style.borderColor = '#50fa7b';
            btnUniv.style.color = '#fff';
        }
        if (instructions) instructions.innerText = "Cliquez sur une foreuse pour restaurer 100% de sa durabilité et réparer toute panne sans risque d'échec (consomme 1 Réparation Universelle).";
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
    const craftPartsEl = document.getElementById('craft-parts-count');

    if (kitsCountEl) kitsCountEl.innerText = game.repairKits || 0;
    if (univCountEl) univCountEl.innerText = game.universalRepairs || 0;
    if (craftPartsEl) craftPartsEl.innerText = game.craftParts || 0;
    if (kitStockCountEl) kitStockCountEl.innerText = game.repairKits || 0;

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
                <div style="font-size: 1.3rem;">🔧</div>
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
            const matStock = (game.repairMateriaux && game.repairMateriaux[d.tier]) || 0;
            const matName = template.name ? template.name.replace("Drill en ", "") : `T${d.tier}`;
            card.style.opacity = canRepair ? "1" : "0.5";
            card.style.cursor = canRepair ? "pointer" : "not-allowed";

            card.innerHTML = `
                <div style="font-size: 1.3rem;">❤️</div>
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
        } else if (currentRepairTab === 'univ') {
            const needsRepair = d.isHS || d.dura < d.maxDura;
            const hasUniv = (game.universalRepairs || 0) > 0;
            card.style.opacity = needsRepair ? "1" : "0.5";
            card.style.cursor = needsRepair ? "pointer" : "not-allowed";

            card.innerHTML = `
                <div style="font-size: 1.3rem;">✨</div>
                <div style="font-weight: bold; font-size: 0.82rem; color: #fff;">${d.name}</div>
                <div style="font-size: 0.72rem; color: #cbd5e0; line-height: 1.2;">
                    ❤️ ${Math.ceil(d.dura)}/${d.maxDura}<br>
                    État: <strong style="color: ${d.isHS ? '#ff5555' : '#50fa7b'};">${d.isHS ? 'HS' : 'OK'}</strong>
                </div>
                <button class="btn-mini btn-action-deploy" style="margin-top: 4px; width: 100%;" ${(!needsRepair || !hasUniv) ? 'disabled' : ''}>
                    ${needsRepair ? 'Remettre à Neuf' : 'Déjà à 100%'}
                </button>
            `;

            if (needsRepair) {
                card.addEventListener('click', () => applyUniversalRepair(d.uid));
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

    if (!drill.isHS && drill.dura >= drill.maxDura) {
        alert(`${drill.name} est déjà en parfait état !`);
        return;
    }

    game.universalRepairs--;
    drill.isHS = false;
    drill.dura = drill.maxDura;

    alert(`✨ Restauration Universelle réussie sur ${drill.name} ! Durabilité à 100% et panne levée.`);

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