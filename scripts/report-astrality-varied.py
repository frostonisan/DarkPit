"""Analyse des affrontements variés, sans modifier les réglages du jeu."""
from pathlib import Path
import collections
import datetime
import hashlib
import html
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/astralite-varied'


def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))


def own(row):
    return next(e for e in row['entities'] if e['id'] == '998000')


def summary(rows):
    n = len(rows)
    es = [own(r) for r in rows]
    wins = sum(r['winner'] == e['side'] for r, e in zip(rows, es))
    p, z = wins/n, 1.959963984540054
    den = 1+z*z/n
    center = (p+z*z/(2*n))/den
    radius = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    assert collections.Counter(e['side'] for e in es) == {'A': n//2, 'B': n//2}
    return {'n': n, 'wins': wins, 'winPercent': p*100,
            'winInterval95': [max(0, center-radius)*100, min(1, center+radius)*100],
            'draws': sum(r['end'] == 'draw' for r in rows), 'timeouts': sum(r['end'] == 'timeout' for r in rows),
            'alive': sum(not e['dead'] and e['hpEnd'] > 0 for e in es),
            'damage': statistics.mean(e['damage'] for e in es), 'heal': statistics.mean(e['heal'] for e in es),
            'hpEnd': statistics.mean(e['hpEnd'] for e in es), 'turns': statistics.mean(e['turns'] for e in es),
            'durationSeconds': statistics.mean(r['durationMs']/1000 for r in rows),
            'procs': {key: statistics.mean(e['details']['procs'].get(key, 0) for e in es)
                      for key in ['astrality', 'astralReturn', 'astralBody', 'astralBodyAvoidance']},
            'armyDamage': statistics.mean(sum(e['damage'] for e in r['entities'] if e['side'] == own(r)['side']) for r in rows),
            'armyHeal': statistics.mean(sum(e['heal'] for e in r['entities'] if e['side'] == own(r)['side']) for r in rows),
            'enemyBrokenSpells': statistics.mean(sum(e['details']['procs'].get('brokenSpell', 0) for e in r['entities'] if e['side'] != own(r)['side']) for r in rows),
            'initialStats': own(next(r for r in rows if r['index'] == 0))['initialStats']}


specs, rows, mechanics = [], [], read('mechanics.json')
hashes = read('source-hashes.json')
for folder in [OUT, OUT / 'complements']:
    group = json.loads((folder / 'cases.json').read_text(encoding='utf-8'))
    run = json.loads((folder / 'run.json').read_text(encoding='utf-8'))
    group_rows = [json.loads(line) for line in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines() if line]
    assert run['requested'] == run['completed'] == len(group_rows) == sum(c['count'] for c in group)
    assert not run['errors']
    assert hashes == json.loads((folder / 'source-hashes.json').read_text(encoding='utf-8'))
    for c in group:
        c['tracePath'] = ('complements/' if folder.name == 'complements' else '')+c['id']+'-trace.json'
    specs.extend(group)
    rows.extend(group_rows)
assert len({(r['caseId'], r['index']) for r in rows}) == len(rows)
cases = []
for c in specs:
    rs = [r for r in rows if r['caseId'] == c['id']]
    assert sorted(r['index'] for r in rs) == list(range(c['count']))
    for r in rs:
        assert r['seed'] == (0xB1650000+r['index']*7919) & 0xffffffff
        assert len(r['entities']) == 1+len(c['foes'])+int(c.get('ally', False))
    cases.append({**c, 'result': summary(rs)})
by_id = {c['id']: c for c in cases}
changed_sources = [name for name, digest in hashes.items()
                   if hashlib.sha256((ROOT / 'docs' / name).read_bytes()).hexdigest() != digest]
assert not changed_sources, f'Source changed during the audit: {changed_sources}'
for c in cases:
    initial = c['result']['initialStats']
    assert initial['HP'] == 400 and initial['physicalDamage'] == 40 and initial['criticalChance'] == 0
    assert abs(initial['fatalSurvival'] - mechanics[c['build']]['chance']) < 1e-9
    if c['threat'] == 'magicTrained':
        assert c['result']['enemyBrokenSpells'] == 0
data = {'createdAt': datetime.datetime.now().astimezone().isoformat(), 'combats': len(rows), 'scenarios': len(cases),
        'timeouts': sum(r['end'] == 'timeout' for r in rows), 'cases': cases, 'mechanics': mechanics,
        'settingsUnchanged': True, 'sourceHashes': hashes}
(OUT / 'summary.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'validation.json').write_text(json.dumps({
    'combats': len(rows), 'situations': len(cases), 'uniqueCombatKeys': len(rows),
    'trialsPerSituation': 16, 'campsPerSituation': {'A': 8, 'B': 8},
    'sameFrozenSources': True, 'sourceFilesUnchanged': len(hashes),
    'trainedMageBrokenSpells': 0, 'timeouts': data['timeouts'], 'errors': [],
    'reproducibleSeedsChecked': True, 'attributesAndPowerChecked': True,
}, ensure_ascii=False, indent=2), encoding='utf-8')


def f(value, digits=2):
    return f'{value:.{digits}f}'.replace('.', ',')


def win(result):
    return f"{result['wins']}/{result['n']}"


def interval(result):
    return '–'.join(f(v, 1) for v in result['winInterval95'])+' %'


def table(headers, lines):
    return '<div class="scroll"><table><thead><tr>'+''.join(f'<th>{h}</th>' for h in headers)+'</tr></thead><tbody>'+''.join(
        '<tr>'+''.join(f'<td>{cell}</td>' for cell in line)+'</tr>' for line in lines)+'</tbody></table></div>'


threats = []
for c in cases:
    if c['build'] != 'high':
        continue
    a, b = c['result'], by_id['cap-'+c['threat']]['result']
    threats.append([html.escape(c['name'].split(' · ', 1)[1]), win(a), interval(a), win(b), interval(b),
                    f(a['procs']['astrality'])+' / '+f(b['procs']['astrality']), f(a['heal'])+' / '+f(b['heal'])])
threat_table = table(['Affrontement', 'Sans bonus fixe', 'Intervalle 95 %', 'Avec +30 % fixe', 'Intervalle 95 %',
                      'Sauvetages moyens sans / avec', 'Soin reçu moyen sans / avec'], threats)
comparison = []
for build in ['none', 'entry', 'mid', 'high', 'constitution', 'integrite', 'robustness']:
    a, b = by_id[build+'-physical'], by_id[build+'-magic']
    comparison.append([html.escape(a['name'].split(' · ', 1)[0]), win(a['result']), win(b['result']),
                       f(a['result']['durationSeconds'])+' / '+f(b['result']['durationSeconds']),
                       f(a['result']['hpEnd'])+' / '+f(b['result']['hpEnd'])])
comparison_table = table(['Build', 'Victoires physiques', 'Victoires magiques', 'Durée physique / magique (s)', 'HP finaux physique / magique'], comparison)
trained_table = table(['Build', 'Victoires face au mage entraîné', 'Incantations brisées adverses', 'Sorts évités par Corps astral', 'Soin reçu'], [
    [html.escape(c['name'].split(' · ', 1)[0]), win(c['result']), f(c['result']['enemyBrokenSpells']),
     f(c['result']['procs']['astralBodyAvoidance']), f(c['result']['heal'])] for c in cases if c['threat'] == 'magicTrained'])
mechanic_table = table(['Build', 'Survie fatale', 'Soin / sauvetage', 'Cooldown', 'Soin/s pendant Retour', 'Corps astral : chance / durée', 'Disponibilité théorique'], [
    [html.escape(by_id[key+'-physical']['name'].split(' · ', 1)[0]), f(mechanics[key]['chance'])+' %',
     f(mechanics[key]['healPercent'])+' %', f(mechanics[key]['cooldown'])+' s',
     f(mechanics[key]['healingPerSecond'])+' HP/s', f(mechanics[key]['bodyChance'])+' % / '+f(mechanics[key]['bodyDuration'])+' s',
     f(mechanics[key]['bodyExpectedUptime'])+' %'] for key in ['entry', 'mid', 'high', 'cap']])
detail = []
for c in cases:
    r = c['result']
    detail.append('<details><summary>'+html.escape(c['name'])+'</summary>'+table(
        ['Combats', 'Victoires de l’armée', 'Nuls', 'Hors durée', 'Sujet encore vivant', 'Durée du combat (s)', 'Dégâts du sujet', 'Soin reçu', 'HP finaux'], [[
            r['n'], r['wins'], r['draws'], r['timeouts'], r['alive'], f(r['durationSeconds']), f(r['damage']), f(r['heal']), f(r['hpEnd'])]])+
        table(['Sauvetages', 'Retours astraux', 'Corps astraux', 'Attaques magiques évitées', 'Dégâts de l’armée', 'Soin de l’armée'], [[
            *[f(r['procs'][key]) for key in ['astrality', 'astralReturn', 'astralBody', 'astralBodyAvoidance']], f(r['armyDamage']), f(r['armyHeal'])]])+
        f'<p><a href="{c["tracePath"]}">Journal du premier essai</a></p></details>')
configuration = table(['Scénario', 'Ennemis : nature / puissance / HP / vitesse / préparation / exécution / récupération'], [
    [html.escape(c['name'].split(' · ', 1)[1]), '<br>'.join(
        f"{html.escape({'physicalDamage':'Physique','magicalDamage':'Magique','hybridalDamage':'Hybride','transpiercingDamage':'Perçant'}[e['nature']])} / {e['power']} / {e['hp']} / {e['speed']} / {e['prep']} / {e['exec']} / {e['recovery']} ms"+
        (' ; Poison : 120 dégâts sur 6 s, tick de 0,5 s' if e.get('effects') else '') for e in c['foes'])] for c in cases if c['build'] == 'high'])

document = f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Astralité — audit varié sans modification</title><style>
:root{{color-scheme:dark;background:#11151f;color:#ebedf3;font-family:system-ui,sans-serif}}body{{max-width:1450px;margin:auto;padding:24px;line-height:1.6}}
h1,h2{{color:#c0d4ff}}h1{{line-height:1.2}}h2{{margin-top:34px}}.scroll{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}
td,th{{padding:10px;text-align:left;border-bottom:1px solid #394051}}th{{background:#222b3b}}td:not(:first-child){{font-variant-numeric:tabular-nums}}
details{{padding:10px;border-bottom:1px solid #394051}}summary{{cursor:pointer}}a{{color:#aacdff}}.note{{padding:18px;background:#202b3e;border-left:3px solid #d8bc78}}
</style><h1>Astralité : puissance, faiblesses et investissement</h1>
<p class="note"><strong>{len(rows)} combats · {len(cases)} situations · {data['timeouts']} hors durée. Réglages du jeu inchangés.</strong><br>
Moteur réel, temps virtuel, victoire d’un camp ou durée maximale de 120 secondes. Aucune estimation marginale « +1 ».</p>
<h2>Mon diagnostic</h2><p><strong>La mécanique présente des forces et de vrais contres. Le cumul proche de 99 % est le principal point de vigilance.</strong>
Sans bonus fixe, Astralité très investie gagne {win(by_id['high-physical']['result'])} duels physiques réguliers et
{win(by_id['high-magicTrained']['result'])} duels contre le mage entraîné. Avec le cumul de Survie fatale fixe,
ces résultats deviennent {win(by_id['cap-physical']['result'])} et {win(by_id['cap-magicTrained']['result'])}.
Ce cumul perd néanmoins tous les essais avec Poison, sous forte pression continue, et contre les deux attaquants physiques synchronisés.</p>
<p>Constitution et Intégrité restent plus fiables sur leur terrain spécialisé dans ces scénarios. Astralité dépasse en revanche Robustesse
dans les duels témoins étudiés. Je ne réduirais pas les ratios Force et Agilité sur la seule base d’un build fabriqué à 99 % :
il faut distinguer la puissance mécanique de ce cumul et son accessibilité en progression normale.
Ces essais ne suffisent pas à valider l’équilibrage global de tous les archétypes, équipements et combinaisons d’Umbras.</p>
<h2>Précaution sur le précédent bilan</h2><p>Le build à 15/16 victoires physiques et 16/16 magiques possédait aussi +30 % de Survie fatale fixe.
Il atteignait donc 99 %. Le présent audit distingue ce cumul du build investi sans bonus fixe : 79,90 % avec 150 Astralité et 150 Intelligence.
Les adversaires, les durées et les graines ont changé : ce rapport élargit les situations, il ne compare pas deux versions des réglages.</p>
<h2>Résistance selon l’adversaire</h2>{threat_table}
<h2>Comparaison avec les autres défenses</h2>{comparison_table}
<p>Les lignes Astralité 150, Constitution 150, Intégrité 150 et Robustesse 150 ont le même budget d’Umbra et les mêmes attributs :
150 Force, 150 Intelligence, 150 Agilité. Même HP et même attaque de base. Cela n’attribue pas un prix économique identique à tous les points du jeu.
Les lignes Astralité 1 et Astralité 50 illustrent des investissements inférieurs ; elles ne doivent pas être classées comme des builds de coût égal.</p>
<h2>Face à un mage entraîné</h2>{trained_table}
<p>Les mages témoins sans Intelligence subissent le risque natif d’incantation brisée (30 % avant les règles de nature).
Leurs échecs et dégâts de retour favorisent le défenseur. Ici, l’adversaire a 150 Intelligence : son risque d’incantation brisée est nul,
sans modifier le fichier d’équilibrage. Cette comparaison est la plus pertinente pour juger la protection contre un vrai build magique.</p>
<h2>Pourquoi l’investissement devient puissant</h2>{mechanic_table}
<ol><li><strong>La Force augmente le volume et l’Agilité accélère sa délivrance.</strong> Sur 400 HP, le build investi reçoit jusqu’à 251 HP en 3,24 s,
soit environ 77 HP/s pendant Retour. Ce débit n’existe qu’après un sauvetage ; il ne s’agit pas d’une régénération permanente.</li>
<li><strong>Les sauvetages peuvent s’enchaîner.</strong> Passer de 79,90 % à 99 % divise la probabilité d’échec d’un jet par environ 20.
Dans le duel physique régulier, les victoires observées nécessitent cinq sauvetages : réussir cinq jets vaut environ 32,6 % avec 79,9 % par jet,
contre 95,1 % avec 99 %. Avec les attributs et l’Umbra à 150, +20 points fixes de Survie fatale suffisent déjà à atteindre le plafond de 99 %.
Le catalogue des cristaux permanents inclut Survie fatale. Chaque crystal aléatoire donne de 1 à 3 points :
atteindre +20 demande au minimum sept cristaux de cette statistique. Ces récompenses sont conditionnées aux niveaux marqués
« permanentReward ». La fréquence d’acquisition réelle n’est pas mesurée ici ; le cas à 99 % reste un test extrême,
et non une hypothèse de build courant.
Si le cooldown était toujours disponible et les jets indépendants, on attendrait environ 4 réussites avant un échec, contre 99.
Ce calcul théorique ne tient pas compte des morts pendant le cooldown : les simulations, elles, les comptent.</li>
<li><strong>Survie fatale annule aussi le surplus du coup mortel.</strong> Un impact énorme laisse 1 HP si le jet réussit,
comme un impact juste suffisant pour tuer. Quand les coups sont espacés, le soin et le cooldown ont le temps de se terminer.
C’est pourquoi un attaquant aux coups très lourds mais lents peut être moins dangereux qu’une succession d’impacts rapprochés.</li>
<li><strong>Corps astral protège la fenêtre de soin contre la magie pure.</strong> À 150 Astralité et Intelligence, un jet à 23,62 % produit une fenêtre de 5,55 s.
Sa disponibilité théorique à long terme est d’environ 30,4 %, en restant éveillé et sans interruption. Elle bloque aussi les malus de l’attaque ratée.
L’hybride, le physique et un Poison déjà posé ne sont pas annulés par cette protection.</li>
<li><strong>Une seule Astralité débloque déjà tout le soin de la Force et toute la réduction de l’Agilité.</strong>
Avec des attributs à 150, Astralité 1 garde le soin de 62,75 % et le cooldown de 3,24 s, avec 57,83 % de Survie fatale.
Les points d’Umbra supplémentaires renforcent surtout les chances et la durée de Corps astral. C’est un point d’attention sur le coût d’accès.</li></ol>
<p>Ce bénéfice d’entrée n’est pas gratuit : le cas Astralité 1 possède déjà 450 points d’attributs.
Il teste l’intérêt d’ajouter l’Umbra à un personnage très développé, pas la puissance d’un débutant avec un seul point.</p>
<h2>Un contre observé dans le journal</h2><p>Dans <a href="cap-duoPhysical-trace.json">l’essai à 99 % contre deux ennemis physiques</a>,
deux impacts arrivent à 9,500 s : le premier déclenche Survie fatale, le second touche alors que l’entité n’a plus que 1 HP.
Elle meurt avant le premier versement. Le cooldown empêche bien une seconde survie instantanée.</p>
<p>Dans <a href="cap-poison-trace.json">l’essai avec Poison</a>, un coup déclenche Survie fatale à 21,140 s.
Les trois premiers versements remontent les HP de 1 à 7. Le tick de Poison inflige ensuite 10 dégâts à 21,240 s :
l’entité meurt 100 ms après son sauvetage, pendant le cooldown. Le soin progressif laisse donc une véritable fenêtre de vulnérabilité.</p>
<h2>Conditions et limites</h2><p>Chaque ligne contient 16 essais, huit dans chaque camp, avec les mêmes graines entre les builds.
Les intervalles de Wilson à 95 % rendent visible l’incertitude : 16 victoires sur 16 ne prouvent pas une victoire garantie.
Les HP du sujet restent à 400 et sa puissance physique fixe à 40, pour isoler la défense. Aucune génération d’archetype,
aucun équipement caché, aucune invincibilité admin ni chance de critique ajoutée.</p>
<p>Le soin en pourcentage bénéficie aussi d’une hausse des HP maximum ; cette extrapolation vient de la formule, les HP maximum du sujet n’ont pas été balayés ici.
Le pilote mesurait environ 46,9 dégâts/s en physique régulier, 39,7 en rapide et 55,7 en hybride avant les évitements.
Les variantes « pression ajustée » rapprochent les débits sans modifier les calculs du jeu. Le Poison ajoute 20 dégâts/s aux impacts physiques.
Leurs journaux confirment 32 dégâts toutes les 0,68 s en rapide (47,06/s), et 90 toutes les 1,94 s en hybride (46,39/s),
contre 91 toutes les 1,94 s pour le physique régulier (46,91/s).
Les très gros coups et la forte pression servent de tests de résistance et ne sont pas présentés comme équivalents.</p>
<p>En groupe, la victoire est celle du camp entier. La durée moyenne affichée est celle du combat, pas nécessairement le temps de vie du sujet.
Le nombre de sujets encore vivants, les dégâts et les soins de l’armée figurent dans les détails.</p>
{configuration}<h2>Relevés complets par situation</h2>{''.join(detail)}
<p><a href="summary.json">Synthèse JSON</a> · <a href="cases.json">Configurations exactes</a> · <a href="mechanics.json">Valeurs théoriques</a> ·
<a href="source-hashes.json">Empreintes des sources figées</a></p></html>'''
(OUT / 'rapport.html').write_text(document, encoding='utf-8')
print(json.dumps({'combats': len(rows), 'timeouts': data['timeouts'], 'results': {c['id']: win(c['result']) for c in cases}}, ensure_ascii=False, indent=2))
