# Règles de travail Codex

Les règles techniques d'organisation, de performance et de validation sont dans
[AGENTS.md à la racine](../AGENTS.md) et s'appliquent aussi à ce dossier.
Les règles opérationnelles ci-dessous restent applicables à tout le projet.

## Developpement sur donnees neuves

Le joueur vide ses donnees entre les tests. Conserver un seul modele courant pour les essences.
Ne pas ajouter de migration, de passerelle vers les anciens formats ou de mecanisme de rollback,
sauf demande explicite du joueur. Les controles des IDs et des actions courantes restent utiles.

## Branche autorisée

- Travaille uniquement sur la branche `version-2`.
- Ne modifie jamais `main`.
- Ne fusionne jamais `version-2` vers `main` sans mon autorisation explicite.
- N'effectue jamais de `git push --force`.

## Modifications autorisées automatiquement

Tu peux sans demander :

- modifier quelques fichiers liés à une tâche précise ;
- corriger un bug localisé ;
- ajouter une petite fonctionnalité ;
- lancer les tests ;
- vérifier `git diff` et `git status` ;
- créer un commit ;
- pousser sur `origin/version-2`.

## Demander mon accord avant une grosse modification

Demande mon autorisation AVANT de :

- modifier plus de 5 fichiers ;
- supprimer plusieurs fichiers ;
- renommer beaucoup de fichiers ;
- modifier l’architecture générale du projet ;
- changer le format des données ;
- modifier le système de sauvegarde ;
- modifier des dépendances ;
- faire un gros refactor ;
- changer une partie importante du gameplay ;
- effectuer une opération Git destructive.

## Mesures de performances des combats

À chaque campagne de mesures ou validation d'une optimisation des combats,
tester obligatoirement les trois populations : **10, 40 et 80 entités**.
Comparer avant/après avec les mêmes scénarios, graines et conditions pour chaque
population, sans autre test lourd en parallèle. Présenter les résultats séparément
pour les trois tailles ; ne pas extrapoler les mesures à 40 entités aux autres cas.
Si une taille n'a pas été mesurée, signaler explicitement que la campagne est incomplète.

## Version du jeu

Pour chaque mise à jour du jeu, incrémenter la version avant la validation finale
selon l’ampleur réelle du changement, et non à chaque intervention :
- quatrième nombre pour une retouche visuelle, CSS, pictogramme ou affichage
  (`0.90.5.1-dev`, puis `0.90.5.2-dev`) ;
- troisième nombre pour une correction fonctionnelle ou une petite évolution
  (`0.90.6-dev`) ;
- deuxième nombre pour une fonctionnalité importante (`0.91.0-dev`) ;
- premier nombre pour une refonte majeure (`1.0.0-dev`).
Conserver le suffixe `-dev` pendant le développement. Un diagnostic seul ou une
modification exclusivement documentaire ne crée pas de version.

La source de la version est la constante exportée `GAME_VERSION`, en tête de
`docs/js/debug/admin.js`. Modifier cette constante, puis synchroniser `package.json`,
les deux versions racines de `package-lock.json` et la note de version actuelle du README.
`package.json.gameVersion` conserve le numéro affiché exact. Pour les outils npm,
une microversion `0.90.5.1-dev` s’écrit `0.90.5-dev.1` dans les champs `version`
de package.json et package-lock.json (sans suffixe dev : `0.90.5+fix.1`).
Les versions à trois nombres conservent leur forme habituelle. Les contrôles du
libellé affiché lisent `gameVersion`, avec repli sur `version` pour les références
antérieures. `scripts/verify-project.mjs` vérifie cette correspondance.
`docs/js/debug/admin.js` injecte lui-même cette valeur dans `#game-version`, en mode
normal comme en mode admin. Il remplace l'ancien libellé du HTML ou crée le support
s'il manque. Ne pas modifier ni republier `docs/index.html` pour une mise à jour
du numéro : le JavaScript chargé fait autorité.

Décrire dans le README les changements réellement terminés, pas les travaux prévus.
`npm run verify` contrôle la cohérence des versions. Vérifier aussi que le libellé
reste visible dans le jeu, après rechargement et sur mobile.

## Avant chaque commit

Toujours :

1. vérifier `git status`;
2. vérifier `git diff`;
3. lancer les tests pertinents si possible;
4. ne pas commit si une erreur importante est détectée.

## Push automatique

Après une tâche terminée et validée :

1. `git add` uniquement sur les fichiers concernés ;
2. créer un commit avec un message clair ;
3. pousser automatiquement vers `origin/version-2`.

Ne jamais pousser directement vers `main`.

## Sécurité

Ne jamais exécuter sans autorisation explicite :

- `git reset --hard`
- `git clean`
- `git push --force`
- suppression massive de fichiers
- fusion vers `main`
