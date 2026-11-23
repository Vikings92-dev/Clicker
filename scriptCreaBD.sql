CREATE DATABASE IF NOT EXISTS copper_clicker;
USE copper_clicker;

CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_user_id INT UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    auth_token VARCHAR(512) NOT NULL,
    game_state JSON NOT NULL,
    last_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    total_warn_count INT DEFAULT 0,
    total_timeout_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_warns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    reason VARCHAR(100) DEFAULT 'autoclick_detected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_player_warn_time (player_id, created_at),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_timeouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    timeout_number INT NOT NULL,
    duration_minutes INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_player_timeout_active (player_id, expires_at),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS clean_expired_warns
ON SCHEDULE EVERY 1 MINUTE
DO
    DELETE FROM player_warns
    WHERE created_at < NOW() - INTERVAL 1 HOUR;

/* Requete sur le jeu */
SELECT expires_at, duration_minutes 
FROM player_timeouts 
WHERE player_id = ? AND expires_at > NOW() 
ORDER BY expires_at DESC 
LIMIT 1;

INSERT INTO player_warns (player_id, reason) VALUES (?, ?);
UPDATE players SET total_warn_count = total_warn_count + 1 WHERE id = ?;

SELECT COUNT(*) AS active_warns 
FROM player_warns 
WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR;

UPDATE players SET total_timeout_count = total_timeout_count + 1 WHERE id = ?;

INSERT INTO player_timeouts (player_id, timeout_number, duration_minutes, expires_at)
VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE);

DELETE FROM player_warns WHERE player_id = ?;