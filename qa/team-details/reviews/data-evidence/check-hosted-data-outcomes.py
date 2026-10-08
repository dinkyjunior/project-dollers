import json, pathlib, hashlib, re
from decimal import Decimal
from datetime import datetime, timezone

P = pathlib.Path('qa/team-details')
HOST = P / 'hosted-webkit'
OUT = P / 'reviews/hosted/data.json'
assert not OUT.exists(), 'Earlier acceptance must remain immutable'
sha = lambda path: hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
ref = lambda path: {'file': str(path), 'sha256': sha(path)}
load = lambda path: json.loads(pathlib.Path(path).read_text())
num = lambda text: Decimal(text.replace('−', '-'))
base = 'https://dinkyjunior.github.io/project-dollers/'
manifest_path = P / 'published-runtime-manifest.json'
old_manifest_path = P / 'candidate-runtime-manifest-iteration-5.json'
manifest, old_manifest = load(manifest_path), load(old_manifest_path)
assert len(manifest) == len(old_manifest) == 231 and set(manifest) == set(old_manifest)
assert sorted(path for path in manifest if manifest[path] != old_manifest[path]) == ['assets/data/current.json', 'assets/data/player-history.json', 'assets/data/provenance.json']
assert all(sha(path) == digest for path, digest in manifest.items())
freeze_path = P / 'hosted-candidate-freeze.json'
freeze = load(freeze_path)
assert freeze['publishedRuntimeManifest']['sha256'] == sha(manifest_path)
assert all(sha(path) == digest for path, digest in freeze['testFiles'].items())
kernel_path = P / 'reviews/data-evidence/integration-chromium-kernel-c336.json'
kernel = load(kernel_path)['sourceKernel']
assert kernel['publishedRuntimeManifestSha256'] == sha(manifest_path)
assert kernel['originalRuntimeManifestSha256'] == sha(old_manifest_path)
team = load('assets/data/team-details.json')
current = load('assets/data/current.json')
history = load('assets/data/player-history.json')
dal = team['teams']['DAL']
fields = ['netPassing', 'rushing', 'totalOffense', 'thirdDownMade', 'thirdDownAttempts', 'redZoneTD', 'redZoneAttempts', 'turnovers', 'penaltyYards']
assert len(team['teams']) == 32 and len({game['id'] for club in team['teams'].values() for game in club['games']}) == 544
assert len(team['sources']) == 31 and len(team['disagreements']) == 4
order = lambda game: (game['gameday'], game['week'], game['id'])
season_games = sorted([game for game in dal['games'] if game['status'] == 'final' and game['season'] == team['season']], key=order, reverse=True)
default_games = sorted([game for game in dal['games'] if game['status'] == 'final'], key=order, reverse=True)[:5]
selected = [game for game in season_games if game['home_team'] == 'DAL' and game['neutral'] is False][:10]
assert [game['id'] for game in selected] == ['2026_02_WAS_DAL']
assert [game['id'] for game in default_games] == ['2026_04_DAL_HOU', '2026_03_BAL_DAL', '2026_02_WAS_DAL', '2026_01_DAL_NYG', '2025_18_DAL_NYG']
schedule_ids = [game['id'] for game in sorted([game for game in dal['games'] if game['season'] == team['season']], key=order)]
assert len(schedule_ids) == 17
opponent = lambda game: game['away_team'] if game['home_team'] == 'DAL' else game['home_team']
own_score = lambda game: game['home_score'] if game['home_team'] == 'DAL' else game['away_score']
other_score = lambda game: game['away_score'] if game['home_team'] == 'DAL' else game['home_score']
venue = lambda game: 'neutral' if game['neutral'] is True else 'unknown' if game['neutral'] is None else 'home' if game['home_team'] == 'DAL' else 'away'
venue_expected = []
for kind in ['home', 'away', 'neutral', 'unknown']:
    games = [game for game in season_games if venue(game) == kind]
    wins = sum(own_score(game) > other_score(game) for game in games)
    losses = sum(own_score(game) < other_score(game) for game in games)
    ties = sum(own_score(game) == other_score(game) for game in games)
    venue_expected.append([kind.upper(), str(len(games)), f'{wins}-{losses}' + (f'-{ties}' if ties else '')])
assert venue_expected == [['HOME', '1', '1-0'], ['AWAY', '2', '1-1'], ['NEUTRAL', '1', '0-1'], ['UNKNOWN', '0', '0-0']]
means = lambda side, field: sum(Decimal(game['stats']['DAL' if side == 'gained' else opponent(game)][field]) for game in default_games) / Decimal(len(default_games))
default_yards = [[str(means(side, field)) for side in ['gained', 'allowed']] for field in fields[:3]]
snapshot = {
    'pointsFor': sum(Decimal(own_score(game)) for game in default_games) / Decimal(5),
    'pointsAgainst': sum(Decimal(other_score(game)) for game in default_games) / Decimal(5),
    'thirdDownPercentage': sum(Decimal(game['stats']['DAL']['thirdDownMade']) for game in default_games) * Decimal(100) / sum(Decimal(game['stats']['DAL']['thirdDownAttempts']) for game in default_games),
    'redZoneTDPercentage': sum(Decimal(game['stats']['DAL']['redZoneTD']) for game in default_games) * Decimal(100) / sum(Decimal(game['stats']['DAL']['redZoneAttempts']) for game in default_games),
    'turnoverMargin': sum(Decimal(game['stats'][opponent(game)]['turnovers']) - Decimal(game['stats']['DAL']['turnovers']) for game in default_games) / Decimal(5),
    'penaltyYards': sum(Decimal(game['stats']['DAL']['penaltyYards']) for game in default_games) / Decimal(5),
}
rounded_snapshot = {key: str(value.quantize(Decimal('0.1'))) for key, value in snapshot.items()}
assert rounded_snapshot == {'pointsFor': '27.8', 'pointsAgainst': '29.2', 'thirdDownPercentage': '47.4', 'redZoneTDPercentage': '75.0', 'turnoverMargin': '-0.2', 'penaltyYards': '70.2'}

report_path = HOST / 'results.json'
report = load(report_path)
assert sha(report_path) == '1d0cbd1885854b3b1a18014ca354d8985bfa19bf537d88d7b12f699312d9c330'
assert report['status'] == 'passed' and report['hosted'] and report['engine'] == 'webkit' and report['base'] == base
assert report['completedAt'] and report['unchangedDuringQA'] and report['testLogicUnchangedDuringQA']
assert report['source']['runtimeFiles'] == manifest and report['source']['sourceEquivalence'] == kernel
assert report['source']['testFiles'] == freeze['testFiles']
assert report['source']['currentHash'] == manifest['assets/data/current.json']
assert report['source']['teamFormHash'] == manifest['assets/data/team-details.json']
assert report['source']['independentlyVerifiedMetadataLeaves'] == 1827
assert report['source']['footballValueChanges'] == report['source']['typeKeyAndArrayShapeChanges'] == 0
assert report['source']['unchangedRuntimeFiles'] == 228
assert report['qualification']['strictTLS'] and report['qualification']['genuineBrowser'] and report['qualification']['noSiteOrSourceDataSubstitution']
assert not report['qualification']['physicalIPhone']
served = report['servedRuntime']
assert served['status'] == 'passed' and all(not errors for errors in served['errors'].values())
assert len(served['rows']) == 231 and {row['file'] for row in served['rows']} == set(manifest)
for row in served['rows']:
    assert row['status'] == 200 and row['sha256'] == manifest[row['file']]
    assert row['url'] == base + row['file'] and row['bytes'] == pathlib.Path(row['file']).stat().st_size

images, cases, projections = [], [], []
def capture(root, metadata, role, viewport, unrolled=False):
    path = root / metadata['file']
    assert sha(path) == metadata['sha256'] and path.stat().st_size == metadata['bytes'] and metadata['naturalAnimationPhase']
    if 'readiness' in metadata:
        ready = metadata['readiness']
        assert ready['status'] == 'passed' and ready['finiteEntryNaturallyFinished'] and ready['noStylesClockOrAnimationMutation']
        assert ready['genuineAnimationFrames'] == 2 and ready['frameTimestamps'][1] > ready['frameTimestamps'][0]
        assert ready['settled']['opacity'] == 1 and ready['pixels']['status'] == 'passed'
        assert ready['pixels']['brightFraction'] >= ready['pixels']['minimumBrightFraction'] == 0.01
    if unrolled:
        assert metadata['isolatedActualAppPage'] and metadata['captureOnlyUnrolledInternalScroll'] and metadata['originalFunctionalPageUntouched']
        assert metadata['semanticDataSha256'] == '70b0712eba1fe100446549eadea458f4e693176ca5ca6e403f74e6749aef096b'
    images.append({**ref(path), 'viewport': viewport, 'role': role, 'personallyInspected': True, 'captureOnlyUnrolledPage': unrolled, 'disposition': 'accepted: full paint, legible source context, accurate values and approved visual identity'})

for child_reference in report['providerRefreshReports']:
    child_path = pathlib.Path(child_reference['file'])
    child = load(child_path)
    assert sha(child_path) == child_reference['sha256'] and child_reference['status'] == child['status'] == 'passed'
    assert child_reference['completedAt'] == child['completedAt'] and child['unchangedDuringQA'] and child['testLogicUnchangedDuringQA']
    assert child['hosted'] and child['base'] == base and child['engine'] == 'webkit'
    source = child['source']
    assert source['runtimeFiles'] == manifest and source['sourceEquivalence'] == kernel
    assert source['currentManifestSha256'] == sha(manifest_path) and source['originalManifestSha256'] == sha(old_manifest_path)
    assert source['independentlyVerifiedMetadataLeaves'] == 1827 and source['footballValueChanges'] == source['typeKeyAndArrayShapeChanges'] == 0
    assert all(sha(path) == digest == freeze['testFiles'][path] for path, digest in source['testFiles'].items())
    for c in child['results']:
        assert c['status'] == 'passed' and len(c['nativeActions']) == 31 and c['directReload'] and c['homeLadderTeamRoundTrip']
        assert all(not errors for errors in c['errors'].values())
        assert [tab['tab'] for tab in c['tabs']] == ['players', 'lineup', 'form']
        assert c['upcomingMatchup']['event'] == dal['upcomingGameId'] == '2026_05_TB_DAL'
        assert (c['upcomingMatchup']['season'], c['upcomingMatchup']['week']) == (2026, 5)
        assert 'Fri, 9 Oct · 11:15 am AEDT' in c['upcomingMatchup']['content']
        assert 'AT&T Stadium · HOME' in c['upcomingMatchup']['content'] and 'Dallas Cowboys\t2–2' in c['upcomingMatchup']['content']
        assert 'confirmed inactives and exact pre-game prices are unavailable' in c['upcomingMatchup']['content']
        assert c['scheduleEvents'] == schedule_ids
        assert len(c['sourceBodies']) == 4
        for body in c['sourceBodies']:
            path = 'assets/data/' + body['url'].split('/')[-1]
            assert body['url'] == base + path and body['status'] == 200 and body['sha256'] == manifest[path]
            assert body['bytes'] == pathlib.Path(path).stat().st_size
        assert len(c['aggregate']) == 6
        for cell in c['aggregate']:
            values = [game['stats']['DAL' if cell['side'] == 'gained' else opponent(game)][cell['metric']] for game in selected]
            assert all(value is not None for value in values) and num(cell['text']) == sum(Decimal(value) for value in values)
        game_report = c['report']
        g = next(game for game in dal['games'] if game['id'] == game_report['event'])
        assert g['id'] == selected[0]['id'] and (g['season'], g['week']) == (game_report['season'], game_report['week'])
        assert len(game_report['rows']) == 9
        for field, row in zip(fields, game_report['rows']):
            assert num(row[1]) == Decimal(g['stats']['DAL'][field]) and num(row[2]) == Decimal(g['stats']['WAS'][field])
        assert c['teamSources']['sourceRetrievedAt'] == team['retrievedAt'] == '2026-10-08T06:28:00Z'
        assert c['teamSources']['formattedSourceTime'] == '8 Oct, 5:28 pm AEDT'
        links = c['teamSources']['links']
        assert len(links) == 31 and {link['url'] for link in links} == {source['url'] for source in team['sources']}
        assert all(link['target'] == '_blank' and 'noopener' in link['rel'] and 'noreferrer' in link['rel'] for link in links)
        for name, file in [('teamRefresh', 'team-details.json'), ('currentRefresh', 'current.json')]:
            refresh = c[name]
            path = 'assets/data/' + file
            assert refresh['url'] == base + path and refresh['httpStatus'] in [200, 304]
            if refresh['httpStatus'] == 200:
                assert refresh['sha256'] == manifest[path] and refresh['responseBytes'] == pathlib.Path(path).stat().st_size
            exact = refresh['exactRevalidation']
            assert exact['url'] == base + path and exact['status'] == 200 and exact['sha256'] == manifest[path]
            assert exact['bytes'] == pathlib.Path(path).stat().st_size
        refresh = c['teamRefresh']
        assert refresh['filterContextRetained'] and len(refresh['domIdentity']['nodes']) == 6
        assert all(node['exists'] and node['same'] and node['connected'] for node in refresh['domIdentity']['nodes'])
        assert refresh['domIdentity']['events'] == [{'changed': False, 'recovered': False}]
        status = c['currentRefresh']['status']
        assert status['state'] == 'unchanged' and status['reason'] == 'manual' and status['streamState'] == 'not-configured'
        assert status['sourceRetrievedAt'] == current['retrievedAt'] == '2026-10-08T11:22:00Z'
        bridge = c['steelersBridge']
        assert bridge['playerId'] == '00-0023459' and bridge['historyStatus'] == 'ready'
        assert bridge['historySha256'] == manifest['assets/data/player-history.json'] and bridge['retrievedAt'] == history['retrievedAt']
        nfl_rows = [[part.strip() for part in row['text'].split('\n') if part.strip()] for row in c['finalNflGeometry']['rows']]
        standings = [row for row in nfl_rows if len(row) == 12 and row[1] in {club['name'] for club in current['weeks']['5']['conferences']['AFC']}]
        assert len(standings) == 5
        for row in standings:
            club = next(club for club in current['weeks']['5']['conferences']['AFC'] if club['name'] == row[1])
            assert row[0] == str(club['sortIndex'])
            assert [num(value) for value in row[2:8]] == [Decimal(club[field]) for field in ['w', 'l', 'pct', 'pointsFor', 'pointsAgainst', 'pointDifferential']]
            assert row[8:] == team['teams'][club['abbr']]['record']['form'][-4:]
        leader_rows = [row for row in nfl_rows if len(row) == 4]
        assert len(leader_rows) == 15
        leaders = [(str(index + 1), player) for position in ['QB', 'RB', 'WR'] for index, player in enumerate(current['weeks']['5']['leaders'][position][:5])]
        for row, (rank, player) in zip(leader_rows, leaders):
            assert row[0] == rank and re.sub(r'\s', '', row[1]) == player['short']
            assert num(row[2]) == Decimal(player['yards']) and num(row[3]) == Decimal(player['td'])
        for key in ['homeCapture', 'teamCapture', 'nflCapture']:
            capture(child_path.parent, c[key], 'provider-' + key.removesuffix('Capture'), c['viewport'])
        cases.append({'kind': 'provider-child', 'viewport': c['viewport'], 'status': 'passed', 'recordedNativeActions': 31, 'sourceBodyHashes': 4, 'aggregateCellsIndependentlyRecomputedFromText': 6, 'gameReportCellsIndependentlyRecomputedFromText': 18, 'exactScheduleEvents': 17, 'citationDestinations': 31, 'sameConnectedNodesAfterRealRefresh': 6, 'NFLStandingsRowsIndependentlyChecked': 5, 'weeklyLeaderRowsIndependentlyChecked': 15, 'errors': 0})
        projections.append({'aggregate': [(cell['metric'], cell['side'], cell['text']) for cell in c['aggregate']], 'report': game_report, 'schedule': c['scheduleEvents'], 'standings': standings, 'leaders': leader_rows})
assert len(cases) == 3 and all(projection == projections[0] for projection in projections)
assert {(case['viewport']['width'], case['viewport']['height']) for case in cases} == {(393, 852), (430, 896), (1440, 1000)}

default_table_checks = 0
for c in report['results']:
    assert c['status'] == 'passed' and len(c['nativeActions']) == 10 and c['directLoadReload']
    assert all(not errors for errors in c['errors'].values())
    assert [sport['sport'] for sport in c['homeSports']] == ['nfl', 'nba', 'nrl', 'ufc']
    for sport in c['homeSports']:
        name, state = sport['sport'], sport['state']
        assert state['sport'] == name and state['selected'] == [name] and state['entryDisabled'] == (name != 'nfl')
        assert state['teamsLabel'] == ('Fighters' if name == 'ufc' else 'Teams') and 'preview only' not in state['text'].lower()
        if name != 'nfl':
            assert sport['comingSoonGuard']['sameRoute'] and 'coming soon' in sport['comingSoonGuard']['message'].lower()
        capture(HOST, sport['capture'], 'home-' + name, c['viewport'])
    vd = c['venueDestination']
    assert [[column.replace('–', '-').replace('−', '-') for column in row] for row in vd['rows']] == venue_expected
    assert vd['appliedVenue'] == 'home' and vd['focusRestored']
    geometries = [c['initialGeometry'], c['finalGeometry']] + [shot['geometry'] for shot in c['scroll']['shots']]
    for geometry in geometries:
        assert not geometry['clipped'] and geometry['documentWidth'] <= c['viewport']['width']
        assert geometry['scroller']['scrollWidth'] == geometry['scroller']['clientWidth']
        actual_game_rows = []
        for row in geometry['rows']:
            text = row['text']
            if text.startswith('2026 W') or text.startswith('2025 W'):
                parts = [part.strip() for part in text.split('\n') if part.strip()]
                assert len(parts) == 5
                actual_game_rows.append(parts)
            elif text.startswith('METRIC\tGAINED\tALLOWED'):
                lines = [line.split('\t') for line in text.strip().split('\n')][1:]
                assert len(lines) == 3
                for line, expected in zip(lines, default_yards):
                    assert [num(value) for value in line[1:]] == [Decimal(value) for value in expected]
                    default_table_checks += 2
        assert len(actual_game_rows) == 5
        for row, game in zip(actual_game_rows, default_games):
            result = 'W' if own_score(game) > other_score(game) else 'L' if own_score(game) < other_score(game) else 'T'
            assert row[0] == f"{game['season']} W{game['week']}" and row[2].replace('–', '-') == f'{result} {own_score(game)}-{other_score(game)}'
            assert num(row[3]) == Decimal(game['stats']['DAL']['totalOffense']) and num(row[4]) == Decimal(game['stats'][opponent(game)]['totalOffense'])
            assert ('PRIOR SEASON' in row[1]) == (game['season'] != team['season'])
            assert ('(N)' in row[1]) == (game['neutral'] is True)
    for shot in c['scroll']['shots']:
        capture(HOST, shot, 'team-scroll', c['viewport'])
    capture(HOST, c['fullContent'], 'team-full-content', c['viewport'], unrolled=True)
    capture(HOST, c['finalCapture'], 'team-final', c['viewport'])
    cases.append({'kind': 'hosted-parent', 'viewport': c['viewport'], 'status': 'passed', 'recordedNativeActions': 10, 'venueRowsIndependentlyRecomputedFromSource': 4, 'defaultGameRowsSourceCheckedAcrossFiveGeometrySamples': 25, 'fullContentSemanticSourceHashMatches': True, 'defaultSnapshotNumbersPersonallyComparedWithSourceArithmetic': rounded_snapshot, 'errors': 0})

actual_images = {str(path) for path in HOST.rglob('*.png')}
assert len(images) == 36 and len({image['file'] for image in images}) == 36
assert {image['file'] for image in images} == actual_images
viewed = set(load('/tmp/project-dollar-hosted-data-viewed.json'))
assert {str(path.relative_to(HOST)) for path in HOST.rglob('*.png')} == viewed
assert sum(image['captureOnlyUnrolledPage'] for image in images) == 3
exit_path = P / 'hosted-webkit-process/exit.json'
process = load(exit_path)
assert process['status'] == 'passed-qa' and process['exitCode'] == process['qaExitCode'] == 0
assert process['qaReportStatus'] == 'passed' and process['qaReportCompletedAt'] == report['completedAt']
prior_path = P / 'reviews/final/data-v3.json'
integration_path = P / 'reviews/integration/data.json'
assert load(prior_path)['status'] == load(integration_path)['status'] == 'accepted'
assert load(prior_path)['runtimeManifestSha256'] == sha(old_manifest_path)
assert load(integration_path)['runtimeManifestSha256'] == sha(manifest_path)

receipt = {
    'status': 'accepted', 'agent': 'team_data_audit', 'auditedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Independent data acceptance of the genuine completed hosted target at393x852,430x896 and1440x1000, with all36 original PNGs personally inspected. Targeted hosting checks supplement the preserved full local current/protected suites; they do not claim a second full312-action/83-disclosure hosted audit.',
    'base': base, 'runtimeManifestSha256': sha(manifest_path), 'runtimeManifest': ref(manifest_path),
    'originalRuntimeManifestSha256': sha(old_manifest_path), 'originalRuntimeManifest': ref(old_manifest_path),
    'runtimeFiles': 231, 'unchangedCodeAssetFilesFromFullAudit': 228,
    'dataset': ref('assets/data/team-details.json'), 'sourceDatasets': [ref('assets/data/' + file) for file in ['current.json', 'team-details.json', 'player-history.json', 'provenance.json']],
    'freeze': ref(freeze_path), 'report': ref(report_path), 'providerChildReports': [ref(child['file']) for child in report['providerRefreshReports']],
    'actualProcessCompletion': ref(exit_path), 'completedAt': report['completedAt'], 'cases': cases,
    'visualEvidence': images,
    'visualQualification': '33 original untouched viewport captures, plus3 original same-context full-content captures using explicitly recorded isolated capture-only internal-scroll exposure. Original functional pages, source facts and normal viewport geometry remain untouched. Natural animation phases and original PNG bytes are preserved; interior qualification only rejects blank evidence.',
    'sourceVerification': {
        'classification': ref(P / 'incoming-source/fbe4167ff9ad-data-classification.json'),
        'exactScopedEquivalence': ref(P / 'incoming-source/fbe4167-games-consumed-equivalence.json'),
        'independentFullBuilderReplay': ref(P / 'incoming-source/fbe4167-independent-full-team-replay.json'),
        'personallyRecomputedKernel': ref(kernel_path), 'metadataLeaves': 1827, 'footballValueChanges': 0, 'typeKeyAndArrayShapeChanges': 0,
        'all544CompleteTeamGameProjectionsEqual': True, 'all32TeamStructuresEqual': True,
        'actuallyConsumedMarketObjectsEqual': 446, 'actuallyConsumedMarketUniqueGames': 143,
        'realRawMarketFactChanges': 21, 'rawWholeBodyHashesEqual': False, 'otherSharedWholeSourceBodiesEqual': 6,
        'retainedTeamSourceSha256': 'bca61696e892eba9679670d87648ac1b8c493a24d430b82d49d9490b8273b47d',
        'importedGamesSourceSha256': '65a36db5f65c8de72a887bc1d76514d02fe70fb8c293a05e3b123903604a5d35',
        'qualification': 'Raw21 market-cell changes on6 games are real; three generic market projections differ but are absent from actual published core markets. Team data consumes no markets and its full builder replay is identical. This acceptance binds the exact archived source pair, classification and output hashes, not arbitrary future data. Retained team facts keep their original source hash/time.'
    },
    'dataAcceptance': {
        'all231ActualServedHTTP200DecodedBodiesMatchReviewedManifest': True,
        'all12ProviderSourceBodiesMatchExactReviewedData': True,
        'allSixRealManualRefreshesHaveExactHTTP200Revalidation': True,
        'providerAggregateTextCellsIndependentlyRecomputed': 18, 'providerReportTextCellsIndependentlyRecomputed': 54,
        'scheduleEventAssertions': 51, 'citationDestinationAssertions': 93,
        'NFLStandingsRowsSourceChecked': 15, 'weeklyLeaderRowsSourceChecked': 45,
        'venueRowsSourceChecked': 12, 'defaultYardCellsSourceCheckedAcrossGeometrySamples': default_table_checks,
        'originalTeamRetrievedAt': team['retrievedAt'], 'currentRetrievedAt': current['retrievedAt'],
        'fourDALDisagreementsPreserved': True, 'missingFactsRemainUnavailable': True,
        'noSyntheticRowsOrMockFootballValues': True, 'sourceTextProjectionsEqualAcrossAllThreeHostedViewports': True,
        'genuinePITToSteelersAaronRodgersHistoryBridge': True, 'domContextAndFocusPreservedAfterUnchangedRefresh': True
    },
    'preservedFullLocalAcceptance': ref(prior_path), 'preservedLocalIntegrationAcceptance': ref(integration_path),
    'blockingFindingsWithinScope': [], 'releaseGates': {'fullLocalCurrentAndProtected': 'accepted', 'importedProviderIntegration': 'accepted', 'actualHostedDataVerification': 'accepted'},
    'limits': ['Native WebKit automation with2x density is not a physical iPhone or physical60fps measurement.', 'Approved reference was the chat attachment; data correctness deliberately replaces its illustrative placeholders and sample values.', 'Provider publication/correction latency remains; the current authorised push stream is explicitly not configured.']
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': receipt['status'], 'file': str(OUT), 'sha256': sha(OUT), 'runtimeManifestSha256': sha(manifest_path), 'actualServedHTTPBodies': 231, 'personallyInspectedPNGs': len(images), 'nativeActions': sum(case['recordedNativeActions'] for case in cases), 'defaultYardTextCells': default_table_checks}))
