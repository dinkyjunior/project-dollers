"""Read-only immutable 5144 -> 1b source delta and combined reviewed chain.

This does not rerun a production updater or relabel older browser/source evidence.
"""
import ast
import collections
import csv
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PACK = Path('/workspace/recovery-qa/home-gem-source-integration-current')
BEFORE = '5144cd67d0b4a002eed44122f56280942fb22eba'
INCOMING = '1b7679f8c259e811b53d966768ae2abaf2b818e4'
FILES = ['current.json', 'provenance.json', 'player-history.json', 'team-details.json', 'matchup-breakdown.json']
OUT = ROOT/'qa/home-gem/reviews/source-integration-current-review.json'
checks = collections.Counter()
failures = []

def sha(body):
    return hashlib.sha256(body).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def check(ok, kind, context=None):
    checks[kind] += 1
    if not ok:
        failures.append({'check': kind, 'context': context})

prior_helper = ROOT/'qa/home-gem/reviews/audit-source-integration.py'
for statement in ast.parse(prior_helper.read_text()).body:
    if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('META', 'UNORDERED') for t in statement.targets):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))
    if isinstance(statement, ast.FunctionDef) and statement.name in ('normalize', 'differences'):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))

prior_path = ROOT/'qa/home-gem/reviews/source-integration-5144-review-v2.json'
prior = json.loads(prior_path.read_text())
check(prior['status'] == 'passed' and not prior['failures'] and prior['assertions'] == 6054,
      'Prior6054AssertionReviewAcceptedWithoutRewriting')
check(prior['auditHelperSha256'] == sha((ROOT/'qa/home-gem/reviews/audit-source-integration-5144.py').read_bytes()),
      'PriorAuditHelperExactIdentity')
books, hashes = {}, {}
for side, commit in [('before', BEFORE), ('incoming', INCOMING)]:
    books[side], hashes[side] = {}, {}
    for name in FILES:
        body = subprocess.check_output(['git', 'show', commit+':assets/data/'+name], cwd=ROOT)
        check(body == (PACK/side/name).read_bytes(), 'ExactImmutableCommitBody', {'side': side, 'file': name})
        books[side][name] = json.loads(body)
        hashes[side][name] = sha(body)
        if side == 'incoming':
            check((ROOT/'assets/data'/name).read_bytes() == body, 'CurrentWorktreeExactLatestIncoming', name)
check(prior['snapshotHashes']['incoming'] == hashes['before'], 'PriorIncomingExactlyCurrentDeltaBase')

before = books['before']['matchup-breakdown.json']
incoming = books['incoming']['matchup-breakdown.json']
old_sources = {s['id']: s for s in before['sources']}
new_sources = {s['id']: s for s in incoming['sources']}
check(old_sources.keys() == new_sources.keys(), 'SameSourceIdentitySet')
alias = {'espn_fixture_summary_401872980': 'espn_matchup_summary_401872980'}
for a, b in alias.items():
    check(old_sources[a]['url'] == old_sources[b]['url'] == new_sources[a]['url'] == new_sources[b]['url'] and new_sources[a]['url'].endswith('event=401872980'),
          'FinalEventAliasAlwaysExactSameProviderURLAndIdentity')

def normalized(value):
    if isinstance(value, dict):
        return {k: normalized(v) for k,v in normalize(value).items()}
    if isinstance(value, list):
        return [normalized(v) for v in value]
    return alias.get(value, value) if isinstance(value, str) else value

raw, material = [], []
for name in FILES:
    raw.extend(differences(books['before'][name], books['incoming'][name], name))
    material.extend(differences(normalized(books['before'][name]), normalized(books['incoming'][name]), name))
allowed_hash_paths = {'current.json/playerHistory/currentSourceHashes/nflverse_games', 'player-history.json/currentSourceHashes/nflverse_games'}
check({r['path'] for r in material} == allowed_hash_paths and len(material) == 2,
      'OnlyTwoPrimaryBodyHashReferencesRemainAfterExplicitMetadataAndSameEventAlias', material)
for row in material:
    check(row['before'] == old_sources['nflverse_games']['sha256'] and row['after'] == new_sources['nflverse_games']['sha256'],
          'NewGameBodyHashReferencesActuallyBindExactSourceRecords', row)

for team in before['teams']:
    a,b = before['teams'][team], incoming['teams'][team]
    check(set(a['players']) == set(b['players']), 'All32ExactPlayerIdentitySets', team)
    check(normalized(a) == normalized(b), 'EveryTeamIdentityRosterGameStatInjuryDepthRoleFixtureFactEquivalent', team)
    for pid in a['players']:
        check(normalized(a['players'][pid]) == normalized(b['players'][pid]), 'EveryPlayerEntireFactsAndStatisticsEquivalent', {'team': team, 'playerId': pid})

math_helper = ROOT/'qa/matchup-breakdown/reviews/source-evidence/audit-final-basic-current-math.py'
tree = ast.parse(math_helper.read_text())
node = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'node' for t in n.targets))
states, outputs = {}, {}
for side in ['before', 'incoming']:
    body = subprocess.check_output(['node', '-e', node, str(PACK/side/'matchup-breakdown.json')], cwd=ROOT)
    states[side] = json.loads(body)
    outputs[side] = {'sha256': sha(body), 'states': len(states[side])}
    check(len(states[side]) == 1536, 'All32By48IndependentProjectionStates', side)
for a,b in zip(states['before'], states['incoming']):
    check(a == b, 'All1536EntireWindowLeaderGPNullRateQBRoleStartProjectionsExactlyEquivalent', {'team': a['team'], **a['options']})
check(outputs['before']['sha256'] == prior['independentModel']['outputs']['incoming']['sha256'], 'IndependentMathChainExactPriorOutputIdentity')

source_changes = [{'sourceId': sid, 'beforeSha256': old_sources[sid].get('sha256'), 'afterSha256': new_sources[sid].get('sha256'),
    'beforeRetrievedAt': old_sources[sid].get('retrievedAt'), 'afterRetrievedAt': new_sources[sid].get('retrievedAt')}
    for sid in sorted(old_sources) if old_sources[sid].get('sha256') != new_sources[sid].get('sha256')]
for sid, source in new_sources.items():
    check(source.get('tlsVerified') is not False and source.get('url', '').startswith('https://'), 'NoInsecurePublicRetrieval', sid)
    if sid.startswith('nflverse_') and sid != 'nflverse_games':
        check(old_sources[sid].get('sha256') == source.get('sha256'), 'AllPrimaryRosterInjuryDepthPlayerStatisticsHistoricalBodiesUnchanged', sid)
for sid in ['nflverse_roster', 'nflverse_injuries']:
    r = next(x for x in prior['publicCorroboration'] if x['sourceId'] == sid)
    body = gzip.decompress((ROOT/r['bodyPath']).read_bytes())
    check(r['httpStatus'] == 200 and r['tlsVerified'] and sha(body) == r['sha256'] == new_sources[sid]['sha256'],
          'ExistingIndependentPrimaryRawCorroborationStillExactlyMatchesLatestBody', sid)

games_receipt_path = ROOT/'qa/home-gem/reviews/source-evidence-current/nflverse_games.receipt.json'
games_receipt = json.loads(games_receipt_path.read_text())
games_raw = gzip.decompress((ROOT/games_receipt['bodyPath']).read_bytes())
check(games_receipt['httpStatus'] == 200 and games_receipt['tlsVerified'] and sha(games_raw) == games_receipt['sha256'] == new_sources['nflverse_games']['sha256'],
      'ActualIndependentTLSGamesCSVExactlyMatchesLatestSourceBody')
csv_games = {r['game_id']:r for r in csv.DictReader(games_raw.decode().splitlines())}
game_count = 0
for team in incoming['teams'].values():
    for game in team['games']:
        game_count += 1
        row = csv_games.get(game['id'])
        check(row is not None, 'EveryDisplayedScheduleGameExistsInActualPrimaryCSV', game['id'])
        if not row:
            continue
        literal = {'season': int(row['season']), 'week': int(row['week']), 'home_team': row['home_team'], 'away_team': row['away_team'],
                   'home_score': int(float(row['home_score'])) if row['home_score'] else None,
                   'away_score': int(float(row['away_score'])) if row['away_score'] else None}
        check(all(game[k] == v for k,v in literal.items()), 'EveryScheduleSeasonWeekTeamsAndScoreMatchesActualPrimaryCSV', {'gameId': game['id'], 'literal': literal})

known_path = ROOT/'qa/home-gem/iteration-3-chromium/results.json'
known = json.loads(known_path.read_text())
source_files = {'assets/data/'+name for name in FILES}
current_runtime = {p.relative_to(ROOT).as_posix():sha(p.read_bytes()) for p in [ROOT/'index.html', *sorted(p for p in (ROOT/'assets').rglob('*') if p.is_file())]}
nondata = {k:v for k,v in current_runtime.items() if k not in source_files}
check(len(nondata) == 240 and nondata == {k:v for k,v in known['runtimeManifest'].items() if k not in source_files}, 'All240HomeAndProtectedNondataRuntimeFilesExactA99b', {'count': len(nondata)})
runtime_id = sha(json.dumps(current_runtime,sort_keys=True,separators=(',',':')).encode())

receipt = {'status': 'failed' if failures else 'passed', 'auditedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'agent': '/root/home_gem_controls_audit', 'beforeCommit': prior['beforeCommit'], 'intermediateCommit': BEFORE, 'preservedIncomingCommit': INCOMING,
    'scope': 'Combined bounded immutable f1 -> 5144 -> 1b source review; actual worktree is latest 1b, every nondata runtime file matches reviewed a99b Home; no updater/browser/runtime mutations.',
    'snapshotHashes': {'before': prior['snapshotHashes']['before'], 'intermediate': hashes['before'], 'incoming': hashes['incoming']},
    'snapshotSha256': hashes['incoming']['matchup-breakdown.json'], 'runtimeManifestSha256': runtime_id,
    'priorSourceReview': {'path': prior_path.relative_to(ROOT).as_posix(), 'sha256': sha(prior_path.read_bytes()), 'assertions': prior['assertions'],
        'preservedSummary': 'One independently corroborated DAL cut; seven source jersey corrections and three roster statuses; newly available weekly practice evidence; seven independently corroborated DAL depth ranks. All retained numerical football facts and projections preserved.'},
    'delta5144ToCurrent': {'rawRecursiveChanges': len(raw), 'rawChangesSha256': sha(canonical(raw).encode()), 'remainingNormalizedChanges': material,
        'sameEventSourceAliases': alias, 'sourceBodyHashChanges': source_changes,
        'depthAsOfTimestampLeaves': sum(r['path'].endswith('/sourceTimestamp') and '/depth/players/' in r['path'] for r in raw),
        'providerPublicationTimestampLeaves': [r for r in raw if r['path'].endswith('/sourceTimestamp') and '/depth/players/' not in r['path']],
        'allExportedFootballFactsEquivalent': not any('Equivalent' in f['check'] for f in failures)},
    'independentModel': {'path': 'qa/matchup-breakdown/model.cjs', 'sha256': sha((ROOT/'qa/matchup-breakdown/model.cjs').read_bytes()),
        'outputs': outputs, 'statesCompared': 1536, 'allStatesExactlyEquivalentToReviewed5144': states['before'] == states['incoming']},
    'newPrimaryGamesCorroboration': {**games_receipt, 'receiptPath': games_receipt_path.relative_to(ROOT).as_posix(),
        'receiptSha256': sha(games_receipt_path.read_bytes()), 'scheduleGameRowsChecked': game_count},
    'nondataRuntime': {'files': len(nondata), 'allFilesExact': nondata == {k:v for k,v in known['runtimeManifest'].items() if k not in source_files},
        'knownHomeReportPath': known_path.relative_to(ROOT).as_posix(), 'knownHomeReportSha256': sha(known_path.read_bytes()), 'knownHomeRuntimeManifestSha256': known['runtimeManifestSha256']},
    'assertions': sum(checks.values()), 'checks': dict(checks), 'failures': failures,
    'auditHelperSha256': sha(Path(__file__).read_bytes()), 'runtimeChangedByReview': False,
    'limitations': ['This is independent source/math QA, not browser or hosted deployment verification.',
        'Prior f1/5144/browser receipts retain their original runtime and body hashes. Current native evidence must be produced separately.',
        'Provider-reported practice/roster status is distinct from complete official inactive confirmation; unknown context remains explicit.',
        'New primary games raw body changed; this audit proves exported relevant game identities/scores and all statistical projections match, not every unused CSV field across all games.']}
assert not OUT.exists()
OUT.write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'status': receipt['status'], 'path': OUT.relative_to(ROOT).as_posix(), 'sha256': sha(OUT.read_bytes()),
    'runtime': runtime_id, 'assertions': receipt['assertions'], 'failures': failures[:8]},indent=2))
raise SystemExit(bool(failures))
