"""Report real-engine audits; keep the previous two-second model untouched."""
from pathlib import Path
import collections
import datetime
import hashlib
import html
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/astralite-common-cooldown'


def load(folder):
    specs = json.loads((folder / 'cases.json').read_text(encoding='utf-8'))
    run = json.loads((folder / 'run.json').read_text(encoding='utf-8'))
    rows = [json.loads(line) for line in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines() if line]
    assert not run['errors'] and run['requested'] == run['completed'] == len(rows) == sum(c['count'] for c in specs)
    assert len({(r['caseId'], r['index']) for r in rows}) == len(rows)
    assert all(r['end'] in ['victory', 'draw', 'timeout'] for r in rows)
    for c in specs:
        assert sorted(r['index'] for r in rows if r['caseId'] == c['id']) == list(range(c['count']))
    return specs, rows


def own(row):
    return next(e for e in row['entities'] if str(e['id']) == '998000')


def won(row):
    return row['winner'] == own(row)['side']


def summary(rows):
    n = len(rows)
    wins = sum(won(r) for r in rows)
    p, z = wins / n, 1.959963984540054
    den = 1 + z*z/n
    center = (p + z*z/(2*n))/den
    radius = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    es = [own(r) for r in rows]
    assert collections.Counter(e['side'] for e in es) == {'A': n//2, 'B': n//2}
    return {'n': n, 'wins': wins, 'winPercent': wins*100/n,
            'winInterval95': [max(0, center-radius)*100, min(1, center+radius)*100],
            'timeouts': sum(r['end'] == 'timeout' for r in rows),
            'draws': sum(r['end'] == 'draw' for r in rows),
            'durationSeconds': statistics.mean(r['durationMs']/1000 for r in rows),
            'damage': statistics.mean(e['damage'] for e in es),
            'heal': statistics.mean(e['heal'] for e in es),
            'hpEnd': statistics.mean(e['hpEnd'] for e in es),
            'survivals': statistics.mean(e['details']['procs'].get('astrality', 0) for e in es),
            'initialStats': own(next(r for r in rows if r['index'] == 0))['initialStats']}


cases, all_rows, hashes = [], [], None
for group in ['comparison', 'spaced', 'agility', 'force']:
    specs, rows = load(OUT / group)
    manifest = json.loads((OUT / group / 'source-hashes.json').read_text())
    if hashes is None:
        hashes = manifest
    # Only JS changes would invalidate the common gameplay reference.
    assert {k: v for k, v in hashes.items() if k.endswith('.js')} == {k: v for k, v in manifest.items() if k.endswith('.js')}
    all_rows.extend(rows)
    old = {}
    if group in ['comparison', 'spaced']:
        old_specs, old_rows = load(ROOT / 'outputs/astralite-cooldown-comparison' / ('after' if group == 'comparison' else 'spaced'))
        assert specs == old_specs
        old = {(r['caseId'], r['index']): r for r in old_rows}
    for c in specs:
        current = sorted((r for r in rows if r['caseId'] == c['id']), key=lambda r: r['index'])
        entry = {**c, 'group': group, 'after': summary(current)}
        if old:
            previous = [old[(r['caseId'], r['index'])] for r in current]
            assert all(a['seed'] == b['seed'] and own(a)['side'] == own(b)['side'] for a, b in zip(current, previous))
            assert {e['id']: e['initialStats'] for e in current[0]['entities']} == {e['id']: e['initialStats'] for e in previous[0]['entities']}
            entry['before'] = summary(previous)
            entry['sameOutcomeCount'] = sum((a['end'], a['winner'], a['durationMs']) == (b['end'], b['winner'], b['durationMs']) for a, b in zip(current, previous))
        cases.append(entry)

by_id = {c['id']: c for c in cases}
pairs = []
for nature in ['physicalDamage', 'magicalDamage']:
    for alone, umbra in [('f50', 'a50f50'), ('f99', 'a1f99'), ('plus50-a0', 'plus50-a50')]:
        pairs.append((nature+'-'+alone, nature+'-'+umbra))
    for agility in [0, 150]:
        pairs.append((f'{nature}-agi{agility}-a0', f'{nature}-agi{agility}-a1'))
for kind in ['fixed', 'plus']:
    pairs.append((f'spaced-{kind}-a0', f'spaced-{kind}-a1'))
comparisons = []
for alone, umbra in pairs:
    a, u = by_id[alone]['after'], by_id[umbra]['after']
    comparisons.append({'standalone': alone, 'umbra': umbra, 'n': a['n'], 'winsAlone': a['wins'],
                        'winsUmbra': u['wins'], 'durationDeltaSeconds': u['durationSeconds']-a['durationSeconds']})
data = {'createdAt': datetime.datetime.now().astimezone().isoformat(), 'combats': len(all_rows),
        'timeouts': sum(r['end'] == 'timeout' for r in all_rows), 'cases': cases, 'comparisons': comparisons,
        'sourceHashes': hashes}
(OUT / 'comparison.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def f(value):
    return f'{value:.2f}'.replace('.', ',')


def label(c):
    return html.escape(c['name'].replace('physicalDamage', 'Physique').replace('magicalDamage', 'Magique'))


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>'+''.join(f'<th>{h}</th>' for h in headers)+'</tr></thead><tbody>'+''.join(
        '<tr>'+''.join(f'<td>{cell}</td>' for cell in row)+'</tr>' for row in rows)+'</tbody></table></div>'


before_after = table(['Configuration', 'Combats', 'Victoires avant → après', 'Durée moyenne', 'Soin effectif moyen'], [
    [label(c), c['count'], f"{c['before']['wins']} → {c['after']['wins']}",
     f(c['before']['durationSeconds'])+' → '+f(c['after']['durationSeconds'])+' s',
     f(c['before']['heal'])+' → '+f(c['after']['heal'])+' HP'] for c in cases if 'before' in c])
umbra = table(['Stat autonome', 'Avec Umbra', 'Victoires sans → avec', 'Durée moyenne avec Umbra'], [
    [label(by_id[c['standalone']]), label(by_id[c['umbra']]), f"{c['winsAlone']}/{c['n']} → {c['winsUmbra']}/{c['n']}",
     f(by_id[c['umbra']]['after']['durationSeconds'])+' s'] for c in comparisons])
attributes = table(['Configuration', 'Combats', 'Victoires', 'Durée moyenne', 'Soin moyen', 'Sauvetages moyens'], [
    [label(c), c['count'], c['after']['wins'], f(c['after']['durationSeconds'])+' s', f(c['after']['heal'])+' HP', f(c['after']['survivals'])]
    for c in cases if c['group'] in ['agility', 'force']])
observations = '<ul>'
for key in ['spaced-fixed-a1', 'spaced-plus-a1', 'spaced-fixed-a0', 'spaced-plus-a0']:
    c = by_id[key]
    observations += f"<li>{label(c)} : {c['before']['wins']}/{c['count']} avant, {c['after']['wins']}/{c['count']} après.</li>"
unchanged = sum(c.get('sameOutcomeCount', 0) for c in cases if c['group'] == 'comparison')
observations += f'<li>Affrontements de référence rapprochés : {unchanged}/360 résultats et durées identiques. Un soin supérieur ne suffit pas toujours à encaisser le coup suivant.</li></ul>'
details = ''.join('<details><summary>'+label(c)+'</summary>'+table(
    ['Version', 'Victoires', 'Intervalle 95 %', 'Durée (s)', 'Dégâts', 'Soin', 'HP finaux', 'Hors durée'], [
        [('Avant' if key == 'before' else 'Après'), f"{r['wins']}/{r['n']}", '–'.join(f(x) for x in r['winInterval95'])+' %',
         f(r['durationSeconds']), f(r['damage']), f(r['heal']), f(r['hpEnd']), r['timeouts']]
        for key in ['before', 'after'] if (r := c.get(key))])+ '</details>' for c in cases)
report = f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Astralité — cooldown commun</title><style>
:root{{color-scheme:dark;background:#11151f;color:#ebedf3;font-family:system-ui,sans-serif}}body{{max-width:1400px;margin:auto;padding:24px;line-height:1.6}}
h1,h2{{color:#c0d4ff}}h1{{line-height:1.2}}h2{{margin-top:34px}}.scroll{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}
td,th{{padding:10px;text-align:left;border-bottom:1px solid #394051}}th{{background:#222b3b}}td:not(:first-child){{font-variant-numeric:tabular-nums}}
details{{padding:10px;border-bottom:1px solid #394051}}summary{{cursor:pointer}}a{{color:#aacdff}}.note{{padding:18px;background:#202b3e;border-left:3px solid #d8bc78}}
</style><h1>Astralité : cooldown commun, avant / après</h1>
<p class="note"><strong>{len(all_rows)} combats complets · {data['timeouts']} hors durée.</strong> Moteur réel, temps virtuel, victoire d’un camp ou 90 secondes maximum.
Les séries interrompues par des écritures concurrentes sont conservées à part et exclues de ces chiffres.</p>
<h2>Réglages appliqués</h2><p>Cooldown commun : 5 s sans Umbra. Avec Astralité : 5 − 3 × S / (98 + S), où S = Agilité × 0,5 × sa courbe.
Minimum asymptotique : 2 s. Retour astral : 10 + 90 × F / (98 + F) % des HP maximum, où F = Force × 0,5 × sa courbe.
Le soin est réparti sur le cooldown, sans attente ajoutée. Intelligence et quantité d’Astralité n’augmentent plus ce budget et ne modifient pas ce délai.</p>
<p>Avant : autonome 2 s ; avec Umbra, soin de 10 à 30 % et durée proportionnelle de 3 à 9 s, augmentés par Force et Astralité.
<a href="before/settings.json">Réglages précédents</a> · <a href="comparison.json">Résultats détaillés JSON</a>.</p>
<h2>Constats mesurés</h2>{observations}
<p>Le nouveau délai de base de 5 s est aussi un nerf de la Survie fatale autonome précédemment réglée à 2 s.
Les réglages précédents sont sauvegardés pour permettre une révision de ce choix indépendamment du soin.</p>
<h2>Comparaison avec le modèle précédent</h2>{before_after}
<h2>Stat autonome seule ou avec Astralité</h2>{umbra}
<h2>Influence de l’Agilité et de la Force</h2>{attributes}
<h2>Interprétation et limites</h2><p>Le surcoût mécanique à l’acquisition de l’Umbra disparaît : son cooldown est égal ou inférieur au délai autonome.
Le soin et Corps astral s’ajoutent à cette disponibilité. Cela ne garantit pas la même issue pour chaque graine : les nouveaux jets peuvent déplacer la suite du hasard.</p>
<p>Les valeurs ci-dessus sont des mesures sur ces affrontements, pas une preuve d’équilibre universel. Les petits échantillons ont des intervalles larges.
Les builds riches en Force et Agilité sont particulièrement favorisés ; des dégâts groupés pendant le cooldown restent un contre.
Les soins sont réellement reçus, limités par les HP manquants, et non le budget théorique.</p>
<p>Les combats de référence gardent les mêmes entités, positions, graines et statistiques initiales. Côtés A/B alternés ; HP 400,
Force et Intelligence 50 sauf variantes annoncées. Le sujet attaque physiquement ; l’adversaire utilise la nature indiquée.
Les variantes d’attributs sont des combats de builds complets, pas une estimation marginale « +1 ».</p>
<h2>Détail des mesures</h2>{details}</html>'''
(OUT / 'rapport.html').write_text(report, encoding='utf-8')
print(json.dumps({'combats': data['combats'], 'timeouts': data['timeouts'], 'comparisons': comparisons}, ensure_ascii=False, indent=2))
