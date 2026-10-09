"""Bounded, immutable f1e5c56 -> 5144cd67 source review; no updater or browser.

Historical receipts remain unchanged. All inputs come from exact git-show bodies.
The independent 1,536-state model is QA code, not the production data renderer.
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
PACK = Path('/workspace/recovery-qa/home-gem-source-integration-5144')
OUT = ROOT / 'qa/home-gem/reviews/source-integration-5144-review-v2.json'
BEFORE = 'f1e5c56181c613805854cc088965b8754e717cc2'
INCOMING = '5144cd67d0b4a002eed44122f56280942fb22eba'
FILES = ['current.json', 'provenance.json', 'player-history.json', 'team-details.json', 'matchup-breakdown.json']
REMOVED = '00-0038705'
checks = collections.Counter()
failures = []

def sha(body):
    return hashlib.sha256(body).hexdigest()

def check(ok, name, context=None):
    checks[name] += 1
    if not ok:
        failures.append({'check': name, 'context': context})

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

# Reuse only the previously reviewed pure comparison definitions, never execute
# its historical expected-change assertions or retarget its immutable receipt.
prior_helper = ROOT / 'qa/home-gem/reviews/audit-source-integration.py'
definitions = ast.parse(prior_helper.read_text())
for statement in definitions.body:
    if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('META', 'UNORDERED') for t in statement.targets):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))
    if isinstance(statement, ast.FunctionDef) and statement.name in ('normalize', 'differences'):
        exec(compile(ast.Module(body=[statement], type_ignores=[]), str(prior_helper), 'exec'))

books, hashes = {}, {}
for side, commit in [('before', BEFORE), ('incoming', INCOMING)]:
    books[side], hashes[side] = {}, {}
    for name in FILES:
        body = subprocess.check_output(['git', 'show', commit + ':assets/data/' + name], cwd=ROOT)
        path = PACK / side / name
        check(path.read_bytes() == body, 'ImmutableGitShowBodyIdentity', {'side': side, 'file': name})
        books[side][name] = json.loads(body)
        hashes[side][name] = sha(body)
        # Review is performed before the deliberate integration. It must not
        # silently rewrite the frozen f1 source to simulate the incoming data.
        check((ROOT / 'assets/data' / name).read_bytes() == (PACK / 'before' / name).read_bytes(),
              'FrozenBrowserWorktreeStillBeforeIntegration', name)

raw_changes, normalized_changes = [], []
for name in FILES:
    before, incoming = books['before'][name], books['incoming'][name]
    raw_changes.extend(differences(before, incoming, name))
    normalized_changes.extend(differences(normalize(before), normalize(incoming), name))

before = books['before']['matchup-breakdown.json']
incoming = books['incoming']['matchup-breakdown.json']
old_sources = {row['id']: row for row in before['sources']}
new_sources = {row['id']: row for row in incoming['sources']}
ALIASES = {'espn_fixture_summary_401872980': 'espn_matchup_summary_401872980'}
for old_id, new_id in ALIASES.items():
    check(old_sources[old_id]['url'] == new_sources[new_id]['url'] and old_sources[old_id]['url'].endswith('event=401872980'),
          'ExplicitFinalEventAliasPreservesExactProviderURLAndEvent', {'beforeSource': old_id, 'incomingSource': new_id})

def normalize_same_event_alias(value):
    if isinstance(value, dict):
        return {key: normalize_same_event_alias(child) for key, child in normalize(value).items()}
    if isinstance(value, list):
        return [normalize_same_event_alias(child) for child in value]
    return ALIASES.get(value, value) if isinstance(value, str) else value

check(set(before['teams']) == set(incoming['teams']) and len(incoming['teams']) == 32, 'Same32TeamIdentities')
membership, player_changes, literal_roster_changes = [], [], []
for abbr in sorted(before['teams']):
    old_team, new_team = before['teams'][abbr], incoming['teams'][abbr]
    lost = set(old_team['players']) - set(new_team['players'])
    added = set(new_team['players']) - set(old_team['players'])
    check(lost == ({REMOVED} if abbr == 'DAL' else set()) and not added,
          'OnlyCorroboratedDallasCutRemovedFromCurrentRoster', {'team': abbr, 'removed': sorted(lost), 'added': sorted(added)})
    for pid in sorted(lost):
        membership.append({'team': abbr, 'playerId': pid, 'name': old_team['players'][pid]['name'],
                           'priorHistoricalRows': len(old_team['players'][pid]['gameLog']), 'currentRosterRemoved': True})
    for field in ['games', 'headToHeadGames', 'headToHeadCoverage', 'upcomingGameId', 'researchGameId', 'nextScheduledGameId']:
        check(normalize(old_team.get(field)) == normalize(new_team.get(field)), 'AllHistoricalGameFixtureAndScoresEquivalent', {'team': abbr, 'field': field})
    for pid in sorted(set(old_team['players']) & set(new_team['players'])):
        old_player, new_player = old_team['players'][pid], new_team['players'][pid]
        old_rows = {row['gameId']: normalize_same_event_alias(row) for row in old_player['gameLog']}
        new_rows = {row['gameId']: normalize_same_event_alias(row) for row in new_player['gameLog']}
        check(old_rows == new_rows, 'AllRetainedPlayerGameStatisticAdvancedAppearanceCellsEquivalentWithExactEventAlias', {'team': abbr, 'player': pid})
        check(all(old_player.get(k) == new_player.get(k) for k in ['id', 'name', 'position', 'team', 'espnId']),
              'AllRetainedPlayerIdentityPositionTeamEquivalent', {'team': abbr, 'player': pid})
        literal = {k: {'before': old_player.get(k), 'incoming': new_player.get(k)} for k in ['jersey', 'number', 'status'] if old_player.get(k) != new_player.get(k)}
        if literal:
            literal_roster_changes.append({'team': abbr, 'playerId': pid, 'name': new_player['name'], 'changes': literal})
        changes = differences(normalize(old_player), normalize(new_player), abbr + '/' + pid)
        if changes:
            player_changes.extend(changes)
    for team in [old_team, new_team]:
        for row in team.get('injuries', {}).get('currentTeamBulletin', []):
            check(all(row.get(k) is None for k in ['season', 'week', 'gameId']), 'UnscopedDepthBulletinNotMadeWeeklyEvidence', {'team': abbr, 'player': row.get('playerId')})
        for gid, report in team.get('fixtureReports', {}).items():
            for row in report.get('availability', {}).get('currentTeamBulletin', []):
                check(all(row.get(k) is None for k in ['gameId', 'eventId', 'week', 'reportedInactive']), 'FutureBulletinNotPromotedToInactives', {'team': abbr, 'fixture': gid, 'player': row.get('playerId')})

# Exact, source-independent math/state comparison and a narrowly described
# counterfactual staging input identify the effect of the one current-roster cut.
math_helper = ROOT / 'qa/matchup-breakdown/reviews/source-evidence/audit-final-basic-current-math.py'
tree = ast.parse(math_helper.read_text())
node = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'node' for t in n.targets))
states, model = {}, {}
for side in ['before', 'incoming']:
    body = subprocess.check_output(['node', '-e', node, str(PACK / side / 'matchup-breakdown.json')], cwd=ROOT)
    states[side] = json.loads(body)
    model[side] = {'sha256': sha(body), 'states': len(states[side])}
    check(len(states[side]) == 1536, 'All32By48IndependentModelStates', side)
counterfactual = json.loads((PACK / 'before' / 'matchup-breakdown.json').read_text())
del counterfactual['teams']['DAL']['players'][REMOVED]
staged = PACK / 'before-with-only-corroborated-cut.json'
staged.write_text(canonical(counterfactual))
body = subprocess.check_output(['node', '-e', node, str(staged)], cwd=ROOT)
counter_states = json.loads(body)
model['isolatedRosterCutCounterfactual'] = {'sha256': sha(body), 'states': len(counter_states),
    'qualification': 'Separate QA input only; before/incoming originals and production worktree were never modified.'}
check(counter_states == states['incoming'], 'EveryIncomingProjectionExactlyExplainedByOnlyRosterCut')
changed_states = []
for old, new in zip(states['before'], states['incoming']):
    check(old['team'] == new['team'] and old['options'] == new['options'], 'StableModelStateIdentity')
    changed_fields = [field for field in old if old[field] != new[field]]
    if changed_fields:
        changed_states.append({'team': old['team'], 'options': old['options'], 'changedFields': changed_fields})
    check(not changed_fields or old['team'] == 'DAL' and set(changed_fields) <= {'playerRows', 'rushing'},
          'OnlyDallasRosterMembershipAndResultingRushingLeaderboardChange', {'team': old['team'], 'options': old['options'], 'fields': changed_fields})
check(len(changed_states) == 48, 'OnlyDallas48ModelStatesChanged')

check(old_sources.keys() == new_sources.keys(), 'SourceIdentitySetPreserved')
source_changes = [{'sourceId': sid, 'beforeSha256': old_sources[sid].get('sha256'), 'afterSha256': new_sources[sid].get('sha256'),
                   'beforeRetrievedAt': old_sources[sid].get('retrievedAt'), 'afterRetrievedAt': new_sources[sid].get('retrievedAt')}
                  for sid in sorted(old_sources) if old_sources[sid].get('sha256') != new_sources[sid].get('sha256')]
for sid, source in new_sources.items():
    check(source.get('tlsVerified') is not False and source.get('url', '').startswith('https://'), 'NoInsecurePublicRetrievalSource', sid)
    if sid.startswith('nflverse_') and sid not in ['nflverse_roster', 'nflverse_depth', 'nflverse_injuries']:
        check(old_sources[sid].get('sha256') == source.get('sha256'), 'PrimaryScheduleStatsHistoricalPBPBodiesUnchanged', sid)

evidence_dir = ROOT / 'qa/home-gem/reviews/source-evidence-5144'
evidence = {}
for sid in ['nflverse_roster', 'nflverse_injuries', 'espn_matchup_roster_DAL', 'espn_matchup_depth_DAL']:
    receipt_path = evidence_dir / (sid + '.receipt.json')
    receipt = json.loads(receipt_path.read_text())
    raw = gzip.decompress((evidence_dir / (sid + '.source.gz')).read_bytes())
    check(receipt['httpStatus'] == 200 and receipt['tlsVerified'] is True and sha(raw) == receipt['sha256'], 'ActualPublicTLSCorroborationBodyIdentity', sid)
    check(receipt['snapshotSourceSha256'] == new_sources[sid]['sha256'], 'CorroborationBoundToReviewedSnapshotSource', sid)
    evidence[sid] = {**receipt, 'receiptPath': receipt_path.relative_to(ROOT).as_posix(), 'receiptSha256': sha(receipt_path.read_bytes())}
    evidence[sid]['parsed'] = list(csv.DictReader(raw.decode().splitlines())) if sid.startswith('nflverse_') else json.loads(raw)
for sid in ['nflverse_roster', 'nflverse_injuries']:
    check(evidence[sid]['exactIncomingBody'], 'PrimaryRosterAndWeeklyInjuryBodiesExactSnapshotMatch', sid)
roster_rows = evidence['nflverse_roster']['parsed']
raw_roster = {(r['team'], r['gsis_id']): r for r in roster_rows if r['season'] == '2026'}
for changed in literal_roster_changes:
    raw = raw_roster.get((changed['team'], changed['playerId']))
    check(raw is not None, 'EveryChangedLiteralRosterFieldHasExactPrimaryIdentity', changed)
    for field, values in changed['changes'].items():
        expected = raw['status'] if field == 'status' else raw['jersey_number']
        check(str(values['incoming']) == expected, 'EveryChangedJerseyNumberOrStatusMatchesExactIncomingPrimaryCSV', {'player': changed['playerId'], 'field': field, 'value': values['incoming'], 'literalCSV': expected})
cut = [row for row in roster_rows if row['gsis_id'] == REMOVED and row['team'] == 'DAL' and row['season'] == '2026']
check(len(cut) == 1 and cut[0]['status'] == 'CUT', 'PrimaryNFLRosterLiterallyConfirmsCut', cut)
espn_players = [p for group in evidence['espn_matchup_roster_DAL']['parsed']['athletes'] for p in group['items']]
check(not any(p['id'] == '4362478' for p in espn_players), 'IndependentCurrentESPNDallasRosterCorroboratesAbsence')

# Verify every freshly exposed weekly-report leaf against the exact CSV body.
weekly = {(int(r['season']), r['team'], int(r['week']), r['gsis_id']): r for r in evidence['nflverse_injuries']['parsed']}
weekly_count, injury_counts, team_injury_rows_count = 0, {}, 0
for abbr, team in incoming['teams'].items():
    injury_counts[abbr] = {'before': len(before['teams'][abbr]['injuries'].get('players', [])), 'incoming': len(team['injuries'].get('players', []))}
    for row in team['injuries'].get('players', []):
        team_injury_rows_count += 1
        original = weekly.get((incoming['season'], abbr, row['week'], row['playerId']))
        check(original is not None and row['sourceIds'] == ['nflverse_injuries'] and row['practiceStatus'] == (original['practice_status'] or None) and row['reportStatus'] == (original['report_status'] or None),
              'EveryCurrentTeamInjuryReportHasLiteralPrimarySeasonWeekIdentityAndParticipation', {'team': abbr, 'player': row['playerId'], 'week': row['week']})
    for gid, report in team['fixtureReports'].items():
        for row in report.get('availability', {}).get('players', []):
            verified = row.get('weeklyReport')
            if not verified:
                continue
            weekly_count += 1
            original = weekly.get((incoming['season'], abbr, verified['week'], verified['playerId']))
            check(original is not None and verified['sourceIds'] == ['nflverse_injuries'], 'EveryWeeklyReportHasExactIdentitySeasonWeekSource', {'team': abbr, 'fixture': gid, 'player': verified['playerId']})
            if original:
                check(verified['practiceStatus'] == (original['practice_status'] or None) and verified['reportStatus'] == (original['report_status'] or None),
                      'EveryWeeklyPracticeAndReportDesignationMatchesLiteralCSV', {'team': abbr, 'fixture': gid, 'player': verified['playerId']})
            if row.get('reportedInactive') is not None:
                old_rows = before['teams'][abbr]['fixtureReports'].get(gid, {}).get('availability', {}).get('players', [])
                prior = next((r for r in old_rows if r['playerId'] == row['playerId']), None)
                check(prior is not None and prior.get('reportedInactive') == row['reportedInactive'] and prior.get('officialConfirmed') == row.get('officialConfirmed') and row.get('confirmation') == 'provider-reported' and 'fantasyStatus' in row.get('sourceField', '') and row.get('sourceIds') == ['espn_fixture_summary_' + row['eventId']],
                      'ExistingProviderInactiveRemainsSeparateFromNewWeeklyPracticeAndOfficialConfirmation', {'team': abbr, 'fixture': gid, 'player': verified['playerId']})
check(weekly_count > 0, 'NewWeeklyEvidenceActuallyInspected', weekly_count)

td_before, td_new = books['before']['team-details.json'], books['incoming']['team-details.json']
depth_changes = []
for abbr in td_before['teams']:
    old_players = {p['id']: p for p in td_before['teams'][abbr]['roster']}
    new_players = {p['id']: p for p in td_new['teams'][abbr]['roster']}
    check(set(old_players)-set(new_players) == ({REMOVED} if abbr == 'DAL' else set()) and not set(new_players)-set(old_players),
          'TeamDetailsCurrentRosterUsesSameCorroboratedCut', abbr)
    for pid in set(old_players) & set(new_players):
        check(old_players[pid]['seasonStats'] == new_players[pid]['seasonStats'] and normalize(old_players[pid]['last5']) == normalize(new_players[pid]['last5']),
              'EveryRetainedTeamSeasonAndLast5StatisticCellEquivalent', {'team': abbr, 'player': pid})
    key = lambda p: (p['playerId'], p['position'], p['rank'], p['unit'])
    old_depth = {key(p): p for p in td_before['teams'][abbr]['depth']['players']}
    new_depth = {key(p): p for p in td_new['teams'][abbr]['depth']['players']}
    if old_depth.keys() != new_depth.keys():
        depth_changes.append({'team': abbr,
            'removed': [old_depth[k] for k in sorted(old_depth.keys()-new_depth.keys())],
            'added': [new_depth[k] for k in sorted(new_depth.keys()-old_depth.keys())]})
check([row['team'] for row in depth_changes] == ['DAL'], 'OnlyDallasDepthMembershipRanksChanged')
espn_depth = {(unit['name'], p['position']['abbreviation'], str(ath['id'])): rank
              for unit in evidence['espn_matchup_depth_DAL']['parsed']['depthchart']
              for p in unit['positions'].values() for rank, ath in enumerate(p['athletes'], 1)}
depth_crosschecks = []
for row in depth_changes[0]['added']:
    provider_rank = espn_depth.get((row['unit'], row['position'], str(row['espnId'])))
    depth_crosschecks.append({'playerId': row['playerId'], 'name': row['name'], 'unit': row['unit'], 'position': row['position'],
        'snapshotNFLverseRank': row['rank'], 'separateESPNRank': provider_rank, 'agreement': provider_rank == row['rank']})
    check(provider_rank == row['rank'], 'EveryChangedDallasDepthRankIndependentlyCorroboratedByESPN', depth_crosschecks[-1])

removed_rows = before['teams']['DAL']['players'][REMOVED]['gameLog']
removed_final_current = [r for r in removed_rows if r.get('season') == incoming['season'] and r.get('finalBoxscoreEvidence')]
for side in ['before', 'incoming']:
    recorded = sum(bool(r.get('finalBoxscoreEvidence')) for t in books[side]['matchup-breakdown.json']['teams'].values() for p in t['players'].values() for r in p['gameLog'])
    check(recorded == books[side]['matchup-breakdown.json']['coverage']['finalBasicBoxscores']['recordedPlayerGameRows'], 'CoverageRecordedBoxscoreRowsRecountFromActualRows', {'side': side, 'actual': recorded})

report = {'status': 'failed' if failures else 'passed', 'auditedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'agent': '/root/home_gem_controls_audit', 'beforeCommit': BEFORE, 'preservedIncomingCommit': INCOMING,
    'scope': 'Read-only bounded immutable source delta; separate from a99b Home browser/visual acceptance; no production refresh, browser or runtime writes.',
    'snapshotHashes': hashes, 'snapshotSha256': hashes['incoming']['matchup-breakdown.json'],
    'rawRecursiveChanges': len(raw_changes), 'rawChangesSha256': sha(canonical(raw_changes).encode()),
    'normalizedChanges': normalized_changes, 'normalization': {'removedMetadataKeys': sorted(META), 'unorderedIdentityCollections': sorted(UNORDERED),
        'arrayLengthChangesRetainedAndSeparatelyAuditedByStableIdentity': True},
    'allRetainedPlayerFootballCellsEquivalent': not any(f['check'].startswith('AllRetainedPlayerGame') for f in failures),
    'currentRosterMembershipChanges': membership, 'literalJerseyAndStatusChangesIndependentlyVerified': literal_roster_changes,
    'explicitSameEventSourceAliases': ALIASES, 'retainedPlayerEvidenceChanges': player_changes,
    'depthMembershipAndRankChanges': depth_changes, 'independentESPNDepthCrosschecks': depth_crosschecks,
    'weeklyInjuryEvidence': {'exactIncomingNFLverseBody': True, 'weeklyReportLeavesChecked': weekly_count, 'currentTeamInjuryRowsChecked': team_injury_rows_count, 'perTeamPlayerCounts': injury_counts},
    'independentModel': {'path': 'qa/matchup-breakdown/model.cjs', 'sha256': sha((ROOT/'qa/matchup-breakdown/model.cjs').read_bytes()), 'outputs': model,
        'statesCompared': 1536, 'changedStates': changed_states, 'allIncomingStatesExactlyExplainedByOnlyCurrentRosterCut': counter_states == states['incoming']},
    'sourceBodyHashChanges': source_changes,
    'publicCorroboration': [{k:v for k,v in value.items() if k != 'parsed'} for value in evidence.values()],
    'timestampClassification': dict(collections.Counter('providerPublication' if row['path'].endswith('/sourceTimestamp') else 'retrievalOrGeneration' if any(row['path'].endswith('/'+k) for k in ['retrievedAt','generatedAt','checkedAt','refreshAfter']) else 'other' for row in raw_changes)),
    'coverage': {'before': before['coverage']['finalBasicBoxscores'], 'incoming': incoming['coverage']['finalBasicBoxscores'], 'removedCurrentFinalRows': removed_final_current},
    'assertions': sum(checks.values()), 'checks': dict(checks), 'failures': failures,
    'auditHelperSha256': sha(Path(__file__).read_bytes()), 'priorHelperSha256': sha(prior_helper.read_bytes()),
    'runtimeChangedByReview': False,
    'priorDiagnostic': {'path': 'qa/home-gem/reviews/source-integration-5144-review.json', 'sha256': sha((ROOT/'qa/home-gem/reviews/source-integration-5144-review.json').read_bytes()),
        'qualification': 'Preserved initial QA diagnostic assumed unchanged jersey/status/source aliases and treated existing provider-reported inactives as official. V2 individually verifies literal roster changes, exact same-event aliases and preserved separate confirmation rather than altering source facts.'},
    'limitations': ['1536 model states are QA independent projections, not a browser or live-site pass.',
        'Historical source bodies/receipts are not relabeled; current ESPN body hashes differ from snapshot bodies and are separately recorded corroboration.',
        'Full 59MB NFLverse depth raw body was not independently re-downloaded; the seven changed Dallas depth ranks were individually cross-checked against actual current ESPN depth.',
        'Weekly practice evidence is source-reported participation, not a complete official inactive declaration. Missing facts remain unavailable.',
        'The source integration must receive fresh companion native proof after rebase; a99b Home screenshot hashes remain bound to the earlier f1 runtime.']}
assert not OUT.exists(), 'Use a separate immutable report; do not overwrite prior evidence.'
OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'status': report['status'], 'report': OUT.relative_to(ROOT).as_posix(), 'sha256': sha(OUT.read_bytes()),
    'assertions': report['assertions'], 'changedModelStates': len(changed_states), 'weeklyReportLeavesChecked': weekly_count, 'failures': failures[:12]}, indent=2))
raise SystemExit(bool(failures))
