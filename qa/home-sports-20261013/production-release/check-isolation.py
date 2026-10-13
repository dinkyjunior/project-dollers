"""Read-only production isolation check for the Home-only release."""
import hashlib, json, pathlib, subprocess, datetime

ROOT = pathlib.Path('/workspace/project-dollers')
OUT = pathlib.Path('/workspace/.onboarding/home-production-release')
baseline = json.loads((OUT / 'baseline-context.json').read_text())
manifest = json.loads((OUT / 'production-protected-manifest.json').read_text())
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
failures = []
for name, expected in manifest.items():
    p = ROOT / name
    if not p.is_file():
        failures.append({'path': name, 'issue': 'missing'})
        continue
    content = p.read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected['sha256'] or len(content) != expected['bytes']:
        failures.append({'path': name, 'issue': 'content differs', 'expected': expected['sha256'], 'actual': actual})
paths = subprocess.check_output(['git', 'diff', '--name-only', baseline['baselineProductionCommit'], head], cwd=ROOT, text=True).splitlines()
for name in paths:
    if name in manifest and not any(f['path'] == name for f in failures):
        failures.append({'path': name, 'issue': 'commit differs from protected production baseline'})
before = subprocess.check_output(['git', 'show', baseline['baselineProductionCommit'] + ':index.html'], cwd=ROOT, text=True)
after = (ROOT / 'index.html').read_text()
marker = '<section class="page nfl-premium-dashboard'
research_markup_equal = before[before.index(marker):] == after[after.index(marker):]
if not research_markup_equal:
    failures.append({'path': 'index.html', 'issue': 'existing research markup differs'})
result = {'status': 'passed' if not failures else 'failed', 'baselineProductionCommit': baseline['baselineProductionCommit'], 'releaseCommit': head, 'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'protectedFilesChecked': len(manifest), 'dataFilesChecked': baseline['dataFiles'], 'researchMarkupByteIdentical': research_markup_equal, 'changedCommitPaths': paths, 'failures': failures, 'qualification': 'Home-only production release isolation. Byte preservation is not an independent NFL accuracy or hosted delivery certificate.'}
(OUT / 'release-isolation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'releaseCommit': head, 'protectedFilesChecked': len(manifest), 'dataFilesChecked': baseline['dataFiles'], 'researchMarkupByteIdentical': research_markup_equal, 'failures': failures, 'path': str(OUT / 'release-isolation.json')}, indent=2))
raise SystemExit(0 if result['status'] == 'passed' else 1)
