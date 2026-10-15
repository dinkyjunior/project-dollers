"""Reconcile the candidate release against independently retrieved official pages."""
import hashlib
import json
import pathlib
import re
import subprocess
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).parent
SOURCE = OUT / 'sources'

class NFLRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.cells = None
        self.cell = None
        self.abbr = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr':
            self.cells, self.abbr = [], None
        if self.cells is not None and tag == 'td':
            self.cell = []
        logo = re.search(r'/clubs/logos/([A-Z]{2,3})(?:$|[? /])', attrs.get('src', ''))
        if self.cells is not None and logo:
            self.abbr = {'LAR':'LA', 'WSH':'WAS', 'AZ':'ARI'}.get(logo[1], logo[1])

    def handle_data(self, text):
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.cells.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        if tag == 'tr' and self.cells is not None:
            if self.abbr and len(self.cells) >= 9:
                c = self.cells
                self.rows.append((self.abbr, dict(w=int(c[1]), l=int(c[2]), ties=int(c[3]), rank=int(c[4]), pct=float(c[5]), pointsFor=int(c[6]), pointsAgainst=int(c[7]))))
            self.cells = None

api = json.loads((SOURCE/'independent-espn-api.json').read_text())
assert api['season']['year'] == 2026
expected = {}
orders = {}
raw_orders = {}
for conference in api['children']:
    name = conference['abbreviation']
    assert conference['standings']['seasonType'] == 2
    rows = []
    for entry in conference['standings']['entries']:
        abbr = {'LAR':'LA', 'WSH':'WAS'}.get(entry['team']['abbreviation'], entry['team']['abbreviation'])
        stats = {s['name']: s for s in entry['stats']}
        row = dict(conference=name, rank=int(stats['playoffSeed']['value']), w=int(stats['wins']['value']), l=int(stats['losses']['value']), ties=int(stats['ties']['value']), pct=float(stats['winPercent']['value']))
        expected[abbr] = row
        rows.append(abbr)
    raw_orders[name] = rows
    orders[name] = sorted(rows,key=lambda abbr:expected[abbr]['rank'])
    assert sorted(expected[a]['rank'] for a in rows) == list(range(1,17))
assert orders['AFC'] == 'KC BAL JAX BUF NE DEN LV CLE PIT CIN NYJ IND HOU MIA LAC TEN'.split()
assert orders['NFC'] == 'SF MIN NYG CAR GB DET CHI SEA LA ATL PHI DAL WAS TB NO ARI'.split()
nfl = NFLRows()
nfl.feed((SOURCE/'independent-nfl-conference.html').read_text())
assert len(nfl.rows) == 32 and len({a for a,_ in nfl.rows}) == 32
nfl_rows = dict(nfl.rows)
differences = []
for abbr, actual in nfl.rows:
    assert all(expected[abbr][field] == actual[field] for field in ['w','l','ties','pct'])
    if actual['rank'] != expected[abbr]['rank']:
        differences.append(dict(abbr=abbr, espnRank=expected[abbr]['rank'], nflRank=actual['rank']))
assert {r['abbr'] for r in differences} == {'CHI','DET','MIA','TEN'}
feed = json.loads((ROOT/'assets/data/standings.json').read_text())
assert feed['ranking']['official'] is True and feed['ranking']['provider'] == 'ESPN'
week = feed['weeks'][str(feed['currentBrowsingWeek'])]
for conference in ['AFC','NFC']:
    rows = week['conferences'][conference]
    assert [r['abbr'] for r in rows] == orders[conference]
    for row in rows:
        abbr = row['abbr']
        for field in ['w','l','ties','rank']:
            assert row[field] == expected[abbr][field], (abbr,field,row[field],expected[abbr][field])
        for field in ['pointsFor','pointsAgainst']:
            assert row[field] == nfl_rows[abbr][field], (abbr,field)
        assert abs(float(row['pct'])-expected[abbr]['pct']) < .00051
actual_differences = {d['abbr']:(d['espnRank'],d['nflRank']) for d in feed['crossCheck']['orderDisagreements']}
assert actual_differences == {d['abbr']:(d['espnRank'],d['nflRank']) for d in differences}
preserved = {}
for file in ['assets/data/current.json','assets/data/team-details.json','assets/data/game-reports.json','assets/team-details.js','assets/player-research.js','assets/matchup-breakdown.js','assets/game-report.js','assets/home-editorial.js','assets/home-editorial.css']:
    actual = (ROOT/file).read_bytes()
    assert actual == subprocess.check_output(['git','show',f'43521f6:{file}'],cwd=ROOT), file
    preserved[file] = hashlib.sha256(actual).hexdigest()
changed = subprocess.check_output(['git','diff','43521f6','--name-only'],cwd=ROOT,text=True).splitlines()
allowed = {'assets/app.js','assets/nfl-dashboard.js','assets/nfl-editorial.css','index.html','assets/data/standings.json','scripts/refresh-standings.py','.github/workflows/refresh-nfl-standings.yml','qa/standings.test.py','qa/standings-ui.test.cjs'}
assert all(file in allowed or file.startswith('qa/standings-order-20261015/') for file in changed), changed
result = dict(result='pass', comparedTeams=32, sourceOrders=orders, rawApiOrders=raw_orders, NFLRecordsMatch=True, NFLRankDifferences=differences, preservedFiles=preserved, changedTrackedFiles=changed)
(OUT/'independent-data.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['preservedFiles','changedTrackedFiles']},indent=2))
