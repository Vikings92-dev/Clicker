CREATE DATABASE IF NOT EXISTS copper_clicker;
USE copper_clicker;

CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    auth_token VARCHAR(255) NOT NULL,
    game_state JSON NOT NULL,
    last_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    total_advertisement_count INT DEFAULT 0,
);

CREATE TABLE IF NOT EXISTS player_advertisement (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS clean_expired_advertisements
ON SCHEDULE EVERY 1 MINUTE
DO
    DELETE FROM player_advertisements 
    WHERE created_at < NOW() - INTERVAL 1 HOUR;

SELECT COUNT(*) AS hour_advertisement_count 
FROM player_advertisements 
WHERE player_id = ? AND created_at >= NOW() - INTERVAL 1 HOUR;