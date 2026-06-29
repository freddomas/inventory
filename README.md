# Inventory Realm

Application web multi-shop de gestion des stocks, ventes, validations et clotures.

## Structure

```text
public/              Interface web servie au navigateur
src/server/          Backend Express, API et persistance JSON
scripts/smoke.mjs    Smoke test HTTP autonome
test/                Tests API et controles de roles
docs/QUALITY_LOOP.md Critere de sortie de boucle qualite
```

## Demarrage local

```bash
npm ci
npm start
```

L'application ecoute par defaut sur `http://127.0.0.1:4173`.

Variables optionnelles:

```bash
PORT=4173
HOST=127.0.0.1
```

Pour exposer le serveur depuis une plateforme d'hebergement Node.js, definir par exemple `HOST=0.0.0.0` et laisser la plateforme fournir `PORT`.

## Deploiement

Cette application n'est pas une application statique GitHub Pages: elle depend de `server.mjs` pour les routes `/api/*` et pour la persistance JSON.

Options supportees par ce depot:

- Hebergement Node.js: `npm ci`, puis `npm start`.
- Render Blueprint: importer le depot GitHub et utiliser `render.yaml`.
- Docker: construire l'image avec `docker build -t inventory-realm .`, puis lancer avec un volume persistant monte sur `/data`.

Variables de production recommandees:

```bash
NODE_ENV=production
BUSINESS_TIME_ZONE=Africa/Kinshasa
HOST=0.0.0.0
PORT=<fourni-par-la-plateforme>
DATA_DIR=<chemin-persistant>
ALLOW_DEMO_SEED=true
RESET_CORRUPT_STORE=false
```

Le endpoint `/api/health` permet aux plateformes d'hebergement de verifier que le serveur repond.

Sur Render, le Blueprint utilise un disque persistant monte sur `/var/data`. C'est necessaire pour ne pas perdre `store.json` a chaque redeploiement/redemarrage. Un deploiement sans disque persistant n'est pas correct pour cette application.

`ALLOW_DEMO_SEED=true` est volontaire ici parce que l'application contient des donnees de demonstration. Pour une production reelle, il faut initialiser explicitement les donnees et retirer ce mode demo.

## Validation

```bash
npx playwright install chromium
npm run verify
```

`npm run verify` execute le controle syntaxique, les tests API, le smoke test HTTP et les tests UI Playwright avec un `DATA_DIR` temporaire.

Pour le CI, `npm run ci` est un alias explicite vers cette verification complete.

## Donnees locales

Le fichier `data/store.json` est une base locale de persistance et n'est pas versionne. Si le fichier est absent, `server.mjs` recree un jeu de donnees de demonstration au premier lancement.

Les comptes de demonstration sont destines au developpement local. Ne pas utiliser ces identifiants comme configuration de production.
