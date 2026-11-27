// Validation des sauvegardes côté serveur.
//  1. sanitizeState()    : ne garde que les champs connus, borne chaque valeur, reconstruit les drills
//                          depuis les templates (impossible d'avoir un drill avec power = 1e12).
//  2. checkProgression() : compare l'ancien et le nouvel état et vérifie que le joueur n'a pas gagné
//                          plus que le maximum théorique possible pendant le temps écoulé.
const RULES = require('./gameRules');

const MAX_COUNT = 1e12;
const MAX_ELAPSED_SECONDS = 300; // au-delà, on considère que le client ne jouait pas (onglet fermé, réseau coupé…)
const LATENCY_SLACK_SECONDS = 5;
// Réserve maximale d'objets "gratuits" (loot) qu'un joueur peut accumuler entre deux sauvegardes
const LOOT_CREDIT_CAPS = { kits: 5, universal: 3, parts: 25 };
const LOOT_CHANCES = { kits: RULES.lootKitChance, universal: RULES.lootUniversalChance, parts: RULES.lootPartChance };

function toNumber(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function toInt(value, min, max, fallback = min) {
    return Math.floor(toNumber(value, min, max, fallback));
}

function sanitizeDrill(raw, unlockedDrillTier) {
    if (!raw || typeof raw !== 'object') return null;
    const tier = toInt(raw.tier, -1, RULES.drillTemplates.length - 1, -1);
    if (tier < 0 || tier > unlockedDrillTier) return null;
    const uid = toInt(raw.uid, 0, MAX_COUNT, 0);
    if (uid <= 0) return null;

    const t = RULES.drillTemplates[tier];
    const modules = raw.modules && typeof raw.modules === 'object' ? raw.modules : {};
    return {
        uid,
        tier,
        name: t.name,
        speed: t.speed,
        power: t.power,
        maxDura: t.maxDura,
        maxElec: t.maxElec,
        regen: t.regen,
        dura: toNumber(raw.dura, 0, t.maxDura, t.maxDura),
        elec: toNumber(raw.elec, 0, t.maxElec, 0),
        perteDura: t.pourcentagePerteDura,
        resistance: t.resistance,
        isHS: raw.isHS === true,
        image: t.image,
        modules: {
            electricite: modules.electricite === true,
            solidite: modules.solidite === true
        }
    };
}

function getInitialState() {
    return sanitizeState({});
}

function sanitizeState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const unlockedDrillTier = toInt(src.unlockedDrillTier, 0, RULES.drillTemplates.length - 1, 0);

    const seenUids = new Set();
    let drillBudget = RULES.maxDrills;
    const cleanDrills = (list) => {
        const out = [];
        if (!Array.isArray(list)) return out;
        for (const rawDrill of list) {
            if (drillBudget <= 0) break;
            const d = sanitizeDrill(rawDrill, unlockedDrillTier);
            if (!d || seenUids.has(d.uid)) continue;
            seenUids.add(d.uid);
            out.push(d);
            drillBudget--;
        }
        return out;
    };

    const inventory = cleanDrills(src.inventory);
    const rawPhases = Array.isArray(src.phases) ? src.phases : [];

    let previousUnlocked = true;
    const phases = RULES.phases.map((rule) => {
        const rp = rawPhases.find(p => p && p.id === rule.id) || {};
        const unlocked = rule.id === 1 ? true : (previousUnlocked && rp.unlocked === true);
        previousUnlocked = unlocked;

        let activeDrills = cleanDrills(rp.activeDrills);
        if (!unlocked && activeDrills.length > 0) {
            // Drills déployés sur une phase verrouillée : renvoyés au hangar
            inventory.push(...activeDrills);
            activeDrills = [];
        }

        const phase = {
            id: rule.id,
            progress: activeDrills.length > 0 ? toNumber(rp.progress, 0, 99.999, 0) : 0,
            blockBrocken: toInt(rp.blockBrocken, 0, MAX_COUNT, 0),
            unlocked,
            activeDrills
        };
        if (rule.displays > 0) {
            phase.selectedDisplay = toInt(rp.selectedDisplay, 0, rule.displays - 1, 0);
        }
        return phase;
    });

    let maxUid = 0;
    seenUids.forEach(uid => { if (uid > maxUid) maxUid = uid; });

    const mats = Array.isArray(src.repairMateriaux) ? src.repairMateriaux : [];
    const modules = src.modulesStock && typeof src.modulesStock === 'object' ? src.modulesStock : {};

    return {
        money: toNumber(src.money, 0, RULES.maxMoney, 0),
        pickaxeTier: toInt(src.pickaxeTier, 0, RULES.pickaxePower.length - 1, 0),
        unlockedDrillTier,
        drillCounterId: Math.max(maxUid, toInt(src.drillCounterId, 0, MAX_COUNT, 0)),
        inventory,
        repairKits: toInt(src.repairKits, 0, MAX_COUNT, 0),
        universalRepairs: toInt(src.universalRepairs, 0, MAX_COUNT, 0),
        craftParts: toInt(src.craftParts, 0, MAX_COUNT, 0),
        repairMateriaux: RULES.matCosts.map((_, i) => toInt(mats[i], 0, MAX_COUNT, 0)),
        modulesStock: {
            electricite: toInt(modules.electricite, 0, MAX_COUNT, 0),
            solidite: toInt(modules.solidite, 0, MAX_COUNT, 0)
        },
        phases
    };
}

function allDrills(state) {
    const list = [...state.inventory];
    state.phases.forEach(p => list.push(...p.activeDrills));
    return list;
}

function phaseReward(rule, phase) {
    if (rule.id !== 1) return rule.reward;
    let bonus = 0;
    RULES.phase1Paliers.forEach(p => { if (phase.blockBrocken >= p.nbBlock) bonus = p.ajoutReward; });
    return rule.reward + bonus;
}

// Borne supérieure du nombre de blocs/s qu'une phase peut produire avec un ensemble de drills.
// (Pour tout sous-ensemble S de drills : débit <= P_total * eff(P_total/R) * vitesseMax / R)
function maxBlocksPerSecond(rule, drills) {
    if (drills.length === 0) return 0;
    let totalPower = 0;
    let maxSpeed = 0;
    drills.forEach(d => { totalPower += d.power; maxSpeed = Math.max(maxSpeed, d.speed); });
    const ratio = totalPower / rule.baseResist;
    const eff = ratio >= 1 ? Math.pow(ratio, 0.75) : Math.pow(ratio, 1.5);
    const progressPerSecond = ((totalPower * eff * maxSpeed) / rule.baseResist) * 100;
    return Math.min(progressPerSecond, RULES.maxProgressPerSecond) / 100;
}

function sumRange(costs, from, to) {
    let total = 0;
    for (let i = from; i < to; i++) total += costs[i] || 0;
    return total;
}

function countModules(state) {
    const total = { electricite: state.modulesStock.electricite, solidite: state.modulesStock.solidite };
    allDrills(state).forEach(d => {
        if (d.modules.electricite) total.electricite++;
        if (d.modules.solidite) total.solidite++;
    });
    return total;
}

/**
 * Vérifie que le passage de oldState à newState est possible en elapsedSeconds.
 * Les deux états doivent déjà être passés par sanitizeState().
 * lootCredit : crédit de loot restant de la sauvegarde précédente (null = plein).
 * Retourne { ok: true, lootCredit } ou { ok: false, reason, details }.
 */
function checkProgression(oldState, newState, elapsedSeconds, lootCredit = null) {
    const E = Math.min(Math.max(0, elapsedSeconds), MAX_ELAPSED_SECONDS);
    const fail = (reason, details = {}) => ({ ok: false, reason, details: { ...details, elapsed: E } });

    // --- Progressions qui ne peuvent jamais reculer
    if (newState.pickaxeTier < oldState.pickaxeTier) return fail('pickaxe_regression');
    if (newState.unlockedDrillTier < oldState.unlockedDrillTier) return fail('research_regression');
    if (newState.drillCounterId < oldState.drillCounterId) return fail('drill_counter_regression');
    for (let i = 0; i < RULES.phases.length; i++) {
        if (oldState.phases[i].unlocked && !newState.phases[i].unlocked) return fail('phase_regression');
        if (newState.phases[i].blockBrocken < oldState.phases[i].blockBrocken) return fail('blocks_regression');
    }

    // --- Gains maximum possibles sur la période
    // Toutes les bornes sont proportionnelles au temps écoulé ; les marges fixes (latence, orbe chanceux…)
    // viennent d'une réserve plafonnée reportée d'une sauvegarde à l'autre, pour que multiplier
    // les sauvegardes ne multiplie pas les marges.
    const maxClicks = RULES.maxCps * E;
    const clickPower = RULES.pickaxePower[newState.pickaxeTier];
    const clickRate = RULES.maxCps * clickPower * RULES.maxClickMultiplier
        + RULES.maxCps * RULES.orbChancePerClick * 3 * RULES.burstMaxClicks * clickPower;

    const oldDrills = allDrills(oldState);
    const newDrills = allDrills(newState);
    const oldByUid = new Map(oldDrills.map(d => [d.uid, d]));
    const union = [...oldDrills, ...newDrills.filter(d => !oldByUid.has(d.uid))];

    let drillRate = 0;
    for (let i = 0; i < RULES.phases.length; i++) {
        const rule = RULES.phases[i];
        const newPhase = newState.phases[i];
        if (!newPhase.unlocked) continue;
        const bps = maxBlocksPerSecond(rule, union);
        const blocksDelta = newPhase.blockBrocken - oldState.phases[i].blockBrocken;
        if (blocksDelta > bps * (E + LATENCY_SLACK_SECONDS) + 2) {
            return fail('blocks_too_fast', { phase: rule.id, blocksDelta, max: bps * E });
        }
        drillRate += bps * phaseReward(rule, newPhase);
    }

    const gainRate = (clickRate + drillRate) * 1.2;
    const maxGain = gainRate * E;
    const bankCap = gainRate * LATENCY_SLACK_SECONDS + RULES.burstMaxClicks * clickPower * 2 + 1000;
    const previousBank = lootCredit && Number.isFinite(lootCredit.money) ? Math.max(0, lootCredit.money) : bankCap;
    const moneyBank = Math.min(bankCap, previousBank);

    // --- Objets obtenus par loot : "crédit" qui se recharge avec le temps (stocké côté serveur),
    // pour qu'envoyer beaucoup de sauvegardes rapprochées ne donne pas plus d'objets gratuits.
    const credit = {};
    for (const key of Object.keys(LOOT_CREDIT_CAPS)) {
        const previous = lootCredit && Number.isFinite(lootCredit[key]) ? lootCredit[key] : LOOT_CREDIT_CAPS[key];
        credit[key] = Math.min(LOOT_CREDIT_CAPS[key], Math.max(0, previous) + maxClicks * LOOT_CHANCES[key] * 3);
    }

    if (newState.craftParts > oldState.craftParts + credit.parts) {
        return fail('craft_parts_too_fast', { delta: newState.craftParts - oldState.craftParts });
    }
    const universalAvailable = oldState.universalRepairs + credit.universal;
    if (newState.universalRepairs > universalAvailable) {
        return fail('universal_too_fast', { delta: newState.universalRepairs - oldState.universalRepairs });
    }

    // --- Dépenses minimales nécessaires pour arriver au nouvel état
    let spent = 0;
    spent += sumRange(RULES.pickaxeCosts, oldState.pickaxeTier, newState.pickaxeTier);
    spent += sumRange(RULES.researchCosts, oldState.unlockedDrillTier, newState.unlockedDrillTier);
    for (let i = 0; i < RULES.phases.length; i++) {
        if (newState.phases[i].unlocked && !oldState.phases[i].unlocked) spent += RULES.phases[i].reqMoney;
    }

    // Drills : un drill dont l'uid existait déjà doit être présent dans l'ancien état avec le même tier.
    // Un nouveau drill doit avoir un uid > ancien compteur et a été acheté au prix du shop.
    const survivorsByTier = new Array(RULES.drillTemplates.length).fill(0);
    const newByTier = new Array(RULES.drillTemplates.length).fill(0);
    let hsRepairs = 0;
    const duraRepairs = []; // { tier, needed (en "réparations 50%") }

    for (const d of newDrills) {
        if (d.uid <= oldState.drillCounterId) {
            const before = oldByUid.get(d.uid);
            if (!before || before.tier !== d.tier) return fail('unknown_drill', { uid: d.uid });
            survivorsByTier[d.tier]++;
            if (before.isHS && !d.isHS) hsRepairs++;
            const duraGain = d.dura - before.dura;
            if (duraGain > 0.5) {
                duraRepairs.push({ tier: d.tier, needed: Math.ceil(duraGain / (d.maxDura * 0.5) - 1e-9) });
            }
        } else {
            newByTier[d.tier]++;
        }
    }
    for (let tier = 0; tier < RULES.drillTemplates.length; tier++) {
        const t = RULES.drillTemplates[tier];
        const multiplier = (tier + 1) * 1.5;
        for (let k = 0; k < newByTier[tier]; k++) {
            spent += Math.floor(t.costBase + multiplier * Math.pow(survivorsByTier[tier] + k, 5));
        }
    }

    // Réparations de durabilité : une Réparation Universelle couvre un drill entier,
    // sinon il faut des matériaux du tier (chaque matériau = +50% max).
    let universalLeft = Math.floor(Math.max(0, universalAvailable - newState.universalRepairs));
    let universalUsed = 0;
    duraRepairs.sort((a, b) => b.needed - a.needed);
    const matsNeeded = new Array(RULES.matCosts.length).fill(0);
    for (const r of duraRepairs) {
        if (universalLeft > 0) { universalLeft--; universalUsed++; continue; }
        matsNeeded[r.tier] += r.needed;
    }
    credit.universal -= Math.max(0, newState.universalRepairs + universalUsed - oldState.universalRepairs);
    for (let tier = 0; tier < RULES.matCosts.length; tier++) {
        const before = oldState.repairMateriaux[tier];
        const after = newState.repairMateriaux[tier];
        const consumedFromStock = Math.max(0, before - after);
        const bought = Math.max(0, after - before) + Math.max(0, matsNeeded[tier] - consumedFromStock);
        spent += bought * RULES.matCosts[tier];
    }

    // Modules (stock + installés)
    const oldModules = countModules(oldState);
    const newModules = countModules(newState);
    for (const m of Object.keys(RULES.moduleCosts)) {
        spent += Math.max(0, newModules[m] - oldModules[m]) * RULES.moduleCosts[m];
    }

    // Caisses à outils : loot + craft + achat. Les dépannages HS en consomment une chacun.
    const kitsNeeded = Math.max(0, newState.repairKits - oldState.repairKits + hsRepairs);
    const partsAvailable = Math.max(0, oldState.craftParts + credit.parts - newState.craftParts);
    const craftedKits = Math.min(kitsNeeded, Math.floor(partsAvailable / RULES.craftPartsPerKit));
    credit.parts -= Math.max(0, newState.craftParts + craftedKits * RULES.craftPartsPerKit - oldState.craftParts);
    const kitsFromLoot = Math.min(kitsNeeded - craftedKits, Math.floor(credit.kits));
    credit.kits -= kitsFromLoot;
    const kitsBought = kitsNeeded - craftedKits - kitsFromLoot;
    spent += kitsBought * RULES.kitCost;

    // --- Bilan
    const allowed = oldState.money + maxGain + moneyBank;
    const required = newState.money + spent;
    if (required > allowed * (1 + 1e-9)) {
        return fail('money_too_fast', {
            oldMoney: oldState.money,
            newMoney: newState.money,
            spent,
            maxGain,
            moneyBank
        });
    }
    credit.money = Math.min(bankCap, Math.max(0, allowed - required));
    return { ok: true, lootCredit: credit };
}

module.exports = { sanitizeState, checkProgression, getInitialState, MAX_ELAPSED_SECONDS };
