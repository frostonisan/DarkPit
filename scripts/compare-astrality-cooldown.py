"""Compare the archived audit with new real-engine trials, without editing gameplay."""
from pathlib import Path
import collections
import datetime
import hashlib
import html
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/astralite-cooldown-comparison'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def load(folder, expected_cooldown=None):
    specs, run = read(folder / 'cases.json'), read(folder / 'run.json')
    rows = [json.loads(l) for l in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines() if l]
    assert not run['errors'] and run['completed'] == run['requested'] == len(rows) == sum(c['count'] for c in specs)
    if expected_cooldown is not None:
        assert run['expectedCooldown'] == expected_cooldown
    assert len({(r['caseId'], r['index']) for r in rows}) == len(rows)
    for c in specs:
        assert sorted(r['index'] for r in rows if r['caseId'] == c['id']) == list(range(c['count']))
    return specs, rows


def own(row):
    return next(e for e in row['entities'] if str(e['id']) == '998000')


def won(row):
    return row['winner'] == own(row)['side']


def interval(wins, n):
    z = 1.959963984540054
    p, den = wins / n, 1 + z*z/n
    c = (p + z*z/(2*n))/den
    r = z * math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return [100*max(0,c-r),100*min(1,c+r)]


def summarize(rows):
    es = [own(r) for r in rows]
    mean = statistics.mean
    wins = sum(won(r) for r in rows)
    result = {'n': len(rows), 'wins': wins, 'winRate': wins/len(rows)*100, 'winInterval95': interval(wins,len(rows)),
              'losses': sum(bool(r['winner']) and not won(r) for r in rows),
              'draws': sum(r['end']=='draw' for r in rows), 'timeouts': sum(r['end']=='timeout' for r in rows),
              'durationSeconds': mean(r['durationMs']/1000 for r in rows),
              'damage': mean(e['damage'] for e in es), 'heal': mean(e['heal'] for e in es),
              'hpEnd': mean(e['hpEnd'] for e in es),
              'procs': {key: mean(e['details'].get('procs',{}).get(key,0) for e in es)
                        for key in ['astrality','astralReturn','astralBody','astralBodyAvoidance']},
              'initialStats': own(next(r for r in rows if r['index']==0))['initialStats']}
    assert collections.Counter(e['side'] for e in es) == {'A': len(es)//2, 'B': len(es)//2}
    assert result['wins']+result['losses']+result['draws']+result['timeouts']==len(rows)
    return result


old_specs, old_rows = [], []
for folder in ['astralite-balance','astralite-balance-plus']:
    cs, rs = load(ROOT / 'outputs' / folder)
    old_specs.extend(cs); old_rows.extend(rs)
specs, after_rows = load(OUT / 'after',2)
spaced_specs, spaced_rows = load(OUT / 'spaced',2)
old_by_key = {(r['caseId'],r['index']):r for r in old_rows}
cases = []
for c in specs:
    after = sorted((r for r in after_rows if r['caseId']==c['id']),key=lambda r:r['index'])
    before = [old_by_key[(c['id'],r['index'])] for r in after]
    assert c == next(s for s in old_specs if s['id']==c['id']), 'Changed starting specification'
    assert all(a['seed']==b['seed'] and own(a)['side']==own(b)['side'] for a,b in zip(after,before))
    assert {e['id']:e['initialStats'] for e in after[0]['entities']} == {e['id']:e['initialStats'] for e in before[0]['entities']}
    before_summary, after_summary = summarize(before), summarize(after)
    same = lambda r: (r['end'],r['winner'],r['durationMs'],[(e['id'],e['hpEnd'],e['damage'],e['heal'],e['details'].get('procs',{})) for e in r['entities']])
    unchanged = sum(same(a)==same(b) for a,b in zip(after,before))
    cases.append({**c,'before':before_summary,'after':after_summary,'identicalOutcomes':unchanged,
                  'wonBeforeLostAfter':sum(won(b) and not won(a) for a,b in zip(after,before)),
                  'wonAfterNotBefore':sum(won(a) and not won(b) for a,b in zip(after,before))})
spaced = [{**c,'after':summarize([r for r in spaced_rows if r['caseId']==c['id']])} for c in spaced_specs]
by_id = {c['id']:c for c in cases+spaced}
pairs = []
for nature in ['physicalDamage','magicalDamage']:
    pairs.extend([(nature+'-f50',nature+'-a50f50'),(nature+'-f99',nature+'-a1f99'),
                  (nature+'-plus50-a0',nature+'-plus50-a50')])
pairs.extend([('spaced-fixed-a0','spaced-fixed-a1'),('spaced-plus-a0','spaced-plus-a1')])
comparisons = []
for alone, umbra in pairs:
    a,u = by_id[alone]['after'],by_id[umbra]['after']
    rows_a = {r['index']:r for r in after_rows+spaced_rows if r['caseId']==alone}
    rows_u = {r['index']:r for r in after_rows+spaced_rows if r['caseId']==umbra}
    assert rows_a.keys()==rows_u.keys()
    examples = []
    for i,r in rows_a.items():
        t=rows_u[i]
        if won(r) and not won(t):
            examples.append({'index':i,'seed':r['seed'],'standalone':r,'umbra':t})
    comparisons.append({'standalone':alone,'umbra':umbra,'winsAlone':a['wins'],'winsUmbra':u['wins'],'n':a['n'],
                        'winDeltaPoints':u['winRate']-a['winRate'],
                        'durationDeltaSeconds':u['durationSeconds']-a['durationSeconds'],
                        'lostWinningSeeds':len(examples),'examples':examples})

baseline = read(ROOT / 'outputs/astralite-balance/summary.json')
proof = {}
for f in ['docs/js/data/umbraProgression.js','docs/js/damagesCalcul.js','docs/js/attackEffectMecanics.js',
          'docs/js/entityAttributs.js','docs/js/combatSimulation.js']:
    saved = ROOT / 'outputs/astralite-cooldown/before' / f
    reference = saved if saved.exists() else ROOT/f
    assert hashlib.sha256(reference.read_bytes()).hexdigest()==baseline['sourceSha256'][f], f
    proof[f] = {'before':baseline['sourceSha256'][f],'current':hashlib.sha256((ROOT/f).read_bytes()).hexdigest()}
data = {'createdAt':datetime.datetime.now().astimezone().isoformat(),'replayedCombats':len(after_rows),
        'additionalCombats':len(spaced_rows),'newCombatsTotal':len(after_rows)+len(spaced_rows),
        'sourceHashes':proof,'cases':cases,'additionalCases':spaced,'comparisons':comparisons}
(OUT/'comparison.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')


def fmt(value,digits=2):
    return f'{value:.{digits}f}'.replace('.',',')


def table(headers,rows):
    return '<div class="scroll"><table><thead><tr>'+''.join(f'<th>{html.escape(h)}</th>' for h in headers)+'</tr></thead><tbody>'+''.join(
        '<tr>'+''.join(f'<td>{v}</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>'


changes = table(['Configuration','n','Victoires avant','Victoires après','Durée avant → après','Soins avant → après','Survies avant → après'],[
    [html.escape(c['name']),c['after']['n'],f"{c['before']['wins']}/{c['before']['n']}",f"{c['after']['wins']}/{c['after']['n']}",
     fmt(c['before']['durationSeconds'])+' → '+fmt(c['after']['durationSeconds'])+' s',
     fmt(c['before']['heal'])+' → '+fmt(c['after']['heal'])+' HP',
     fmt(c['before']['procs']['astrality'])+' → '+fmt(c['after']['procs']['astrality'])] for c in cases])
cadence = table(['Configuration','Chance de survie','Victoires','Défaites / doubles KO','Durée moyenne','Soins moyens'],[
    [html.escape(c['name']),fmt(c['after']['initialStats']['fatalSurvival'])+' %',f"{c['after']['wins']}/{c['after']['n']}",
     f"{c['after']['losses']} / {c['after']['draws']}",fmt(c['after']['durationSeconds'])+' s',fmt(c['after']['heal'])+' HP'] for c in spaced])
pair_table = table(['Stat autonome seule','Avec Astralité','Victoires seules → Umbra','Écart de durée moyenne'],[
    [html.escape(by_id[c['standalone']]['name']),html.escape(by_id[c['umbra']]['name']),
     f"{c['winsAlone']}/{c['n']} → {c['winsUmbra']}/{c['n']}",fmt(c['durationDeltaSeconds'])+' s'] for c in comparisons])
details=[]
for c in cases+spaced:
    sections=[]
    for phase in ['before','after']:
        if phase not in c:continue
        r=c[phase]
        sections.append([('Avant' if phase=='before' else 'Après'),r['wins'],r['losses'],r['draws'],r['timeouts'],
                         fmt(r['damage']),fmt(r['heal']),fmt(r['hpEnd']),fmt(r['durationSeconds']),
                         '–'.join(fmt(v,1) for v in r['winInterval95'])+' %'])
    details.append('<details><summary>'+html.escape(c['name'])+'</summary>'+table(
        ['Version','Victoires','Défaites','Doubles KO','Hors durée','Dégâts infligés','Soins reçus','HP finaux','Durée (s)','Intervalle victoire 95 %'],sections)+'</details>')
examples=[]
for comparison in comparisons:
    if not comparison['standalone'].startswith('spaced'):continue
    matching=[e for e in comparison['examples'] if own(e['umbra'])['details'].get('procs',{}).get('astrality',0)>0]
    if matching:
        e=matching[0];a,u=own(e['standalone']),own(e['umbra'])
        examples.append(f'<p><strong>{html.escape(by_id[comparison["standalone"]]["name"])}, essai {e["index"]+1}, graine {e["seed"]}.</strong> '
                        f'Seule : {a["details"]["procs"].get("astrality",0)} sauvetages et victoire à {fmt(e["standalone"]["durationMs"]/1000)} s. '
                        f'Avec Astralité : {u["details"]["procs"].get("astrality",0)} sauvetage, {u["heal"]} HP soignés, puis défaite à {fmt(e["umbra"]["durationMs"]/1000)} s.</p>')
umbra_cases=[c for c in cases if c['stats'].get('astrality',0)>0]
unchanged=sum(c['identicalOutcomes'] for c in umbra_cases)
umbra_n=sum(c['count'] for c in umbra_cases)
timeouts=sum(c['after']['timeouts'] for c in cases+spaced)
normal99=by_id['physicalDamage-f99']
report=f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Astralité — comparaison avant/après cooldown de 2 secondes</title>
<style>:root{{color-scheme:dark;background:#11131c;color:#ecebf2;font-family:system-ui,sans-serif}}body{{max-width:1360px;margin:auto;padding:28px 22px;line-height:1.6}}
h1{{line-height:1.2}}h2{{color:#c9b1ff;margin-top:36px}}a{{color:#bcd9ff}}.lead{{padding:18px 22px;border-left:4px solid #e5ac55;background:#292336}}
.muted{{color:#aeb8ca}}.scroll{{overflow:auto;margin:18px 0}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{border-bottom:1px solid #363949;padding:11px;text-align:right;white-space:nowrap}}
th{{background:#1d1f2c;color:#cab5f1}}td:first-child,th:first-child{{text-align:left;white-space:normal;min-width:230px}}details{{padding:14px;border:1px solid #363949;border-radius:6px;margin:12px 0}}summary{{cursor:pointer;font-weight:600}}li{{margin:6px 0}}</style>
<main><h1>Astralité : le cooldown de 2 secondes suffit-il ?</h1>
<p class="muted">{html.escape(data['createdAt'])} · {data['replayedCombats']} combats rejoués à l’identique + {data['additionalCombats']} combats complémentaires = {data['newCombatsTotal']} nouveaux combats.</p>
<div class="lead"><strong>Oui, acquérir Astralité peut encore faire perdre un combat que la stat autonome permettait de gagner.</strong>
Le cooldown supprime l’enchaînement immédiat des sauvegardes autonomes. Il reste cependant plus court que Retour astral.
Des coups espacés de plus de 2 secondes peuvent donc autoriser plusieurs sauvegardes autonomes, tout en tuant l’entité qui a pris l’Umbra.</div>
<p><a href="comparison.json" download>Données complètes avant/après</a> · <a href="after/trials.jsonl" download>Combats rejoués</a> ·
<a href="spaced/trials.jsonl" download>Combats à cadence complémentaire</a> · <a href="../astralite-balance/rapport-astralite.html">Rapport précédent</a></p>

<h2>1. Comparaison sur les mêmes duels qu’avant</h2>
<p>À caractéristiques, graines et côtés identiques, Survie fatale fixe à 99 % contre le combattant physique passe de
<strong>{normal99['before']['wins']}/{normal99['before']['n']} à {normal99['after']['wins']}/{normal99['after']['n']} victoires</strong>.
Dans ce duel, les coups sont espacés d’environ 1,931 seconde : le coup suivant arrive pendant le nouveau cooldown.
Le cas à 99 % sert de test extrême ; il ne suppose pas qu’un tel total soit accessible en progression ordinaire.</p>
{changes}
<p>Les configurations déjà dotées d’Astralité gardent leur fonctionnement : {unchanged}/{umbra_n} essais retrouvent les mêmes issues,
durées, HP finaux, dégâts, soins et déclenchements qu’avant. Les deux secondes ne s’ajoutent pas à Retour astral.</p>

<h2>2. Le cas qui reste défavorable à l’Umbra</h2>
<p>Nouvelle cadence contrôlée : même duel physique, mais ATB adverse passée de 1 300 à 1 700 ms. Les impacts sont espacés d’environ
<strong>2,331 secondes</strong>. Le sujet garde 400 HP, Force 50 et Intelligence 50. On compare 30 % de Survie fatale fixe ou 10 points de Survie fatale +,
avec et sans un point d’Astralité.</p>{cadence}
<p>Avec Force 50, Astralité 1 déclenche environ <strong>62 HP de soin sur 4,68 secondes</strong>.
Sur les 2,331 secondes précédant le coup suivant, cela rend environ 30 HP ; le coup physique du scénario vaut 58.
Le soin ne suffit pas, et Survie fatale reste bloquée. La version autonome a déjà terminé ses deux secondes et peut tirer de nouveau.</p>
{''.join(examples)}
<p>Le bonus d’Intelligence est conservé : 10 points de Survie fatale + donnent ici environ 29,88 % de chance. Avec Astralité 1,
la chance totale augmente, mais la fenêtre d’indisponibilité augmente aussi.</p>

<h2>3. Résistance moyenne et capacité à gagner sont deux lectures différentes</h2>{pair_table}
<p>Une Umbra peut augmenter la durée moyenne de survie grâce à une meilleure chance initiale et au soin, tout en supprimant certaines victoires
obtenues par deux sauvegardes successives. Un score unique de « résistance » masquerait ce compromis.
Les durées sont celles des combats : quand le sujet gagne, sa survie est seulement observée jusqu’à la victoire, pas jusqu’à une mort future.</p>
<p>Face à la magie pure, Corps astral apporte une autre protection. Les résultats magiques ne se transposent donc pas directement au physique.</p>

<h2>4. Résultats détaillés</h2>
<p>Valeurs moyennes par combat pour le sujet. Doubles KO distincts des défaites ; {timeouts} combat(s) ayant atteint la limite de 90 secondes.
Les intervalles de Wilson à 95 % montrent l’incertitude sur les taux, pas la diversité des situations du jeu.</p>{''.join(details)}

<h2>5. Méthode et limites</h2>
<ul><li>Moteur réel : capture du board puis simulateur de combat existant ; mêmes attaques, phases, natures, arrondis et procs.
Les archétypes automatiques sont neutralisés dans le montage ; les statistiques initiales sont vérifiées.</li>
<li>Les douze configurations historiques portant sur la stat autonome fixe ou + et Astralité sont rejouées : 360 combats.
Les résultats avant cooldown proviennent des fichiers archivés, sans réécriture. Les 128 essais complémentaires sont quatre nouvelles configurations de 32 combats chacune.</li>
<li>Les graines sont identiques entre configurations et les côtés alternent. Ajouter une Umbra change la consommation de hasard :
les jets ne restent pas identiques action par action. Le mécanisme de cooldown est donc analysé avec les résultats, les délais réels et les compteurs de déclenchement.</li>
<li>Les empreintes des calculs et du moteur correspondent à la version archivée avant modification, ou aux copies conservées avant ajout du cooldown.
La comparaison contrôle aussi l’égalité des statistiques initiales de chaque entité.</li>
<li>Ces essais montrent l’existence d’un cas défavorable ; ils ne mesurent ni sa fréquence dans toutes les armées du jeu,
ni la rareté réelle des acquisitions autonomes. Aucun classement marginal « +1 » de toutes les stats n’a été lancé.</li></ul>

<h2>Conclusion</h2>
<p><strong>Les deux secondes corrigent l’abus des coups mortels enchaînés, mais ne garantissent pas qu’acquérir Astralité soit toujours avantageux.</strong>
La fenêtre restante est simple : délai entre deux coups supérieur à 2 secondes, mais inférieur à la fin de Retour astral, et soin insuffisant pour encaisser le suivant.</p>
<p>Si l’objectif est de supprimer toute régression à l’acquisition, il faudra harmoniser les règles de disponibilité de la stat autonome et de l’Umbra,
ou accepter explicitement ce compromis. Aucun réglage ni calcul du jeu n’a été modifié dans cette comparaison.</p>
</main></html>'''
(OUT/'comparaison.html').write_text(report,encoding='utf-8')
print(f"{data['newCombatsTotal']} nouveaux combats ; {timeouts} hors duree ; {unchanged}/{umbra_n} essais Umbra identiques a avant.")
for c in cases:
    print(c['id'],c['before']['wins'],'->',c['after']['wins'],'/',c['after']['n'],
          'duration',round(c['before']['durationSeconds'],3),'->',round(c['after']['durationSeconds'],3))
for c in comparisons:
    print(c['standalone'],'vs',c['umbra'],c['winsAlone'],'->',c['winsUmbra'],'/',c['n'],
          'duration delta',round(c['durationDeltaSeconds'],3),'lost winning seeds',c['lostWinningSeeds'])
