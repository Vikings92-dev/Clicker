# Clicker
Clicker intéractif basé sur de la gestion de ressource

## Configuration de l'API (`.env`)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `AUTH_SECRET` | oui | Secret HMAC partagé avec Projet Chronos pour signer les jetons |
| `DB_PASSWORD` | oui en production | Mot de passe MariaDB |
| `TURNSTILE_SECRET` | recommandé | Clé secrète Cloudflare Turnstile : sans elle, le captcha n'est pas vérifié côté serveur |
| `NODE_ENV` | recommandé | `production` : retire les origines locales du CORS et exige `DB_PASSWORD` |
| `TRUST_PROXY` | si reverse proxy | `true` pour que l'API voie la vraie IP des joueurs (limitation de débit) |
| `HOST` / `PORT` | non | Adresse d'écoute (`127.0.0.1` si l'API est derrière un proxy sur la même machine) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `CORS_ORIGIN` | non | Connexion BDD et origines autorisées |

## Anti-triche

Les sauvegardes sont validées par le serveur (`api/validation.js`) : chaque valeur est bornée, les drills
sont reconstruits depuis leurs templates, et la progression est comparée au maximum possible depuis la
sauvegarde précédente. **Les règles de `api/gameRules.js` doivent rester synchronisées avec `src/js/state.js`**
lors de tout rééquilibrage.
