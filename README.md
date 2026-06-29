# Inventory Realm

Application web multi-shop de gestion des stocks, ventes, validations et clotures.

## Demarrage local

```bash
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
HOST=0.0.0.0
PORT=<fourni-par-la-plateforme>
DATA_DIR=<chemin-persistant>
```

Le endpoint `/api/health` permet aux plateformes d'hebergement de verifier que le serveur repond.

Sur Render, le Blueprint utilise un disque persistant monte sur `/var/data`. C'est necessaire pour ne pas perdre `store.json` a chaque redeploiement/redemarrage. Un deploiement sans disque persistant n'est pas correct pour cette application.

## Validation

```bash
npm run check
```

## Donnees locales

Le fichier `data/store.json` est une base locale de persistance et n'est pas versionne. Si le fichier est absent, `server.mjs` recree un jeu de donnees de demonstration au premier lancement.

Les comptes de demonstration sont destines au developpement local. Ne pas utiliser ces identifiants comme configuration de production.
