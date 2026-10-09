"""Bounded read-only review of automatic 3e047 -> 607d source publication.

Immutable Git books and the independent QA model only. Production assets,
updaters, browser state, original tests and older receipts remain untouched.
"""
import ast
import collections
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PACK = Path('/workspace/recovery-qa/home-gem-source-integration-607d')
BEFORE = '3e047c86df61208a6675bf60fbd8e98051566cbf'
INCOMING = '607d2c7c01ad40abf9f4baf6210a08287dc931be'
FILES = ['current.json', 'provenance.json', 'player-history.json', 'team-details.json', 'matchup-breakdown.json']
OUT = ROOT / 'qa/home-gem/reviews/source-integration-607d-review.json'
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


prior_helper = ROOT / 'qa/home-gem/reviews/audit-source-integration.py'
for statement in ast.parse(prior_helper.read_text()).body:
    if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('META', 'UNORDERED') for t in statement.targets):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))
    if isinstance(statement, ast.FunctionDef) and statement.name in ('normalize', 'differences'):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))

assert not OUT.exists(), 'Preserve every prior receipt; use a new audit identity'
prior_path = ROOT / 'qa/home-gem/reviews/source-integration-current-review.json'
prior = json.loads(prior_path.read_text())
check(sha(prior_path.read_bytes()) == 'f95dc6c1682664befb8915097170f45342698e604256d858e9fc362ada709fb9', 'PriorAcceptedSourceReviewImmutableExactIdentity')
check(prior['status'] == 'passed' and not prior['failures'] and prior['assertions'] == 4773, 'PriorActual4773AssertionsPassed')
check(prior['auditHelperSha256'] == sha((ROOT / 'qa/home-gem/reviews/audit-source-integration-current.py').read_bytes()), 'PriorActualAuditHelperIdentity')
books, hashes = {}, {}
for side, commit in [('before', BEFORE), ('incoming', INCOMING)]:
    books[side], hashes[side] = {}, {}
    for name in FILES:
        body = subprocess.check_output(['git', 'show', commit + ':assets/data/' + name], cwd=ROOT)
        destination = PACK / side / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            check(destination.read_bytes() == body, 'RetainedImmutableSnapshotExactlyMatchesCommit', {'side': side, 'file': name})
        else:
            destination.write_bytes(body)
        books[side][name] = json.loads(body)
        hashes[side][name] = sha(body)
        check(destination.read_bytes() == body, 'ExactImmutableGitBody', {'side': side, 'file': name})
check(hashes['before'] == prior['snapshotHashes']['incoming'], 'BeforeSourceBodiesExactlyPreviouslyAccepted1b')
changed_paths = subprocess.check_output(['git', 'diff', '--name-only', BEFORE, INCOMING], cwd=ROOT, text=True).splitlines()
check(set(changed_paths) == {'assets/data/' + name for name in FILES} and len(changed_paths) == 5, 'AutomaticCommitChangesExactlyFiveSourceJSONFiles', changed_paths)

before = books['before']['matchup-breakdown.json']
incoming = books['incoming']['matchup-breakdown.json']
old_sources = {s['id']: s for s in before['sources']}
new_sources = {s['id']: s for s in incoming['sources']}
check(old_sources.keys() == new_sources.keys(), 'ExactProviderSourceIdentitySet')
alias = {'espn_fixture_summary_401872980': 'espn_matchup_summary_401872980'}
for a, b in alias.items():
    check(old_sources[a]['url'] == old_sources[b]['url'] == new_sources[a]['url'] == new_sources[b]['url'] and new_sources[a]['url'].endswith('event=401872980'), 'SameFinalEventAliasExactProviderURLIdentity')
    check(old_sources[a]['sha256'] == old_sources[b]['sha256'] and new_sources[a]['sha256'] == new_sources[b]['sha256'], 'SameFinalEventAliasesBindSameActualProviderBodyWithinEachSnapshot')


def normalized(value):
    if isinstance(value, dict):
        return {key: normalized(v) for key, v in normalize(value).items()}
    if isinstance(value, list):
        return [normalized(v) for v in value]
    return alias.get(value, value) if isinstance(value, str) else value


raw, material, numeric_delta = [], [], []
file_summaries = []
for name in FILES:
    literal = differences(books['before'][name], books['incoming'][name], name)
    semantic = differences(normalize(books['before'][name]), normalize(books['incoming'][name]), name)
    equivalent = differences(normalized(books['before'][name]), normalized(books['incoming'][name]), name)
    raw.extend(literal)
    material.extend(semantic)
    numeric_delta.extend(equivalent)
    file_summaries.append({'file': name, 'rawChanges': len(literal), 'normalizedChangesBeforeExplicitAlias': len(semantic), 'factualChangesAfterExactSameEventAlias': len(equivalent)})
    check(not equivalent, 'EveryExportedSourceDatasetFactEquivalentAfterExplicitMetadataAndSameEventAlias', {'file': name, 'remaining': equivalent[:8]})
check(len(material) == 62 and all(r['kind'] == 'scalar' and r['before'] == 'espn_fixture_summary_401872980' and r['after'] == 'espn_matchup_summary_401872980' for r in material), 'Only62ExplicitSameFinalEventSourceAliasLeaves', material[:3])

check(before['teams'].keys() == incoming['teams'].keys() and len(incoming['teams']) == 32, 'Same32TeamIdentitySet')
for team in before['teams']:
    a, b = before['teams'][team], incoming['teams'][team]
    check(set(a['players']) == set(b['players']), 'EveryTeamExactPlayerIdentitySet', team)
    check(normalized(a) == normalized(b), 'EveryEntireTeamRosterFixtureGameInjuryDepthAndStatisticFactEquivalent', team)
    for pid in a['players']:
        check(normalized(a['players'][pid]) == normalized(b['players'][pid]), 'EveryEntirePlayerIdentityStatsGameLogsRolesAndStatusEquivalent', {'team': team, 'playerId': pid})
    for game_a, game_b in zip(a['games'], b['games']):
        check(normalized(game_a) == normalized(game_b), 'EveryScheduleGameVenueIdentityWeekScoreAndContextEquivalent', {'team': team, 'game': game_a['id']})

source_changes = []
for sid, source in new_sources.items():
    previous = old_sources[sid]
    check(previous['url'] == source['url'], 'EveryProviderURLUnchanged', sid)
    check(source.get('tlsVerified') is not False and source['url'].startswith('https://'), 'EveryProviderHTTPSAndNoTLSBypass', sid)
    check(len(source['sha256']) == 64 and all(c in '0123456789abcdef' for c in source['sha256']), 'EveryProviderBodyHashValidSHA256', sid)
    if sid.startswith('nflverse_'):
        check(previous['sha256'] == source['sha256'], 'EveryPrimaryNFLverseRosterInjuryGamesPlayerStatsDepthHistoricalRawBodyUnchanged', sid)
    if previous.get('sha256') != source.get('sha256'):
        source_changes.append({'sourceId': sid, 'url': source['url'], 'beforeSha256': previous.get('sha256'), 'afterSha256': source.get('sha256'), 'beforeRetrievedAt': previous.get('retrievedAt'), 'afterRetrievedAt': source.get('retrievedAt')})

math_helper = ROOT / 'qa/matchup-breakdown/reviews/source-evidence/audit-final-basic-current-math.py'
tree = ast.parse(math_helper.read_text())
node = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'node' for t in n.targets))
states, outputs = {}, {}
for side in ['before', 'incoming']:
    body = subprocess.check_output(['node', '-e', node, str(PACK / side / 'matchup-breakdown.json')], cwd=ROOT)
    states[side] = json.loads(body)
    outputs[side] = {'sha256': sha(body), 'states': len(states[side])}
    check(len(states[side]) == 1536, 'All32TeamsBy48IndependentWindowProjectionStatesExecuted', side)
for a, b in zip(states['before'], states['incoming']):
    check(a == b, 'Every1536WholeProjectionExactlyEquivalentIncludingLeadersGPNullRatesQBRolesStartsAndOpponentWindows', {'team': a['team'], **a['options']})
check(outputs['before']['sha256'] == prior['independentModel']['outputs']['incoming']['sha256'], 'IndependentMathBeforeOutputExactlyPriorAcceptedOutput')

runtime_books = {}
for side, commit in [('before', BEFORE), ('incoming', INCOMING)]:
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', commit, 'index.html', 'assets'], cwd=ROOT, text=True).splitlines()
    runtime_books[side] = {p: sha(subprocess.check_output(['git', 'show', commit + ':' + p], cwd=ROOT)) for p in paths}
source_files = {'assets/data/' + name for name in FILES}
nondata = {k: v for k, v in runtime_books['incoming'].items() if k not in source_files}
known_path = ROOT / 'qa/home-gem/iteration-3-chromium/results.json'
known = json.loads(known_path.read_text())
check(len(runtime_books['incoming']) == 245 and len(nondata) == 240, 'Exact245RuntimeAnd240NondataFileCounts')
check(nondata == {k: v for k, v in runtime_books['before'].items() if k not in source_files} == {k: v for k, v in known['runtimeManifest'].items() if k not in source_files}, 'Every240HomeAndProtectedNondataFileByteIdenticalToBothAccepted3eAndKnownA99b')
check(sha(canonical(runtime_books['before']).encode()) == 'c9407130820cbd39d9aed62818e26b8881d166de7c2e6f30b358b4da793fea67', 'BeforeRuntimeExactAcceptedC940CanonicalManifest')
incoming_id = sha(canonical(runtime_books['incoming']).encode())

receipt = {
    'status': 'failed' if failures else 'passed', 'auditedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'agent': '/root/home_gem_controls_audit', 'beforeCommit': BEFORE, 'preservedIncomingCommit': INCOMING,
    'scope': 'Bounded immutable 3e047 -> 607d automatic source review; no production runtime, updater, branch, browser or prior evidence mutation.',
    'snapshotHashes': hashes, 'snapshotSha256': hashes['incoming']['matchup-breakdown.json'],
    'beforeRuntimeManifestSha256': sha(canonical(runtime_books['before']).encode()),
    'incomingRuntimeManifestSha256': incoming_id, 'runtimeManifestSha256': incoming_id,
    'incomingRuntimeManifest': runtime_books['incoming'],
    'priorSourceReview': {'path': prior_path.relative_to(ROOT).as_posix(), 'sha256': sha(prior_path.read_bytes()), 'assertions': prior['assertions']},
    'delta': {'rawRecursiveChanges': len(raw), 'rawChangesSha256': sha(canonical(raw).encode()), 'files': file_summaries,
              'sameEventSourceAliases': alias, 'onlySameEventAliasLeafChanges': len(material), 'factualChangesAfterVerifiedAlias': numeric_delta,
              'sourceBodyHashChanges': source_changes, 'primaryNFLverseBodiesUnchanged': all(old_sources[sid]['sha256'] == v['sha256'] for sid, v in new_sources.items() if sid.startswith('nflverse_'))},
    'independentModel': {'path': 'qa/matchup-breakdown/model.cjs', 'sha256': sha((ROOT / 'qa/matchup-breakdown/model.cjs').read_bytes()),
                         'outputs': outputs, 'statesCompared': 1536, 'allStatesExactlyEquivalentToAccepted3e': states['before'] == states['incoming']},
    'nondataRuntime': {'files': len(nondata), 'allFilesExact': nondata == {k: v for k, v in known['runtimeManifest'].items() if k not in source_files},
                       'knownHomeReportPath': known_path.relative_to(ROOT).as_posix(), 'knownHomeReportSha256': sha(known_path.read_bytes()), 'knownHomeRuntimeManifestSha256': known['runtimeManifestSha256']},
    'assertions': sum(checks.values()), 'checks': dict(checks), 'failures': failures,
    'auditHelperSha256': sha(Path(__file__).read_bytes()), 'runtimeChangedByReview': False,
    'limitations': ['This source/math review does not relabel c940 browser/hosted receipts or independently claim the new source publication was deployed.',
                   'ESPN response hashes and retrieval/publication timestamps changed; exported relevant football facts and all projections are proven equivalent. This bounded audit does not freshly retrieve every unrelated ESPN raw response.',
                   'All primary NFLverse raw hashes are unchanged, so the previously accepted independent CSV corroboration remains bound to the same primary bodies.',
                   'Official inactive confirmation and provider-reported roster/practice status remain distinct; missing values remain unavailable.']}
OUT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'status': receipt['status'], 'path': OUT.relative_to(ROOT).as_posix(), 'sha256': sha(OUT.read_bytes()), 'incomingRuntime': incoming_id, 'assertions': receipt['assertions'], 'failures': failures[:8]}, indent=2))
raise SystemExit(bool(failures))
