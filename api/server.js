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

// Route 1: Récupérer la partie du joueur (Chargement)
fastify.get('/api/load/:username', async (request, reply) => {
    const { username } = request.params;
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT game_state FROM players WHERE username = ?", [username]);
        
        if (rows.length === 0) {
            // Nouveau joueur : on retourne un état vide, le client créera l'état initial
            return { status: "new_player", game_state: null };
        }
        
        // MariaDB peut renvoyer le JSON sous forme de chaîne ou d'objet selon la config
        const state = typeof rows[0].game_state === 'string' ? JSON.parse(rows[0].game_state) : rows[0].game_state;
        return { status: "success", game_state: state };
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