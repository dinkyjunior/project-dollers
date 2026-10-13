"""Read-only isolation gate for the approved NFL editorial dashboard change."""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
from html.parser import HTMLParser

ROOT = pathlib.Path('/workspace/project-dollers')
OUT = pathlib.Path('/workspace/.onboarding/nfl-editorial-preservation')
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
def start(text, page):
    match = re.search(r'<section\b(?=[^>]*\bdata-page="' + page + r'")[^>]*>', text)
    if not match:
        raise ValueError('Missing root page: ' + page)
    return match.start()

home_same = before[start(before, 'home'):start(before, 'nfl')] == after[start(after, 'home'):start(after, 'nfl')]
other_research_same = before[start(before, 'steelers'):] == after[start(after, 'steelers'):]
def normalize_prefix(text):
    text = re.sub(r'(?m)^[ \t]*<link\b[^>]*href="assets/nfl-editorial\.css(?:\?[^"]*)?"[^>]*>[ \t]*\r?\n', '', text)
    return re.sub(r'src="assets/nfl-dashboard\.js(?:\?[^"]*)?"', 'src="assets/nfl-dashboard.js"', text)
prefix_same = normalize_prefix(before[:start(before, 'nfl')]) == normalize_prefix(after[:start(after, 'nfl')])
if not home_same:
    failures.append({'path': 'index.html', 'issue': 'protected Home section changed'})
if not other_research_same:
    failures.append({'path': 'index.html', 'issue': 'Steelers or later research markup changed'})
if not prefix_same:
    failures.append({'path': 'index.html', 'issue': 'document prefix changed beyond approved NFL include/cache tag'})

class Includes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.new_style = []
    def handle_starttag(self, tag, attrs):
        if tag not in {'script', 'link'}:
            return
        details = dict(attrs)
        target = details.get('src') if tag == 'script' else details.get('href')
        if not target:
            return
        if tag == 'link' and target.split('?')[0] == 'assets/nfl-editorial.css':
            self.new_style.append(attrs)
            return
        if tag == 'script' and target.split('?')[0] == 'assets/nfl-dashboard.js':
            attrs = [(key, value.split('?')[0] if key == 'src' else value) for key, value in attrs]
        self.items.append((tag, attrs))

p, q = Includes(), Includes()
p.feed(before)
q.feed(after)
includes_same = p.items == q.items
if not includes_same:
    failures.append({'path': 'index.html', 'issue': 'protected include or ordering changed'})
if len(q.new_style) != 1:
    failures.append({'path': 'index.html', 'issue': 'expected one new NFL editorial stylesheet include'})

home_files = {}
for name, expected in context['requiredUnchangedHomeFiles'].items():
    path = ROOT / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    home_files[name] = dict(expected, unchanged=actual == expected['sha256'])
    if actual != expected['sha256']:
        failures.append({'path': name, 'issue': 'required Home SHA-256 mismatch'})

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--short'], cwd=ROOT, text=True).splitlines()
result = {
    'status': 'passed' if not failures else 'failed',
    'baselineProductionCommit': context['baselineProductionCommit'],
    'candidateBaseCommit': head, 'workingTreeStatus': dirty,
    'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    **{key: context[key] for key in ['protectedFiles', 'protectedAssetScriptWorkflowFiles', 'dataFiles', 'archivedQAFiles', 'referenceFiles']},
    'HomeMarkupByteIdentical': home_same,
    'ProtectedDocumentPrefixIdentical': prefix_same,
    'OtherResearchMarkupByteIdentical': other_research_same,
    'ProtectedIncludesIdentical': includes_same,
    'NewNFLEditorialStyleIncludes': len(q.new_style),
    'requiredUnchangedHomeFiles': home_files,
    'currentNFLSourceHashes': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                               for name in ['index.html', 'assets/nfl-dashboard.js', 'assets/nfl-editorial.css'] if (ROOT / name).exists()},
    'failures': failures,
    'qualification': 'Exact existing production and archive content comparison uses Git blob identities; key Home files also compare SHA-256. Preserved snapshot consistency is not official current standings verification or hosted deployment.'
}
(OUT / 'isolation-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'baselineProductionCommit', 'candidateBaseCommit',
      'protectedFiles', 'protectedAssetScriptWorkflowFiles', 'dataFiles', 'archivedQAFiles', 'referenceFiles',
      'HomeMarkupByteIdentical', 'OtherResearchMarkupByteIdentical', 'ProtectedIncludesIdentical',
      'ProtectedDocumentPrefixIdentical', 'NewNFLEditorialStyleIncludes', 'failures']}, indent=2))
raise SystemExit(0 if not failures else 1)
