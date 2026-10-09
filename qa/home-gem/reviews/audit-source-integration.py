"""Read-only stable-identity review of the preserved Home source integration.

Independent QA model only; no production code or updater imports, no refresh.
"""
import ast
import collections
import datetime
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/workspace/project-dollers')
PACK = pathlib.Path('/workspace/recovery-qa/home-gem-source-integration')
OUT = ROOT / 'qa/home-gem/reviews/source-integration-review-v2.json'
FILES = ['current.json', 'provenance.json', 'player-history.json', 'team-details.json', 'matchup-breakdown.json']
OLD = 'f33d2180522e4411f539490c9840359c36b2d71b'
NEW = 'f1e5c56181c613805854cc088965b8754e717cc2'
META = {'retrievedAt', 'generatedAt', 'checkedAt', 'refreshAfter', 'sha256', 'bytes', 'etag', 'lastModified',
        'sourceHashes', 'sourceTimestamp', 'scheduleRetrievedAt', 'teamDetailsRetrievedAt', 'currentRetrievedAt',
        'teamDetailsSha256', 'currentSha256', 'playerHistorySha256', 'snapshotSha256CanonicalJson', 'tlsVerified'}
UNORDERED = {'sources', 'sourceIds', 'identitySourceIds', 'disagreements', 'startingQBMissingStatistics',
             'startingRoleDisagreements', 'startingRoleUncorroborated'}
checks = collections.Counter()
failures = []

def sha(body):
    return hashlib.sha256(body).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def check(ok, kind, context=None):
    checks[kind] += 1
    if not ok:
        failures.append({'kind': kind, 'context': context})

def normalize(value, field=''):
    if isinstance(value, dict):
        return {key: normalize(v, key) for key, v in value.items() if key not in META}
    if isinstance(value, list):
        rows = [normalize(v) for v in value]
        if field in UNORDERED:
            return sorted(rows, key=canonical)
        return rows
    return value

def differences(a, b, path=''):
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for key in sorted(a.keys() | b.keys()):
            if key not in a or key not in b:
                out.append({'path': path+'/'+key, 'before': a.get(key), 'after': b.get(key), 'kind': 'presence'})
            else:
                out.extend(differences(a[key], b[key], path+'/'+key))
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [{'path': path, 'beforeCount': len(a), 'afterCount': len(b), 'kind': 'length'}]
        return [row for i, (x, y) in enumerate(zip(a, b)) for row in differences(x, y, path+'/'+str(i))]
    return [] if a == b and type(a) is type(b) else [{'path': path, 'before': a, 'after': b, 'kind': 'scalar'}]

books = {}
hashes = {}
for side, commit in [('before', OLD), ('incoming', NEW)]:
    books[side] = {}
    hashes[side] = {}
    for name in FILES:
        original = subprocess.check_output(['git', 'show', commit+':assets/data/'+name], cwd=ROOT)
        retained = (PACK / side / name).read_bytes()
        check(original == retained, 'ExactImmutableCommitBody', {'commit': commit, 'file': name})
        hashes[side][name] = sha(retained)
        books[side][name] = json.loads(retained)
        if side == 'incoming':
            check((ROOT/'assets/data'/name).read_bytes() == retained, 'CurrentWorktreeExactIncoming', name)

semantic = []
for name in FILES:
    semantic.extend(differences(normalize(books['before'][name]), normalize(books['incoming'][name]), name))
expected_path = 'matchup-breakdown.json/teams/CHI/fixtureReports/2026_05_CHI_GB/availability/players/0/reportStatus'
check(len(semantic) == 1 and semantic[0]['path'] == expected_path and semantic[0]['before'] == 'Injured Reserve' and
      semantic[0]['after'] == 'Out', 'ExactlyOneAttributedProviderDesignationChange', semantic)

before, incoming = (books[k]['matchup-breakdown.json'] for k in ['before', 'incoming'])
for abbr in before['teams']:
    old_team, new_team = before['teams'][abbr], incoming['teams'][abbr]
    check(set(old_team['players']) == set(new_team['players']), 'ExactPlayerIdentitySet', abbr)
    for key in ['games', 'headToHeadGames', 'headToHeadCoverage', 'qbEvidence', 'upcomingGameId', 'researchGameId']:
        check(normalize(old_team.get(key)) == normalize(new_team.get(key)), 'FootballTeamFieldEquivalent', {'team': abbr, 'field': key})
    for pid in old_team['players']:
        old_p, new_p = old_team['players'][pid], new_team['players'][pid]
        check(normalize(old_p) == normalize(new_p), 'AllPlayerIdentityStatisticsRolesAppearancesAdvancedCoverageEquivalent', {'team': abbr, 'player': pid})
    for team in [old_team, new_team]:
        for row in team.get('injuries', {}).get('currentTeamBulletin', []):
            check(all(row.get(k) is None for k in ['season', 'week', 'gameId']), 'DepthBulletinKeepsUnknownGameScope', {'team': abbr, 'player': row.get('playerId')})
        for game_id, report in team.get('fixtureReports', {}).items():
            for row in report.get('availability', {}).get('currentTeamBulletin', []):
                check(all(row.get(k) is None for k in ['gameId', 'eventId', 'week', 'reportedInactive']), 'FutureEndpointBulletinNotPromoted', {'team': abbr, 'fixture': game_id, 'player': row.get('playerId')})

helper = ROOT/'qa/matchup-breakdown/reviews/source-evidence/audit-final-basic-current-math.py'
tree = ast.parse(helper.read_text())
node = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'node' for t in n.targets))
model_proof = {}
states = {}
for side in ['before', 'incoming']:
    body = subprocess.check_output(['node', '-e', node, str(PACK/side/'matchup-breakdown.json')], cwd=ROOT)
    states[side] = json.loads(body)
    model_proof[side] = {'outputSha256': sha(body), 'states': len(states[side])}
    check(len(states[side]) == 1536, 'All32By48IndependentModelStates', side)
for old_s, new_s in zip(states['before'], states['incoming']):
    check(old_s == new_s, 'ExactWindowLeaderGPNullRateIdentityRoleStartProjectionEquivalent', {'team': old_s['team'], **old_s['options']})

old_sources = {s['id']: s for s in before['sources']}
new_sources = {s['id']: s for s in incoming['sources']}
check(old_sources.keys() == new_sources.keys(), 'ExactSourceIdentitySet')
tls_changes = [{'sourceId': key, 'before': old_sources[key].get('tlsVerified'), 'after': new_sources[key].get('tlsVerified'),
                'bodySha256Unchanged': old_sources[key].get('sha256') == new_sources[key].get('sha256')}
               for key in sorted(old_sources) if old_sources[key].get('tlsVerified') != new_sources[key].get('tlsVerified')]
check(len(tls_changes) == 3 and all(row['bodySha256Unchanged'] for row in tls_changes), 'ThreeExplicitTLSMetadataChangesOnUnchangedBodies', tls_changes)
for source in new_sources.values():
    check(source.get('tlsVerified') is not False and source.get('url', '').startswith('https://'), 'NoTLSFalseOrInsecurePublicSourceURL', source['id'])
body_changes = [{'sourceId': key, 'beforeSha256': old_sources[key].get('sha256'), 'afterSha256': new_sources[key].get('sha256'),
                 'beforeRetrievedAt': old_sources[key].get('retrievedAt'), 'afterRetrievedAt': new_sources[key].get('retrievedAt')}
                for key in sorted(old_sources) if old_sources[key].get('sha256') != new_sources[key].get('sha256')]
primary_ids = ['nflverse_games', 'nflverse_player_ids', 'nflverse_player_stats_2026', 'nflverse_player_stats_2025']
for key in sorted(old_sources):
    if key.startswith('nflverse_'):
        check(old_sources[key].get('sha256') == new_sources[key].get('sha256'), 'PrimaryNFLSourceBodyIdentityUnchanged', key)

baseline = json.loads((ROOT/'qa/home-gem/source-integration-baseline.json').read_text())
times = [row for row in baseline['changes'] if row['path'].endswith('/sourceTimestamp')]
depth_times = [row for row in times if '/depth/players/' in row['path']]
provider_times = [row for row in times if '/depth/players/' not in row['path']]
check(len(depth_times) == 210 and len(provider_times) == 1, 'ExplicitTimestampClassification', {'depthAsOf': len(depth_times), 'providerPublication': len(provider_times)})
change_row = incoming['teams']['CHI']['fixtureReports']['2026_05_CHI_GB']['availability']['players'][0]
check(change_row['playerId'] == '00-0038411' and change_row['espnId'] == '4361748' and change_row['reportedInactive'] is None and
      change_row['officialConfirmed'] is False and change_row['practiceStatus'] is None and change_row['week'] == 5 and
      change_row['sourceIds'] == ['espn_fixture_summary_401872990'], 'DesignationRetainsLiteralIdentityWeekProviderAndUnknownInactivePractice', change_row)
corroboration_path = ROOT/'qa/home-gem/reviews/source-evidence/espn-401872990-current-corroboration.receipt.json'
corroboration = json.loads(corroboration_path.read_text())
corroboration_body = ROOT/'qa/home-gem/reviews/source-evidence/espn-401872990-current-corroboration.json'
check(sha(corroboration_body.read_bytes()) == corroboration['sha256'] and corroboration['httpStatus'] == 200 and corroboration['tlsVerified'], 'SeparateNormalTLSProviderCorroborationIdentity')
check(corroboration['eventId'] == '401872990' and len(corroboration['anthonyJohnsonRows']) == 1 and
      corroboration['anthonyJohnsonRows'][0]['status'] == change_row['reportStatus'] and
      corroboration['anthonyJohnsonRows'][0]['date'] == change_row['sourceTimestamp'], 'ActualProviderCorroboratesOnlyMaterialDesignationAndPublication')

report = {'status': 'failed' if failures else 'passed', 'auditedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'agent': '/root/matchup_sources', 'scope': 'Bounded read-only source integration delta for Home-only work; no refresh, producer, browser or runtime mutation.',
          'beforeCommit': OLD, 'preservedIncomingCommit': NEW, 'snapshotHashes': hashes,
          'snapshotSha256': hashes['incoming']['matchup-breakdown.json'], 'rawRecursiveChanges': len(baseline['changes']),
          'normalization': {'removedMetadataKeys': sorted(META), 'unorderedIdentityCollections': sorted(UNORDERED),
                            'otherArrayOrderingPreserved': True, 'providerPublicationTimesSeparatelyClassified': True},
          'semanticChanges': semantic, 'materialProviderUpdate': change_row,
          'timestampClassification': {'depthAsOfUpdates': len(depth_times), 'providerPublicationUpdates': provider_times},
          'sourceBodyHashChanges': body_changes, 'changedSourceBodyHashes': len(body_changes),
          'sourceTLSMetadataChanges': tls_changes,
          'separateActualProviderCorroboration': {'path': str(corroboration_path.relative_to(ROOT)), 'sha256': sha(corroboration_path.read_bytes()),
                                                'bodyPath': str(corroboration_body.relative_to(ROOT)), 'bodySha256': sha(corroboration_body.read_bytes()),
                                                'exactIncomingBody': corroboration['exactIncomingBody'], 'retrievedAt': corroboration['retrievedAt']},
          'independentModel': {'path': 'qa/matchup-breakdown/model.cjs', 'sha256': sha((ROOT/'qa/matchup-breakdown/model.cjs').read_bytes()), 'outputs': model_proof},
          'projectionStatesCompared': 1536, 'statisticalProjectionEquivalent': not any(f['kind'].endswith('ProjectionEquivalent') for f in failures),
          'checks': dict(checks), 'assertions': sum(checks.values()), 'failures': failures,
          'limitations': ['Raw HTTP body hashes really changed for87 source records; this review does not label the whole raw responses byte-identical or claim independent re-fetch of all87 bodies.',
                          'Keyed published snapshot facts and all1536 independent-model statistical projections are compared. Historical source receipts remain bound to their original bodies/book and are not retargeted.',
                          'The one provider designation update is separate from official complete inactives, health, practice or activation. Source publication and retrieval times are preserved.'],
          'runtimeChangedByReview': False, 'auditHelperSha256': sha(pathlib.Path(__file__).read_bytes())}
report['priorDiagnostic'] = {'path': 'qa/home-gem/reviews/source-integration-review.json',
                            'qualification': 'Preserved first reviewer diagnostic classified three TLS metadata changes alongside the sole football designation leaf. V2 records those explicitly as provenance; no snapshot or source record was changed.'}
assert not OUT.exists()
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
print(json.dumps({'path': str(OUT.relative_to(ROOT)), 'sha256': sha(OUT.read_bytes()), 'status': report['status'], 'assertions': report['assertions'],
                  'materialLeaves': len(semantic), 'states': 1536, 'failures': failures[:8]}))
raise SystemExit(bool(failures))
