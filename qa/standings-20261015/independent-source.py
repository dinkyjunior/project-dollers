"""Independent, read-only audit of the downloaded upstream CSV and released records."""
import csv
import hashlib
import io
import json
import pathlib
import subprocess
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[2]
raw = pathlib.Path('/tmp/standings-independent-source.csv').read_bytes()
feed = json.loads((ROOT / 'assets/data/standings.json').read_text())
assert hashlib.sha256(raw).hexdigest() == feed['source']['sha256']
rows = [r for r in csv.DictReader(io.StringIO(raw.decode())) if r['season'] == '2026' and r['game_type'] == 'REG']
assert len(rows) == 272
finals = [r for r in rows if r['home_score'] != '' and r['away_score'] != '']
assert len(finals) == 79
week5 = [r for r in rows if r['week'] == '5']
assert len(week5) == 15 and all(r['home_score'] and r['away_score'] for r in week5)
buffalo = next(r for r in week5 if set((r['home_team'], r['away_team'])) == {'BUF', 'LA'})
assert int(buffalo['home_score'] if buffalo['home_team'] == 'BUF' else buffalo['away_score']) == 37
assert int(buffalo['home_score'] if buffalo['home_team'] == 'LA' else buffalo['away_score']) == 34
compared = 0
for key, snapshot in feed['weeks'].items():
    games = [r for r in finals if int(r['week']) <= snapshot['throughWeek']]
    assert len(games) == snapshot['coverage']['finalGames']
    for team in snapshot['conferences']['AFC'] + snapshot['conferences']['NFC']:
        totals = Counter(w=0, l=0, ties=0, pointsFor=0, pointsAgainst=0)
        for r in games:
            if team['abbr'] not in (r['home_team'], r['away_team']):
                continue
            home = r['home_team'] == team['abbr']
            own = int(r['home_score'] if home else r['away_score'])
            other = int(r['away_score'] if home else r['home_score'])
            totals['pointsFor'] += own
            totals['pointsAgainst'] += other
            totals['w' if own > other else 'l' if own < other else 'ties'] += 1
        assert all(totals[field] == team[field] for field in totals), (key, team['abbr'], totals, team)
        compared += 1
current = {t['abbr']: t for t in feed['weeks']['6']['conferences']['AFC'] + feed['weeks']['6']['conferences']['NFC']}
assert (current['BUF']['w'], current['BUF']['l']) == (4, 1)
assert (current['LA']['w'], current['LA']['l']) == (2, 3)
changed = subprocess.check_output(['git', 'diff', 'a5944b2', '--name-only'], cwd=ROOT, text=True).splitlines()
allowed = {'index.html', 'assets/nfl-dashboard.js', 'assets/nfl-editorial.css', '.github/workflows/verify-pages.yml'}
unexpected = [name for name in changed if name not in allowed and not name.startswith('qa/') and not name.startswith('.github/workflows/')]
assert not unexpected, unexpected
preserved = {}
for name in ['assets/data/current.json', 'assets/data/team-details.json', 'assets/data/game-reports.json', 'assets/app.js', 'assets/team-details.js', 'assets/player-research.js', 'assets/matchup-breakdown.js', 'assets/game-report.js', 'assets/home-editorial.js', 'assets/home-editorial.css']:
    if not (ROOT/name).exists():
        continue
    expected = subprocess.check_output(['git', 'show', f'a5944b2:{name}'], cwd=ROOT)
    actual = (ROOT/name).read_bytes()
    assert expected == actual, name
    preserved[name] = hashlib.sha256(actual).hexdigest()
report = dict(sourceBytes=len(raw), sourceSha256=hashlib.sha256(raw).hexdigest(), upstreamRegularSeasonGames=len(rows), upstreamFinals=len(finals), week5Finals=len(week5), comparedTeamWeekRecords=compared, buffaloRamsGame=buffalo, records={'BUF':'4-1','LA':'2-3'}, sourceRetrievedAt=feed['source']['retrievedAt'], officialOrderVerified=feed['ranking']['official'], preservedFiles=preserved, changedTrackedFiles=changed)
(pathlib.Path(__file__).parent/'independent-source.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('preservedFiles','buffaloRamsGame')}, indent=2))
