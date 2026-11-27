import { game } from './state.js';
import { formatMoney, updateUI } from './function.js';
import { saveGameToServer } from './backend.js';

// MODIF: Événements aléatoires avec traînée de particules (Option A), rareté vert à or et vitesse proportionnelle
export let clickMultiplier = 1;
export let clickMultiplierTimeout = null;

export function checkRandomClickEvent() {
    // 1 chance sur 2 pour les tests (remettre * 500 pour la production finale)
    const roll = Math.floor(Math.random() * 500) + 1;
    if (roll === 1) {
        spawnClickOrb();
    }
}

export function spawnClickOrb() {
    const clickArea = document.querySelector('.click-area');
    if (!clickArea) return;

    // Empêche d'avoir plusieurs orbes simultanés
    if (clickArea.querySelector('.click-event-orb')) return;

    const orb = document.createElement('div');
    orb.className = 'click-event-orb';
    orb.style.position = 'absolute';

    const eventTypeRoll = Math.random();
    let bonusConfig = {};
    let rarityScore = 0; // Valeur entre 0 (commun) et 1 (ultra rare)

    if (eventTypeRoll < 0.55) {
        // Multiplicateur temporaire
        const mRoll = Math.random();
        let mult = 2;
        let baseRarity = 0.15;
        if (mRoll > 0.90) {
            mult = 4;
            baseRarity = 0.85;
        } else if (mRoll > 0.60) {
            mult = 3;
            baseRarity = 0.50;
        }

        const duration = Math.floor(5 + (1 - Math.pow(Math.random(), 0.5)) * 5); // 5s à 10s
        rarityScore = Math.min(1.0, baseRarity + ((duration - 5) / 5) * 0.15);

        bonusConfig = {
            type: 'multiplier',
            mult: mult,
            duration: duration,
            icon: '⚡'
        };
    } else {
        // Gain instantané (+Z clics)
        const powerRoll = Math.pow(Math.random(), 1.5);
        const clicksGranted = Math.floor(10 + (1 - powerRoll) * 20); // 10 à 30 clics
        rarityScore = (clicksGranted - 10) / 20; // 0.0 pour 10 clics, 1.0 pour 30 clics

        bonusConfig = {
            type: 'burst',
            clicks: clicksGranted,
            icon: '💎'
        };
    }

    orb.innerHTML = bonusConfig.icon;

    // Détermination de la couleur selon le score de rareté (Vert -> Jaune -> Or)
    let trailColor = '#55efc4';
    if (rarityScore < 0.35) {
        orb.classList.add('orb-common');
        trailColor = '#55efc4'; // Vert émeraude
    } else if (rarityScore < 0.70) {
        orb.classList.add('orb-medium');
        trailColor = '#fdcb6e'; // Jaune ambré
    } else {
        orb.classList.add('orb-legendary');
        trailColor = '#ffd700'; // Or éclatant
    }

    // Calcul de la vitesse : plus c'est rare, plus c'est rapide (5.5s -> 2.0s)
    const travelDurationMs = 5500 - (rarityScore * 3500);

    const areaRect = clickArea.getBoundingClientRect();
    const orbSize = 56;

    const maxW = Math.max(orbSize + 20, areaRect.width) - orbSize - 10;
    const maxH = Math.max(orbSize + 20, areaRect.height) - orbSize - 10;

    // Points de passage périphériques pour contourner le bouton central
    function getPeripheryPoint(zoneIndex) {
        if (zoneIndex === 0) {
            return {
                x: 10 + Math.random() * Math.max(10, maxW - 10),
                y: 10 + Math.random() * Math.min(50, maxH * 0.22)
            };
        } else if (zoneIndex === 1) {
            return {
                x: 10 + Math.random() * Math.max(10, maxW - 10),
                y: Math.max(10, maxH - Math.random() * Math.min(50, maxH * 0.22))
            };
        } else if (zoneIndex === 2) {
            return {
                x: 10 + Math.random() * Math.min(45, maxW * 0.2),
                y: 10 + Math.random() * Math.max(10, maxH - 10)
            };
        } else {
            return {
                x: Math.max(10, maxW - Math.random() * Math.min(45, maxW * 0.2)),
                y: 10 + Math.random() * Math.max(10, maxH - 10)
            };
        }
    }

    const startZone = Math.floor(Math.random() * 4);
    const endZone = (startZone + 1 + Math.floor(Math.random() * 3)) % 4;
    const controlZone = (startZone + 2) % 4;

    const startPt = getPeripheryPoint(startZone);
    const endPt = getPeripheryPoint(endZone);
    const ctrlPt = getPeripheryPoint(controlZone);

    orb.style.left = `${startPt.x}px`;
    orb.style.top = `${startPt.y}px`;
    clickArea.appendChild(orb);

    const startTime = performance.now();
    let lastTrailSpawnTime = 0;

    function moveOrb(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / travelDurationMs);

        // Formule de Bézier quadratique : (1-t)²*P0 + 2(1-t)t*P1 + t²*P2
        const currentX = (1 - t) * (1 - t) * startPt.x + 2 * (1 - t) * t * ctrlPt.x + t * t * endPt.x;
        const currentY = (1 - t) * (1 - t) * startPt.y + 2 * (1 - t) * t * ctrlPt.y + t * t * endPt.y;

        const clampedX = Math.max(5, Math.min(maxW, currentX));
        const clampedY = Math.max(5, Math.min(maxH, currentY));

        orb.style.left = `${clampedX}px`;
        orb.style.top = `${clampedY}px`;

        // Émission rapprochée (toutes les 22 ms) pour une traînée continue et très longue
        if (now - lastTrailSpawnTime > 22 && orb.isConnected) {
            lastTrailSpawnTime = now;
            createTrailParticle(clickArea, clampedX + (orbSize / 2), clampedY + (orbSize / 2), trailColor);
        }

        if (t < 1 && orb.isConnected) {
            requestAnimationFrame(moveOrb);
        } else if (orb.isConnected) {
            orb.remove();
        }
    }
    requestAnimationFrame(moveOrb);

    orb.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerBonusEffect(bonusConfig, orb.getBoundingClientRect());
        orb.remove();
    });
}

// Fonction de génération d'une particule éphémère de traînée
export function createTrailParticle(container, centerX, centerY, color) {
    const particle = document.createElement('div');
    particle.className = 'event-trail-particle';
    const size = Math.floor(16 + Math.random() * 14); // 16px à 30px
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.background = color;
    particle.style.boxShadow = `0 0 10px ${color}`;

    container.appendChild(particle);
    setTimeout(() => {
        if (particle.isConnected) particle.remove();
    }, 400); // Nettoyage DOM synchrone avec la fin de l'animation CSS
}

export function triggerBonusEffect(bonus, rect) {
    const clickArea = document.querySelector('.click-area');
    const toast = document.createElement('div');
    toast.className = 'event-toast';

    if (rect && clickArea) {
        const parentRect = clickArea.getBoundingClientRect();
        toast.style.left = `${rect.left - parentRect.left + 10}px`;
        toast.style.top = `${rect.top - parentRect.top - 15}px`;
    }

    const pickaxePower = (game.pickaxePower && game.pickaxePower[game.pickaxeTier]) ? game.pickaxePower[game.pickaxeTier] : 1;

    if (bonus.type === 'multiplier') {
        clickMultiplier = bonus.mult;
        toast.innerText = `⚡ CLICS x${bonus.mult} (${bonus.duration}s) !`;

        if (clickMultiplierTimeout) clearTimeout(clickMultiplierTimeout);
        clickMultiplierTimeout = setTimeout(() => {
            clickMultiplier = 1;
            updateUI();
        }, bonus.duration * 1000);
    } else if (bonus.type === 'burst') {
        const instantMoney = pickaxePower * bonus.clicks;
        game.money += instantMoney;
        toast.innerText = `💎 +${formatMoney(instantMoney)} $ (+${bonus.clicks} clics) !`;
        saveGameToServer();
    }

    if (clickArea) clickArea.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);
    updateUI();
}

export function getClickMultiplier() {
    return clickMultiplier;
}