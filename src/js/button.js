let lastClickTimestampForInterval = 0;
let lastIntervalMs = 0;
let streakDurationAccumulatorMs = 0;

const INTERVAL_TOLERANCE_MS = 2; // Tolérance de 2ms
const REQUIRED_STREAK_DURATION_MS = 10000;

setInterval(() => {
    // 1. Détection cadence brute excessive (> 15 CPS pendant 5 sec)
    if (rawClickCount > 15) {
        overLimitSecondsStreak++;
        console.warn(`CPS au-dessus de la limite (${rawClickCount} CPS) : ${overLimitSecondsStreak}/5 sec`);

        if (overLimitSecondsStreak >= 5) {
            triggerAutoclickerAlert();
            overLimitSecondsStreak = 0;
        }
    } else {
        overLimitSecondsStreak = 0;
    }

    // 2. Mise à jour de l'affichage sur le bouton
    if (clickBtn) {
        clickBtn.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <span>MINER !</span>
                <span style="font-size: 0.95rem; color: var(--brass, #c5a059); margin-top: 4px; font-family: var(--font-mono);">
                    ${validClicksThisSecond} / 15 CPS
                </span>
            </div>
        `;
    }

    rawClickCount = 0;
    validClicksThisSecond = 0;
}, 1000);

clickBtn.addEventListener('click', (e) => {
    if (isGameFinished || isSuspendedByCaptcha) return;

    rawClickCount++;
    
    // Test de l'événement aléatoire (1 chance sur 500 clics valides)
    if (typeof checkRandomClickEvent === 'function') {
        checkRandomClickEvent();
    }

    const now = performance.now();

    // 1. Mesure de l'écart en ms entre chaque clic (détection autoclicker 10 sec)
    if (lastClickTimestampForInterval > 0) {
        const deltaMs = now - lastClickTimestampForInterval;

        if (lastIntervalMs > 0 && Math.abs(deltaMs - lastIntervalMs) <= INTERVAL_TOLERANCE_MS) {
            streakDurationAccumulatorMs += deltaMs;

            if (streakDurationAccumulatorMs >= REQUIRED_STREAK_DURATION_MS) {
                console.warn(`Autoclicker détecté : intervalle de ~${Math.round(lastIntervalMs)}ms stable pendant 10s !`);
                triggerAutoclickerAlert();
                streakDurationAccumulatorMs = 0;
                lastIntervalMs = 0;
            }
        } else {
            // Variation temporelle normale d'un humain : réinitialisation de la série
            streakDurationAccumulatorMs = 0;
            console.log(`Intervalle de clics varié : ${Math.round(deltaMs)}ms (dernier intervalle : ${Math.round(lastIntervalMs)}ms)`);
        }

        lastIntervalMs = deltaMs;
    }

    lastClickTimestampForInterval = now;

    // 2. Limite mécanique anti-spam (interdit de cliquer plus vite que 15 CPS)
    if (now - lastValidClickTimestamp < MIN_CLICK_INTERVAL_MS) {
        return;
    }
    lastValidClickTimestamp = now;

    validClicksThisSecond++;

    // Tirage aléatoire de loot au clic
    if (typeof checkClickLoot === 'function') {
        checkClickLoot(e);
    }

    // Multiplicateur temporaire (si actif via js/events.js)
    const currentMultiplier = (typeof getClickMultiplier === 'function') ? getClickMultiplier() : 1;
    game.money += game.pickaxePower[game.pickaxeTier] * currentMultiplier;

    updateUI();
});

upgradePickaxeBtn.addEventListener('click', async () => {
    if (isGameFinished || isPurchaseOnCooldown || game.pickaxeTier >= game.pickaxeCosts.length) return;

    const cost = game.pickaxeCosts[game.pickaxeTier];
    if (game.money >= cost) {
        game.money -= cost;
        game.pickaxeTier++;
        updateUI();
        updatePickaxeCursor();
        await saveGameToServer();
    }
});

buyDrillGlobalBtn.addEventListener('click', async () => {
    if (isGameFinished || isPurchaseOnCooldown) return;
    const cost = getGlobalDrillCost();
    if (game.money >= cost) {
        game.money -= cost;
        const template = game.drillTemplates[game.unlockedDrillTier];
        game.drillCounterId++;
        game.inventory.push({
            uid: game.drillCounterId,
            tier: template.tier,
            name: template.name,
            speed: template.speed,
            power: template.power,
            maxDura: template.maxDura,
            maxElec: template.maxElec,
            regen: template.regen,
            dura: template.maxDura,
            elec: template.maxElec,
            perteDura: template.pourcentagePerteDura,
            resistance: template.resistance,
            isHS: template.isHS,
            image: template.image,
            modules: { electricite: false, solidite: false }
        });
        updateUI();
        await saveGameToServer();
    }
});

researchDrillBtn.addEventListener('click', async () => {
    if (isGameFinished || isPurchaseOnCooldown || game.unlockedDrillTier >= game.researchCosts.length) return;
    
    const cost = game.researchCosts[game.unlockedDrillTier];
    const chance = game.researchChances[game.unlockedDrillTier];
    
    if (game.money >= cost) {
        game.money -= cost;
        
        const roll = Math.floor(Math.random() * 100) + 1;
        
        if (roll <= chance) {
            game.unlockedDrillTier++;
            if (typeof refreshShopMatSelect === 'function') refreshShopMatSelect();
            alert(`🎉 Succès ! Vous avez débloqué les technologies pour fabriquer : ${game.drillTemplates[game.unlockedDrillTier].name} !`);
        } else {
            alert(`❌ Échec de la recherche ! Les prototypes ont explosé. Vos scientifiques demandent de nouveaux fonds pour retenter (${roll}/100 requis <= ${chance}).`);
        }
        
        updateUI();
        await saveGameToServer();
    }
});

const openShopBtn = document.getElementById('open-shop-btn');
if (openShopBtn) {
    openShopBtn.addEventListener('click', openShopModal);
}

if (buyKitQtyInput) {
    buyKitQtyInput.addEventListener('input', () => {
        if (buyKitQtyInput.value < 1) buyKitQtyInput.value = 1;
        updateCosts();
    });
}

if (buyKitBtn) {
    buyKitBtn.addEventListener('click', async () => {
        if (isGameFinished || isPurchaseOnCooldown) return;

        const qty = Math.max(1, parseInt(buyKitQtyInput.value) || 1);
        const totalCost = (game.kitCost || 5000) * qty;

        if (game.money >= totalCost) {
            game.money -= totalCost;
            game.repairKits = (game.repairKits || 0) + qty;

            triggerPurchaseCooldown();
            updateUI();
            updateCosts();
            await saveGameToServer();
        }
    });
}

const openRepairBtn = document.getElementById('open-repair-btn');
if (openRepairBtn) {
    openRepairBtn.addEventListener('click', openRepairModal);
}

if (buyMatTypeSelect) {
    buyMatTypeSelect.addEventListener('change', () => {
        updateCosts();
    });
}

if (buyMatQtyInput) {
    buyMatQtyInput.addEventListener('input', () => {
        if (buyMatQtyInput.value < 1) buyMatQtyInput.value = 1;
        updateCosts();
    });
}

if (buyMatBtn) {
    buyMatBtn.addEventListener('click', async () => {
        if (isGameFinished || isPurchaseOnCooldown) return;

        const selectedType = buyMatTypeSelect ? buyMatTypeSelect.value : "T0";
        const matTemplate = game.repairMateriauxTemplates.find(m => m.type === selectedType) || game.repairMateriauxTemplates[0];
        const qty = Math.max(1, parseInt(buyMatQtyInput.value) || 1);
        const totalCost = matTemplate.costBase * qty;

        if (game.money >= totalCost) {
            game.money -= totalCost;
            game.repairMateriaux[matTemplate.tier] = (game.repairMateriaux[matTemplate.tier] || 0) + qty;

            if (typeof refreshShopMatSelect === 'function') refreshShopMatSelect();
            triggerPurchaseCooldown();
            updateUI();
            updateCosts();
            await saveGameToServer();
        }
    });
}

if (buyModElecQtyInput) {
    buyModElecQtyInput.addEventListener('input', () => {
        if (buyModElecQtyInput.value < 1) buyModElecQtyInput.value = 1;
        updateCosts();
    });
}

if (buyModElecBtn) {
    buyModElecBtn.addEventListener('click', async () => {
        if (isGameFinished || isPurchaseOnCooldown) return;

        const qty = Math.max(1, parseInt(buyModElecQtyInput.value) || 1);
        const unitCost = (game.moduleTemplates && game.moduleTemplates.electricite.cost) || 5000;
        const totalCost = unitCost * qty;

        if (game.money >= totalCost) {
            game.money -= totalCost;
            if (!game.modulesStock) game.modulesStock = { electricite: 0, solidite: 0 };
            game.modulesStock.electricite = (game.modulesStock.electricite || 0) + qty;

            triggerPurchaseCooldown();
            updateUI();
            updateCosts();
            await saveGameToServer();
        }
    });
}

if (buyModSolidQtyInput) {
    buyModSolidQtyInput.addEventListener('input', () => {
        if (buyModSolidQtyInput.value < 1) buyModSolidQtyInput.value = 1;
        updateCosts();
    });
}

if (buyModSolidBtn) {
    buyModSolidBtn.addEventListener('click', async () => {
        if (isGameFinished || isPurchaseOnCooldown) return;

        const qty = Math.max(1, parseInt(buyModSolidQtyInput.value) || 1);
        const unitCost = (game.moduleTemplates && game.moduleTemplates.solidite.cost) || 15000;
        const totalCost = unitCost * qty;

        if (game.money >= totalCost) {
            game.money -= totalCost;
            if (!game.modulesStock) game.modulesStock = { electricite: 0, solidite: 0 };
            game.modulesStock.solidite = (game.modulesStock.solidite || 0) + qty;

            triggerPurchaseCooldown();
            updateUI();
            updateCosts();
            await saveGameToServer();
        }
    });
}