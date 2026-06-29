# Quality Loop

Inventory Realm sort de boucle uniquement quand les controles suivants passent:

1. `npm ci`
2. `npm run check`
3. `npm test`
4. `npm run smoke`
5. `npm run test:ui`

Les criteres minimaux sont:

- le serveur demarre avec `DATA_DIR` temporaire;
- `/api/health`, `/`, `/app.js` repondent correctement;
- `/api/bootstrap` reste protege sans session;
- les roles ne sortent pas de leur shop;
- une vente normale decremente le stock;
- les donnees demo locales ne sont pas versionnees.
