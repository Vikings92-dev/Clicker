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
    
    kitCost: 5000,
    repairKits: 0,
    universalRepairs: 0,
    craftParts: 0,
    matCost: 500,
    repairMateriaux: [0,0,0,0,0],

    repairMateriauxTemplates: [
        { type: "T0", tier: 0, costBase: 500},
        { type: "T1", tier: 1, costBase: 1500},
        { type: "T2", tier: 2, costBase: 5000},
        { type: "T3", tier: 3, costBase: 15000},
        { type: "T4", tier: 4, costBase: 50000}
    ],

    modulesStock: {
        electricite: 0,
        solidite: 0
    },

    moduleTemplates: {
        electricite: {
            id: "electricite",
            name: "Module d'Électricité",
            shortName: "Élec",
            desc: "Réduit la consommation d'électricité de 33%.",
            cost: 5000,
            image: "/public/module_electricite.png"
        },
        solidite: {
            id: "solidite",
            name: "Module de Solidité",
            shortName: "Solidité",
            desc: "50% de chance de ne pas consommer de durabilité.",
            cost: 15000,
            image: "/public/module_solidite.png"
        }
    },

    drillTemplates: [
        { tier: 0, name: "Drill en Prismaline", speed: 1.5, power: 10, pourcentagePerteDura: 20, resistance: 200, maxDura: 300, maxElec: 300, regen: 2.0, costBase: 8500, repairHSChance: 80, isHS: false, image: "/public/PrismalineDrill.png" },
        { tier: 1, name: "Drill en Véridite", speed: 2.0, power: 35, pourcentagePerteDura: 30, resistance: 550, maxDura: 450, maxElec: 400, regen: 3.5, costBase: 60000, repairHSChance: 60, isHS: false, image: "/public/VeriditeDrill.png" },
        { tier: 2, name: "Drill en Bracium", speed: 2.5, power: 120, pourcentagePerteDura: 40, resistance: 2500, maxDura: 750, maxElec: 500, regen: 6.0, costBase: 450000, repairHSChance: 40, isHS: false, image: "/public/BraciumDrill.png" },
        { tier: 3, name: "Drill en Azula", speed: 3.5, power: 450, pourcentagePerteDura: 50, resistance: 10000, maxDura: 1200, maxElec: 600, regen: 11.0, costBase: 3500000, repairHSChance: 20, isHS: false, image: "/public/AzulaDrill.png" },
        { tier: 4, name: "Drill en Aetheris", speed: 5.0, power: 2500, pourcentagePerteDura: 60, resistance: 32000, maxDura: 2500, maxElec: 700, regen: 22.0, costBase: 30000000, repairHSChance: 10, isHS: false, image: "/public/AetherisDrill.png" }
    ],

    paliers: [
        { id: 1, name: "Dead Coral Block", displayName: "Phase 1 - Palier : Dead Coral Block", bgImage: "/public/stone.png", ajoutReward: 0, nbBlock: 0 },
        { id: 2, name: "Stone", displayName: "Phase 1 - Palier : Stone", bgImage: "/public/deepslate.png", ajoutReward: 1, nbBlock: 100 },
        { id: 3, name: "Cobblestone", displayName: "Phase 1 - Palier : Cobblestone", bgImage: "/public/obsidian.png", ajoutReward: 2, nbBlock: 250 },
        { id: 4, name: "Deepslate", displayName: "Phase 1 - Palier : Deepslate", bgImage: "/public/end_stone.png", ajoutReward: 4, nbBlock: 500 }
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
const drillShopImg = document.getElementById('drill-shop-img');
const researchDrillBtn = document.getElementById('research-drill-btn');
const researchCostEl = document.getElementById('research-cost');
const researchChanceEl = document.getElementById('research-chance');
const researchNextLevelEl = document.getElementById('research-next-level');
const researchDrillImg = document.getElementById('research-drill-img');

const buyKitQtyInput = document.getElementById('buy-kit-qty');
const buyKitBtn = document.getElementById('buy-kit-btn');
const kitTotalCostEl = document.getElementById('kit-total-cost');
const kitStockCountEl = document.getElementById('kit-stock-count');
const kitShopStockCountEl = document.getElementById('kit-shop-stock-count');

const buyMatQtyInput = document.getElementById('buy-mat-qty');
const buyMatBtn = document.getElementById('buy-mat-btn');
const matTotalCostEl = document.getElementById('mat-total-cost');
const buyMatTypeSelect = document.getElementById('buy-mat-type');
const buyMatDrillImg = document.getElementById('buy-mat-drill-img');

const buyModElecQtyInput = document.getElementById('buy-mod-elec-qty');
const buyModElecBtn = document.getElementById('buy-mod-elec-btn');
const modElecTotalCostEl = document.getElementById('mod-elec-total-cost');
const modElecShopStockEl = document.getElementById('mod-elec-shop-stock');

const buyModSolidQtyInput = document.getElementById('buy-mod-solid-qty');
const buyModSolidBtn = document.getElementById('buy-mod-solid-btn');
const modSolidTotalCostEl = document.getElementById('mod-solid-total-cost');
const modSolidShopStockEl = document.getElementById('mod-solid-shop-stock');