// MODIF: Gestionnaire des événements aléatoires autour du bouton de clic
let clickMultiplier = 1;
let clickMultiplierTimeout = null;

// Déclenché à chaque clic physique valide depuis button.js
function checkRandomClickEvent() {
    // 1 chance sur 500 par clic physique
    const roll = Math.floor(Math.random() * 500) + 1;
    if (roll === 1) {
        spawnClickOrb();
    }
}
window.checkRandomClickEvent = checkRandomClickEvent;

function spawnClickOrb() {
    const clickArea = document.querySelector('.click-area');
    if (!clickArea) return;

    // Empêche d'avoir plusieurs comètes simultanées
    if (clickArea.querySelector('.click-event-orb')) return;

    const orb = document.createElement('div');
    orb.className = 'click-event-orb';

    // Définition du bonus avec probabilité inversée (plus le gain est fort, moins il est probable)
    const eventTypeRoll = Math.random();
    let bonusConfig = {};

    if (eventTypeRoll < 0.55) {
        // Multiplicateur temporaire
        // Poids inversé : multiplicateur 2x (60%), 3x (30%), 4x (10%)
        const mRoll = Math.random();
        let mult = 2;
        if (mRoll > 0.90) mult = 4;
        else if (mRoll > 0.60) mult = 3;

        // Durée entre 5s et 10s (pondération inversée vers les petites durées)
        const duration = Math.floor(5 + (1 - Math.pow(Math.random(), 0.5)) * 5); // 5s à 10s

        bonusConfig = {
            type: 'multiplier',
            mult: mult,
            duration: duration,
            icon: '⚡'
        };
        orb.classList.add('click-event-orb--multiplier');
    } else {
        // Gain instantané (+Z clics)
        // Gain entre 10 et 30 clics (valeurs faibles plus fréquentes)
        const powerRoll = Math.pow(Math.random(), 1.5); // Favorise les scores vers 0
        const clicksGranted = Math.floor(10 + (1 - powerRoll) * 20); // 10 à 30 clics

        bonusConfig = {
            type: 'burst',
            clicks: clicksGranted,
            icon: '💎'
        };
        orb.classList.add('click-event-orb--burst');
    }

    orb.innerHTML = bonusConfig.icon;

    // Position verticale aléatoire (en laissant 50px de marge pour ne pas mordre sur les bords)
    const areaRect = clickArea.getBoundingClientRect();
    const availableHeight = Math.max(60, areaRect.height - 60);
    const randomY = Math.floor(Math.random() * availableHeight) + 10;
    orb.style.top = `${randomY}px`;

    // Trajectoire linéaire de gauche à droite ou droite à gauche en 5 secondes
    const goLeftToRight = Math.random() < 0.5;
    const startX = goLeftToRight ? -50 : (areaRect.width + 10);
    const endX = goLeftToRight ? (areaRect.width + 50) : -50;

    orb.style.left = `${startX}px`;
    clickArea.appendChild(orb);

    const travelDurationMs = 5000; // 5 secondes
    const startTime = performance.now();

    function moveOrb(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / travelDurationMs);
        const currentX = startX + (endX - startX) * progress;

        // Légère onde sinusoïdale verticale pour donner du mouvement fluide
        const waveOffset = Math.sin(progress * Math.PI * 4) * 12;
        orb.style.left = `${currentX}px`;
        orb.style.transform = `translateY(${waveOffset}px)`;

        if (progress < 1 && orb.isConnected) {
            requestAnimationFrame(moveOrb);
        } else if (orb.isConnected) {
            orb.remove();
        }
    }
    requestAnimationFrame(moveOrb);

    // Clic sur l'orbe par le joueur
    orb.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerBonusEffect(bonusConfig, orb.getBoundingClientRect());
        orb.remove();
    });
}

function triggerBonusEffect(bonus, rect) {
    const clickArea = document.querySelector('.click-area');
    const toast = document.createElement('div');
    toast.className = 'event-toast';

    if (rect && clickArea) {
        const parentRect = clickArea.getBoundingClientRect();
        toast.style.left = `${rect.left - parentRect.left}px`;
        toast.style.top = `${rect.top - parentRect.top - 10}px`;
    }

    const pickaxePower = game.pickaxePower[game.pickaxeTier] || 1;

    if (bonus.type === 'multiplier') {
        clickMultiplier = bonus.mult;
        toast.innerText = `Clics x${bonus.mult} (${bonus.duration}s) !`;

        if (clickMultiplierTimeout) clearTimeout(clickMultiplierTimeout);
        clickMultiplierTimeout = setTimeout(() => {
            clickMultiplier = 1;
            updateUI();
        }, bonus.duration * 1000);
    } else if (bonus.type === 'burst') {
        const instantMoney = pickaxePower * bonus.clicks;
        game.money += instantMoney;
        toast.innerText = `+${formatMoney(instantMoney)} $ (+${bonus.clicks} clics) !`;
        saveGameToServer();
    }

    if (clickArea) clickArea.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);
    updateUI();
}

window.getClickMultiplier = function() {
    return clickMultiplier;
};