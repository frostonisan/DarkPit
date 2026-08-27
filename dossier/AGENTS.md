# Règles de travail Codex

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