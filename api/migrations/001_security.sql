-- Migration sécurité (appliquée automatiquement au démarrage de l'API, ce fichier sert si
-- l'utilisateur MariaDB de l'API n'a pas le droit ALTER).
USE copper_clicker;

ALTER TABLE players ADD COLUMN IF NOT EXISTS save_version INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS state_saved_ms BIGINT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS captcha_required TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rejected_saves INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS loot_credit VARCHAR(255) NULL;

-- Les jetons de session ne doivent pas être stockés en base
ALTER TABLE players MODIFY auth_token VARCHAR(512) NULL DEFAULT NULL;
UPDATE players SET auth_token = NULL;
