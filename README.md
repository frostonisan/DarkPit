# DarkPit — codex-2-v2

Jeu web statique en JavaScript, HTML et CSS. Le jeu est servi directement depuis
`docs/`, sans compilation. Les dépendances npm servent uniquement aux contrôles
et aux tests ; elles ne sont pas publiées avec le jeu.

## Version actuelle : 0.93.1-dev — 27 novembre 2026

Le numéro de version est défini par `GAME_VERSION` dans `docs/js/debug/admin.js`.
Le même module admin injecte le libellé dans le DOM en mode normal et admin,
en remplaçant l'ancien texte du HTML ou en créant le libellé s'il manque.
Il suffit de publier le JavaScript actualisé pour changer la version affichée :
aucune modification d'`index.html` n'est nécessaire. Le vérificateur du projet
contrôle la cohérence avec les métadonnées npm et cette note de version.

### Natures combinées dans l’admin — 0.93.1-dev — 27 novembre 2026

Le sélecteur de nature des attaques propose directement Prismatique, Spectrale
et Cinétique. Ces choix remplacent la famille précédente par les couleurs
correspondantes, avec les mêmes emplacements d’essences et la même sauvegarde
que les autres modifications d’attaque. Le choix actif reste coché à la réouverture.

### Carte Résilience sur petit écran — 0.93.0.1-dev — 27 novembre 2026

Sur les écrans de 400 px ou moins, les valeurs de la carte Résilience passent
à la ligne quand leur libellé et le bouton de calcul ne tiennent plus ensemble.
Les valeurs et les commandes restent accessibles sans débordement horizontal.

### Perçant, critiques par nature et Silence — 0.93.0-dev — 27 novembre 2026

Le perçant exploite la différence entre les résistances physique et magique après
pénétration : multiplicateur `1 + a × Δ / (100 + |Δ|)`, avec `a = 1,2` si Δ est
positif et `a = 0,9` sinon. L’armure et la protection ésotérique gardent leurs rôles.

Le bonus critique est réduit par la résistance critique avant de déterminer les
dégâts et propriétés. Les dégâts immédiats passent par l’armure. Le physique pur
gagne précision et vol de vie ; la magie pure convertit son supplément en brûlure
et le partage aussi en explosion entre les alliés adjacents de la cible, sur tout
le contour des grandes entités. Chaque explosion peut critiquer sur son propre
montant. Les ticks ne critiquent jamais. Une nouvelle brûlure critique redistribue
le reliquat et le nouvel apport sur sa durée, en conservant les sources.

L’hybride partage son supplément à 50/50 ; cinétique et spectral suivent les parts
d’essences. Le vol de vie suit la part physique, la brûlure la part magique.
Rupture/Dissolution atteignent dix charges : la résilience réduit le malus par
charge. Exaust retire un mouvement actuel ; Déphasage recule les timings actifs,
à l’impact spectral et sur ses ticks, hors projectiles, mouvements et cooldowns.
Corruption prismatique transforme le supplément en perte de PV maximum cumulable
pendant vingt secondes renouvelables. Elle ne peut pas tuer ; l’expiration restaure
la capacité sans soin. La portion tronquée apparaît en noir dans les barres.
Les critiques de soutien conservent leur comportement antérieur.

Silence interrompt la préparation et redémarre le cooldown complet du seul sort
interrompu. Les autres délais continuent et les attaques déjà parties se résolvent.

### Ésotérisme : courbes, protection perçante et cooldown — 0.92.7-dev — 27 novembre 2026

Ésotérisme utilise les ratios progressifs et le seuil de son propriétaire.
L’Agilité renforce la réduction magique ; la Force donne une chance d’étendre
la protection aux dégâts perçants, y compris lors d’une attaque purement perçante.
La réduction perçante vaut exactement la moitié de la réduction magique.
L’Intelligence réduit le cooldown commun de 5 secondes vers 2 secondes.
Une tentative échouée ne consomme pas ce délai. Le cooldown se fige pendant
la pause et le sommeil, se restaure au rechargement et disparaît en fin de combat.
Les cartes séparent les deux protections exclusives et leurs paramètres ; les
helpers et calculs admin reprennent les mêmes valeurs que le moteur.

### Équilibre : Présence équilibrée — 0.92.6-dev — 27 novembre 2026

Présence équilibrée augmente l’aggro générée par les dégâts, les soins et les
éliminations. Ses ratios d’Équilibre et de Force suivent la progression commune
et la limite de l’entité, avec un plafond de 99 %. Le bonus multiplie le score
après la réduction d’aggro des dégâts, en conservant le multiplicateur du rôle
et l’exclusion des dégâts des attaques équilibrées. La carte montre uniquement
la contribution de l’Umbra ; le helper de valeur donne le total de l’entité.
La statistique, ses variantes et sa courbe sont disponibles dans le Codex,
l’administration et le laboratoire Index 14.

### Umbras : contributions et totaux dans les helpers — 0.92.5.1-dev — 26 novembre 2026

Les 27 cartes affichent uniquement les contributions de leur Umbra. L’encart
« Total fourni par l’Umbra » additionne son bonus direct et son renforcement.
Chaque helper de valeur présente le total de l’entité, y compris les helpers
des bonus directs, des renforcements et des paramètres de passives, même lorsque
les deux valeurs sont identiques. Les bonus autonomes et les bases communes
restent dans ce total ; les règles de combat et les sauvegardes ne changent pas.

### Ambidextrie : deux passives et ratios progressifs — 0.92.5-dev — 26 novembre 2026

La chance et les dégâts du deuxième coup utilisent les courbes propres
d’Ambidextrie et d’Agilité, selon la limite de l’entité. La chance approche 99 % ;
les dégâts conservent 20 % de base et progressent sans plafond. Les coefficients
fixes donnent 20 % de chance à 1/35, 12,4 % à 10/0 et 115 % de dégâts à 150/150.
Le moteur, les projections et les helpers partagent les mêmes calculs, sans les
anciens arrondis entiers des contributions. Les deux passives exclusives ont
chacune leur pictogramme encadré, leur description et leurs calculs admin.
La carte s’élargit et se repositionne pour rester visible sans défilement.

### Indestructibilité : bonus de régénération de l’Umbra — 0.92.4.3-dev — 26 novembre 2026

La carte et son calcul affichent uniquement la régénération accordée par
Indestructibilité. Les bonus fixes de la créature et les autres sources restent
comptés dans le total de l’entité, présenté dans le helper du chiffre avec les HP
rendus. Les calculs et les soins du combat restent inchangés.

### Peau indestructible : passive exclusive — 0.92.4.2-dev — 26 novembre 2026

Peau indestructible rejoint l’encadré des passives exclusives d’Indestructibilité,
avec son pictogramme encadré et son sous-helper de passive. Son calcul conserve
les contributions d’Indestructibilité et de Force ainsi que le plafond de 99 %.

### Fureur sanguinaire : carte plus compacte — 0.92.4.1-dev — 26 novembre 2026

La largeur de référence de la carte de Fureur sanguinaire passe de 960 à 640 pixels.
Les séparateurs internes d’Exécution sont retirés. Le séparateur avec son carré
central distingue Exécution, Démence sanguinaire et Voracité sanguinaire.

### Indestructibilité : courbes et cooldown — 0.92.4-dev — 26 novembre 2026

Indestructibilité totale utilise uniquement son propre ratio progressif et tend vers
99 %. Une annulation réussie déclenche un cooldown de cinq secondes, réduit par
la Force vers deux secondes. Son pictogramme, sa durée et son calcul sont affichés
dans la carte ; la pause, le sommeil et la sauvegarde/reprise conservent le délai.
Peau indestructible et la régénération suivent les courbes d’Indestructibilité et de
Force, avec un repère de 15 % à 150/150 et un plafond de 99 %. La régénération
réunit les sources normal, + et X sans double comptage et précise les HP rendus.
L’armure reste prioritaire ; la régénération débute au deuxième tour. Les calculs
restent centrés sous leur ligne, leurs choix mémorisés individuellement et les
dégradés réservés aux noms des statistiques X.

### Exécution : lecture hiérarchisée — 0.92.3.3-dev — 26 novembre 2026

La description d’Exécution explique son déclenchement sous le titre. La chance
est centrée sur sa propre ligne, puis le seuil de HP et les dégâts supplémentaires
occupent deux colonnes. Démence et Voracité ont chacune une ligne complète.

### Exécution : trois paramètres côte à côte — 0.92.3.2-dev — 26 novembre 2026

Exécution occupe toute la largeur avec ses trois paramètres sur une même ligne,
séparés verticalement : chance, seuil de HP et dégâts supplémentaires.
Démence et Voracité sont disposées côte à côte en dessous.

### Fureur sanguinaire : séparateur et pictogrammes — 0.92.3.1-dev — 26 novembre 2026

Un séparateur vertical rouge distingue les deux colonnes des passives exclusives.
Les pictogrammes de Démence et de Voracité sont recentrés dans leurs losanges.

### Fureur sanguinaire : ratios et Exécution exclusive — 0.92.3-dev — 26 novembre 2026

Soif de sang suit les états normal, + et X : pourcentage fixe, renforcement fixe
par la Force, puis ratios progressifs de Fureur et de Force avec l’Umbra.
L’ancien double apport est retiré ; le total reste limité à 99 %.
Exécution est exclusive à Fureur : sa chance, son seuil de HP et ses dégâts
supplémentaires utilisent les courbes communes et la limite de l’entité.
Les paramètres d’Exécution ne sont plus des bonus autonomes ni des choix de cristaux.
Démence et Voracité nécessitent l’Umbra active ; leurs conditions sont conservées.
La carte élargie regroupe Exécution et ses trois paramètres à côté de Démence
et Voracité. Les pictogrammes, descriptions joueur et calculs admin sont séparés ;
les triangles et le bouton i conservent leurs commandes individuelles et globales.
La carte et ses sous-helpers restent visibles sans défilement vertical.

### Hypercognition : courbes et limite de l’entité — 0.92.2-dev — 26 novembre 2026

Explosion cognitive additionne son bonus direct et les renforcements progressifs
d’Hypercognition et d’Intelligence, sans plafond de dégâts ni ancien ratio bloqué
à ×3. Le bonus conserve la nature de l’attaque et la restriction des attaques inertes.
Le Générateur utilise la courbe commune et un ratio fixe, puis arrondit à l’inférieur :
une essence dès un point, deux à 50, six à 100 et dix à 150 lorsque la limite le permet.
Le plafond total reste dix essences, apports autonomes et objets équipés compris.
Les calculs, helpers et stocks partagent la limite du propriétaire ; les prévisualisations
ne créent ni ne retirent d’essences possédées. La carte distingue le bonus direct,
Explosion cognitive X, le total fourni et le Générateur.

### Helper de résurrection compact : 0.92.1.1-dev — 26 novembre 2026

Le helper de Résurrection améliorée affiche chaque type de vie avec son pourcentage
de soin, puis le total par résurrection en pourcentage et en HP. Le paragraphe
de présentation est retiré. En mode admin, la formule conserve ses valeurs sans
répéter les explications textuelles de base et de plafond.
Si la hauteur disponible manque, le sous-helper s’élargit et les types de vie
se répartissent côte à côte pour rester visibles sans défilement vertical.

### Résurrection améliorée exclusive : 0.92.1-dev — 26 novembre 2026

Résurrection améliorée est une passive exclusive de Transcendance, affichée dans
son encadré avec Transcendance totale. L’Intelligence augmente le soin des vies
supplémentaires uniquement lorsque l’Umbra est active. Sans elle, le soin reste
à sa base de 20 % des HP maximum ; avec elle, il peut atteindre 99 %. Le moteur
et les helpers appliquent la même règle, y compris après ajout ou retrait de l’Umbra.

### Ligne de Retour astral : 0.92.0.7-dev — 26 novembre 2026

Retour astral reprend l’alignement des lignes de statistiques et son pictogramme
simple, sans le cadre des passives. La phrase de soin et ses helpers restent accessibles.

### Retour astral hors encadré : 0.92.0.6-dev — 26 novembre 2026

Retour astral apparaît désormais directement dans la carte d’Astralité, après
le cooldown astral et avant l’encadré de Corps astral. Son pictogramme, sa phrase
de soin, ses helpers et ses calculs admin sont conservés.

### Résurrection améliorée et calculs centrés : 0.92.0.5-dev — 26 novembre 2026

La carte de Transcendance affiche Résurrection améliorée comme capacité ordinaire.
Son helper donne les HP rendus pour chaque type de vie possédé par l’entité,
y compris les réserves rechargeables momentanément vides. Les règles de soin
existantes restent utilisées. Les calculs dépliés sont centrés sous leur ligne
de valeur, sans titre supplémentaire, et leurs choix d’ouverture restent mémorisés.
La Résistance aux critiques décrit le bonus de dégâts des coups critiques avec
le pictogramme correspondant. Les sous-helpers des attributs utilisent le titre
« Attribut ».

### Cooldown dans la passive : 0.92.0.4-dev — 26 novembre 2026

Le cooldown transcendantal figure désormais dans l’encadré de Transcendance totale,
sous son effet. Son pictogramme, ses helpers et ses calculs admin restent accessibles.

### Picto du cooldown transcendantal : 0.92.0.3-dev — 26 novembre 2026

Le cooldown transcendantal utilise son pictogramme dédié `picto-transcand-cd.svg`
dans la carte de Transcendance et ses helpers.

### Encarts de total des Umbras : 0.92.0.2-dev — 26 novembre 2026

Lorsqu’une Umbra apporte un bonus fixe et un renforcement à une même statistique,
la carte retrouve son petit encart ornementé « Total fourni par l’Umbra », avec
le pictogramme et leur somme. La ligne X indique le renforcement ; le montant
encadré ouvre le récapitulatif qui distingue ce total de celui de l’entité.
Les statistiques alimentées par un seul apport gardent leur affichage compact.

### Totaux des sous-helpers d’Umbra : 0.92.0.1-dev — 26 novembre 2026

Le total accordé par l’Umbra est mis en avant avec son pictogramme. Le bonus direct
et le renforcement sont regroupés juste dessous, en plus petit. Le total de l’entité
dispose de sa propre ligne séparée ; la réduction des dégâts, la chance d’esquive
ou la réduction de l’esquive adverse occupent un encadré distinct. Les calculs
techniques restent accessibles en mode admin sous ce récapitulatif.

### Transcendance, cooldown et choix de calcul : 0.92.0-dev — 26 novembre 2026

Transcendance accorde des vies supplémentaires suivant une courbe sans plafond à sept
vies. Sa passive unique, Transcendance totale, approche 99 % de protection des vies
avec le ratio progressif d’Intelligence (10,24 % à 150/150). Une réussite déclenche
un cooldown transcendantal de cinq secondes, réduit vers deux secondes par
l’Intelligence lorsque l’Umbra est active. Les protections autonomes partagent
ce cooldown et conservent sa durée de base. Pendant ce délai, les résurrections
consomment normalement leurs vies. Pause, sommeil et rechargement conservent le délai.

Les choix d’ouverture et de fermeture des calculs sont mémorisés séparément par
statistique et par ligne, y compris après rechargement. Seuls les noms des
statistiques X gardent un dégradé ; les passives uniques restent en couleur unie.

### Description selon le bonus : 0.91.0.3-dev — 26 novembre 2026

Les sous-helpers descriptifs reprennent l’état de la statistique qui les ouvre :
formulation habituelle en normal, « fortement » pour + et « énormément » pour X.
Les pictogrammes, couleurs et explications complémentaires sont conservés.

### Lore complet des Umbras : 0.91.0.2-dev — 26 novembre 2026

Les dix textes RP manquants ont été ajoutés pour Brutalité, Indestructibilité,
Inflexion, Transcendance, Équilibre, Mysticisme, Ambidextrie, Ésotérisme, Occultisme
et Vivacité. Les 27 Umbras disposent désormais d’un texte de lore en fin de carte.

### Pictos et présentation des Umbras : 0.91.0.1-dev — 26 novembre 2026

Le helper de présentation affiche les pictogrammes et les couleurs des bonus fixes,
capacités et passives exclusives. Les dégradés reprennent ceux de la carte ; les noms
et pictos ouvrent leur description. La phrase d’introduction utilise une police
légèrement plus petite et un espacement réduit.

### Limites, courbes et plafonds : 0.91.0-dev — 26 novembre 2026

La limite de l’entité (`seuilUmbra`) s’applique individuellement aux 27 Umbras et
aux trois attributs. Les courbes existantes poursuivent leurs cycles jusqu’à cette
limite ; seul leur dépassement utilise la progression résiduelle. Les points bruts
sont conservés : un changement de limite recalcule les gains, les aperçus et les effets.
Les gains naturels conservent 10 % de leur dépassement, les bonus externes 50 % et
les cristaux 100 %. Les malus s’appliquent intégralement jusqu’à zéro ; seule la
portion négative reçoit ce rendement de source.

Les helpers distinguent Bonus, Bonus supérieur et Bonus exceptionnel, ainsi que
leurs malus lorsque la valeur descend sous zéro. Les plafonds d’effets auparavant
fixés à 100 % passent à 99 %. MAX apparaît au plafond ou lorsque l’arrondi affiché
le rejoint, sans modifier la valeur réelle de la courbe. Les contributions plafonnées
restent distinguées des totaux sans plafond, notamment les HP et les vies supplémentaires.

### Contenu du helper de présentation : 0.90.5.8-dev — 26 novembre 2026

Le helper de description d’une Umbra liste ses bonus fixes, les statistiques et
capacités utilisables, puis ses passives exclusives. Les noms et les marqueurs X
proviennent des données de sa carte, sans montant ni détail technique.

### Génération et lore des Umbras : 0.90.5.7-dev — 26 novembre 2026

Le sous-helper du niveau explique comment l’Umbra est générée : investissement
d’un point d’attribut dans une milestone du type et du niveau correspondants.
L’attribut, le type de milestone et son niveau proviennent des données de l’Umbra.
Les textes RP existants retrouvent leur place en fin de carte, en italique,
sous un séparateur et après les statistiques et les passives exclusives.

### Couleurs et lisibilité des sous-helpers : 0.90.5.6-dev — 26 novembre 2026

Les séparateurs du haut, du bas et des sections techniques des sous-helpers
reprennent la couleur de leur attribut. Un ratio d’Intelligence utilise le bleu,
même lorsqu’il est ouvert depuis une Umbra de Force ou d’Agilité. Les explications
sans attribut propre conservent celui de leur contexte, y compris aux niveaux
de sous-helpers suivants.

Les sous-helpers restent à côté de leur statistique d’origine lorsqu’ils tiennent
entièrement à cette hauteur. Sinon, ils remontent pour afficher tout leur contenu,
sans hauteur tronquée ni défilement interne. Les explications longues peuvent
s’élargir avant leur placement pour profiter de l’espace disponible.

### Bonus signés et lignes complètes : 0.90.5.5-dev — 26 novembre 2026

Les cartes d’Umbra s’élargissent à la largeur nécessaire pour garder le nom,
la valeur, le triangle et le calcul sur une même ligne, sans réduire la taille
du texte. Elles retrouvent leur largeur compacte quand les calculs sont refermés.
Les bonus additifs affichent « + » dans la carte et leur sous-helper, notamment
les HP, la Hâte, les vies et les emplacements supplémentaires. Les totaux déjà
calculés, les durées et les seuils conservent leur valeur sans signe d’ajout.
« Confère » reste sans triangle ; ⓘ et les commandes individuelles sont conservés.

### Alignement des lignes de statistiques : 0.90.5.4-dev — 26 novembre 2026

La ligne « Confère » ne contient plus de triangle ni de formule. Les contrôles
restent sur les valeurs principales des statistiques, sans répétition sur les
HP et délais des phrases explicatives. Les lignes retrouvent leur nom à gauche
et leur total à droite, suivi du triangle. Ouvrir le calcul décale le total vers
la gauche pour lui faire de la place ; les formules longues peuvent passer à la
ligne. Les commandes individuelles, le bouton global ⓘ et les sous-helpers
conservent leur fonctionnement.

### Calculs au cas par cas : 0.90.5.3-dev — 26 novembre 2026

En mode admin, un petit ▶ à droite d’une valeur ouvre son calcul à côté,
sans ligne « Détail du calcul ». Les formules longues peuvent passer à la ligne.
Chaque triangle agit sur sa propre occurrence ; ⓘ ouvre tous les calculs si
certains sont fermés, ou les ferme tous s’ils sont déjà ouverts. Son réglage
global reste mémorisé. Les choix individuels sont conservés pendant l’actualisation
de la carte ouverte et sont remplacés par la prochaine commande globale.
Le survol du chiffre conserve son sous-helper de calcul ; nom et picto donnent
toujours la description.

### Sous-helpers des cartes d’Umbra : 0.90.5.2-dev — 26 novembre 2026

Le nom et le pictogramme décrivent la statistique ; sa valeur ouvre le détail
du calcul. Les formules et ratios techniques restent réservés au mode admin,
y compris dans ces sous-helpers. Le bouton ⓘ conserve son action globale sur
les lignes de calcul affichées directement dans les cartes.

Les sous-helpers ne présentent plus de croix de fermeture. Ils apparaissent au
niveau vertical de la statistique qui les appelle, dans les limites de l’écran,
y compris depuis un autre sous-helper. Le clic sur la même valeur et la touche
Échap permettent toujours de les refermer.

### Lisibilité des cartes d’Umbra : 0.90.5.1-dev — 26 novembre 2026

Les liens explicatifs restent sur la même ligne de base que les mots voisins.
La ligne « Confère » inclut les bonus directs calculés par le moteur, notamment
la Puissance physique de Vigueur. Les noms et valeurs renforcés retrouvent leurs
dégradés, des attributs réellement utilisés dans le calcul vers la couleur de
l’Umbra, y compris pour les passives exclusives. Les pictogrammes gardent leurs
couleurs. Le réglage global des calculs et la séparation joueur/admin sont conservés.

Les retouches visuelles utilisent désormais une quatrième composante de version.
Le numéro affiché figure aussi dans `package.json.gameVersion` ; les métadonnées
npm gardent une forme SemVer compatible (`0.90.5-dev.1` pour cette retouche).

### Affichage global des calculs : 0.90.5-dev — 25 novembre 2026

Le bouton ⓘ synchronise les calculs de toutes les cartes d’Umbra ouvertes et
celles ouvertes ensuite. Le choix est conservé au rechargement. Les lignes
« Détail du calcul » retrouvent leur présentation centrée, leur triangle et
leur typographie d’origine, avec les formules juste dessous. Cette commande
reste réservée au mode admin et agit directement dans les cartes.

### Calculs dans la carte d’Umbra : 0.90.4-dev — 25 novembre 2026

En mode admin, le bouton ⓘ déplie ou replie les lignes « Détail du calcul »
et leurs formules directement dans la carte ouverte. Il ne crée aucun second
helper et conserve les valeurs, les textes et les encadrés des passives.
Les sous-helpers des statistiques et des ratios restent disponibles. Les calculs
et leur commande sont absents du mode joueur.

### Cartes d’Umbra et détails : 0.90.3-dev — 25 novembre 2026

La carte conserve sa présentation courte et ses sous-helpers. Les passives
exclusives retrouvent leurs lignes centrées, leurs cadres ornés et leurs pictos
en losange. Le bouton ⓘ reprend les panneaux et résultats encadrés de l’ancienne
mise en page ; en mode admin, les lignes « Détail du calcul » et leurs calculs
sont visibles dès l’ouverture. Les formules restent absentes du mode joueur.

### Sous-helpers des cartes d’Umbra : 0.90.2-dev — 25 novembre 2026

Les introductions, points accordés, catégories, attributs, niveaux, états X et
passives exclusives disposent d’explications ciblées. Les valeurs de contexte
d’Astralité distinguent les HP après survie, l’intervalle d’activation et la durée
du Corps astral. Les phrases d’effet et leurs termes clés ouvrent leurs détails,
avec les calculs toujours réservés au mode admin.

### Cadres des passives exclusives : 0.90.1-dev — 25 novembre 2026

Les pictogrammes des passives exclusives retrouvent leur cadre carré incliné
dans les cartes d’Umbra. La présentation simplifiée et les helpers joueur/admin
sont conservés.

### Helpers des Umbras : 0.90.0-dev — 25 novembre 2026

Les cartes présentent le rôle de l’Umbra et ses effets sans lignes de calcul.
Le nom explique l’effet ; la valeur ouvre son explication chiffrée. Le bouton
ⓘ regroupe les détails, avec les ratios et calculs uniquement en mode admin.
Astralité présente Retour astral et Corps astral comme passives exclusives.
Les règles et les valeurs du combat restent inchangées.

### Pictogrammes distincts d’Astralité : 0.89.8-dev — 25 novembre 2026

L’Umbra Astralité utilise `picto-astrality.svg`, Survie fatale
`picto-actrality-survival.svg` et Corps astral `picto-astra-body.svg`.
Cooldown astral et Retour astral gardent respectivement les pictogrammes
`picto-astrality-cd.svg` et `picto-astrality-reborn.svg`.

### Pictogrammes d’Astralité : 0.89.7-dev — 25 novembre 2026

Cooldown astral utilise `picto-astrality-cd.svg` et Retour astral utilise
`picto-astrality-reborn.svg`. Survie fatale conserve `picto-astrality.svg`.

### Passives d’Astralité : 0.89.6-dev — 24 novembre 2026

Retour astral rejoint Corps astral dans le cadre « Passives exclusives » de la
card d’Astralité. Leurs valeurs, détails de calcul et sous-helpers sont conservés.

### Card d’Astralité simplifiée : 0.89.5-dev — 24 novembre 2026

La card d’Astralité présente les capacités, leurs valeurs et les ratios courts,
comme Adresse. Les paragraphes explicatifs et les formules de conversion longues
sont retirés de la card ; les sous-helpers conservent les explications des effets.
Les calculs et les règles de combat restent inchangés.

### Réutilisation des popups : 0.89.3-dev — 24 novembre 2026

Les nombres de dégâts réutilisent jusqu’à huit cartes HTML par entité.
Les cartes expirées sont retirées du DOM et gardées dans une réserve bornée,
sans animation ; un nouvel impact réutilise leurs éléments avec son montant,
sa nature et sa priorité.
Les huit messages visibles, leur empilement, leurs trajectoires et leurs durées
restent identiques. La réserve est libérée à la fin du combat, et le DOM
existant reste compatible avec la pause et le rechargement de la scène.

### Projectiles magiques rectilignes : 0.89.2-dev — 24 novembre 2026

La queue des projectiles magiques garde une forme fixe, précalculée et partagée
par couleur. Les projectiles magiques suivent désormais leur cible sans aucune
ondulation ajoutée au trajet. Leur queue fixe reste orientée dans le sens du tir.
Les projectiles physiques à distance reprennent le ruban et les trois filaments
de vitesse de la mêlée, avec les couleurs de leur nature. Leurs halos flous
sont retirés, y compris pour les restes physiques d'un projectile mixte.
Les traînées ne redessinent plus de canvas pendant le vol. Les courbes physiques,
le responsive, les règles de ciblage et les délais d'impact sont conservés.

### Courbes et responsive : 0.89.0-dev — 24 novembre 2026

Les projectiles et le plateau partagent le même repère responsive. Les tirs
physiques suivent une courbe visuelle vers leur case visée. Cette version avait
introduit une queue magique déformable, remplacée par une forme fixe en 0.89.1.

### Ondulation du trajet : 0.88.1-dev — 24 novembre 2026

Les projectiles magiques ondulent légèrement autour de leur trajectoire.
L'amplitude diminue à l'arrivée ; le suivi de cible, la vitesse logique et les
impacts restent inchangés. L'effet utilise la transformation déjà écrite par
le déplacement, sans nouvelle boucle ni lecture de géométrie. La pause et la
restauration conservent la phase de l'ondulation.

### Projectiles et déplacement tactile : 0.88.0-dev — 24 novembre 2026

Les projectiles magiques standards utilisent une texture transparente partagée,
avec un noyau lumineux et une traînée orientée vers leur cible. La texture est
calculée une fois par couleur ; les projectiles illustrés spécifiques conservent
leur asset. Les traînées de mêlée prennent la couleur de la nature de l'attaque,
y compris pour Ambidextrie. Les trajectoires, impacts et timings sont conservés.

Sur mobile, maintenir une entité pendant 300 ms permet de la glisser vers une
case puis de la déposer en relâchant. Le déplacement utilise les règles du
plateau existantes, y compris les coûts, échanges, restrictions de camp et pause
tactique. Un appui court conserve la sélection. Le geste fonctionne aussi avec
le paysage automatique et s'annule en cas d'interruption ou de changement de vue.

### Invalidations DOM : 0.87.16-dev — 24 novembre 2026

Les classes de présentation en attente sont publiées en une seule écriture,
sans retirer puis réajouter les modificateurs inchangés. Les compteurs de
déplacement conservent leurs nœuds lors des rafraîchissements ordinaires ;
les gains de déplacement gardent leur animation neuve. Le décompte de
cooldown actualise son texte existant. La sortie d'invisibilité n'écrit plus
les classes et attributs déjà absents. Les valeurs, cadences, animations et
règles de combat restent inchangées.

### Filtres de préparation : 0.87.15-dev — 24 novembre 2026

La phase finale de préparation réutilise le filtre défini par le CSS pour y
ajouter sa luminosité, sans lire le style calculé de chaque effet. Cela évite
des recalculs synchrones après les écritures du HUD. Les couleurs, ombres,
transitions, durées, GIF et règles de combat sont conservés. Les effets externes
ou munis d'un filtre personnalisé en ligne gardent leur lecture de style.
Un contrôle dédié compare les filtres et les poses à 10, 40 et 80 entités,
ainsi que la restauration d'une préparation et le nettoyage des effets.

### Pictogrammes invisibles : 0.87.14-dev — 24 novembre 2026

Les pictogrammes des cases entièrement transparents sont désormais masqués à la
composition. Leur pulsation continue sur la même horloge ; le survol conserve
sa phase et le fondu de sortie se termine avant le masquage. La transition de
visibilité suit les interactions autorisées pendant la pause tactique, tandis
que la pulsation reste figée comme auparavant. Aucun changement des règles de
combat, des GIF, des trajectoires ou du visuel affiché. Les contrôles couvrent
les quatre rôles, l'apparition, la disparition, une inversion du fondu et la
reconstruction du plateau.

### Suivi des positions : 0.87.13-dev — 23 novembre 2026

Le suivi des positions observe les cibles du plateau et leurs dépendances de
placement, sans observer tout le contenu du HUD et des effets. Les déplacements
annoncent une invalidation visuelle ciblée, distincte des effets de gameplay ;
leurs projectiles partagent la nouvelle lecture. Les nouveaux lancements
réutilisent aussi les positions immobiles déjà suivies. Les animations de déplacement
restent suivies jusqu’à leur position finale, puis les lectures s’arrêtent.
Les impacts seuls ne vident plus toutes les positions. Le responsive, les
changements de taille, le remplacement des cibles et les cibles hors plateau
conservent leur prise en compte. Aucun changement des trajectoires, échéances,
statistiques, GIF ou CSS. Un test dédié contrôle le partage des positions, les
mouvements intermédiaires et le nettoyage du suivi à 10, 40 et 80 entités.

### Découplage du HUD : 0.87.12-dev — 23 novembre 2026

Les positions des cibles de projectiles sur le plateau restent en cache entre
les images lorsque seules les informations du HUD changent. Les textes, jauges,
badges et contenus des effets isolés ne réinitialisent plus ces positions.
Les mises à jour d’une case ne vident plus le cache des autres cases. Les cibles
ou ancêtres animés restent mesurés pendant leur mouvement ; les déplacements
réels, changements
de structure ou de style, redimensionnements et défilements invalident le cache.
Les cibles extérieures au plateau gardent leur lecture par image. Les lectures
hors RAF, notamment au lancement et à l'impact, restent fraîches sans effacer
les positions des autres cibles. Le cache sert aussi aux vols isolés et réutilise
leur lecture de lancement. Les trajectoires, échéances, dégâts, GIF, CSS et règles
de combat sont conservés. Un test dédié
compare les coordonnées et les invalidations à 10, 40 et 80 cibles.

### Lectures groupées : 0.87.11-dev — 23 novembre 2026

Les projectiles simultanés lisent ensemble les positions de leurs cibles déjà
connues avant leurs déplacements visuels dans une même image. Cela évite
l'alternance répétée entre une lecture de géométrie et une écriture de style.
Les vrais changements du DOM, les déplacements, le redimensionnement et chaque
nouvelle image conservent l'invalidation des positions. Les nouvelles cibles
restent lues à la demande. Les lectures de lancement et d'impact restent fraîches.
L'ordre des callbacks, les échéances, les dégâts, les GIF et le visuel sont
conservés. Le test ciblé compare les positions avant/après à 10, 40 et 80 cibles.

### JSON des PV et bilans : 0.87.10-dev — 23 novembre 2026

Les sauvegardes de PV et de bilans de combat utilisent désormais les fragments
JSON du cache privé déjà initialisé. Une modification des PV reconvertit le bloc
`stats` ; un bilan reconvertit uniquement ses compteurs et `combatDetails`, sans
reconvertir les autres données de l'entité. Chaque dégât et soin reste traité,
avec les mêmes écritures immédiates, le même format et la même normalisation.
L'initialisation, les modifications externes et les erreurs conservent leur
traitement existant. Aucun changement du gameplay, des timings, des GIF ou du
visuel. Les contrôles couvrent les sauvegardes alternées à 10, 40 et 80 entités.

### JSON de progression : 0.87.9-dev — 23 novembre 2026

Après initialisation, les sauvegardes de progression d'attaque convertissent
uniquement leurs cinq blocs de données en JSON. Les fragments déjà normalisés
des autres champs de l'entité sont réutilisés dans le cache privé du combat.
Les sauvegardes restent immédiates et conservent exactement leur format et leur
normalisation. Les autres écritures gardent le traitement complet et invalident
les fragments concernés ; une modification externe ou une erreur invalide le
cache existant. Aucun changement des gains, déblocages, timings ou visuels.

### Copies de progression : 0.87.8-dev — 23 novembre 2026

La sauvegarde de progression d'attaque remet la copie déjà préparée au premier
destinataire au lieu de la recopier. Les autres destinataires gardent des copies
indépendantes. Les cinq blocs de progression, les écritures immédiates et le
format sauvegardé sont conservés, y compris les essences, les déblocages et la
sélection d'attaques. Un gain de maîtrise rafraîchit immédiatement les valeurs de
puissance de l'entité concernée et les rapports d'armée, sans rafraîchir les
autres propriétaires ni programmer un second passage global à l'image suivante.
Les rafraîchissements périodiques et ceux des autres événements sont conservés.
Les trajectoires, timings, gains, effets, GIF et règles de combat restent inchangés.

### Positions des projectiles : 0.87.7-dev — 23 novembre 2026

Les déplacements des projectiles dans le conteneur responsive
`#game-shell > #game-screen-effects` préservent les rectangles des cibles déjà
lus dans la même image. Le cache reconnaissait uniquement les projectiles placés
directement dans le corps de la page, ce qui annulait le partage après chaque
déplacement depuis le changement de cadrage. Les vrais déplacements des cibles,
les mutations externes, le redimensionnement et les nouvelles images continuent
de rafraîchir les positions. Les trajectoires, impacts, timings, GIF et règles
de combat restent identiques. Le test de partage couvre maintenant le véritable
conteneur responsive et 40 déplacements successifs entre deux lectures.

### Cache des auras : 0.87.6-dev — 23 novembre 2026

Les auras dynamiques conservent leur état avec la vue affichée. Une nouvelle
copie d’une entité avec les mêmes effets ne recrée plus la feuille de style,
ne force plus de lecture de géométrie et ne redémarre plus la pulsation.
Les vrais changements d’aura gardent le même CSS et le redémarrage immédiat.
Le combat et le codex restent indépendants ; la reconstruction de la vue,
le nettoyage et la mort d’une entité sont pris en compte. Les règles de combat,
les filtres, les durées et les GIF sont conservés.

### Continuité des halos : 0.87.5-dev — 23 novembre 2026

Les halos de vie conservent leurs nœuds et leur phase d’animation lors d’un
rafraîchissement de statistiques inchangées. Leur ordre et leurs propriétés CSS
ne sont réécrits que si nécessaire. Sur les cadres de combat calibrés, le
flottement et la pulsation sont composés sur le même élément animé ; les
navigateurs sans composition additive conservent le rendu imbriqué précédent.
Les images, filtres, opacités, trajectoires et durées restent identiques, ainsi
que les règles de combat. Le test navigateur dédié vérifie les trois halos,
13 phases, plusieurs échelles, les rafraîchissements et la consommation des vies.

### Cadrage responsive : 0.87.4-dev — 23 novembre 2026

Le cadrage responsive passe uniquement par `#game-shell` : plateau, paramètres,
journal, aides, commandes de combat, interface admin et version partagent le même
repère. Les dimensions internes ne sont plus recalculées depuis l'écran réel.
Le cadre paysage tourne automatiquement sur un téléphone tenu en portrait,
sans écran bloquant ni bouton de demande d'orientation. Le verrouillage natif est
essayé lors d'une interaction normale quand le navigateur le permet ; la rotation
CSS fonctionne aussi lorsqu'il le refuse. Tourner le téléphone ne met plus le
combat en pause. La pause manuelle et celle de mise en arrière-plan sont conservées.
Les calculs et règles de combat restent inchangés.

### Reflet d'armure : 0.87.3-dev — 23 novembre 2026

Le reflet d'armure se déplace désormais par transformation, sans animer sa position
de mise en page. Son trajet, sa rotation, ses masques, sa durée et son décalage
individuel sont conservés. Le contrôle navigateur compare les positions à plusieurs
tailles et vérifie la suppression du reflet quand l'armure est épuisée.
Les GIF, les halos de vie, la teinte des sprites et les règles de combat sont conservés.

### Rendu DOM des combats : 0.87.2-dev — 23 novembre 2026

Le rendu des combats réutilise les nœuds de texte des compteurs et limite la
propagation des recalculs de mise en page autour des HUD et barres d'attaque.
Les transformations décoratives du moteur ne périment plus les rectangles
partagés des cibles lorsque leur géométrie reste inchangée. Les déplacements
des cibles, les changements externes, le défilement et le redimensionnement
continuent d'invalider ces lectures. Les timings, trajectoires, impacts, GIF
et règles de combat sont conservés.

### Stockage des combats : 0.87.1-dev — 23 novembre 2026

Les sauvegardes de PV, de totaux de combat et de progression réutilisent une
représentation privée des armées et le JSON des entités inchangées. Après la
préparation initiale, seules les entités modifiées sont resérialisées. Les
écritures restent immédiates, avec le même format et le même filtrage des bonus
temporaires. Toute modification externe du stockage invalide la représentation.
Les sessions admin restent isolées et chaque événement de combat est conservé.
Le contrôle de sauvegarde compare 37 scénarios à la version précédente, notamment
les erreurs de quota, les données atypiques et les changements de session.

### Cadrage et contrôles mobiles

Les dimensions logiques se règlent uniquement avec `--game-width` et
`--game-height` dans `docs/css/base.css`. `layoutGameShell` dans
`docs/js/ui/viewport.js` est le seul calcul d'échelle et de rotation.
`#game-windows` contient la scène et ses animations de caméra ; `#game-shell`
contient cette scène et les interfaces. Les aides convertissent les coordonnées
écran dans ce repère commun avant leur placement. Les rotations, les barres du
navigateur et les zones réservées aux encoches sont prises en compte.
Le zoom tactile reste disponible.

`scripts/verify-responsive-browser.mjs` contrôle huit formats, les interactions,
les rotations, les zones sûres et le viewport. Le scénario
`scripts/verify-responsive-combat-browser.mjs` vérifie les plateaux à 10, 40 et
80 entités, les coordonnées et la conservation de l'état pendant la rotation.
Les captures sont dans `outputs/responsive/` et `outputs/responsive-combat/`.

### Optimisations précédentes : 0.86.6-dev — 23 novembre 2026

Une recharge de déplacement qui laisse la réserve inchangée ne relit et ne
sérialise plus l'armée à chaque début de tour. Le premier tour conserve sa
synchronisation initiale ; les recharges réelles et les consommations restent
sauvegardées immédiatement. Les soins de début de tour continuent de s'appliquer
et de se sauvegarder même lorsque la réserve de déplacement est pleine.
Les formats de sauvegarde, le visuel, les GIF et les règles de combat sont conservés.

### Optimisations précédentes : 0.86.5-dev — 22 novembre 2026

Le partage de géométrie n'observe le DOM que pendant les vols simultanés et
libère le suivi dès l'impact ou l'annulation. Les écritures de déplacement
effectuées par le moteur sont isolées des autres mutations : elles ne nécessitent
plus de conserver et de comparer les anciennes chaînes de styles du document.
Les modifications externes continuent d'invalider les rectangles, et le nettoyage
d'un ancien vol ne peut pas désactiver le suivi d'un nouveau. L'ordre des
animations, les trajectoires, les impacts et le suivi des panneaux sont conservés.

### Optimisations précédentes : 0.86.4-dev

Les projectiles partagent les rectangles de leurs cibles pendant une même image
du navigateur. Une modification du DOM, un déplacement, un défilement ou un
redimensionnement invalide ces lectures ; l'ordre des callbacks, les timings et
les impacts restent inchangés. Les six familles de panneaux optionnels sont
suivies lors de leurs insertions, modifications et retraits, ce qui évite les
recherches répétées dans tout le document lorsqu'elles sont absentes. Les GIF,
le visuel et les règles de combat sont conservés.

### Optimisations précédentes : 0.86.3-dev

Les définitions de `makeRules` sont construites à la première demande puis partagées
pendant un même contexte `withStatReadSnapshot`. Chaque calcul conserve ses propres
résultats. Les définitions sont libérées à la fin du traitement synchrone, même en
cas d'exception ; les modifications de configuration sont prises en compte au
calcul suivant. Les formules, le visuel et le gameplay sont conservés.

### Optimisations précédentes : 0.86.2-dev

Première mutualisation des lectures de statistiques des timings : les attaques
d'une même décision partagent un contexte de lecture temporaire, et chaque délai
calculé est réutilisé pour le classement et le choix. Les timings affichés partagent
aussi leurs lectures pendant leur calcul. Le contexte expire à la fin du traitement
synchrone ; buffs, équipement et configuration sont relus au traitement suivant.
L'instant de décision, les formules, le visuel et les règles de combat sont conservés.
Les calculs isolés de vélocité et la définition de `makeRules` restent inchangés.

### Correctifs précédents : 0.86.1-dev

Version corrective : restauration des animations GIF, conservation des spritesheets
pour un usage ultérieur et suppression de la préparation des rafraîchissements de
puissance admin lorsqu'aucun affichage de puissance n'est présent. Le visuel et les
règles de combat sont conservés.

La version apparaît en bas à gauche, dans le cadre responsive `#game-shell`.
Sa source est la constante `GAME_VERSION` en tête de `docs/js/debug/admin.js` ;
ce même module renseigne directement `#game-version` ou le crée s'il est absent.
L'ancien texte éventuel du HTML est remplacé. Ne plus modifier ni republier
`docs/index.html` pour changer le numéro. Synchroniser la constante,
`package.json`, les deux versions racines de `package-lock.json` et la note de version
actuelle du README ; `npm run verify` contrôle cet accord. Chaque mise à jour du jeu
incrémente le troisième nombre pour une correction/optimisation, le deuxième pour
une fonctionnalité. Le suffixe `-dev` identifie la version de développement.

## Structure

- `docs/index.html` : entrée du jeu.
- `docs/js/app/` : démarrage, niveaux, carte et état de la partie.
- `docs/js/entities/`, `combat/`, `board/` : entités, combat et plateau.
- `docs/js/rendering/`, `ui/` : rendu et interface.
- `docs/js/storage/`, `items/`, `data/`, `events/`, `biome/`, `procedural/` : stockage, objets, données et règles associées.
- `docs/js/debug/` : administration, simulation et diagnostics.
- `docs/css/`, `docs/media/` : styles et médias.
- `scripts/` : vérification, tests et serveur local.
- `outputs/` : rapports et captures générés, ignorés par Git.

Les consignes techniques de développement et leur checklist sont dans
[AGENTS.md](AGENTS.md) : organisation des modules, rendu différentiel, statistiques,
stockage, animations, responsive et validation des performances.
Les règles de travail et de publication restent dans [docs/AGENTS.md](docs/AGENTS.md).
La branche de travail est `version-2` ; aucune publication vers `main`.

## État du combat et affichage des timers

Les phases de combat appellent `advanceCombatTimerState(entity)` dans
`docs/js/combat/timerState.js` avant `updateTimerDisplay(entity, timerView)`.
La première fonction applique les transitions existantes sans consulter le DOM ;
la seconde dessine les jauges sans modifier les timers ni les indicateurs du combat.
Conserver la vue retournée : lors d'un nouveau tour, la jauge représente encore
la fin du cycle tandis que le timer logique vient d'être réinitialisé.

Les animations des barres sont dans `docs/js/rendering/timers.js`. Le calcul des
scores est dans `docs/js/combat/score.js` ; `updateScoreDisplay` affiche uniquement
le résultat. Cette séparation conserve la fréquence des mises à jour, l'horloge
et les sauvegardes existantes.

Le scénario `scripts/verify-combat-render-boundary-browser.mjs` vérifie les
transitions sans DOM et les rafraîchissements sans mutation d'état. La variable
`COMBAT_RENDER_BASELINE` permet aussi de comparer le HTML et l'état des jauges
avec une copie antérieure complète de `docs/`.

Pendant un combat actif, `docs/js/rendering/displayBatch.js` regroupe les valeurs
remplaçables des jauges, styles, classes et compteurs jusqu'à la prochaine image.
Une propriété n'est écrite que si sa valeur finale diffère du DOM. Les transitions
logiques et les flashes d'impact continuent à s'exécuter à chaque événement.
La file utilise le rafraîchissement du navigateur, indépendamment de l'horloge
de combat. Elle reste synchrone en simulation, en pause et hors combat.

Avant une capture de pause, une prévisualisation qui lit le DOM ou l'arrêt des
animations d'une entité morte, les valeurs en attente sont appliquées. Un changement
de niveau vide la file ; les nœuds détachés sont ignorés. Les tests d'affichage actif
attendent une image rendue avant de lire les jauges. Le scénario
`scripts/verify-display-batching-browser.mjs` couvre le regroupement, les transitions,
les priorités CSS, les valeurs invalides et le nettoyage de la file.

Les diagnostics de console sont désactivés par défaut au démarrage, y compris
les groupes de messages. Les avertissements, erreurs et le journal du combat
restent disponibles. Pour diagnostiquer une partie, ouvrir `?debugLogs=1` ou
appeler `DarkPitLogs.enable()` dans la console ; `?debugLogs=0` ou
`DarkPitLogs.disable()` les désactive. Mesurer les performances avec ce mode désactivé.

Les impulsions ATB et les compteurs de déplacement ne forcent une lecture de
mise en page que pour redémarrer une animation déjà présente. Le scénario
`scripts/verify-combat-render-costs-browser.mjs` vérifie leurs images clés,
durées, HTML, délais de nettoyage et le contrôle des diagnostics.

## Organisation des styles

Les huit feuilles du jeu sont chargées dans cet ordre, commun à `index.html`,
`index-15.html`, `index-16.html` et `mobile-diagnostic.html` :

| Fichier dans `docs/css/` | Responsabilité |
| --- | --- |
| `base.css` | Police, page, dimensions et utilitaires communs |
| `interface.css` | Menus, dialogues, Codex, inventaire, boutique et administration |
| `stats.css` | Couleurs, pictogrammes, barres, attributs, Umbras et aides de statistiques |
| `combat.css` | Plateau, décors, placement des entités, HUD et objets au sol |
| `animation.css` | Animations communes, keyframes et mouvement réduit |
| `monstre.css` | Dimensions et réglages propres aux monstres |
| `effects.css` | Messages de combat, projectiles et effets visuels |
| `monstre-hitbox.css` | Contours de sélection propres aux monstres |

`vfx-calibrator.css` reste réservé au laboratoire d'effets. Ajouter les règles
dans leur thème existant plutôt que dans un nouveau fichier `style-*`.
L'ordre des feuilles fait partie de la cascade : ne pas le trier arbitrairement.
Les variantes d'une même statistique, dont ses couleurs normales et améliorées,
restent ensemble dans `stats.css`.

Le préchargeur de niveaux parcourt aussi les ressources de `effects.css` avant
que leurs effets soient visibles. Conserver ce lien lors d'un futur renommage.
La réorganisation conserve les règles et les chemins relatifs des médias ;
les trois anciens fichiers `style-2.css`, `style-3.css` et `style-test.css`,
qui n'étaient référencés par aucune page ni aucun module, ont été retirés.

Validation du regroupement : **3 618 règles CSS effectives conservées**, aucun
écart de styles calculés sur **63 scènes** (dont 30 capturées sur le Codex actuel),
et **27 scénarios navigateur ciblés validés après adaptation des montages de test**.
Les contrôles de syntaxe, d'assets et d'imports passent également. Le rapport
local est dans `outputs/css-organization/validation-report.json` ; la suite
navigateur complète n'a pas été relancée pour cette réorganisation.

## Installation et lancement

Prérequis : **Node.js 24**, avec npm. Depuis la racine du projet :

```sh
npm ci
npx playwright install chromium
npm start
```

Le serveur annonce son adresse locale, normalement `http://127.0.0.1:4173/`.
Si ce port est occupé, il choisit le suivant. Arrêt avec `Ctrl+C`.
Ne pas ouvrir `index.html` avec une URL `file://` : les modules utilisent HTTP.

## Contrôles

```sh
npm run verify       # Syntaxe, ressources, chemins et exports utilisés par les tests
npm test             # Régressions Node, sans navigateur
npm run test:smoke   # Démarrage, modules UI et lancement du combat
npm run test:browser # Scénarios navigateur hors mesures de performances
npm run test:all     # Régressions Node et navigateur, hors bancs de performances
```

L'entrée PowerShell existante reste utilisable après `npm ci` :

```powershell
.\scripts\verify.ps1
```

Les tests navigateur utilisent des profils isolés. Ils ne lisent pas les parties
sauvegardées dans votre navigateur habituel. Les résultats, journaux et captures
sont écrits dans `outputs/`. Le lanceur affiche le dossier de son `summary.json`
et renvoie un code non nul si un scénario échoue ou dépasse son délai.

Pour sélectionner un scénario :

```sh
node scripts/verify-suite.mjs --browser verify-combat-pause-browser.mjs
```

Chromium installé par Playwright est utilisé par défaut. Sur Windows, un Chrome
ou Edge déjà installé peut être sélectionné pour les mêmes scénarios :

```powershell
$env:VERIFY_BROWSER = "chrome" # ou "msedge"
npm run test:smoke
Remove-Item Env:VERIFY_BROWSER
```

`VERIFY_WORKERS` règle le nombre de scénarios simultanés (2 par défaut).
`VERIFY_OUTPUT` choisit le dossier du rapport et `VERIFY_TIMEOUT_MS` le délai
maximal par scénario. Les mesures de performances tournent seules.

`npm run test:performance` lance les bancs de mesure. Le banc de simulation
requiert `SIM_REPORT`, chemin d'un rapport HTML exporté par le simulateur ;
une comparaison historique utilise aussi `SIM_BASELINE=1` et `SIM_REFERENCE`.
Ces fichiers personnels ne sont pas nécessaires aux contrôles de publication.

Les contrôles locaux et les tests de démarrage ne garantissent pas à eux seuls
la stabilité de tous les combats, la fluidité ou la reprise après interruption.
Un échec de gameplay doit rester visible jusqu'à sa correction explicite.

### État de la suite au 21 novembre 2026

Campagne du correctif des neuf échecs, avant réorganisation des styles,
avec Node.js 24 et Chromium Playwright : contrôles de syntaxe,
d'assets et d'imports réussis, **17/17 scripts Node et 113/113 scénarios
navigateur validés après relances ciblées**. Les bancs de performances restent
séparés et n'ont pas été exécutés dans cette campagne.

Les neuf scénarios précédemment en échec sont corrigés et restent actifs :

- Les tests Bonus/Malus utilisent les effets par statistique du catalogue actuel.
- La collecte des cristaux distingue le placement d'administration et le déplacement de combat ; les bonus, sauvegardes et consommations uniques restent vérifiés.
- Les attentes de brûlure suivent ses cycles actuels, avec résistance et expiration.
- Les tests du plateau et du mobile attendent la fin des transitions et vérifient le rendu actuel.
- Le laboratoire Umbra distingue le modèle historique et les règles partagées du jeu. Son calcul historique accepte désormais les points fractionnaires sans produire `NaN`.

Une attente asynchrone du test de résurrection a également été corrigée : la
reprise utilise le bouton réel, disponible après l'écriture de la sauvegarde.
Lors de ce correctif des tests, le code du moteur de jeu, les règles de combat,
les styles et les assets n'ont pas été modifiés. Dans `docs/`, seul le calculateur
autonome `index-14.html` a reçu la correction numérique décrite ci-dessus.

La campagne complète a d'abord terminé à 128/130. Le test de résurrection a
ensuite réussi après la correction de synchronisation ; le test des descriptions
de durées a réussi sans modification après réallocation de son port local
(le port Windows 6669 avait été refusé par Chromium avant le chargement).
Le bilan local est conservé dans `outputs/fix-nine/validation-report.json`, avec
les rapports de la campagne initiale et des deux relances.

## Animations GIF et spritesheets conservées

Les combats et les aperçus `index-15.html` et `index-16.html` utilisent les GIF
d'origine, dont Ambidextrie à 100 %. La lecture Canvas des atlas a été retirée
de ces parcours après les saccades observées sous charge.

Les PNG et JSON de `docs/media/assets/spritesheets/`, le lecteur expérimental
et ses outils sont conservés pour de futurs essais. Le jeu et les aperçus
ne chargent plus ce lecteur ni son bundle. Les optimisations antérieures du HUD
et les règles de combat sont conservées.

Après ajout ou remplacement d'un atlas, régénérer les deux fichiers dérivés :

```sh
node scripts/audit-sprite-atlases.mjs --catalog
node scripts/build-sprite-preview.mjs
```

`npm run verify` vérifie les pages, dimensions, frames et fichiers générés.
Le contrôle isolé du lecteur expérimental se lance avec
`node scripts/verify-suite.mjs --browser verify-sprite-atlases-browser.mjs`.
Il vérifie aussi la pause/reprise, le partage des textures, la libération des
lecteurs et les durées de chaque frame. Les écarts de pixels avec les GIF sources
sont consignés dans `outputs/sprite-atlases-browser/frames.json`.
Les GIF restent également la référence de cette comparaison.

Le bundle d'atlas généré reste disponible pour des essais futurs ; sa présence
dans les fichiers ne signifie pas qu'il est actif dans le jeu.

## Publication GitHub Pages

[Le workflow](.github/workflows/pages-version-2.yml) vérifie les propositions
vers `version-2` et les pushes sur cette branche. Avant de publier, il exécute
`npm ci`, `npm run verify`, `npm test` et `npm run test:browser`.
La publication est bloquée si l'un de ces contrôles échoue.
Les journaux et les résumés des tests sont conservés dans l'artefact
`regression-reports` du workflow pendant 14 jours, y compris en cas d'échec.

Après validation d'un push sur `version-2`, seul le contenu de `docs/` est envoyé
à GitHub Pages. Les pull requests ne publient pas. Dans les réglages GitHub du
dépôt, la source de Pages doit être **GitHub Actions** et l'environnement
`github-pages` doit autoriser `version-2`.

Avant un commit, vérifier `git status` et `git diff`, puis ajouter uniquement les
fichiers concernés. Les sources et médias nécessaires doivent être suivis par
Git : un fichier seulement présent sur le disque ne sera pas publié.
L'URL de publication est affichée par l'étape Deploy du workflow ; vérifier sa
réussite avant d'annoncer une mise en ligne. Ce workflow ne configure pas OVH.
