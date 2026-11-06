let game = {
    money: 0,
    pickaxeTier: 0,

    pickaxeNames: ["Pierre", "Fer", "Diamant", "Prismaline", "Véridite", "Bracium", "Aetheris", "Azula"],
    
    pickaxePower: [1, 5, 22, 95, 420, 1900, 8500, 40000],
    
    pickaxeCosts: [150, 650, 2800, 12000, 55000, 250000, 1200000],

    unlockedDrillTier: 0, 
    drillCounterId: 0, 
    inventory: [],

    researchCosts: [35000, 250000, 1800000, 15000000],
    researchChances: [80, 55, 35, 15],
    
    drillTemplates: [
        { tier: 0, name: "Drill en Prismaline", speed: 1.5, power: 10, pourcentagePerteDura: 20, resistance: 200, maxDura: 300, maxElec: 300, regen: 2.0, costBase: 8500 },
        { tier: 1, name: "Drill en Véridite", speed: 2.0, power: 35, pourcentagePerteDura: 30, resistance: 550, maxDura: 450, maxElec: 400, regen: 3.5, costBase: 60000 },
        { tier: 2, name: "Drill en Bracium", speed: 2.5, power: 120, pourcentagePerteDura: 40, resistance: 2500, maxDura: 750, maxElec: 500, regen: 6.0, costBase: 450000 },
        { tier: 3, name: "Drill en Azula", speed: 3.5, power: 450, pourcentagePerteDura: 50, resistance: 10000, maxDura: 1200, maxElec: 600, regen: 11.0, costBase: 3500000 },
        { tier: 4, name: "Drill en Aetheris", speed: 5.0, power: 2500, pourcentagePerteDura: 60, resistance: 32000, maxDura: 2500, maxElec: 700, regen: 22.0, costBase: 30000000 }
    ],

    paliers: [
        { id: 1, name: "Stone", displayName: "Phase 1 - Palier : Dead Coral Block", bgImage: "/public/stone.png", ajoutReward: 0, nbBlock: 0 },
        { id: 2, name: "Deepslate", displayName: "Phase 1 - Palier : Stone", bgImage: "/public/deepslate.png", ajoutReward: 1, nbBlock: 100 },
        { id: 3, name: "Obsidienne", displayName: "Phase 1 - Palier : Cobblestone", bgImage: "/public/obsidian.png", ajoutReward: 2, nbBlock: 250 },
        { id: 4, name: "Endstone", displayName: "Phase 1 - Palier : Deepslate", bgImage: "/public/end_stone.png", ajoutReward: 4, nbBlock: 500 }
    ],

    phases: [
        { id: 1, name: "Phase 1", blocks: "Lunaris", baseResist: 15, reward: 3, progress: 0, blockBrocken: 0, unlocked: true, activeDrills: [] },
        { id: 2, name: "Phase 2", blocks: "Vhoraxis - Névaris", baseResist: 90, reward: 25, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 1500, activeDrills: [] },
        { id: 3, name: "Phase 3", blocks: "Magmia - Orthelya", baseResist: 550, reward: 180, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 12000, activeDrills: [] },
        { id: 4, name: "Phase 4", blocks: "Vulkania - Kryos-Mir", baseResist: 3800, reward: 1400, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 95000, activeDrills: [] },
        { id: 5, name: "Phase 5", blocks: "l'oeil de l'univers", baseResist: 5000, reward: 5000, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 850000, activeDrills: [] }
    ]
};

const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "http://192.168.0.50:3000/api";
let PLAYER_NAME = "";
let isPurchaseOnCooldown = false;
let isGameFinished = false;
const MAX_MONEY_LIMIT = Number.MAX_SAFE_INTEGER; // Limite technique exacte : 9 007 199 254 740 991

// DOM Elements
const moneyEl = document.getElementById('money');
const mpsEl = document.getElementById('mps');
const clickBtn = document.getElementById('click-btn');
const pickaxeTitleEl = document.getElementById('pickaxe-title');
const upgradePickaxeBtn = document.getElementById('upgrade-pickaxe-btn');
const phasesContainer = document.getElementById('phases-container');
const inventoryContainer = document.getElementById('inventory-container');
const buyDrillGlobalBtn = document.getElementById('buy-drill-global-btn');
const drillShopTitle = document.getElementById('drill-shop-title');
const drillShopCost = document.getElementById('drill-shop-cost');
const researchDrillBtn = document.getElementById('research-drill-btn');
const researchCostEl = document.getElementById('research-cost');
const researchChanceEl = document.getElementById('research-chance');
const researchNextLevelEl = document.getElementById('research-next-level');