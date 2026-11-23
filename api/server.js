require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const mariadb = require('mariadb');
const cors = require('@fastify/cors');

// Configuration du pool de connexion MariaDB
const pool = mariadb.createPool({
     host: process.env.DB_HOST || 'localhost', 
     port: parseInt(process.env.DB_PORT, 10) || 3306,
     user: process.env.DB_USER || 'clicker', 
     password: process.env.DB_PASSWORD || 'clicker',
     database: process.env.DB_NAME || 'copper_clicker',
     connectionLimit: 5
});

// Activation de CORS pour que votre fichier HTML puisse appeler l'API
fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || "*" 
});

const TO_DURATIONS_MINUTES = [1, 5, 15, 60, 360, 1440, 4320, 10080];

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
            timeout_number: rows[0].timeout_number,
            duration_minutes: rows[0].duration_minutes,
            remaining_seconds: Number(rows[0].remaining_seconds)
        };
    }
    return null;
}

// Route 1: Récupérer la partie du joueur (Chargement)
fastify.get('/api/load/:username', async (request, reply) => {
    const { username } = request.params;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT id, game_state FROM players WHERE username = ?", [username]);
        
        if (rows.length === 0) {
            // Nouveau joueur : on retourne un état vide, le client créera l'état initial
            return { status: "new_player", game_state: null };
        }

        const playerId = rows[0].id;
        await conn.query("DELETE FROM player_warns WHERE player_id = ? AND created_at < NOW() - INTERVAL 1 HOUR", [playerId]);
        const activeTimeout = await getActiveTimeout(conn, playerId);

        const warnRows = await conn.query(
            "SELECT COUNT(*) AS count FROM player_warns WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR",
            [playerId]
        );
        const activeWarns = Number(warnRows[0].count) || 0;
        
        // MariaDB peut renvoyer le JSON sous forme de chaîne ou d'objet selon la config
        const state = typeof rows[0].game_state === 'string' ? JSON.parse(rows[0].game_state) : rows[0].game_state;
        return {
            status: "success",
            game_state: state,
            active_warns: activeWarns,
            timeout: activeTimeout
        };
    } catch (err) {
        reply.status(500).send({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Route 2: Sauvegarder la partie (Toutes les 30s ou Action Majeure)
fastify.post('/api/save', async (request, reply) => {
    const { username, game_state } = request.body;
    let conn;
    try {
        conn = await pool.getConnection();

        const existing = await conn.query("SELECT id FROM players WHERE username = ?", [username]);
        if (existing.length > 0) {
            const activeTimeout = await getActiveTimeout(conn, existing[0].id);
            if (activeTimeout) {
                return reply.status(403).send({
                    status: "timed_out",
                    message: "Action refusée : exclusion temporaire en cours.",
                    timeout: activeTimeout
                });
            }
        }

        const stateString = JSON.stringify(game_state);
        
        // Un "UPSERT" (INSERT ... ON DUPLICATE KEY UPDATE) pour sauvegarder ou créer en une seule requête
        await conn.query(
            `INSERT INTO players (username, auth_token, game_state) 
             VALUES (?, 'dummy_token', ?) 
             ON DUPLICATE KEY UPDATE game_state = ?`,
            [username, stateString, stateString]
        );
        
        return { status: "success", message: "Partie sauvegardée !" };
    } catch (err) {
        reply.status(500).send({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

fastify.post('/api/warn', async (request, reply) => {
    const { username, reason } = request.body;
    if (!username) return reply.status(400).send({ error: "Username requis" });

    let conn;
    try {
        conn = await pool.getConnection();
        const players = await conn.query("SELECT id, total_timeout_count FROM players WHERE username = ?", [username]);
        if (players.length === 0) {
            return reply.status(404).send({ error: "Joueur introuvable" });
        }

        const player = players[0];

        const existingTimeout = await getActiveTimeout(conn, player.id);
        if (existingTimeout) {
            return { status: "timed_out", active_warns: 0, timeout: existingTimeout };
        }

        await conn.query("DELETE FROM player_warns WHERE player_id = ? AND created_at < NOW() - INTERVAL 1 HOUR", [player.id]);
        await conn.query("INSERT INTO player_warns (player_id, reason) VALUES (?, ?)", [player.id, reason || 'autoclick_detected']);
        await conn.query("UPDATE players SET total_warn_count = total_warn_count + 1 WHERE id = ?", [player.id]);

        const countRows = await conn.query(
            "SELECT COUNT(*) AS count FROM player_warns WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR",
            [player.id]
        );
        const activeWarns = Number(countRows[0].count) || 1;

        if (activeWarns >= 3) {
            const nextTimeoutNum = (player.total_timeout_count || 0) + 1;
            const durationMin = getTimeoutDurationMinutes(nextTimeoutNum);

            await conn.query("UPDATE players SET total_timeout_count = ? WHERE id = ?", [nextTimeoutNum, player.id]);
            await conn.query(
                `INSERT INTO player_timeouts (player_id, timeout_number, duration_minutes, expires_at)
                 VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
                [player.id, nextTimeoutNum, durationMin, durationMin]
            );
            // Remise à zéro des warns actifs une fois sanctionné
            await conn.query("DELETE FROM player_warns WHERE player_id = ?", [player.id]);

            const newTimeout = await getActiveTimeout(conn, player.id);
            return {
                status: "timed_out",
                active_warns: 0,
                timeout: newTimeout
            };
        }

        return {
            status: "warned",
            active_warns: activeWarns,
            max_warns: 3,
            timeout: null
        };
    } catch (err) {
        reply.status(500).send({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// Lancement du serveur sur le port choisi
const start = async () => {
    try {
        const port = parseInt(process.env.PORT, 10) || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Serveur API démarré sur le port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();