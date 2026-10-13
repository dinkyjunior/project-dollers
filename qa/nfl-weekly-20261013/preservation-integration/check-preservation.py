#!/usr/bin/env python3
"""Independently guard the approved NFL-only edit against production HEAD.

The manifest captures Git object IDs from the existing production baseline.
No application, data, asset or old QA file is modified by this audit.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path('/workspace/project-dollers')
OUT = Path(__file__).resolve().parent
manifest = json.loads((OUT / 'baseline-manifest.json').read_text())
result = {
    'baseline': manifest['baseline'],
    'scope': 'NFL dashboard JS/CSS, its index slice/cache versions, AGENTS and new QA evidence; targeted matchup return route exception within four functions only',
    'targetedMatchupException': manifest.get('authorizedTargetedException'),
    'protectedFiles': len(manifest['protectedTracked']),
    'protectedDataFiles': sum(name.startswith('assets/data/') for name in manifest['protectedTracked']),
    'protectedOldQA': sum(name.startswith('qa/') for name in manifest['protectedTracked']),
    'changedProtected': [],
    'checks': [],
}

for name, wanted in manifest['protectedTracked'].items():
    file = ROOT / name
    if not file.exists():
        result['changedProtected'].append({'name': name, 'status': 'missing'})
        continue
    content = file.read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
    if actual != wanted:
        result['changedProtected'].append({'name': name, 'status': 'changed', 'expected': wanted, 'actual': actual})
result['checks'].append({'name': 'Every protected tracked file unchanged', 'passed': not result['changedProtected']})

def isolate_index(source):
    start = source.index('      <section class="page nfl-editorial-dashboard"')
    finish = source.index('      <section\n        class="page"\n        data-page="steelers"', start)
    outside = source[:start] + '<NFL_DASHBOARD_SLICE>' + source[finish:]
    # Cache versions are the only allowed changes outside the NFL DOM slice.
    return re.sub(r'(?P<path>assets/(?:nfl-dashboard\.js|nfl-editorial\.css|matchup-breakdown\.js))\?v=[^"\s]+',
                  r'\g<path>?v=<CACHE_VERSION>', outside)

baseline_index = (OUT / 'baseline-index.html').read_text()
current_index = (ROOT / 'index.html').read_text()
index_preserved = isolate_index(baseline_index) == isolate_index(current_index)
result['checks'].append({'name': 'Home and other research markup/scripts unchanged outside the NFL slice and its cache versions', 'passed': index_preserved})
result['indexOutsideSha256'] = hashlib.sha256(isolate_index(current_index).encode()).hexdigest()

def isolate_matchup(source):
    for name in manifest['authorizedTargetedException']['functions']:
        pattern = r'^  function ' + re.escape(name) + r'\([^\n]*\) \{[\s\S]*?^  \}'
        source, count = re.subn(pattern, '<TARGETED_' + name + '_FUNCTION>', source, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('Expected exactly one targeted matchup function ' + name)
    return source

before_mb = (OUT / 'baseline-matchup-breakdown.js').read_text()
after_mb = (ROOT / 'assets/matchup-breakdown.js').read_text()
matchup_preserved = isolate_matchup(before_mb) == isolate_matchup(after_mb)
result['checks'].append({'name': 'All matchup logic outside the four targeted return-route functions preserved', 'passed': matchup_preserved})
result['matchupOutsideSha256'] = hashlib.sha256(isolate_matchup(after_mb).encode()).hexdigest()

status = subprocess.check_output(['git', 'status', '--porcelain=v1', '-z'], cwd=ROOT).split(b'\0')
unexpected = []
for row in status:
    if not row:
        continue
    name = row[3:].decode()
    if name not in manifest['allowedMutable'] and not name.startswith('qa/nfl-weekly-20261013/'):
        unexpected.append(name)
result['unexpectedChangedPaths'] = unexpected
result['checks'].append({'name': 'Working changes restricted to approved NFL work and this audit archive', 'passed': not unexpected})
result['status'] = 'PASS' if all(check['passed'] for check in result['checks']) else 'FAIL'
(OUT / 'preservation-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'baseline', 'protectedFiles', 'protectedDataFiles', 'protectedOldQA', 'changedProtected', 'unexpectedChangedPaths']}))
raise SystemExit(0 if result['status'] == 'PASS' else 1)
