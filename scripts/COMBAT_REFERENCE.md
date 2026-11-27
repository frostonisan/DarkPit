# Références de combat et rejeu visuel

Ces outils de test ne modifient aucun fichier de jeu et n'incrémentent pas sa version.
Chaque page utilise un contexte Playwright neuf, avec un stockage local isolé :
la sauvegarde du joueur n'est jamais utilisée. Chrome est requis par défaut
(`VERIFY_BROWSER` permet de sélectionner un autre canal Chromium installé).

## Deux séries distinctes

**Combats réels contre le Désert.** Le bouton de la carte et le chargeur de niveau
de production sont utilisés. L'armée B a été créée une seule fois par le générateur
du véritable niveau Désert, puis enregistrée dans `fixtures/combat-reference.json`.
Ses neuf unités, niveaux, attaques et statistiques sont réutilisés sans génération
à chaque passage. La surprise du niveau est conservée. Les PV ne sont pas gonflés,
et les morts, fuites et fins de combat restent possibles.

| Total initial | Armée A | Armée Désert B |
| --- | --- | --- |
| 10 | 1 | 9 |
| 40 | 31 | 9 |
| 80 | 71 | 9 |

L'armée A utilise un cycle fixe de dix modèles : Mouche asticoteuse, six variantes
de Porc, Porc physique à distance, Jeune Salamandron et Escargot coulissant.
Les instances complètes sont enregistrées, avec des identifiants stables. Chaque
cas utilise un préfixe de cette armée ; les trois armées A ne sont donc pas trois
tirages aléatoires. Le test compare les empreintes des armées et les états initiaux
(statistiques, attaques, positions) entre passages de même taille. Une même graine
ne rend pas le déroulement d'un combat en temps réel parfaitement déterministe.

**Rejeu visuel contrôlé.** Une séquence *scriptée*, distincte d'un enregistrement
exhaustif d'une partie, est écrite dans `trace-10.json`, `trace-40.json` et
`trace-80.json`. Elle utilise des camps équilibrés, les véritables fonctions de
rendu et les GIF. Elle couvre préparations et interruptions, mises à jour HUD,
mêlées, projectiles, impacts, soins, Ambidextrie et mouvements de cibles.
Les timings de ce scénario sont volontairement fixés. Il n'applique pas les règles
de dégâts et ne lance pas l'IA. Un contrôle rejette tout véritable impact, mort ou
tour de combat qui s'y introduirait.

Chaque événement possède une échéance et un numéro d'ordre. Aucune commande en
retard n'est supprimée. Les entrées, leur ordre, le nombre exécuté et l'état final
sont comparés entre relectures. Les animations natives et le décodage GIF restent
réels : l'égalité des commandes ne promet pas des pixels ou des instants de rendu
identiques. Le retard d'exécution est mesuré, en plus des intervalles RAF.

## Commandes

Depuis la racine du projet :

```powershell
# Contrats de la trace, sans navigateur
node scripts/verify-combat-reference-browser.mjs --self-test

# Campagne complète : deux passages par taille et par série, ordre inversé au second
node scripts/verify-combat-reference-browser.mjs --measure

# Une série seulement, toujours aux trois tailles
node scripts/verify-combat-reference-browser.mjs --live-only
node scripts/verify-combat-reference-browser.mjs --replay-only

# Vérification des armées, états et placements, sans démarrer le combat
node scripts/verify-combat-reference-browser.mjs --fixtures-only
```

`REFERENCE_OUTPUT` change le dossier de résultats ; `REFERENCE_REPEATS` change le
nombre de passages (défaut 2). Un passage unique est un contrôle exploratoire,
pas une validation de répétabilité. Les commandes précédentes ne régénèrent jamais
le fichier d'armées. `--prepare` sert à son enregistrement initial et refuse
d'écraser une référence existante. Une nouvelle référence de données doit être
créée explicitement et conservée séparément des anciens résultats.
Sans option, seuls les contrats de trace sont vérifiés : la suite de tests
ordinaire ne démarre donc pas de mesures lourdes en parallèle. `--measure` est
nécessaire pour lancer les deux séries complètes.

Pour comparer un correctif à une archive, `REFERENCE_BASELINE_ROOT` désigne un
dossier contenant les anciens `js/` et `css/`. Les médias restent ceux du projet
courant : ne pas utiliser cette option pour comparer des modifications de médias.
L'ordre baseline/current est inversé un passage sur deux. `REFERENCE_TRACE_DIR`
permet de réutiliser des traces déjà enregistrées ; une différence des entrées
attendues fait échouer la campagne au lieu de régénérer silencieusement la charge.

## Mesures et limites

Les deux séries ne doivent pas être mélangées ni comparées directement en FPS.
Les pages ont un viewport de 1536 × 864, DPR 1. La caméra est cadrée une fois pour
contenir les sprites et HUD ; les paramètres de combat ne sont pas modifiés.
Ce cadrage de diagnostic diffère du zoom d'une partie ordinaire. Les mesures
utilisent les véritables RAF et horloges du navigateur, sans horloge virtuelle.

Chaque fenêtre prévue dure 12 secondes. La fin naturelle d'un combat peut la
raccourcir ; la durée, les impacts, morts et l'issue sont conservés. Le rejeu
enregistre également le retard des commandes. Les mesures CDP de script/style/
layout couvrent la fenêtre et sa collecte ; elles ne sont pas des temps GPU.
Les captures sont réalisées après la mesure. Aucun autre test lourd ne doit tourner
en parallèle. Les résultats d'un pilote ayant échoué ne constituent pas une référence.
`REFERENCE_CAPTURE_TRACE=1` enregistre aussi les traces Chrome `.json.gz` des
combats réels à 40 entités, avant/après si une archive est fournie. Le profilage
CPU ajoute une charge : comparer les passages avec la même option et ne pas
mélanger leurs temps avec ceux d'une campagne sans trace.
À 80 entités, le nombre d'images peut être faible dans une fenêtre de 12 secondes :
consulter le compteur `frames` et traiter le P95 comme indicatif tant que la série
n'est pas suffisamment longue. Ce scénario de salves peut saturer le rendu ; ses
FPS ne représentent pas toutes les situations d'une partie.

Les sorties contiennent les traces et leurs empreintes, les états initiaux/finals,
les mesures brutes, les captures, les erreurs et le contrôle SHA-256 des fichiers
de production. Sans `REFERENCE_BASELINE_ROOT`, il s'agit d'une référence répétée
du même code, pas d'une démonstration de gain avant/après.
