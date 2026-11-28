import { API_URL, game } from './state.js';
import { closeAutoclickerPopup, closeDeploymentModal, initPhases, isSuspendedByCaptcha, refreshShopMatSelect, setSuspendedByCaptcha, showCaptchaPopup, updatePhasePaliersVisuals, updatePickaxeCursor, updateUI } from './function.js';

// Authentification par jeton signé Chronos, sauvegarde versionnée et vérification serveur du captcha
export let SAVE_VERSION = 0;
export let saveInFlight = false;
export let savePending = false;
export let autoSaveIntervalId = null;
export let pendingCaptchaToken = null;
export let PLAYER_NAME = "";
export let AUTH_TOKEN = "";

export function setPendingCaptchaToken(token) {
    pendingCaptchaToken = token;
}

export function showChronosRedirectScreen(message) {
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

export function getAuthHeaders(includeJson = false) {
    const headers = {
        'Authorization': `Bearer ${AUTH_TOKEN}`
    };
    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

export function resetGameState() {
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
}

// Applique un état venant du serveur (chargement, ou correction après une sauvegarde refusée)
export function applySavedState(savedGame) {
    if (!savedGame) {
        resetGameState();
        return;
    }
    game.money = savedGame.money ?? 0;
    game.pickaxeTier = savedGame.pickaxeTier ?? 0;
    game.unlockedDrillTier = savedGame.unlockedDrillTier ?? 0;
    game.drillCounterId = savedGame.drillCounterId ?? 0;
    game.inventory = savedGame.inventory ?? [];
    game.repairKits = savedGame.repairKits ?? 0;
    game.universalRepairs = savedGame.universalRepairs ?? 0;
    game.craftParts = savedGame.craftParts ?? 0;
    game.repairMateriaux = Array.isArray(savedGame.repairMateriaux) ? savedGame.repairMateriaux : [0, 0, 0, 0, 0];
    game.modulesStock = {
        electricite: (savedGame.modulesStock && savedGame.modulesStock.electricite) || 0,
        solidite: (savedGame.modulesStock && savedGame.modulesStock.solidite) || 0
    };

    if (Array.isArray(savedGame.phases)) {
        game.phases.forEach(localPhase => {
            const savedPhase = savedGame.phases.find(p => p.id === localPhase.id);
            if (!savedPhase) return;
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
                } else if (localPhase.blockBrocken >= 250) {
                    baseReward += game.paliers[2].ajoutReward;
                } else if (localPhase.blockBrocken >= 100) {
                    baseReward += game.paliers[1].ajoutReward;
                }
                localPhase.reward = baseReward;
            }
        });
    }
}

export function refreshWholeUI() {
    if (typeof closeDeploymentModal === 'function') closeDeploymentModal();
    initPhases();
    updateUI();
    if (typeof refreshShopMatSelect === 'function') refreshShopMatSelect();
    if (typeof updatePickaxeCursor === 'function') updatePickaxeCursor(true);
    updatePhasePaliersVisuals();
}

// Les sauvegardes sont envoyées une par une : si une sauvegarde est demandée pendant qu'une autre
// est en cours, elle est regroupée et envoyée juste après (évite les conflits de version).
export async function saveGameToServer() {
    if (!AUTH_TOKEN || isSuspendedByCaptcha) return;
    if (saveInFlight) {
        savePending = true;
        return;
    }
    saveInFlight = true;
    try {
        do {
            savePending = false;
            const keepGoing = await sendSave();
            if (!keepGoing) break;
        } while (savePending && !isSuspendedByCaptcha);
    } finally {
        saveInFlight = false;
        savePending = false;
    }
}

export async function sendSave() {
    try {
        const response = await fetch(`${API_URL}/save`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ game_state: game, save_version: SAVE_VERSION })
        });

        if (response.status === 401) {
            showChronosRedirectScreen("Votre session a expiré. Reconnectez-vous depuis Projet Chronos.");
            return false;
        }

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.status === "success") {
            SAVE_VERSION = data.save_version;
            return true;
        }

        if (response.status === 403) {
            if (data.timeout) activateTimeoutScreen(data.timeout);
            else if (data.status === "captcha_required") showCaptchaPopup();
            return false;
        }

        if (response.status === 409) {
            // Partie sauvegardée depuis un autre onglet / appareil : on reprend la version du serveur
            if (data.game_state) {
                SAVE_VERSION = data.save_version;
                applySavedState(data.game_state);
                refreshWholeUI();
                alert("⚠️ Votre partie a été modifiée depuis un autre onglet ou appareil. La dernière sauvegarde a été rechargée.");
            } else {
                await reloadStateFromServer();
            }
            return false;
        }

        if (response.status === 422) {
            // Sauvegarde jugée incohérente par le serveur : retour au dernier état valide
            SAVE_VERSION = data.save_version;
            applySavedState(data.game_state);
            refreshWholeUI();
            alert("⚠️ Sauvegarde refusée par le serveur (progression incohérente). Retour à la dernière sauvegarde valide.");
            return false;
        }

        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function fetchGameFromServer() {
    const response = await fetch(`${API_URL}/load`, {
        method: 'GET',
        headers: getAuthHeaders(false)
    });
    if (response.status === 401) {
        showChronosRedirectScreen("Session invalide ou expirée. Veuillez relancer le jeu depuis Projet Chronos.");
        return null;
    }
    if (!response.ok) throw new Error(`Chargement impossible (${response.status})`);
    return response.json();
}

export async function reloadStateFromServer() {
    try {
        const data = await fetchGameFromServer();
        if (!data) return;
        SAVE_VERSION = data.save_version || 0;
        applySavedState(data.status === "success" ? data.game_state : null);
        refreshWholeUI();
    } catch (e) {
        console.error(e);
    }
}

export async function loadGameFromServer() {
    if (!AUTH_TOKEN) {
        showChronosRedirectScreen();
        return;
    }

    try {
        const data = await fetchGameFromServer();
        if (!data) return;

        PLAYER_NAME = data.username || "Mineur";
        document.getElementById('login-screen').style.display = 'none';
        updateWarnBadgeUI(data.active_warns || 0);
        SAVE_VERSION = data.save_version || 0;

        const isNewPlayer = !(data.status === "success" && data.game_state);
        applySavedState(isNewPlayer ? null : data.game_state);

        if (data.timeout) {
            activateTimeoutScreen(data.timeout);
        } else if (data.captcha_required) {
            showCaptchaPopup();
        }

        refreshWholeUI();
        if (isNewPlayer) await saveGameToServer();

        if (!autoSaveIntervalId) autoSaveIntervalId = setInterval(saveGameToServer, 30000);
    } catch (error) {
        console.error(error);
        showChronosRedirectScreen("Impossible de joindre le serveur de jeu. Réessayez depuis Projet Chronos.");
    }
}

// Récupération du jeton : #token=... (recommandé : jamais envoyé aux serveurs ni dans les logs),
// ?token=... (ancien format) ou sessionStorage
window.addEventListener('DOMContentLoaded', () => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = hashParams.get('token') || urlParams.get('token');

    if (tokenFromUrl) {
        AUTH_TOKEN = tokenFromUrl;
        sessionStorage.setItem('chronos_clicker_token', tokenFromUrl);
        // Nettoie le token de la barre d'adresse et de l'historique
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

export let activeTimeoutInterval = null;
export let currentActiveWarns = 0;

export function updateWarnBadgeUI(warnCount) {
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

export function formatRemainingTime(ms) {
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

export function activateTimeoutScreen(timeoutData) {
    if (!timeoutData || !timeoutData.remaining_seconds || timeoutData.remaining_seconds <= 0) return;

    const acPopup = document.getElementById('autoclicker-popup');
    if (acPopup) acPopup.style.display = 'none';

    setSuspendedByCaptcha(true);

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
            setSuspendedByCaptcha(false);
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

export async function reportAutoclickerWarnToServer(reason = 'autoclick_detected') {
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

// Le captcha est validé par le serveur (Cloudflare siteverify) : sans cela, les sauvegardes restent bloquées
export async function submitCaptchaToServer() {
    const btn = document.getElementById('btn-close-autoclicker');
    if (!pendingCaptchaToken) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = "Vérification en cours...";
    }

    try {
        const response = await fetch(`${API_URL}/captcha`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ token: pendingCaptchaToken })
        });
        pendingCaptchaToken = null;

        if (response.ok) {
            closeAutoclickerPopup();
            saveGameToServer();
            return;
        }
    } catch (e) {
        console.error("Erreur lors de la vérification du captcha :", e);
    }

    // Échec : nouveau captcha
    pendingCaptchaToken = null;
    if (btn) btn.innerText = "Échec de la vérification, réessayez";
    if (window.turnstile) window.turnstile.reset('#cf-turnstile-container');
}

function initChronosSession() {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = hashParams.get('token') || urlParams.get('token');

    if (tokenFromUrl) {
        AUTH_TOKEN = tokenFromUrl;
        sessionStorage.setItem('chronos_clicker_token', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        AUTH_TOKEN = sessionStorage.getItem('chronos_clicker_token') || "";
    }

    if (!AUTH_TOKEN) {
        showChronosRedirectScreen();
        return;
    }

    loadGameFromServer();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initChronosSession);
} else {
    initChronosSession();
}