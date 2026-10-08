#!/usr/bin/env python3
"""Independently audit captured numeric browser outcomes with Decimal arithmetic."""
import argparse
import datetime as dt
import decimal
import hashlib
import json
from pathlib import Path

D = decimal.Decimal
BASE = Path(__file__).resolve().parents[4]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def value(raw):
    return D(str(raw)) if isinstance(raw, (int, float)) and not isinstance(raw, bool) else None


def match(actual, expected, label):
    if expected is None:
        assert actual == '—', f'{label}: missing source value must remain unavailable'
        return
    shown = D(actual.replace(',', '').replace('%', '').replace('−', '-'))
    assert abs(shown - expected) < D('0.050000001'), f'{label}: {actual} != {expected}'


def aggregate(values, mode):
    if not values or any(v is None for v in values):
        return None
    return sum(values, D(0)) / (D(len(values)) if mode == 'average' else D(1))


def projection(scenario):
    c = scenario['controls']
    return {
        'viewport': scenario['viewport'],
        'filters': [{
            'selection': f['selection'], 'gameIds': f['gameIds'],
            **{mode: {
                'items': [{k: i[k] for k in ['metric', 'side', 'text']} for i in f[mode]['items']],
                'snapshot': [{k: i[k] for k in ['metric', 'text', 'coverage']} for i in f[mode]['snapshot']],
            } for mode in ['average', 'total']},
        } for f in c['filterCases']],
        'reports': [{'id': v['id'], 'metrics': v['metrics']} for v in c['gameReports']],
        'playerDisclosures': c['playerDisclosures'],
        'schedule': [{'id': s['id'], 'action': s['action'], 'metrics': s.get('metrics')} for s in c['schedule']],
    }


def audit(report_path, manifest_path, output_path, comparison_path=None):
    data_path = BASE / 'assets/data/team-details.json'
    data = json.loads(data_path.read_text())
    dal = data['teams']['DAL']
    by_id = {g['id']: g for g in dal['games']}
    manifest = json.loads(manifest_path.read_text())
    report = json.loads(report_path.read_text())
    assert report['status'] == 'passed'
    assert report['unchangedDuringQA'] and report['testLogicUnchangedDuringQA']
    assert report['source']['runtimeFiles'] == manifest
    assert report['source']['teamFormHash'] == sha(data_path)
    assert all(sha(BASE / name) == expected for name, expected in manifest.items())
    counts = dict(filterSelections=0, yardCells=0, snapshotCells=0, reportMetricCells=0,
                  playerHistoryCells=0, scheduleEvents=0, visibleControlsInventoried=0)
    scenarios = []
    metrics = ['netPassing', 'rushing', 'totalOffense', 'thirdDownMade', 'thirdDownAttempts',
               'redZoneTD', 'redZoneAttempts', 'turnovers', 'penaltyYards']

    def opponent(game):
        return game['away_team'] if game['home_team'] == 'DAL' else game['home_team']

    def own(game):
        return game['stats']['DAL']

    def other(game):
        return game['stats'][opponent(game)]

    def venue(game):
        return 'neutral' if game['neutral'] else 'home' if game['home_team'] == 'DAL' else 'away'

    for scenario in report['results']:
        assert scenario['status'] == 'passed'
        assert all(not entries for entries in scenario['errors'].values())
        c = scenario['controls']
        assert c['status'] == 'passed' and c['coverage']['untested'] == []
        counts['visibleControlsInventoried'] += len(c['inventory'])
        for case in c['filterCases']:
            s = case['selection']
            rows = [g for g in dal['games'] if g['status'] == 'final'
                    and (s['season'] == 'cross' or g['season'] == data['season'])
                    and (s['venue'] == 'all' or venue(g) == s['venue'])]
            rows = sorted(rows, key=lambda g: (g['gameday'], g['id']), reverse=True)[:int(s['window'])]
            assert case['gameIds'] == [g['id'] for g in rows]
            counts['filterSelections'] += 1
            for mode in ['average', 'total']:
                for cell in case[mode]['items']:
                    vals = [value((other(g) if cell['side'] == 'allowed' else own(g)).get(cell['metric'])) for g in rows]
                    match(cell['text'], aggregate(vals, mode), 'yard ' + cell['metric'])
                    counts['yardCells'] += 1
                for cell in case[mode]['snapshot']:
                    key = cell['metric']
                    if key in ['thirdDown', 'redZoneTD']:
                        numerator, denominator = ('thirdDownMade', 'thirdDownAttempts') if key == 'thirdDown' else ('redZoneTD', 'redZoneAttempts')
                        ns = [value(own(g).get(numerator)) for g in rows]
                        ds = [value(own(g).get(denominator)) for g in rows]
                        expected = None if not ns or any(x is None for x in ns + ds) or sum(ds, D(0)) == 0 else D(100) * sum(ns, D(0)) / sum(ds, D(0))
                    else:
                        vals = []
                        for g in rows:
                            if key in ['pointsFor', 'pointsAgainst']:
                                score = 'home_score' if (g['home_team'] == 'DAL') == (key == 'pointsFor') else 'away_score'
                                vals.append(value(g[score]))
                            elif key == 'turnoverMargin':
                                a, b = value(other(g).get('turnovers')), value(own(g).get('turnovers'))
                                vals.append(None if a is None or b is None else a - b)
                            else:
                                vals.append(value(own(g).get(key)))
                        expected = aggregate(vals, mode)
                    match(cell['text'], expected, 'snapshot ' + key)
                    counts['snapshotCells'] += 1
        for displayed in c['gameReports']:
            game = by_id[displayed['id']]
            assert len(displayed['metrics']) == len(metrics)
            for field, cells in zip(metrics, displayed['metrics']):
                for side, stats in enumerate([own(game), other(game)]):
                    match(cells[side + 1], value(stats.get(field)), 'report ' + game['id'] + '/' + field)
                    counts['reportMetricCells'] += 1
        assert len(c['playerDisclosures']) == len(dal['roster']) == 83
        for displayed, player in zip(c['playerDisclosures'], dal['roster']):
            assert displayed['name'] == player['name']
            assert len(displayed['historyRows']) == len(player.get('last5', []))
            for cells, game in zip(displayed['historyRows'], player.get('last5', [])):
                assert cells[0] == f"{game['season']} W{game['week']} · {game.get('team') or 'DAL'} vs {game['opponent']}"
                for index, key in enumerate(['passingYards', 'rushingYards', 'receivingYards', 'offensiveTD']):
                    expected = game['stats'].get(key, game['stats'].get('totalTD') if key == 'offensiveTD' else None)
                    match(cells[index + 1], value(expected), 'player ' + player['name'] + '/' + key)
                    counts['playerHistoryCells'] += 1
        scheduled = [g for g in dal['games'] if g['season'] == data['season']]
        assert {g['id'] for g in c['schedule']} == {g['id'] for g in scheduled}
        counts['scheduleEvents'] += len(c['schedule'])
        for event in c['schedule']:
            assert event['action'] == ('report' if by_id[event['id']]['status'] == 'final' else 'matchup')
        refresh = c['manualRefresh']
        assert refresh['status'] in (200, 304) and refresh['focusPreserved']
        assert all(n['exists'] and n['connected'] and n['same'] for n in refresh['domIdentity']['nodes'])
        assert any(e['changed'] is False for e in refresh['domIdentity']['events'])
        scenarios.append({'viewport': scenario['viewport'], 'nativeActions': len(c['nativeClicks']),
                          'filterCombinations': len(c['filterCases']), 'reports': len(c['gameReports']),
                          'playerDisclosures': len(c['playerDisclosures']), 'scheduleEvents': len(c['schedule']),
                          'untested': [], 'unchangedRefresh': refresh, 'errors': scenario['errors']})
    routes = report['results'][0].get('allTeamRoutes')
    if routes is not None:
        assert routes['status'] == 'passed' and len(routes['results']) == 32
        for row in routes['results']:
            team = data['teams'][row['team']]
            assert ' '.join(row['heading'].split()).upper() == team['fullName'].upper()
            assert row['upcomingEvent'] is None or any(g['id'] == row['upcomingEvent'] and g['status'] == 'scheduled' for g in team['games'])
            assert all(url in {s['url'] for s in data['sources']} for url in row['sourceLinks'])
    comparison = None
    if comparison_path:
        prior = json.loads(comparison_path.read_text())
        prior_scenarios = {tuple(x['viewport'].values()): x for x in prior['results']}
        assert all(projection(x) == projection(prior_scenarios[tuple(x['viewport'].values())]) for x in report['results'])
        comparison = {'file': str(comparison_path.relative_to(BASE)), 'sha256': sha(comparison_path),
                      'actualNumericAndEventProjectionExactlyEqual': True}
    receipt = {'status': 'passed', 'auditedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
               'reviewer': 'team_data_audit', 'scope': 'Independent Decimal computations of actual browser cells and event/player identities; JS test expected fields are not trusted',
               'report': {'file': str(report_path.relative_to(BASE)), 'sha256': sha(report_path)},
               'runtimeManifest': {'file': str(manifest_path.relative_to(BASE)), 'sha256': sha(manifest_path), 'files': len(manifest)},
               'datasetSha256': sha(data_path), 'counts': counts, 'scenarios': scenarios,
               'allTeamRoutes': {'status': routes['status'], 'count': len(routes['results'])} if routes else None,
               'priorOutcomeComparison': comparison, 'failures': []}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    assert not output_path.exists(), 'Evidence receipts are immutable'
    output_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'status': receipt['status'], 'receipt': str(output_path.relative_to(BASE)),
                      'sha256': sha(output_path), 'counts': counts}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('report', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--manifest', type=Path, default=BASE / 'qa/team-details/candidate-runtime-manifest-iteration-5.json')
    parser.add_argument('--compare', type=Path)
    args = parser.parse_args()
    audit(args.report.resolve(), args.manifest.resolve(), args.output.resolve(), args.compare.resolve() if args.compare else None)
