"""Summarize the saved real-engine trials; never run or change a combat."""
import collections
import datetime
import hashlib
import html
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/astralite-balance'
FOLDERS = [OUT, ROOT / 'outputs/astralite-balance-plus']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def average(values):
    return statistics.mean(values)


def wilson(wins, n):
    z = 1.959963984540054
    p = wins / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    radius = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [100 * max(0, center - radius), 100 * min(1, center + radius)]


def subject(row):
    return next(e for e in row['entities'] if str(e['id']) == '998000')


def entity_mean(entities):
    keys = ['hpStart', 'hpEnd', 'armorStart', 'armorEnd', 'turns', 'actions', 'damage', 'heal']
    result = {k: average(e.get(k, 0) for e in entities) for k in keys}
    result['survivalRate'] = 100 * sum(not e['dead'] and e['hpEnd'] > 0 for e in entities) / len(entities)
    details = ['hpDamageDealt', 'armorDamageDealt', 'hpDamageReceived', 'armorDamageReceived', 'healingReceived']
    result.update({k: average(e['details'].get(k, 0) for e in entities) for k in details})
    result['procs'] = {key: average(e['details'].get('procs', {}).get(key, 0) for e in entities)
                       for key in ['astrality', 'astralReturn', 'astralBody', 'astralBodyAvoidance']}
    return result


cases = []
for folder in FOLDERS:
    run = read(folder / 'run.json')
    assert not run['errors'], run
    rows = [json.loads(line) for line in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines() if line]
    specs = read(folder / 'cases.json')
    assert len(rows) == sum(c['count'] for c in specs) == run['completed'] == run['requested']
    assert len({(r['caseId'], r['index']) for r in rows}) == len(rows), 'Duplicate trial'
    for spec in specs:
        trials = sorted((r for r in rows if r['caseId'] == spec['id']), key=lambda r: r['index'])
        assert [t['index'] for t in trials] == list(range(spec['count'])), spec['id']
        assert all(t['end'] in {'victory', 'draw', 'timeout'} for t in trials), spec['id']
        for t in trials:
            assert len(t['entities']) == 1 + spec.get('opponents', 1)
            if t['end'] == 'victory':
                assert all(e['dead'] and e['hpEnd'] <= 0 for e in t['entities'] if e['side'] != t['winner'])
        if spec.get('opponents') == 2:
            assert any(t['firstDeath'] and t['durationMs'] > t['firstDeath']['timeMs'] for t in trials), 'Must continue after first death'
        own = [subject(t) for t in trials]
        assert collections.Counter(e['side'] for e in own) == {'A': len(own) // 2, 'B': len(own) // 2}
        first = subject(trials[0])['initialStats']
        assert first['strength'] == first['intelligence'] == 50 and first['criticalChance'] == 0
        wins = sum(t['winner'] == e['side'] for t, e in zip(trials, own))
        losses = sum(bool(t['winner']) and t['winner'] != e['side'] for t, e in zip(trials, own))
        ends = collections.Counter(t['end'] for t in trials)
        group = collections.defaultdict(list)
        for t in trials:
            for e in t['entities']:
                group[str(e['id'])].append(e)
        armies = {}
        for key, same in [('subject', True), ('opponents', False)]:
            totals = []
            for t, s in zip(trials, own):
                army = [e for e in t['entities'] if (e['side'] == s['side']) == same]
                totals.append({k: sum(e.get(k, 0) for e in army) for k in ['damage', 'heal', 'hpEnd', 'actions']})
            armies[key] = {k: average(t[k] for t in totals) for k in totals[0]}
        result = {**spec, 'wins': wins, 'losses': losses, 'draws': ends['draw'], 'timeouts': ends['timeout'],
                  'winRate': 100 * wins / len(trials), 'winInterval95': wilson(wins, len(trials)),
                  'durationSeconds': average(t['durationMs'] / 1000 for t in trials),
                  'medianSeconds': statistics.median(t['durationMs'] / 1000 for t in trials),
                  'minSeconds': min(t['durationMs'] / 1000 for t in trials),
                  'maxSeconds': max(t['durationMs'] / 1000 for t in trials),
                  'computeSeconds': sum(t['timings']['elapsedMs'] / 1000 for t in trials),
                  'initialStats': first, 'subject': entity_mean(own), 'armies': armies,
                  'entities': {k: entity_mean(v) for k, v in group.items()},
                  'trace': str((folder / (spec['id'] + '-trace.json')).relative_to(OUT.parent)).replace('\\', '/')}
        cases.append(result)

by_id = {c['id']: c for c in cases}
checks = read(OUT / 'counter-checks.json')
browser = read(ROOT / 'outputs/astralite/browser-report.json')
assert not checks['errors'] and not browser['errors']
total = sum(c['count'] for c in cases)
formula = read(OUT / 'formulas.json')
return_tradeoff = read(OUT / 'return-tradeoff.json')
source_files = ['docs/js/data/umbraProgression.js', 'docs/js/damagesCalcul.js',
                'docs/js/attackEffectMecanics.js', 'docs/js/entityAttributs.js', 'docs/js/combatSimulation.js',
                'scripts/audit-astrality-balance.mjs', 'scripts/verify-astrality-counters-browser.mjs']
summary = {'createdAt': datetime.datetime.now().astimezone().isoformat(), 'combats': total, 'conditions': len(cases),
           'cases': cases, 'formula': formula, 'returnTradeoff': return_tradeoff,
           'counterChecks': checks, 'browserChecks': browser,
           'sourceSha256': {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in source_files}}
(OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')


def esc(value):
    return html.escape(str(value))


def fmt(value, digits=2):
    return f'{value:,.{digits}f}'.replace(',', '\u202f').replace('.', ',')


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>' + ''.join(f'<th>{esc(h)}</th>' for h in headers) + '</tr></thead><tbody>' + ''.join(
        '<tr>' + ''.join(f'<td>{v}</td>' for v in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def comparison(ids):
    return table(['Configuration', 'Victoires', 'Doubles KO', 'Défaites', 'Durée moyenne', 'Soin réel moyen'], [
        [esc(by_id[i]['name']), f"{by_id[i]['wins']} / {by_id[i]['count']}", by_id[i]['draws'], by_id[i]['losses'],
         fmt(by_id[i]['durationSeconds']) + ' s', fmt(by_id[i]['subject']['heal']) + ' HP'] for i in ids])


critical_table = comparison(['physicalDamage-f99', 'physicalDamage-a1f99', 'physicalDamage-plus50-a0', 'physicalDamage-plus50-a50',
                            'magicalDamage-f99', 'magicalDamage-a1f99'])
magic_table = comparison(['magicalDamage-a0', 'magicalDamage-a1', 'magicalDamage-a50', 'magicalDamage-a150', 'magic-integrite50'])
all_table = table(['Configuration', 'n', 'Victoires', 'Intervalle à 95 %', 'Défaites', 'Doubles KO', 'Hors durée', 'Durée', 'Soins', 'Survies fatales', 'Sorts ratés'], [
    [esc(c['name']), c['count'], fmt(c['winRate'], 1) + ' %', '–'.join(fmt(x, 1) for x in c['winInterval95']) + ' %',
     c['losses'], c['draws'], c['timeouts'], fmt(c['durationSeconds']) + ' s', fmt(c['subject']['heal']),
     fmt(c['subject']['procs']['astrality']), fmt(c['subject']['procs']['astralBodyAvoidance'])] for c in cases])
formula_table = table(['Astralité', 'Survie fatale', 'Jet de Corps astral', 'Durée de Corps astral', 'Temps actif théorique', 'Retour astral complet'], [
    [p['points'], fmt(p['survival']) + ' %', fmt(p['bodyChance']) + ' %', fmt(p['bodySeconds']) + ' s',
     fmt(p['steadyBodyUptime'] * 100) + ' %', f"{p['heal']} HP sur {fmt(p['seconds'])} s"]
    for p in formula if p['intelligence'] == 50 and p['points'] in [0, 1, 50, 150]])
detail = []
for c in cases:
    s = c['subject']
    detail.append(f'<details><summary>{esc(c["name"])}</summary><p>Chance initiale de Survie fatale : {fmt(c["initialStats"]["fatalSurvival"])} %. '
                  f'Victoires : {c["wins"]}/{c["count"]}. Durée : {fmt(c["minSeconds"])}–{fmt(c["maxSeconds"])} s. '
                  f'<a href="../{esc(c["trace"])}">Trace complète du premier combat</a>.</p>')
    detail.append(table(['Entité', 'Dégâts infligés', 'Dégâts HP reçus', 'Dégâts armure reçus', 'Soins reçus', 'HP finaux', 'Actions'], [
        ['Sujet Astralité' if k == '998000' else 'Adversaire ' + str(int(k) - 998000),
         fmt(e['damage']), fmt(e['hpDamageReceived']), fmt(e['armorDamageReceived']), fmt(e['healingReceived']), fmt(e['hpEnd']), fmt(e['actions'])]
        for k, e in c['entities'].items()]))
    detail.append(table(['Armée', 'Dégâts infligés', 'Soins produits', 'HP finaux', 'Actions'], [
        ['Camp du sujet' if k == 'subject' else 'Camp adverse', fmt(a['damage']), fmt(a['heal']), fmt(a['hpEnd']), fmt(a['actions'])]
        for k, a in c['armies'].items()]))
    detail.append(f'<p>Moyennes par combat : {fmt(s["procs"]["astrality"])} Survies fatales, '
                  f'{fmt(s["procs"]["astralReturn"])} Retours astraux, {fmt(s["procs"]["astralBody"])} activations de Corps astral, '
                  f'{fmt(s["procs"]["astralBodyAvoidance"])} attaques annulées.</p></details>')

timeouts = sum(c['timeouts'] for c in cases)
report = f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Astralité — audit des contres et de l’équilibrage</title>
<style>
:root{{color-scheme:dark;font-family:system-ui,sans-serif;background:#11131c;color:#e8eaf1}}body{{max-width:1360px;margin:auto;padding:32px 22px;line-height:1.6}}
h1{{line-height:1.2}}h2{{margin-top:40px;color:#c9b1ff}}a{{color:#b7d8ff}}.lead{{border-left:4px solid #e5ac55;padding:15px 22px;background:#292336}}
.meta,small{{color:#adb6c8}}.scroll{{overflow:auto;margin:20px 0}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:10px 12px;border-bottom:1px solid #353849;text-align:right;white-space:nowrap}}
th{{color:#bba3e8;background:#1c1e2a}}td:first-child,th:first-child{{text-align:left;white-space:normal;min-width:210px}}tr:hover{{background:#232535}}
details{{border:1px solid #353849;padding:12px 16px;margin:12px 0;border-radius:6px}}summary{{cursor:pointer;font-weight:600}}
li{{margin:5px 0}}code{{background:#242737;padding:2px 5px}}.links{{display:flex;gap:18px;flex-wrap:wrap}}@media print{{:root{{color-scheme:light;background:white;color:#111}}details{{break-inside:avoid}}}}
</style><main>
<h1>Astralité : contres, statistiques autonomes et équilibre</h1>
<p class="meta">{esc(summary['createdAt'])} · {total} combats valides · {len(cases)} configurations · moteur réel du jeu · aucune règle modifiée.</p>
<div class="lead"><strong>Verdict : l’équilibrage global n’est pas validé.</strong> Astralité apporte une défense spécialisée contre la magie et conserve des contres francs.
Le problème prioritaire est la Survie fatale autonome : elle peut se relancer à chaque coup mortel, alors que l’ajout d’Astralité la bloque pendant Retour astral.
Une acquisition supplémentaire peut donc diminuer fortement la survie.</div>
<p class="links"><a href="summary.json" download>Télécharger les résultats détaillés (JSON)</a><a href="trials.jsonl" download>Combats principaux</a>
<a href="../astralite-balance-plus/trials.jsonl" download>Combats avec la stat +</a><a href="counter-checks.json" download>Contrôles des contres</a></p>

<h2>1. Le défaut d’interaction confirmé</h2>{critical_table}
<p>Ces confrontations physiques utilisent les mêmes statistiques de départ et les mêmes graines initiales ; les côtés A et B sont alternés.
À 99 %, la version autonome bénéficie d’un nouveau jet sur chaque coup mortel, même immédiatement après le précédent. Avec un seul point d’Astralité,
le premier succès déclenche Retour astral, et les coups suivants ne bénéficient plus d’aucun jet tant que ce soin dure.</p>
<p>Exemple enregistré : sans Umbra, le sujet reste à 1 HP sur quatre coups mortels successifs entre 13,32 et 19,11 s.
Avec Astralité 1, il survit à 13,32 s, récupère 25 HP, puis meurt au coup suivant à 15,25 s : Retour astral n’est pas terminé.</p>
<p>À 50 Force, Retour astral dure déjà 4,68 s pour un point d’Astralité. Le coup physique suivant arrive avant sa fin.
Le phénomène existe aussi avec Survie fatale + : les 50 points autonomes, aidés par Intelligence 50, donnent ici 69,88 % de chance avant ajout de l’Umbra.
L’ajout d’Astralité 50 porte cette chance à 99 %, mais les victoires physiques diminuent quand même de 6/16 à 0/16 à cause de l’indisponibilité.</p>
<p>La version autonome à 99 % n’est pas immortelle : la probabilité de supporter dix nouveaux coups mortels est 0,99¹⁰ ≈ 90,44 %.
Sans délai de récupération, cela reste extrêmement puissant. Le résultat de 97/100 est propre à ce duel ; il ne représente pas tous les combats du jeu.</p>

<h2>2. Astralité face à la magie</h2>{magic_table}
<p>Corps astral peut faire basculer ce duel, mais le résultat dépend des jets et du moment où les sorts touchent.
Une capacité défensive spécialisée telle qu’Intégrité est également comparée. Ces essais à 16 répétitions donnent une tendance exploratoire,
pas une preuve d’équilibrage à quelques points de pourcentage près.</p>
<p><strong>Face à deux adversaires exclusivement magiques, Astralité 150 fait passer les victoires de 4/16 à 15/16.</strong>
Le soin réel reste très faible dans ce cas : Corps astral apporte l’essentiel de la protection. C’est une forte spécialisation à surveiller,
pas la preuve d’une supériorité contre toutes les armées. Les mêmes 150 points ne gagnent aucun des duels physiques testés.</p>
{formula_table}
<p>Lecture des formules avec Force 50, Intelligence 50 et 400 HP. Le « temps actif théorique » est une moyenne à long terme,
pas une mesure des essais : q × durée / (3 + q × durée), avec q en fraction. Le premier jet attend 3 secondes et chaque fin d’effet relance cette attente.
À 150 points, environ 30 % de temps actif ne signifie donc ni 25 % de réduction permanente, ni une immunité permanente.</p>

<h2>3. Retour astral et retombées de progression</h2>
<ul><li>Le soin et sa durée augmentent ensemble : 10 % des HP sur 3 s vers 30 % sur 9 s. Le débit reste environ 3,33 % des HP maximum par seconde, hors arrondis.</li>
<li>Augmenter Force augmente le budget et prolonge l’indisponibilité ; cela ne rend pas le soin nettement plus rapide. À Astralité 50, Force 0 → 150 fait passer 75 HP sur 5,59 s à 95 HP sur 7,11 s, pour 400 HP maximum.</li>
<li>Les soins réellement reçus avant la mort sont souvent très inférieurs au budget annoncé. Face aux coups physiques soutenus, l’effet achète du temps sans assurer le prochain sauvetage.</li>
<li>Le premier point vaut 1 % sans Intelligence. Avec Intelligence 50, il donne déjà 27,93 % de Survie fatale et 15,40 % par jet de Corps astral. L’accès à l’Umbra débloque donc immédiatement la contribution de l’attribut.</li>
<li>Dans le code actuel, Retour astral bloque Survie fatale, y compris sa composante autonome. Corps astral reste actif et peut encore se déclencher pendant Retour astral. Il ne s’agit pas d’un verrou de toute l’Umbra.</li>
<li>À très long terme, la durée de Corps astral continue de croître avec le ratio résiduel. Son plafond de 25 % par jet ne plafonne pas sa proportion de temps actif. C’est un point à encadrer si des quantités extrêmes deviennent accessibles ; à 150 points, cette dérive n’est pas observée.</li></ul>

<h2>4. Contres et intégration vérifiés</h2>
<p>{len(checks['checks'])} contrôles ciblés réussis, 1 495 assertions de formules et d’accord avec index-14 réussies, puis vérification navigateur des effets, de la pause/F5, des cards et des helpers.</p>
<ul><li>Physique, perçant, hybride et autres mélanges traversent Corps astral : la règle actuelle ne bloque que les attaques magiques pures hostiles.</li>
<li>Un sort magique raté ne consomme ni HP ni armure et n’applique pas Silence ni vol de vie. Le même Silence fonctionne hors de l’effet.</li>
<li>Les soins alliés passent ; les dégâts périodiques déjà posés continuent. Corps astral n’est pas une purification.</li>
<li>Survie fatale seule ne donne ni soin ni Corps astral. Sa version + conserve son ratio autonome statique ; les contributions sont regroupées sans double comptage.</li>
<li>Pause et F5 conservent les délais et le budget de soin sans duplication. La mort et l’arrêt du combat nettoient les effets.</li></ul>

<h2>5. Tous les résultats</h2>
<p>Les taux portent sur tous les essais, doubles KO et fins de durée compris. « Hors durée » signifie limite simulée de 90 s atteinte ; total observé : {timeouts}.
Les intervalles de Wilson à 95 % indiquent l’incertitude d’échantillonnage, pas la diversité des situations de jeu.</p>{all_table}

<h2>6. Détails par entité et par armée</h2>
<p>Toutes les valeurs ci-dessous sont des moyennes par combat. Le sujet change de côté un combat sur deux ; « camp du sujet » conserve le même sens.
Les dégâts de la colonne principale incluent ce que le moteur comptabilise comme dégâts infligés ; les pertes de HP et d’armure sont détaillées séparément.
Les dommages évités affichés par Survie fatale ne sont pas utilisés comme équivalent de HP supplémentaires.</p>{''.join(detail)}

<h2>7. Protocole et limites</h2>
<p>Appels directs à <code>captureSimulationBoard</code> et <code>simulateTrial</code> du jeu, avec son temps virtuel, ses phases,
ses jets, ses règles de nature, ses soins et ses conditions de victoire. Arrêt à la victoire d’un camp, au double KO ou à 90 s ; aucune analyse marginale « +1 » automatique.
Les configurations comparées sont explicites, notamment l’ajout d’Astralité 1 pour reproduire l’interaction signalée.</p>
<p>Base : niveau 30, Force 50, Intelligence 50, Agilité 0, aucun équipement ni critique, 400 HP. Le sujet inflige des attaques physiques de puissance de base 40 ;
l’adversaire dispose de 55 dans la nature testée. ATB de base 1 300 ms, préparation 200 ms, exécution 300 ms, récupération 200 ms ; les ajustements du moteur restent appliqués.
La même puissance saisie ne garantit pas les mêmes dégâts finaux entre natures.</p>
<p>Variantes de cadence : rapide, puissance 16 et ATB 300 ms ; lente, puissance 200, 800 HP adverses et ATB 6 000 ms.
Ce sont des confrontations différentes, pas des mesures isolant uniquement la cadence.
En groupe, deux adversaires magiques ont chacun 200 HP et 27,5 de puissance ; le combat continue jusqu’à la fin de leur camp.</p>
<p>La graine de départ est partagée entre configurations et varie entre répétitions. L’ajout d’un effet consomme d’autres jets : les tirages ne restent donc pas identiques action par action.
L’acquisition automatique d’archétypes est neutralisée dans le montage de test et les statistiques initiales sont contrôlées.
Un premier pilote biaisé par cette acquisition a été exclu et conservé séparément dans <code>invalid-pilot-archetype</code>.</p>
<p>La matrice couvre des duels, deux ennemis, plusieurs natures et cadences, les statistiques autonomes fixes et +.
Elle ne constitue pas un inventaire exhaustif de toutes les combinaisons d’équipements, d’armées, de soins alliés et de contrôles.</p>

<h2>8. Décision proposée</h2>
<p><strong>Traiter d’abord l’indisponibilité de Survie fatale autonome et son interaction avec l’Umbra.</strong>
Un même investissement ne doit pas devenir moins efficace quand on acquiert Astralité.
Il faut harmoniser les fenêtres d’indisponibilité sans donner Retour astral à une entité qui ne possède que la stat autonome.</p>
<p>Ensuite, refaire ces mêmes confrontations avant de modifier les chances de Corps astral ou la puissance globale de l’Umbra.
Les présents essais ne justifient pas un nerf général d’Astralité : son problème principal est l’incohérence avec la stat autonome,
et sa faiblesse face au physique soutenu reste nette. Aucun réglage ni calcul du jeu n’a été modifié pendant cet audit.</p>
</main></html>'''
(OUT / 'rapport-astralite.html').write_text(report, encoding='utf-8')
print(f'{total} combats / {len(cases)} configurations ; {timeouts} hors durée ; rapport et summary.json enregistrés.')
for c in cases:
    print(c['id'], f"{c['wins']}/{c['count']} victoires, {c['draws']} doubles KO", f"{c['durationSeconds']:.2f}s, soins {c['subject']['heal']:.2f}")
