function calculateMPS() {
    let totalMPS = 0;

    game.phases.forEach(p => {
        if (p.unlocked && p.activeDrills.length > 0) {
            let combinedPower = 0;
            let totalSpeed = 0;
            let activeDrillsCount = 0;

            p.activeDrills.forEach(d => {
                if (d.isHS || d.elec <= 0) return;

                combinedPower += d.power;
                totalSpeed += d.speed;
                activeDrillsCount++;
            });

            if (activeDrillsCount === 0) return;

            const combinedRatio = combinedPower / p.baseResist;
            const efficiencyMultiplier = combinedRatio >= 1
                ? Math.pow(combinedRatio, 0.75)
                : Math.pow(combinedRatio, 1.5);
            const averagePower = (combinedPower * efficiencyMultiplier) / activeDrillsCount;
            const averageSpeed = totalSpeed / activeDrillsCount;
            const rawProgressPerSecond = ((averagePower * averageSpeed) / p.baseResist) * 100;
            const cappedProgressPerSecond = Math.min(rawProgressPerSecond, 1000);

            const blocksPerSecond = cappedProgressPerSecond / 100;
            totalMPS += blocksPerSecond * p.reward;
        }
    });

    return totalMPS;
}