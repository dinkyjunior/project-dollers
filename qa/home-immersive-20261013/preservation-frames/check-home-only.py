"""Read-only frozen Home candidate preservation gate, including prior archives."""
import datetime
import hashlib
import json
import pathlib
import subprocess
from html.parser import HTMLParser

ROOT = pathlib.Path('/workspace/project-dollers')
OUT = pathlib.Path('/workspace/.onboarding/home-immersive-preservation')
context = json.loads((OUT / 'baseline-context.json').read_text())
manifest = json.loads((OUT / 'protected-manifest.json').read_text())
failures = []

for name, expected in manifest.items():
    path = ROOT / name
    if not path.is_file():
        failures.append({'path': name, 'issue': 'missing protected file'})
        continue
    size = path.stat().st_size
    hasher = hashlib.sha1(('blob ' + str(size) + '\0').encode())
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            hasher.update(chunk)
    actual = hasher.hexdigest()
    if actual != expected['gitBlobId'] or size != expected['bytes']:
        failures.append({'path': name, 'issue': 'protected production content changed',
                         'expectedBlobId': expected['gitBlobId'], 'actualBlobId': actual})

before = (OUT / 'baseline-index.html').read_text()
after = (ROOT / 'index.html').read_text()
marker = '<section class="page nfl-premium-dashboard'
tail_same = before[before.index(marker):] == after[after.index(marker):]
if not tail_same:
    failures.append({'path': 'index.html', 'issue': 'NFL or later research markup changed'})

class Includes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
    def handle_starttag(self, tag, attrs):
        if tag not in {'script', 'link'}:
            return
        details = dict(attrs)
        target = details.get('src') if tag == 'script' else details.get('href')
        if not target or target.startswith(('assets/home-editorial.css', 'assets/home-editorial.js')):
            return
        self.items.append((tag, attrs))

p, q = Includes(), Includes()
p.feed(before)
q.feed(after)
includes_same = p.items == q.items
if not includes_same:
    failures.append({'path': 'index.html', 'issue': 'existing non-Home include/order changed'})

required = {}
for name, expected in context['requiredUnchangedArt'].items():
    path = ROOT / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    required[name] = dict(expected, unchanged=actual == expected['sha256'])
    if actual != expected['sha256']:
        failures.append({'path': name, 'issue': 'required art SHA-256 mismatch'})

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--short'], cwd=ROOT, text=True).splitlines()
result = {
    'status': 'passed' if not failures else 'failed',
    'baselineProductionCommit': context['baselineProductionCommit'],
    'candidateBaseCommit': head,
    'workingTreeStatus': dirty,
    'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    **{key: context[key] for key in ['protectedFiles', 'protectedAssetScriptWorkflowFiles',
                                    'dataFiles', 'archivedQAFiles', 'referenceFiles']},
    'NFLAndLaterMarkupByteIdentical': tail_same,
    'existingNonHomeIncludesIdentical': includes_same,
    'requiredUnchangedArt': required,
    'currentHomeSourceHashes': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                               for name in ['index.html', 'assets/home-editorial.css',
                                            'assets/home-editorial.js']},
    'failures': failures,
    'qualification': 'Working Home candidate bound by current source hashes. Exact existing production and archive content comparison uses Git blob identities; required NFL art also compares SHA-256. Local preservation is not provider freshness or hosted verification.'
}
(OUT / 'preservation-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'baselineProductionCommit',
      'candidateBaseCommit', 'protectedFiles', 'protectedAssetScriptWorkflowFiles',
      'dataFiles', 'archivedQAFiles', 'referenceFiles', 'NFLAndLaterMarkupByteIdentical',
      'existingNonHomeIncludesIdentical', 'requiredUnchangedArt', 'failures']}, indent=2))
raise SystemExit(0 if not failures else 1)
