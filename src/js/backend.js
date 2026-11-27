// MODIF: Authentification automatique par jeton signé Chronos et gestion des erreurs 401
function showChronosRedirectScreen(message) {
    AUTH_TOKEN = "";
    PLAYER_NAME = "";
    sessionStorage.removeItem('chronos_clicker_token');

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        const desc = loginScreen.querySelector('p');
        if (desc && message) desc.innerText = message;
        loginScreen.style.display = 'flex';
    }
}

function getAuthHeaders(includeJson = false) {
    const headers = {
        'Authorization': `Bearer ${AUTH_TOKEN}`
    };
    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

async function saveGameToServer() {
    if (!AUTH_TOKEN || isSuspendedByCaptcha) return;
    try {
        const response = await fetch(`${API_URL}/save`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ game_state: game })
        });
        if (response.status === 401) {
            showChronosRedirectScreen("Votre session a expiré. Reconnectez-vous depuis Projet Chronos.");
            return;
        }
        if (response.status === 403) {
            const data = await response.json();
            if (data.timeout) {
                activateTimeoutScreen(data.timeout);
            }
        }
    } catch (e) { console.error(e); }
}

async function loadGameFromServer() {
    if (!AUTH_TOKEN) {
        showChronosRedirectScreen();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/load`, {
            method: 'GET',
            headers: getAuthHeaders(false)
        });

        if (response.status === 401) {
            showChronosRedirectScreen("Session invalide ou expirée. Veuillez relancer le jeu depuis Projet Chronos.");
            return;
        }

        const data = await response.json();
        PLAYER_NAME = data.username || "Mineur";
        document.getElementById('login-screen').style.display = 'none';

        updateWarnBadgeUI(data.active_warns || 0);

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

                        if (Array.isArray(localPhase.displays) && localPhase.displays.length > 0) {
                            const savedIdx = savedPhase.selectedDisplay ?? 0;
                            localPhase.selectedDisplay = (savedIdx >= 0 && savedIdx < localPhase.displays.length) ? savedIdx : 0;
                        }
                        
                        if (localPhase.id === 1) {
                            let baseReward = 3;
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
            game.phases.forEach(p => {
                p.progress = 0;
                p.blockBrocken = 0;
                p.unlocked = (p.id === 1);
                p.activeDrills = [];
                if (Array.isArray(p.displays)) p.selectedDisplay = 0;
            });
            await saveGameToServer();
        }

        if (data.timeout) {
            activateTimeoutScreen(data.timeout);
        }

        initPhases();
        updateUI();
        if (typeof updatePickaxeCursor === 'function') updatePickaxeCursor(true);
        updatePhasePaliersVisuals();
        setInterval(saveGameToServer, 30000);
    } catch (error) {
        console.error(error);
        showChronosRedirectScreen("Impossible de joindre le serveur de jeu. Réessayez depuis Projet Chronos.");
    }
}

// MODIF: Initialisation automatique au chargement de la page via ?token=... ou sessionStorage
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
        AUTH_TOKEN = tokenFromUrl;
        sessionStorage.setItem('chronos_clicker_token', tokenFromUrl);
        // Nettoie le token de la barre d'adresse
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        AUTH_TOKEN = sessionStorage.getItem('chronos_clicker_token') || "";
    }

    if (!AUTH_TOKEN) {
        showChronosRedirectScreen();
        return;
    }

    loadGameFromServer();
});

let activeTimeoutInterval = null;
let currentActiveWarns = 0;

function updateWarnBadgeUI(warnCount) {
    currentActiveWarns = warnCount || 0;
    const badge = document.getElementById('player-warn-badge');
    const countEl = document.getElementById('player-warn-count');
    const popupStatusEl = document.getElementById('autoclicker-warn-status');

    if (countEl) countEl.innerText = currentActiveWarns;
    if (badge) {
        badge.style.display = currentActiveWarns > 0 ? 'block' : 'none';
    }
    if (popupStatusEl) {
        popupStatusEl.innerText = `Avertissement : ${currentActiveWarns} / 3 (expire après 1h)`;
    }
}
window.updateWarnBadgeUI = updateWarnBadgeUI;

function formatRemainingTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (days > 0) return `${days}j ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    return `${pad(minutes)}m ${pad(seconds)}s`;
}

function activateTimeoutScreen(timeoutData) {
    if (!timeoutData || !timeoutData.remaining_seconds || timeoutData.remaining_seconds <= 0) return;

    const acPopup = document.getElementById('autoclicker-popup');
    if (acPopup) acPopup.style.display = 'none';

    isSuspendedByCaptcha = true;

    const screen = document.getElementById('timeout-screen');
    const reasonEl = document.getElementById('timeout-reason-text');
    const countdownEl = document.getElementById('timeout-countdown');

    if (reasonEl) {
        reasonEl.innerText = `Exclusion temporaire #${timeoutData.timeout_number || 1} — Limite de 3 avertissements atteinte.`;
    }
    if (screen) screen.style.display = 'flex';

    const expiresAtMs = Date.now() + (timeoutData.remaining_seconds * 1000);

    if (activeTimeoutInterval) clearInterval(activeTimeoutInterval);

    const tickTimer = () => {
        const remaining = expiresAtMs - Date.now();
        if (remaining <= 0) {
            clearInterval(activeTimeoutInterval);
            activeTimeoutInterval = null;
            if (screen) screen.style.display = 'none';
            isSuspendedByCaptcha = false;
            updateWarnBadgeUI(0);
            return;
        }
        if (countdownEl) {
            countdownEl.innerText = formatRemainingTime(remaining);
        }
    };

    tickTimer();
    activeTimeoutInterval = setInterval(tickTimer, 1000);
}
window.activateTimeoutScreen = activateTimeoutScreen;

async function reportAutoclickerWarnToServer(reason = 'autoclick_detected') {
    if (!AUTH_TOKEN) return;
    try {
        const response = await fetch(`${API_URL}/warn`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ reason })
        });
        const data = await response.json();

        if (data.status === "timed_out" && data.timeout) {
            activateTimeoutScreen(data.timeout);
        } else if (data.status === "warned") {
            updateWarnBadgeUI(data.active_warns);
        }
    } catch (e) {
        console.error("Erreur lors de l'envoi du warn :", e);
    }
}
window.reportAutoclickerWarnToServer = reportAutoclickerWarnToServer;