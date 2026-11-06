setInterval(() => {
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

clickBtn.addEventListener('click', () => {
    if (isGameFinished || isSuspendedByCaptcha) return;

    rawClickCount++;

    const now = performance.now();
    if (now - lastValidClickTimestamp < MIN_CLICK_INTERVAL_MS) {
        return;
    }
    lastValidClickTimestamp = now;

    validClicksThisSecond++;
    game.money += game.pickaxePower[game.pickaxeTier];
    updateUI();
});

upgradePickaxeBtn.addEventListener('click', async () => {
    if (isGameFinished || isPurchaseOnCooldown || game.pickaxeTier >= game.pickaxeCosts.length) return;

    const cost = game.pickaxeCosts[game.pickaxeTier];
    if (game.money >= cost) {
        game.money -= cost;
        game.pickaxeTier++;
        updateUI();
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
            resistance: template.resistance
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