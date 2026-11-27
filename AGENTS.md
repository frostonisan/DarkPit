# Consignes de développement — codex-2-v2

## Portée et règles de travail

Ces consignes s'appliquent à tout le dépôt : jeu, styles, assets, scripts et tests.
Lire également [docs/AGENTS.md](docs/AGENTS.md) avant toute modification : ses règles
de branche, d'autorisation, de données, de version et de publication s'appliquent
à l'ensemble du projet. Les présentes consignes techniques les complètent.
Une instruction explicite de l'utilisateur prime sur ces consignes.

Objectif : ajouter des fonctionnalités sans réintroduire le travail inutile supprimé
du moteur. La priorité de fluidité est le **combat réel à 40 entités** ; 10 et 80
restent des contrôles distincts. Une règle de code ne garantit pas un gain de FPS :
les conclusions de performance reposent sur des mesures et des non-régressions.

## 1. Organisation et responsabilités

Le jeu est une application statique en modules JavaScript natifs, servie depuis
`docs/`, sans compilation du jeu. Les dépendances npm servent aux outils et tests.

| Emplacement | Responsabilité |
| --- | --- |
| `docs/js/app/` | Démarrage, état de l'application, navigation entre étapes |
| `docs/js/combat/` | Règles, calculs, phases, ciblage logique, horloge et résolution |
| `docs/js/entities/` | Modèles d'entités, statistiques, progression et création logique |
| `docs/js/board/` | Plateau, placement, occupation et interactions de déplacement |
| `docs/js/rendering/` | Projection visuelle : HUD, animations, géométrie et effets |
| `docs/js/ui/` | Interfaces, panneaux, actions utilisateur et responsive |
| `docs/js/storage/` | Persistance, sessions, normalisation et caches privés de stockage |
| `docs/js/data/` | Catalogues et configurations partagés |
| `docs/js/items/`, `events/`, `biome/`, `procedural/` | Règles propres à ces domaines |
| `docs/js/debug/` | Diagnostics et outils de développement activés explicitement |
| `scripts/` | Tests, vérificateurs, serveur local et bancs de mesure |
| `outputs/` | Captures, rapports, références figées et prototypes expérimentaux |

- Chercher le module propriétaire et ses consommateurs avant d'ajouter du code.
  Réutiliser les API existantes ; ne pas créer un second cache, sérialiseur,
  ordonnanceur ou moteur de statistiques parallèle pour la même responsabilité.
- Ajouter une fonction cohérente au module concerné, ou un module nommé pour sa
  responsabilité. Ne pas accumuler des domaines différents dans un fichier généraliste,
  ni créer des variantes `new`, `v2`, `final` ou un dossier `utils` sans rôle précis.
- Utiliser des imports/exports explicites, sans nouvelles dépendances circulaires.
  Ne pas ajouter d'état global sur `window` pour contourner les frontières des modules.
- Garder les catalogues communs comme source unique : pas de copie locale de formule,
  couleur de nature, définition d'attaque ou configuration de statistique.
- Le code de production ne dépend jamais de `scripts/`, d'`outputs/` ou d'une page de
  laboratoire `index-*.html`. Un prototype validé rejoint son module de production.
- Les anciens modules mélangent parfois des responsabilités : isoler le code ajouté
  sans entreprendre un refactor général non demandé. Pas de dépendance ou framework
  supplémentaire pour une optimisation supposée.

## 2. Logique de combat et affichage

- Le moteur reste la source de vérité : dégâts, soins, effets, positions logiques,
  gains, ressources, phases et échéances. Le rendu consomme cet état ; il ne décide
  pas du résultat d'une attaque et ne modifie pas les statistiques pour afficher.
- Pour les nouveaux calculs, préférer des entrées/sorties explicites sans DOM.
  Les adaptateurs existants assurent les liens avec les vues. Référence :
  `combat/timerState.js` produit l'état consommé par `rendering/hud.js`.
- L'idempotence concerne les écritures d'affichage remplaçables. Deux dégâts, soins,
  gains ou effets périodiques identiques sont deux événements à traiter entièrement.
- Ne pas regrouper les impacts, sons, débuts d'animation ou changements de phase
  comme des valeurs de jauge. Préserver leur ordre, leur nombre et leurs échéances.
- Dans une optimisation, préserver le gameplay et le visuel existants. Une nouvelle
  fonctionnalité ne modifie que le comportement demandé, avec ses interactions testées.

## 3. Rendu DOM différentiel

- Utiliser `rendering/displayBatch.js` pour les styles, classes et textes remplaçables
  du combat : `setDisplayStyle`, `setDisplayText`, `setDisplayClass`, `toggleDisplayClass`.
  Respecter les attributs synchrones et les points de publication immédiate existants.
- Réutiliser les nœuds et ne publier que les valeurs modifiées. Préférer `setDOMText`
  aux remplacements de contenu texte ; modifier un groupe de classes en une publication.
  Ne pas retirer puis réajouter un modificateur inchangé.
- Ne pas reconstruire avec `innerHTML`/`replaceChildren` un panneau, compteur ou HUD
  à chaque tick. Réserver les reconstructions aux changements de structure réels.
  Un redémarrage d'animation voulu reste un changement réel, même à montant identique.
- Les points de synchronisation utilisent `flushCombatDisplay` : capture de pause,
  lecture synchrone qui exige l'état publié, arrêt d'une animation. Ne pas appeler
  un flush global à chaque mise à jour, ce qui annulerait le regroupement.
- Limiter les recherches au conteneur propriétaire et réutiliser les références de
  la vue. Pour les panneaux optionnels, utiliser le suivi de `ui/viewRoots.js` ;
  ne pas rechercher périodiquement dans tout le document des panneaux absents.
- Toute référence DOM mise en cache doit survivre correctement à la reconstruction
  de vue, à la mort/recréation d'une entité et au changement de niveau. Ne pas conserver
  silencieusement un ancien nœud détaché comme cible active.

## 4. Géométrie, responsive et CSS

- Regrouper les lectures de géométrie avant les écritures visuelles quand le traitement
  le permet. Éviter les séquences répétées écriture → `getBoundingClientRect`,
  `getClientRects`, `offsetWidth` ou `getComputedStyle` dans une boucle d'entités.
- Utiliser `rendering/projectileGeometry.js` pour partager les positions et notifier
  leurs changements. Un changement de PV, de texte HUD ou d'effet décoratif ne doit
  pas invalider toutes les cibles. Ne pas classer une transformation réelle comme
  décorative pour contourner l'invalidation.
- Une cible animée doit être suivie pendant son déplacement, pas seulement au départ
  et à l'arrivée. Préserver aussi les cas de redimensionnement, scroll, remplacement,
  changement d'ancêtre et cibles hors plateau. Documenter les invalidations du cache.
- `ui/viewport.js` et `#game-shell` portent l'adaptation à l'écran. Utiliser leurs
  conversions pour les overlays et pointeurs, sans ajouter un second calcul d'échelle
  ou de rotation. Préserver le paysage automatique mobile, sans bouton bloquant
  demandant de tourner l'appareil, ainsi que l'appui maintenu pour déplacer une entité.
- Respecter les huit feuilles et leur ordre définis dans le README : `base.css`,
  `interface.css`, `stats.css`, `combat.css`, `animation.css`, `monstre.css`,
  `effects.css`, `monstre-hitbox.css`. Classer les règles par responsabilité ; ne pas
  créer une feuille générique de correctifs ni multiplier les `!important`.
- Préférer des animations de transformation/opacité lorsque leur rendu est équivalent,
  puis vérifier le résultat. Ni `transform`, ni `will-change`, ni un nouveau calque
  ne sont une garantie d'accélération ; ne pas les ajouter systématiquement.
- Tester `contain` localement avec dimensions, débordements, ancrages et empilement.
  Le HUD et les barres d'attaque possèdent déjà du confinement. Les ancres de popups
  mesurent 0 × 0 : ne pas leur appliquer `contain: paint` à l'aveugle.

## 5. Statistiques et caches

- Partager les lectures coûteuses dans un même traitement synchrone via
  `entities/statSystem.js` et `withStatReadSnapshot`. Réutiliser les timings calculés
  pour le classement et la sélection ; ne pas reconstruire `makeRules` inutilement.
- Ne pas étendre ce contexte au-delà d'un `await` ou d'un événement. Les buffs,
  équipements et modifications de configuration doivent être pris en compte dès
  le calcul suivant ; le contexte doit être libéré même après exception.
- Pour tout nouveau cache : préciser son propriétaire, ses dépendances, ses causes
  d'invalidation, sa borne et son nettoyage. Ne pas exposer un objet mutable partagé
  à un appelant qui attend une copie indépendante.
- Ne pas utiliser un `JSON.stringify` complet d'entité ou d'armée à chaque image
  pour détecter un changement. Utiliser les changements connus ou les dépendances
  nécessaires sans ignorer les modifications externes prises en charge par le jeu.
- Mettre en cache un calcul coûteux et répété, pas chaque addition. Le coût de
  recherche, d'invalidation et de mémoire fait partie du bilan de l'optimisation.

## 6. Persistance et pause

- Passer par les API de `storage/`, sans introduire de sérialiseur ou d'écriture
  directe de sauvegarde dans une boucle de rendu. Réutiliser les caches d'armée
  et les fragments JSON des champs inchangés.
- Un appel de sauvegarde partielle doit déclarer **tous** les champs modifiés.
  Préserver normalisation JSON, isolation des copies, clés, ordre et caractère
  immédiat des écritures existantes. Ne pas transformer une sauvegarde immédiate
  en sauvegarde différée pour améliorer artificiellement un benchmark.
- Conserver l'invalidation lors d'une écriture externe, d'un changement de session
  ou d'une erreur. Tester les sauvegardes alternées, pas uniquement le cas nominal.
- Employer l'horloge de `combat/clock.js` pour les délais du combat et les effets
  qui doivent se figer. Ne pas remplacer l'horloge native de publication du
  `displayBatch` ou celle des interactions UI par une horloge de combat.
- Un nouvel effet doit préciser comment il se fige, se sauvegarde, se restaure et
  reprend sans rejouer l'impact. Utiliser les mécanismes existants de `combat/pause.js`
  et `registerCombatState` lorsque nécessaire. Une capture de pixels Canvas ne
  suffit pas à restaurer la progression et l'expiration d'une animation.

## 7. Animations, effets et ressources

- Réutiliser les ordonnanceurs existants, notamment `scheduleProjectileFrame` dans
  `rendering/projectileTrails.js`. Ne pas ajouter une boucle permanente par entité
  ou par effet lorsqu'une mise à jour partagée ou déclenchée par changement suffit.
- À vide, un nouveau système d'effets ne doit pas continuer à tourner. Borner
  les réserves d'objets, historiques, textures et listes ; nettoyer RAF, timers,
  animations, observateurs, écouteurs et références au retrait de leur propriétaire.
- Les popups de dégâts réutilisent une réserve détachée, limitée à huit cartes par
  entité. Ne pas réintroduire les cartes expirées cachées dans le DOM ni modifier
  les limites d'affichage pour obtenir un meilleur chiffre de performance.
- Précalculer et partager les textures répétées lorsque pertinent. Éviter le dessin
  coûteux du même motif, le décodage ou les conversions d'images à chaque frame.
- Les GIF sont le mode de production retenu ; les spritesheets restent disponibles
  pour expérimentation. Ne pas réactiver leur migration globale ou imposer Canvas,
  WebGL ou Phaser sans demande/prototype, parité visuelle et gain mesuré.
- Pour un prototype Canvas partagé : un consommateur visuel de l'état du moteur,
  pas une seconde simulation. Vérifier texte, contours, ombres, DPR, coordonnées,
  couches de profondeur, interactions et pause ; ne pas imposer une surface unique
  si l'empilement avec le DOM nécessite plusieurs couches.
- Préserver le préchargement et les chemins d'assets. Documenter les ressources
  ajoutées ou inutilisées ; aucune réduction silencieuse de résolution ou d'effets.
- Les diagnostics lourds doivent être désactivés par défaut. Conserver erreurs,
  avertissements utiles et journal du jeu ; éviter les logs détaillés par impact/frame.

## 8. Validation proportionnée et preuve des gains

Avant d'implémenter, identifier le module propriétaire, le travail ajouté par entité,
par événement et par frame, ainsi que les bornes et le nettoyage des nouvelles ressources.
Pour une optimisation, identifier le poste coûteux et figer la référence avant édition.

- Pour un changement de code : lancer `npm run verify`, les tests Node concernés
  (ou `npm test`) et les scénarios navigateur pertinents. Utiliser
  `node scripts/verify-suite.mjs <nom-du-script>` pour une sélection précise.
  Ne pas confondre un script lancé sans mode de mesure avec un benchmark effectué.
- Ajouter ou adapter une régression utile lorsqu'un comportement sensible change :
  deux impacts identiques, buff/équipement/configuration, reconstruction DOM,
  fin de combat, pause/rechargement/reprise, déplacement ou sauvegarde selon le cas.
  Conserver les assertions fonctionnelles ; un changement de technique de rendu
  ne justifie pas de supprimer les garanties de résultat.
- Vérifier les vues et le responsive touchés, y compris portrait mobile avec paysage
  automatique et glisser-déposer si concernés. Ne pas revendiquer une validation
  complète du jeu après une seule sélection de tests.
- Pour une modification affectant le coût du combat : comparer avant/après à
  **10, 40 et 80 entités**, priorité 40. Une nouvelle fonctionnalité changeant la
  charge doit distinguer son coût ajouté des améliorations du moteur existant.
- Suivre [scripts/COMBAT_REFERENCE.md](scripts/COMBAT_REFERENCE.md) : mêmes fixtures,
  entrées, caméra, viewport, DPR, ressources et fenêtres par paire ; sources figées
  et données brutes conservées dans un nouveau dossier `outputs/`.
- Répéter en ordre alterné. Un passage unique est exploratoire. Séparer combat réel,
  rejeu visuel et glisser-déposer ; vérifier les événements et états du rejeu.
  Aucun autre test lourd en parallèle. Documenter la charge externe et conserver
  Firefox actif lorsque c'est la contrainte de l'utilisateur.
- Séparer les traces diagnostiques des mesures de fluidité. Ne pas mesurer les gains
  avec les statistiques CSS lentes activées. Donner moyenne RAF, P95, nombre de
  callbacks, durée et résultats des paires ; signaler les fenêtres raccourcies et
  les effectifs faibles. Ne pas additionner des temps inclusifs de profilage.
- Distinguer baisse de calculs/JSON/mutations et amélioration de fluidité. Une racine
  de layout `#document` ne prouve pas une reconstruction intégrale. Un gain au rejeu
  ne prouve pas un gain en combat réel ; un P95 plus bas n'est pas autant de FPS en plus.
- Retenir une optimisation de fluidité pour un gain reproductible en combat réel
  à 40, avec les autres tailles documentées. Si le résultat est variable ou négatif,
  le dire. Un nettoyage retenu pour d'autres raisons doit être présenté comme tel,
  pas comme une accélération acquise. Une régression reproductible exige correction
  ou décision explicite ; une variation isolée à 80 ne remplace pas l'objectif à 40.
- Ne pas additionner les pourcentages de campagnes différentes. Ne pas écarter une
  mesure défavorable sans raison documentée ; conserver les essais rejetés séparément.
- Une modification exclusivement documentaire nécessite une relecture et un contrôle
  des références, pas une campagne de combat ni une nouvelle version du jeu.

## 9. Checklist de livraison

- [ ] Responsabilité et emplacement cohérents ; mécanismes existants réutilisés.
- [ ] Aucun calcul/événement réel perdu ; affichage différentiel et lectures nécessaires.
- [ ] Coût par événement/frame, bornes, invalidation et nettoyage examinés.
- [ ] Visuel, interactions, pause et persistance concernés vérifiés.
- [ ] Tests et mesures réellement exécutés indiqués, avec leurs limites et échecs.
- [ ] Pour une mise à jour du jeu : version incrémentée, synchronisée et visible,
      note README décrivant uniquement les changements terminés.
      La source est `GAME_VERSION` dans `docs/js/debug/admin.js`, qui injecte aussi
      le libellé dans le DOM ; synchroniser les métadonnées npm et le README.
      Aucune modification/publication d'`index.html` n'est requise pour le numéro.
- [ ] Diff limité à la tâche, changements préexistants préservés ; aucun prototype
      abandonné présenté comme livré, aucun fichier de diagnostic chargé en production.
- [ ] Bilan précis : changement, preuve, gain ou absence de gain, risques restants.

Ces consignes doivent évoluer avec les mécanismes effectivement adoptés. Une
architecture proposée dans un rapport ne devient pas une règle avant validation.
