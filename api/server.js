require('dotenv').config();
const crypto = require('node:crypto');
const mariadb = require('mariadb');
const cors = require('@fastify/cors');
const { sanitizeState, checkProgression, getInitialState, MAX_ELAPSED_SECONDS } = require('./validation');

const IS_PROD = process.env.NODE_ENV === 'production';

const fastify = require('fastify')({
    logger: true,
    bodyLimit: 2 * 1024 * 1024, // 2 Mo : largement assez pour une sauvegarde, empêche les envois géants
    trustProxy: process.env.TRUST_PROXY === 'true' // à activer si l'API est derrière un reverse proxy (nginx, Caddy…)
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
    console.error("ERREUR CRITIQUE : AUTH_SECRET manquant dans le fichier .env");
    process.exit(1);
}

if (!process.env.DB_PASSWORD) {
    if (IS_PROD) {
        console.error("ERREUR CRITIQUE : DB_PASSWORD manquant dans le fichier .env");
        process.exit(1);
    }
    console.warn("ATTENTION : DB_PASSWORD absent, utilisation du mot de passe de développement.");
}

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;
if (!TURNSTILE_SECRET) {
    console.warn("ATTENTION : TURNSTILE_SECRET absent : le captcha n'est PAS vérifié côté serveur.");
}

const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'clicker',
    password: process.env.DB_PASSWORD || 'clicker',
    database: process.env.DB_NAME || 'copper_clicker',
    connectionLimit: 5
});

const DEV_ORIGINS = ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://192.168.0.50:5500'];
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['https://clicker.projetchronos.fr', ...(IS_PROD ? [] : DEV_ORIGINS)];

fastify.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
});

// Réponses d'erreur génériques : on ne renvoie jamais le message interne (SQL, stack…) au client
fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
        return reply.status(400).send({ status: "bad_request", error: "Requête invalide." });
    }
    if (error.statusCode && error.statusCode < 500) {
        return reply.status(error.statusCode).send({ status: "error", error: "Requête refusée." });
    }
    request.log.error(error);
    return reply.status(500).send({ status: "error", error: "Erreur interne du serveur." });
});

fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    return payload;
});

// ---------------------------------------------------------------------------
// Limitation de débit (en mémoire, par joueur ou par IP)
// ---------------------------------------------------------------------------
const rateBuckets = new Map();

function hitRateLimit(key, limit, windowMs) {
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
        rateBuckets.set(key, bucket);
    }
    bucket.count++;
    return bucket.count > limit;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
        if (now >= bucket.resetAt) rateBuckets.delete(key);
    }
}, 60000).unref();

// Limite globale par IP (protège aussi les routes appelées sans token valide)
fastify.addHook('onRequest', async (request, reply) => {
    if (hitRateLimit(`ip:${request.ip}`, 600, 60000)) {
        return reply.status(429).send({ status: "rate_limited", error: "Trop de requêtes." });
    }
});

function rateLimit(name, limit, windowMs = 60000) {
    return async (request, reply) => {
        if (hitRateLimit(`${name}:${request.player.idSiteUser}`, limit, windowMs)) {
            return reply.status(429).send({ status: "rate_limited", error: "Trop de requêtes." });
        }
    };
}

// ---------------------------------------------------------------------------
// Authentification (jeton signé par Projet Chronos)
// ---------------------------------------------------------------------------
function verifyChronosToken(token) {
    if (!token || typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;

    const expectedSignature = crypto
        .createHmac('sha256', AUTH_SECRET)
        .update(encodedPayload)
        .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        const idSiteUser = Number(payload.idSiteUser);
        if (!Number.isSafeInteger(idSiteUser) || idSiteUser <= 0) return null;
        if (!payload.name || !payload.exp || Date.now() > Number(payload.exp)) return null;
        return {
            idSiteUser,
            name: String(payload.name).slice(0, 50)
        };
    } catch {
        return null;
    }
}

async function requireChronosAuth(request, reply) {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const verified = verifyChronosToken(token);

    if (!verified) {
        return reply.status(401).send({ status: "unauthorized", error: "Session Chronos invalide ou expirée." });
    }
    request.player = verified;
}

// ---------------------------------------------------------------------------
// Utilitaires base de données
// ---------------------------------------------------------------------------
const TO_DURATIONS_MINUTES = [1, 5, 15, 60, 360, 1440, 4320, 10080];
const ALLOWED_WARN_REASONS = new Set(['autoclick_detected', 'cps_limit', 'interval_pattern']);

function getTimeoutDurationMinutes(timeoutNumber) {
    const index = Math.min(Math.max(0, timeoutNumber - 1), TO_DURATIONS_MINUTES.length - 1);
    return TO_DURATIONS_MINUTES[index];
}

async function getActiveTimeout(conn, playerId) {
    const rows = await conn.query(
        `SELECT timeout_number, duration_minutes, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS remaining_seconds
         FROM player_timeouts
         WHERE player_id = ? AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [playerId]
    );
    if (rows.length > 0 && Number(rows[0].remaining_seconds) > 0) {
        return {
            timeout_number: Number(rows[0].timeout_number),
            duration_minutes: Number(rows[0].duration_minutes),
            remaining_seconds: Number(rows[0].remaining_seconds)
        };
    }
    return null;
}

function parseStoredState(value) {
    try {
        return sanitizeState(typeof value === 'string' ? JSON.parse(value) : value);
    } catch {
        return getInitialState();
    }
}

// Ajoute automatiquement les colonnes nécessaires (voir aussi api/migrations/001_security.sql)
async function runMigrations() {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS save_version INT NOT NULL DEFAULT 0");
        await conn.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS state_saved_ms BIGINT NULL");
        await conn.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS captcha_required TINYINT(1) NOT NULL DEFAULT 0");
        await conn.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS rejected_saves INT NOT NULL DEFAULT 0");
        await conn.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS loot_credit VARCHAR(255) NULL");
        await conn.query("ALTER TABLE players MODIFY auth_token VARCHAR(512) NULL DEFAULT NULL");
        // Les jetons de session n'ont pas à être conservés en base
        await conn.query("UPDATE players SET auth_token = NULL WHERE auth_token IS NOT NULL");
    } finally {
        if (conn) conn.release();
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Récupérer la partie du joueur
fastify.get('/api/load', { preHandler: [requireChronosAuth, rateLimit('load', 30)] }, async (request) => {
    const { idSiteUser, name } = request.player;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            "SELECT id, game_state, save_version, captcha_required FROM players WHERE site_user_id = ?",
            [idSiteUser]
        );

        if (rows.length === 0) {
            return { status: "new_player", username: name, game_state: null, save_version: 0, active_warns: 0, timeout: null, captcha_required: false };
        }

        const player = rows[0];
        await conn.query("DELETE FROM player_warns WHERE player_id = ? AND created_at < NOW() - INTERVAL 1 HOUR", [player.id]);
        const activeTimeout = await getActiveTimeout(conn, player.id);
        const warnRows = await conn.query(
            "SELECT COUNT(*) AS count FROM player_warns WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR",
            [player.id]
        );

        return {
            status: "success",
            username: name,
            game_state: parseStoredState(player.game_state),
            save_version: Number(player.save_version),
            active_warns: Number(warnRows[0].count) || 0,
            timeout: activeTimeout,
            captcha_required: Boolean(player.captcha_required)
        };
    } finally {
        if (conn) conn.release();
    }
});

const saveSchema = {
    body: {
        type: 'object',
        required: ['game_state', 'save_version'],
        properties: {
            game_state: { type: 'object' },
            save_version: { type: 'integer', minimum: 0 }
        }
    }
};

// Sauvegarder la partie : l'état est nettoyé puis comparé à l'ancien avant d'être accepté
fastify.post('/api/save', { schema: saveSchema, preHandler: [requireChronosAuth, rateLimit('save', 90)] }, async (request, reply) => {
    const { idSiteUser, name } = request.player;
    const { game_state, save_version } = request.body;
    const now = Date.now();
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const rows = await conn.query(
            "SELECT id, game_state, save_version, state_saved_ms, captcha_required, loot_credit FROM players WHERE site_user_id = ? FOR UPDATE",
            [idSiteUser]
        );
        const player = rows[0];

        if (player) {
            const activeTimeout = await getActiveTimeout(conn, player.id);
            if (activeTimeout) {
                await conn.rollback();
                return reply.status(403).send({ status: "timed_out", message: "Action refusée : exclusion temporaire en cours.", timeout: activeTimeout });
            }
            if (player.captcha_required) {
                await conn.rollback();
                return reply.status(403).send({ status: "captcha_required", message: "Vérification anti-robot requise." });
            }
        }

        const currentVersion = player ? Number(player.save_version) : 0;
        const storedState = player ? parseStoredState(player.game_state) : getInitialState();

        // Une autre session (autre onglet / appareil) a sauvegardé entre-temps
        if (save_version !== currentVersion) {
            await conn.rollback();
            return reply.status(409).send({ status: "conflict", game_state: storedState, save_version: currentVersion });
        }

        const newState = sanitizeState(game_state);
        let elapsedSeconds = 0;
        if (player) {
            elapsedSeconds = player.state_saved_ms === null || player.state_saved_ms === undefined
                ? MAX_ELAPSED_SECONDS
                : (now - Number(player.state_saved_ms)) / 1000;
        }

        let lootCredit = null;
        try { lootCredit = player && player.loot_credit ? JSON.parse(player.loot_credit) : null; } catch { lootCredit = null; }

        const verdict = checkProgression(storedState, newState, elapsedSeconds, lootCredit);
        if (!verdict.ok) {
            request.log.warn({ idSiteUser, reason: verdict.reason, details: verdict.details }, 'Sauvegarde refusée (incohérence)');
            if (player) {
                await conn.query("UPDATE players SET rejected_saves = rejected_saves + 1 WHERE id = ?", [player.id]);
            }
            await conn.commit();
            return reply.status(422).send({
                status: "rejected",
                reason: verdict.reason,
                game_state: storedState,
                save_version: currentVersion
            });
        }

        const stateString = JSON.stringify(newState);
        const nextVersion = currentVersion + 1;
        const creditString = JSON.stringify(verdict.lootCredit);
        if (player) {
            await conn.query(
                "UPDATE players SET username = ?, game_state = ?, save_version = ?, state_saved_ms = ?, loot_credit = ? WHERE id = ?",
                [name, stateString, nextVersion, now, creditString, player.id]
            );
        } else {
            await conn.query(
                `INSERT INTO players (site_user_id, username, auth_token, game_state, save_version, state_saved_ms, loot_credit)
                 VALUES (?, ?, NULL, ?, ?, ?, ?)`,
                [idSiteUser, name, stateString, nextVersion, now, creditString]
            );
        }
        await conn.commit();
        return { status: "success", save_version: nextVersion };
    } catch (err) {
        if (conn) await conn.rollback().catch(() => {});
        if (err && err.code === 'ER_DUP_ENTRY') {
            return reply.status(409).send({ status: "conflict", game_state: null, save_version: 0 });
        }
        throw err;
    } finally {
        if (conn) conn.release();
    }
});

const warnSchema = {
    body: {
        type: 'object',
        properties: { reason: { type: 'string', maxLength: 100 } }
    }
};

fastify.post('/api/warn', { schema: warnSchema, preHandler: [requireChronosAuth, rateLimit('warn', 10)] }, async (request, reply) => {
    const { idSiteUser } = request.player;
    const rawReason = (request.body && request.body.reason) || 'autoclick_detected';
    const reason = ALLOWED_WARN_REASONS.has(rawReason) ? rawReason : 'autoclick_detected';

    let conn;
    try {
        conn = await pool.getConnection();
        const players = await conn.query("SELECT id, total_timeout_count FROM players WHERE site_user_id = ?", [idSiteUser]);
        if (players.length === 0) {
            return reply.status(404).send({ status: "not_found", error: "Joueur introuvable" });
        }
        const player = players[0];

        const existingTimeout = await getActiveTimeout(conn, player.id);
        if (existingTimeout) {
            return { status: "timed_out", active_warns: 0, timeout: existingTimeout };
        }

        await conn.query("DELETE FROM player_warns WHERE player_id = ? AND created_at < NOW() - INTERVAL 1 HOUR", [player.id]);
        await conn.query("INSERT INTO player_warns (player_id, reason) VALUES (?, ?)", [player.id, reason]);
        // Le joueur devra résoudre le captcha (vérifié par le serveur) avant de pouvoir sauvegarder à nouveau
        await conn.query("UPDATE players SET total_warn_count = total_warn_count + 1, captcha_required = 1 WHERE id = ?", [player.id]);

        const countRows = await conn.query(
            "SELECT COUNT(*) AS count FROM player_warns WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR",
            [player.id]
        );
        const activeWarns = Number(countRows[0].count) || 1;

        if (activeWarns >= 3) {
            const nextTimeoutNum = (Number(player.total_timeout_count) || 0) + 1;
            const durationMin = getTimeoutDurationMinutes(nextTimeoutNum);

            // Pendant l'exclusion, le captcha n'est plus nécessaire (le timeout bloque déjà les sauvegardes)
            await conn.query("UPDATE players SET total_timeout_count = ?, captcha_required = 0 WHERE id = ?", [nextTimeoutNum, player.id]);
            await conn.query(
                `INSERT INTO player_timeouts (player_id, timeout_number, duration_minutes, expires_at)
                 VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
                [player.id, nextTimeoutNum, durationMin, durationMin]
            );
            await conn.query("DELETE FROM player_warns WHERE player_id = ?", [player.id]);

            const newTimeout = await getActiveTimeout(conn, player.id);
            return { status: "timed_out", active_warns: 0, timeout: newTimeout };
        }

        return { status: "warned", active_warns: activeWarns, max_warns: 3, timeout: null };
    } finally {
        if (conn) conn.release();
    }
});

const captchaSchema = {
    body: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string', minLength: 1, maxLength: 2048 } }
    }
};

async function verifyTurnstile(token, remoteIp) {
    if (!TURNSTILE_SECRET) return true; // mode dégradé : voir l'avertissement au démarrage
    try {
        const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
        if (remoteIp) body.append('remoteip', remoteIp);
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body,
            signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        return data.success === true;
    } catch (err) {
        fastify.log.error(err, 'Erreur de vérification Turnstile');
        return false;
    }
}

// Validation du captcha : seule cette route peut lever le blocage posé par /api/warn
fastify.post('/api/captcha', { schema: captchaSchema, preHandler: [requireChronosAuth, rateLimit('captcha', 10)] }, async (request, reply) => {
    const { idSiteUser } = request.player;
    const valid = await verifyTurnstile(request.body.token, request.ip);
    if (!valid) {
        return reply.status(403).send({ status: "captcha_failed", error: "Vérification anti-robot échouée." });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("UPDATE players SET captcha_required = 0 WHERE site_user_id = ?", [idSiteUser]);
        return { status: "success" };
    } finally {
        if (conn) conn.release();
    }
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
const start = async () => {
    try {
        await runMigrations();
    } catch (err) {
        fastify.log.error(err, "Migration impossible : exécutez api/migrations/001_security.sql manuellement.");
        process.exit(1);
    }
    try {
        const port = parseInt(process.env.PORT, 10) || 3000;
        const host = process.env.HOST || '0.0.0.0';
        await fastify.listen({ port, host });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
