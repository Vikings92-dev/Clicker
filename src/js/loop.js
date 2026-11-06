// MODIF: Boucle de jeu optimisée (100ms) avec scoping propre
const dt = 0.1;
const SECONDE = 10;
let ticksCounter = 0;

setInterval(() => {
    if (isGameFinished || isSuspendedByCaptcha) return;

    // Régénération passive de l'électricité dans le hangar
    game.inventory.forEach(d => {
        if (d.elec < d.maxElec) d.elec = Math.min(d.maxElec, d.elec + (1 * dt));
    });

    ticksCounter++;
    const isOneSecondTick = (ticksCounter >= SECONDE);

    game.phases.forEach(p => {
        let noElecDrill = 0;

        if (p.activeDrills.length > 0) {
            let combinedPower = 0;
            let totalSpeed = 0;

            p.activeDrills.forEach(d => {
                if (d.isHS || d.elec <= 0) {
                    noElecDrill++;
                    return;
                }

                if (isOneSecondTick) {
                    const failRoll = Math.random() * 600; // env toute les 10 minutes
                    if (failRoll < 1) {
                        d.isHS = true;
                        alert(`💥 Votre ${d.name} est HS ! Il ne peut plus être utilisé jusqu'à réparation.`);
                        noElecDrill++;
                        return;
                    }
                }

                d.elec -= 1 * dt;
                combinedPower += d.power;
                totalSpeed += d.speed;
            });

            const activeDrillsCount = p.activeDrills.length - noElecDrill;
            if (activeDrillsCount <= 0) {
                return;
            }

            const combinedRatio = combinedPower / p.baseResist;
            const efficiencyMultiplier = combinedRatio >= 1 
                ? Math.pow(combinedRatio, 0.75) 
                : Math.pow(combinedRatio, 1.5);

            if (isOneSecondTick) {
                const frictionOverload = Math.max(1, p.baseResist / combinedPower);
                const baseDamage = 0.5;
                const damage = Math.min(50, baseDamage * Math.pow(frictionOverload, 1.3));

                p.activeDrills.forEach(d => {
                    if (d.elec <= 0) return;
                    const breakRoll = Math.random() * 100;
                    if (breakRoll > d.perteDura) {
                        d.dura -= damage;
                    }
                });
            }

            const totalEffectivePower = combinedPower * efficiencyMultiplier;
            const averagePower = totalEffectivePower / activeDrillsCount;
            const averageSpeed = totalSpeed / activeDrillsCount;
            const rawProgressIncrement = ((averagePower * averageSpeed) / p.baseResist) * 100 * dt;
            const maxProgressPerTick = 100
            p.progress += Math.min(rawProgressIncrement, maxProgressPerTick);

            if (p.progress >= 100) {
                const blocksBroken = Math.floor(p.progress / 100);
                game.money += blocksBroken * p.reward;
                p.progress %= 100;
                p.blockBrocken += blocksBroken;

                p.activeDrills.forEach(d => {
                    if (d.elec <= 0) return;
                    const individualOverload = Math.max(1, p.baseResist / d.power);
                    const impactDamage = Math.min(30, 1.0 * Math.pow(individualOverload, 1.3));
                    d.dura -= impactDamage * blocksBroken;
                });

                if (p.id === 1) {
                    updatePhasePaliersVisuals();
                    if (p.blockBrocken >= 500) {
                        p.reward = 3 + game.paliers[3].ajoutReward;
                    } else if (p.blockBrocken >= 250) {
                        p.reward = 3 + game.paliers[2].ajoutReward;
                    } else if (p.blockBrocken >= 100) {
                        p.reward = 3 + game.paliers[1].ajoutReward;
                    }
                }
            }

            p.activeDrills = p.activeDrills.filter(d => d.dura > 0);

            const progBar = document.getElementById(`drill-progress-${p.id}`);
            const progText = document.getElementById(`drill-progress-text-${p.id}`);
            if (progBar) {
                progBar.style.width = `${p.progress}%`;
                progText.innerText = `${Math.floor(p.progress)}%`;
            }
        } else {
            const progBar = document.getElementById(`drill-progress-${p.id}`);
            const progText = document.getElementById(`drill-progress-text-${p.id}`);
            if (progBar) { 
                progBar.style.width = `0%`; 
                progText.innerText = `0%`; 
            }
        }
    });
    
    if (isOneSecondTick) {
        ticksCounter = 0;
    }

    checkVictoryCondition();
    updateUI();
}, dt * 1000);