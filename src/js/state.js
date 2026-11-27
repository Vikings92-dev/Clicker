export let game = {
    money: 0,
    pickaxeTier: 0,

    pickaxeNames: ["Pierre", "Fer", "Diamant", "Prismaline", "Véridite", "Bracium", "Aetheris", "Azula"],

    pickaxeCursors: [
        { src: "/public/StonePickaxe.png",      x: 10, y: 4 },
        { src: "/public/IronPickaxe.png",       x: 10, y: 4 },
        { src: "/public/DiamondPickaxe.png",    x: 10, y: 4 },
        { src: "/public/PrismalinePickaxe.png", x: 10, y: 5 },
        { src: "/public/VeriditePickaxe.png",   x: 12, y: 4 },
        { src: "/public/BraciumPickaxe.png",    x: 9,  y: 4 },
        { src: "/public/AetherisPickaxe.png",   x: 7,  y: 4 },
        { src: "/public/AzulaPickaxe.png",      x: 12, y: 3 }
    ],
    
    pickaxePower: [1, 4, 25, 150, 15000, 2500000, 350000000, 15000000000],
    
    pickaxeCosts: [200, 5000, 250000, 50000000, 15000000000, 3000000000000, 400000000000000],

    unlockedDrillTier: 0, 
    drillCounterId: 0,
    inventory: [],

    researchCosts: [3000000, 600000000, 120000000000, 18000000000000],
    researchChances: [75, 55, 40, 25],
    
    kitCost: 5000,
    repairKits: 0,
    universalRepairs: 0,
    craftParts: 0,
    matCost: 100,
    repairMateriaux: [0,0,0,0,0],

    repairMateriauxTemplates: [
        { type: "T0", tier: 0, costBase: 100 },
        { type: "T1", tier: 1, costBase: 350000 },
        { type: "T2", tier: 2, costBase: 75000000 },
        { type: "T3", tier: 3, costBase: 13000000000 },
        { type: "T4", tier: 4, costBase: 1900000000000 }
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
        { tier: 0, name: "Drill en Prismaline", speed: 1.8, power: 16,     pourcentagePerteDura: 20, resistance: 200,    maxDura: 1087, maxElec: 180, regen: 1.0, costBase: 2000,           repairHSChance: 85, isHS: false, image: "/public/PrismalineDrill.png" },
        { tier: 1, name: "Drill en Véridite",   speed: 2.0, power: 210,    pourcentagePerteDura: 30, resistance: 1200,   maxDura: 1517, maxElec: 240, regen: 1.0, costBase: 7900000,        repairHSChance: 75, isHS: false, image: "/public/VeriditeDrill.png" },
        { tier: 2, name: "Drill en Bracium",    speed: 2.2, power: 2625,   pourcentagePerteDura: 40, resistance: 8000,   maxDura: 2022, maxElec: 300, regen: 1.0, costBase: 2000000000,     repairHSChance: 65, isHS: false, image: "/public/BraciumDrill.png" },
        { tier: 3, name: "Drill en Azula",      speed: 2.4, power: 36750,  pourcentagePerteDura: 50, resistance: 60000,  maxDura: 2578, maxElec: 360, regen: 1.0, costBase: 390000000000,   repairHSChance: 55, isHS: false, image: "/public/AzulaDrill.png" },
        { tier: 4, name: "Drill en Aetheris",   speed: 2.6, power: 525000, pourcentagePerteDura: 60, resistance: 500000, maxDura: 3638, maxElec: 480, regen: 1.0, costBase: 71000000000000, repairHSChance: 45, isHS: false, image: "/public/AetherisDrill.png" }
    ],

    paliers: [
        { id: 1, name: "Dead Coral Block", displayName: "Phase 1 - Palier : Dead Coral Block", bgImage: "/public/dead_coral_block.png", ajoutReward: 0, nbBlock: 0 },
        { id: 2, name: "Stone", displayName: "Phase 1 - Palier : Stone", bgImage: "/public/stone.png", ajoutReward: 7, nbBlock: 100 },
        { id: 3, name: "Cobblestone", displayName: "Phase 1 - Palier : Cobblestone", bgImage: "/public/cobblestone.png", ajoutReward: 22, nbBlock: 250 },
        { id: 4, name: "Deepslate", displayName: "Phase 1 - Palier : Deepslate", bgImage: "/public/deepslate.png", ajoutReward: 47, nbBlock: 500 }
    ],

    phases: [
        { id: 1, name: "Phase 1", blocks: "Lunaris", baseResist: 15, reward: 3, progress: 0, blockBrocken: 0, unlocked: true, activeDrills: [] },
        {
            id: 2, name: "Phase 2", blocks: "Vhoraxis - Névaris", baseResist: 200, reward: 8000, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 5000000, activeDrills: [],
            selectedDisplay: 0,
            displays: [
                { name: "Vhoraxis", bgImage: "/public/basalt.png" },
                { name: "Névaris", bgImage: "/public/packed_ice.png" }
            ]
        },
        {
            id: 3, name: "Phase 3", blocks: "Magmia - Orthelya", baseResist: 2500, reward: 1500000, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 1200000000, activeDrills: [],
            selectedDisplay: 0,
            displays: [
                { name: "Magmia", bgImage: "/public/magma.png" },
                { name: "Orthelya", bgImage: "/public/blue_ice.png" }
            ]
        },
        {
            id: 4, name: "Phase 4", blocks: "Vulkania - Kryos-Mir", baseResist: 35000, reward: 220000000, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 250000000000, activeDrills: [],
            selectedDisplay: 0,
            displays: [
                { name: "Vulkania", bgImage: "/public/obsidian.png" },
                { name: "Kryos-Mir", bgImage: "/public/snow.png" }
            ]
        },
        { id: 5, name: "Phase 5", blocks: "l'oeil de l'univers", baseResist: 500000, reward: 28000000000, progress: 0, blockBrocken: 0, unlocked: false, reqMoney: 45000000000000, activeDrills: [], bgImage: "/public/end_portal.png" }
    ]
};

export const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3005/api"
    : "https://clicker.projetchronos.fr/api";
export const MAX_MONEY_LIMIT = Number.MAX_SAFE_INTEGER; // Limite technique exacte : 9 007 199 254 740 991

// DOM Elements
export const moneyEl = document.getElementById('money');
export const mpsEl = document.getElementById('mps');
export const clickBtn = document.getElementById('click-btn');
export const pickaxeTitleEl = document.getElementById('pickaxe-title');
export const upgradePickaxeBtn = document.getElementById('upgrade-pickaxe-btn');
export const phasesContainer = document.getElementById('phases-container');
export const inventoryContainer = document.getElementById('inventory-container');
export const buyDrillGlobalBtn = document.getElementById('buy-drill-global-btn');
export const drillShopTitle = document.getElementById('drill-shop-title');
export const drillShopCost = document.getElementById('drill-shop-cost');
export const drillShopImg = document.getElementById('drill-shop-img');
export const researchDrillBtn = document.getElementById('research-drill-btn');
export const researchCostEl = document.getElementById('research-cost');
export const researchChanceEl = document.getElementById('research-chance');
export const researchNextLevelEl = document.getElementById('research-next-level');
export const researchDrillImg = document.getElementById('research-drill-img');

export const buyKitQtyInput = document.getElementById('buy-kit-qty');
export const buyKitBtn = document.getElementById('buy-kit-btn');
export const kitTotalCostEl = document.getElementById('kit-total-cost');
export const kitStockCountEl = document.getElementById('kit-stock-count');
export const kitShopStockCountEl = document.getElementById('kit-shop-stock-count');

export const buyMatQtyInput = document.getElementById('buy-mat-qty');
export const buyMatBtn = document.getElementById('buy-mat-btn');
export const matTotalCostEl = document.getElementById('mat-total-cost');
export const buyMatTypeSelect = document.getElementById('buy-mat-type');
export const buyMatDrillImg = document.getElementById('buy-mat-drill-img');

export const buyModElecQtyInput = document.getElementById('buy-mod-elec-qty');
export const buyModElecBtn = document.getElementById('buy-mod-elec-btn');
export const modElecTotalCostEl = document.getElementById('mod-elec-total-cost');
export const modElecShopStockEl = document.getElementById('mod-elec-shop-stock');

export const buyModSolidQtyInput = document.getElementById('buy-mod-solid-qty');
export const buyModSolidBtn = document.getElementById('buy-mod-solid-btn');
export const modSolidTotalCostEl = document.getElementById('mod-solid-total-cost');
export const modSolidShopStockEl = document.getElementById('mod-solid-shop-stock');