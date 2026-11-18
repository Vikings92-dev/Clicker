async function saveGameToServer() {
    if (!PLAYER_NAME) return;
    try {
        await fetch(`${API_URL}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: PLAYER_NAME, game_state: game })
        });
    } catch (e) { console.error(e); }
}

async function loadGameFromServer() {
    try {
        const response = await fetch(`${API_URL}/load/${PLAYER_NAME}`);
        const data = await response.json();
        if (data.status === "success" && data.game_state) {
            const savedGame = data.game_state;
            game.money = savedGame.money ?? 0;
            game.pickaxeTier = savedGame.pickaxeTier ?? 0;
            game.unlockedDrillTier = savedGame.unlockedDrillTier ?? 0;
            game.drillCounterId = savedGame.drillCounterId ?? 0;
            game.inventory = savedGame.inventory ?? [];
            game.repairKits = savedGame.repairKits ?? 0;
            game.universalRepairs = savedGame.universalRepairs ?? 0;
            game.craftParts = savedGame.craftParts ?? 0;
            game.repairMateriaux = Array.isArray(savedGame.repairMateriaux) ? savedGame.repairMateriaux : [0,0,0,0,0];
            game.modulesStock = {
                electricite: (savedGame.modulesStock && savedGame.modulesStock.electricite) || 0,
                solidite: (savedGame.modulesStock && savedGame.modulesStock.solidite) || 0
            };

            if (Array.isArray(savedGame.phases)) {
                game.phases.forEach(localPhase => {
                    const savedPhase = savedGame.phases.find(p => p.id === localPhase.id);
                    if (savedPhase) {
                        localPhase.progress = savedPhase.progress ?? 0;
                        localPhase.unlocked = savedPhase.unlocked ?? (localPhase.id === 1);
                        localPhase.activeDrills = savedPhase.activeDrills ?? [];
                        localPhase.blockBrocken = savedPhase.blockBrocken ?? 0;
                        
                        if (localPhase.id === 1) {
                            let baseReward = 3; // Valeur par défaut
                            if (localPhase.blockBrocken >= 500) {
                                baseReward += game.paliers[3].ajoutReward;
                            }
                            else if (localPhase.blockBrocken >= 250) {
                                baseReward += game.paliers[2].ajoutReward;
                            }
                            else if (localPhase.blockBrocken >= 100) {
                                baseReward += game.paliers[1].ajoutReward;
                            }
                            localPhase.reward = baseReward;
                        }
                    }
                });
            }
        } else {
            game.money = 0; game.pickaxeTier = 0; game.unlockedDrillTier = 0; game.drillCounterId = 0; game.inventory = [];
            game.repairKits = 0; game.universalRepairs = 0; game.craftParts = 0; game.repairMateriaux = [0, 0, 0, 0, 0];
            game.modulesStock = { electricite: 0, solidite: 0 };
            game.phases.forEach(p => { p.progress = 0; p.blockBrocken = 0; p.unlocked = (p.id === 1); p.activeDrills = []; });
            await saveGameToServer();
        }
    } catch (error) { console.error(error); }
    finally { initPhases(); updateUI(); updatePhasePaliersVisuals();}
}

document.getElementById('login-btn').addEventListener('click', () => {
    const input = document.getElementById('username-input');
    const pseudo = input.value.trim();
    if (pseudo.length >= 2) {
        PLAYER_NAME = pseudo;
        document.getElementById('login-screen').style.display = 'none';
        loadGameFromServer();
        setInterval(saveGameToServer, 30000);
    } else { alert("Pseudonyme trop court."); }
});