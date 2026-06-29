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

## Validation

```bash
npm run check
```

## Donnees locales

Le fichier `data/store.json` est une base locale de persistance et n'est pas versionne. Si le fichier est absent, `server.mjs` recree un jeu de donnees de demonstration au premier lancement.

Les comptes de demonstration sont destines au developpement local. Ne pas utiliser ces identifiants comme configuration de production.
