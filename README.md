# DarkPit

Jeu web vanilla JavaScript deploye automatiquement sur OVH depuis GitHub.

## Structure

- `dossier/index.html` : entree publique du site.
- `dossier/js/` : logique du jeu, UI, combat, sauvegarde et donnees.
- `dossier/css/` : styles principaux.
- `dossier/media/` : sprites, portraits, decors, sons et icones.

## Deploiement

Le depot GitHub est relie a OVH sur la branche `main`.
Chaque `git push` sur `main` redeploie le sous-domaine :

```text
https://git.dark-souls.fr/
```

Le dossier racine OVH doit rester :

```text
git-dark/dossier
```

## Workflow

```powershell
git status
git add .
git commit -m "Description courte"
git push
```

Pour revenir en arriere proprement apres une mauvaise mise a jour :

```powershell
git revert HEAD
git push
```

## Verification locale

Depuis la racine du projet :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

Le script verifie la syntaxe des fichiers JavaScript, les imports, et les references HTML/CSS/assets statiques les plus simples.

## Logs de debug

Par defaut, `console.log`, `console.info` et `console.debug` sont coupes en production. `console.warn` et `console.error` restent visibles.

Pour activer les logs de debug dans le navigateur :

```js
DarkPitLogs.enable()
```

Pour les couper a nouveau :

```js
DarkPitLogs.disable()
```

On peut aussi charger le site avec `?debugLogs=1` ou `?debugLogs=0`.
