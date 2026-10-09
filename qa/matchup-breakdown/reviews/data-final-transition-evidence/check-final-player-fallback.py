#!/usr/bin/env python3
"""Independent final-boxscore oracle. Does not import production builders/UI."""
import argparse
import collections
import csv
import decimal
import hashlib
import json
from pathlib import Path

D = decimal.Decimal
BASE_FIELDS = {'completions', 'attempts', 'passingYards', 'passingTD', 'interceptions',
               'sacks', 'sackYardsLost', 'carries', 'rushingYards', 'rushingTD',
               'receptions', 'targets', 'receivingYards', 'receivingTD', 'fumbles', 'fumblesLost'}
MAPPING = {
    'passing': {'YDS': 'passingYards', 'TD': 'passingTD', 'INT': 'interceptions'},
    'rushing': {'CAR': 'carries', 'YDS': 'rushingYards', 'TD': 'rushingTD'},
    'receiving': {'REC': 'receptions', 'YDS': 'receivingYards', 'TD': 'receivingTD', 'TGTS': 'targets'},
    'fumbles': {'FUM': 'fumbles', 'LOST': 'fumblesLost'},
}
PRIMARY_FIELDS = {'completions':'completions', 'attempts':'attempts', 'passingYards':'passing_yards',
                  'passingTD':'passing_tds', 'interceptions':'passing_interceptions', 'sacks':'sacks_suffered',
                  'sackYardsLost':'sack_yards_lost', 'carries':'carries', 'rushingYards':'rushing_yards',
                  'rushingTD':'rushing_tds', 'receptions':'receptions', 'targets':'targets',
                  'receivingYards':'receiving_yards', 'receivingTD':'receiving_tds',
                  'fumbles':'fumbles_total', 'fumblesLost':'fumbles_lost_total'}


def sha(body):
    return hashlib.sha256(body).hexdigest()


def read_oracle(summary, dataset):
    header = summary['header']
    event = str(header['id'])
    competition = header['competitions'][0]
    assert competition['status']['type']['completed'] is True
    assert competition['status']['type']['state'] == 'post'
    assert int(header['season']['type']) == 2
    game_id = '2026_05_TB_DAL'
    assert event == '401872980' and int(header['season']['year']) == 2026
    assert int(header['week']) == 5
    expected = {}
    team_totals = {}
    excluded = []
    for team in summary['boxscore']['players']:
        abbr = team['team']['abbreviation']
        assert abbr in {'DAL', 'TB'}
        identities = {str(p.get('espnId')): p for p in dataset['teams'][abbr]['players'].values()
                      if p.get('espnId')}
        club_expected = {}
        totals = collections.Counter()
        for category in team['statistics']:
            kind = category['name']
            if kind not in MAPPING:
                continue
            labels = category['labels']
            assert len(labels) == len(set(labels))
            for athlete in category['athletes']:
                assert len(athlete['stats']) == len(labels)
                espn_id = str(athlete['athlete']['id'])
                identity = identities.get(espn_id)
                if identity is None:
                    excluded.append({'team': abbr, 'espnId': espn_id, 'category': kind,
                                     'name': athlete['athlete']['displayName']})
                    continue
                row = club_expected.setdefault(identity['id'], {'team': abbr, 'gameId': game_id,
                    'playerId': identity['id'], 'espnId': espn_id, 'name': identity['name'],
                    'categories': [], 'reported': {}, 'unreported': []})
                row['categories'].append(kind)
                values = dict(zip(labels, athlete['stats']))
                counts = {field: int(D(values[label])) for label, field in MAPPING[kind].items()}
                if kind == 'passing':
                    completed, attempted = values['C/ATT'].split('/')
                    sacks, lost = values['SACKS'].split('-', 1)
                    counts.update(completions=int(completed), attempts=int(attempted),
                                  sacks=int(sacks), sackYardsLost=abs(int(lost)))
                for field, value in counts.items():
                    assert field not in row['reported']
                    row['reported'][field] = value
                    totals[field] += value
        for row in club_expected.values():
            row['unreported'] = sorted(BASE_FIELDS - row['reported'].keys())
        expected[abbr] = club_expected
        team_totals[abbr] = dict(totals)
    assert len(expected['DAL']) == 11 and len(expected['TB']) == 9
    assert excluded == [{'team': 'TB', 'espnId': '4602648', 'category': 'fumbles', 'name': 'Kevin Knowles'}]
    for abbr, known in {'DAL': {'completions': 24, 'attempts': 42, 'passingYards': 316,
                               'carries': 13, 'rushingYards': 50, 'receptions': 24, 'receivingYards': 316, 'targets': 42},
                        'TB': {'completions': 19, 'attempts': 25, 'passingYards': 189,
                               'carries': 39, 'rushingYards': 241, 'receptions': 19, 'receivingYards': 189, 'targets': 25}}.items():
        assert all(team_totals[abbr][key] == value for key, value in known.items())
    for team in summary['boxscore']['teams']:
        abbr = team['team']['abbreviation']
        actual = {item['name']: item['displayValue'] for item in team['statistics']}
        totals = team_totals[abbr]
        assert totals['passingYards'] - totals['sackYardsLost'] == int(actual['netPassingYards'])
        assert totals['rushingYards'] == int(actual['rushingYards'])
        assert totals['carries'] == int(actual['rushingAttempts'])
        assert totals['receptions'] == totals['completions']
        assert totals['receivingYards'] == totals['passingYards']
        assert totals['targets'] == totals['attempts']
    return expected, team_totals, excluded


def validate(summary, dataset, expected, primary=None):
    assertions = 0
    sources = {source['id']: source for source in dataset['sources']}
    for abbr, expected_players in expected.items():
        for player_id, oracle in expected_players.items():
            player = dataset['teams'][abbr]['players'][player_id]
            matches = [r for r in player['gameLog'] if r['gameId'] == oracle['gameId'] and r['team'] == abbr]
            assert len(matches) == 1, (abbr, player_id, 'missing/duplicate final row')
            row = matches[0]
            assertions += 1
            for field, value in oracle['reported'].items():
                assert row['stats'].get(field) == value, (abbr, player_id, field, row['stats'].get(field), value)
                assertions += 1
            for field in oracle['unreported']:
                if primary is not None and player_id in primary:
                    raw = primary[player_id][PRIMARY_FIELDS[field]]
                    value = None if raw == '' else float(D(raw))
                    if field == 'sackYardsLost' and value is not None:
                        value = abs(value)
                    assert row['stats'].get(field) == value, (abbr, player_id, field, 'primary reported value must be preserved', value)
                else:
                    assert row['stats'].get(field) is None, (abbr, player_id, field, 'unreported must remain null')
                assertions += 1
            assert row['appearance']['status'] == 'recorded'
            assert row['provenance']['season'] == 2026 and row['provenance']['week'] == 5
            if primary is None:
                assert any(key.startswith(('espn_matchup_summary_', 'espn_fixture_summary_')) and
                           key.endswith('401872980') and sources[key]['status'] == 'verified' for key in row['sourceIds'])
                assert all(value is None for value in row['advanced'].values())
            else:
                assert 'nflverse_player_stats' in row['sourceIds']
                assert sources['nflverse_player_stats']['status'] == 'verified'
            assertions += 4
            if player['position'] == 'QB':
                assert row['started']['candidate'] is True
                if primary is None:
                    assert row['started']['value'] is None and row['started']['status'] == 'unavailable'
                else:
                    assert row['started']['value'] is True and row['started']['status'] == 'verified'
                    assert 'nflverse_games' in row['started']['sourceIds']
                assertions += 2
    if primary is not None:
        assert len(primary) == 22
        for player_id, raw in primary.items():
            abbr = raw['team']
            player = dataset['teams'][abbr]['players'][player_id]
            row = next(r for r in player['gameLog'] if r['gameId'] == '2026_05_TB_DAL' and r['team'] == abbr)
            for field, column in PRIMARY_FIELDS.items():
                value = None if raw[column] == '' else float(D(raw[column]))
                if field == 'sackYardsLost' and value is not None:
                    value = abs(value)
                assert row['stats'].get(field) == value, (abbr, player_id, field, value)
                assertions += 1
    return assertions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validate', action='store_true')
    parser.add_argument('--primary-csv', type=Path,
                        help='Actual newly published weekly NFL stats; explicit values supersede unavailable ESPN categories.')
    args = parser.parse_args()
    source_body, dataset_body = args.source.read_bytes(), args.dataset.read_bytes()
    summary, dataset = json.loads(source_body), json.loads(dataset_body)
    expected, totals, excluded = read_oracle(summary, dataset)
    primary = None
    if args.primary_csv:
        primary = {r['player_id']:r for r in csv.DictReader(args.primary_csv.open())
                   if r['game_id'] == '2026_05_TB_DAL' and r['season_type'] == 'REG'
                   and r['position'] in {'QB','RB','FB','WR','TE'}}
    count = validate(summary, dataset, expected, primary) if args.validate else 0
    report = {'status': 'passed' if args.validate else 'oracle-prepared-not-runtime-validation',
              'source': {'path': str(args.source), 'sha256': sha(source_body)},
              'dataset': {'path': str(args.dataset), 'sha256': sha(dataset_body)},
              'assertions': count, 'expectedPlayerCount': 20, 'expectedRows': expected,
              'teamCategoryTotals': totals, 'excludedDefensiveIdentity': excluded,
              'limits': ['No starter flags; attempts do not confirm a start.',
                         'Unreported categories and advanced fields remain null, not invented zero.',
                         'Statistical row GP does not confirm physical participation.',
                         'Gross player passing corroborates team net passing after sack loss.',
                         'No production imports or runtime selectors used.']}
    if args.primary_csv:
        report['primarySource'] = {'path': str(args.primary_csv), 'sha256':sha(args.primary_csv.read_bytes()),
                                   'offensiveRows':len(primary), 'semantics':'Source-published NFL category zeros remain factual; neither ESPN category absence nor participation is guessed. Schedule-designated role plus primary weekly row follows existing role contract.'}
        report['limits'][0] = 'ESPN has no starter flags; primary NFL weekly rows and explicitly defined NFL schedule role are audited separately.'
        report['limits'][1] = 'Unreported categories remain null for ESPN-only fallback; current primary NFL published values, including explicit zeros, are preserved.'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as handle:
        handle.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'assertions': count, 'players': 20,
                      'output': str(args.output), 'sha256': sha(args.output.read_bytes())}))


if __name__ == '__main__':
    main()
