# AGENTS.md

## Posture

- Répondre en français quand l'utilisateur écrit en français.
- Adopter une posture directe, critique et pratique.
- Prioriser la vérité, la preuve et la robustesse plutôt que la complaisance.
- Signaler clairement les hypothèses, limites, validations faites et validations impossibles.
- Ne pas présenter une correction comme terminée sans preuve suffisante.

## Règles De Démarrage

- Inspecter d'abord les fichiers d'orientation disponibles: `AGENTS.md`, `AGENTS.override.md`, `README*`, `docs/README*`, `CONTRIBUTING*`, `CHANGELOG*`, manifestes et fichiers de configuration.
- Si aucun fichier d'orientation n'existe, continuer avec le contexte local et les demandes explicites.
- Utiliser `rg` / `rg --files` en priorité pour chercher dans le projet.
- Préserver les changements utilisateur non liés. Ne jamais réinitialiser ou supprimer du travail existant sans demande explicite.

## Projet Inventory

- Application web multi-shop avec isolation stricte par shop.
- Rôles principaux: `super_user`, `shop_admin`, `manager`, `agent`.
- Appliquer le principe `need to know`: ne pas afficher à un rôle une information ou une action dont il n'a pas besoin.
- Le responsable shop valide les ventes sous prix et les entrées stock. Le manager consulte le backlog selon ses droits.
- L'agent peut vendre, consulter le stock et clôturer selon son périmètre, sans accès aux statistiques avancées ni aux fonctions d'administration.
- Les données sont actuellement servies par `server.mjs` avec persistance JSON dans `data/store.json`.
- Tous les mots de passe initiaux de données seedées sont `demo2026!`.

## Qualité UI/UX

- Traiter l'application comme un vrai produit, pas comme une démo, un SOP ou un document.
- Éviter les textes d'aide inutiles au milieu des vues métier.
- Les écrans doivent être utilisables sur laptop et smartphone.
- Toute navigation visible doit mener à une action réelle.
- Les dashboards doivent contenir des indicateurs exploitables, des graphiques utiles et des éléments cliquables.
- Les vues stock/catalogue doivent rester lisibles avec beaucoup d'articles: recherche, filtres, arbre dépliable et statuts visuels.
- Respecter le thème clair/sombre.

## Développement

- Utiliser `apply_patch` pour les modifications manuelles.
- Garder les changements ciblés et cohérents avec l'architecture existante.
- Ne pas ajouter de dépendance lourde sans nécessité claire.
- Préférer des solutions simples, robustes et vérifiables.
- Ne pas faire de refactor non demandé si ce n'est pas nécessaire pour corriger le problème.

## Validation

- Exécuter au minimum:
  - `node --check app.js`
  - `node --check server.mjs`
- Quand l'UI est modifiée, vérifier le rendu réel dans le navigateur intégré quand disponible.
- Si le navigateur intégré ou la capture est indisponible, le dire explicitement et compenser par des validations locales raisonnables.
- Ne pas inventer de résultat de test, de capture ou de log.

## Sécurité Et Données

- Ne pas exposer de secrets, mots de passe ou données sensibles dans l'interface.
- Ne pas envoyer de message externe ni appeler d'API externe sans demande explicite.
- Ne pas modifier destructivement `data/store.json` pour simuler un état visuel sauf si l'utilisateur l'autorise.
- Toute restriction côté UI doit rester cohérente avec les contrôles backend.
