// Règles du jeu côté serveur.
// ⚠️ À GARDER SYNCHRONISÉ avec src/js/state.js (coûts, puissances, templates de drills, phases).
// Si vous rééquilibrez le jeu côté client sans modifier ce fichier, des sauvegardes légitimes
// risquent d'être refusées (ou des triches acceptées).

const RULES = {
    pickaxePower: [1, 4, 25, 150, 15000, 2500000, 350000000, 15000000000],
    pickaxeCosts: [200, 5000, 250000, 50000000, 15000000000, 3000000000000, 400000000000000],

    researchCosts: [3000000, 600000000, 120000000000, 18000000000000],

    kitCost: 5000,
    craftPartsPerKit: 5,
    matCosts: [100, 350000, 75000000, 13000000000, 1900000000000],
    moduleCosts: { electricite: 5000, solidite: 15000 },

    drillTemplates: [
        { tier: 0, name: "Drill en Prismaline", speed: 1.8, power: 16,     pourcentagePerteDura: 20, resistance: 200,    maxDura: 1087, maxElec: 180, regen: 1.0, costBase: 2000,           image: "/public/PrismalineDrill.png" },
        { tier: 1, name: "Drill en Véridite",   speed: 2.0, power: 210,    pourcentagePerteDura: 30, resistance: 1200,   maxDura: 1517, maxElec: 240, regen: 1.0, costBase: 7900000,        image: "/public/VeriditeDrill.png" },
        { tier: 2, name: "Drill en Bracium",    speed: 2.2, power: 2625,   pourcentagePerteDura: 40, resistance: 8000,   maxDura: 2022, maxElec: 300, regen: 1.0, costBase: 2000000000,     image: "/public/BraciumDrill.png" },
        { tier: 3, name: "Drill en Azula",      speed: 2.4, power: 36750,  pourcentagePerteDura: 50, resistance: 60000,  maxDura: 2578, maxElec: 360, regen: 1.0, costBase: 390000000000,   image: "/public/AzulaDrill.png" },
        { tier: 4, name: "Drill en Aetheris",   speed: 2.6, power: 525000, pourcentagePerteDura: 60, resistance: 500000, maxDura: 3638, maxElec: 480, regen: 1.0, costBase: 71000000000000, image: "/public/AetherisDrill.png" }
    ],

    // Bonus de récompense de la phase 1 selon le nombre de blocs cassés (paliers)
    phase1Paliers: [
        { nbBlock: 0, ajoutReward: 0 },
        { nbBlock: 100, ajoutReward: 7 },
        { nbBlock: 250, ajoutReward: 22 },
        { nbBlock: 500, ajoutReward: 47 }
    ],

    phases: [
        { id: 1, baseResist: 15,     reward: 3,           reqMoney: 0,              displays: 0 },
        { id: 2, baseResist: 200,    reward: 8000,        reqMoney: 5000000,        displays: 2 },
        { id: 3, baseResist: 2500,   reward: 1500000,     reqMoney: 1200000000,     displays: 2 },
        { id: 4, baseResist: 35000,  reward: 220000000,   reqMoney: 250000000000,   displays: 2 },
        { id: 5, baseResist: 500000, reward: 28000000000, reqMoney: 45000000000000, displays: 0 }
    ],

    // Limites anti-triche
    maxCps: 15,
    maxClickMultiplier: 4,       // orbe "multiplicateur" x4 maximum
    burstMaxClicks: 30,          // orbe "burst" : +30 clics maximum
    orbChancePerClick: 1 / 500,
    lootKitChance: 0.0015,
    lootUniversalChance: 0.0005,
    lootPartChance: 0.025,
    maxProgressPerSecond: 1000,  // = 10 blocs/s par phase (cap de loop.js)
    maxMoney: Number.MAX_SAFE_INTEGER * 2,
    maxDrills: 5000
};

module.exports = RULES;
