"""Create a verified source archive; exclude secrets, dependencies and raw caches."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'backups/project-dollar-home-continuous-source.zip'
assert not OUTPUT.exists(), 'Never overwrite an earlier source backup'
old = json.loads((ROOT / 'backups/project-dollar-home-tapered-source.json').read_text())
members = {row['path'] for row in old['contents'] if (ROOT / row['path']).is_file()}
members.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'assets').rglob('*') if p.is_file())
for directory in ('qa/home-continuous', 'reference'):
    for p in (ROOT / directory).rglob('*'):
        if p.is_file() and p.suffix.lower() in ('.md', '.json', '.cjs', '.py', '.html'):
            members.add(p.relative_to(ROOT).as_posix())
members.update(('reference/home-tapered-aperture-final-master.png',
                'reference/home-gem-atlas-generated-master.png'))
for name in members:
    assert not name.startswith(('.git/', 'node_modules/', 'backups/', '.aws/', '.codex/'))
    assert '.env' not in Path(name).name and not name.endswith(('.pem', '.key'))
    assert 'raw-cache' not in name
rows = []
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name in sorted(members):
        data = (ROOT / name).read_bytes()
        archive.writestr(name, data)
        rows.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == members
    for row in rows:
        assert hashlib.sha256(archive.read(row['path'])).hexdigest() == row['sha256']
runtime = json.loads(subprocess.check_output(['node', '-e',
    "const q=require('./qa/matchup-breakdown/qa.cjs');console.log(JSON.stringify(q.runtimeManifest()))"], cwd=ROOT))
rowmap = {r['path']: r['sha256'] for r in rows}
assert all(rowmap.get(name) == value for name, value in runtime.items())
canonical = hashlib.sha256(json.dumps(dict(sorted(runtime.items())), separators=(',', ':')).encode()).hexdigest()
digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
receipt = {'status': 'verified-application-source-backup',
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'path': OUTPUT.relative_to(ROOT).as_posix(), 'bytes': OUTPUT.stat().st_size,
    'sha256': digest, 'fileCount': len(rows), 'allMemberHashesChecked': True,
    'crcChecked': True, 'runtimeFileCount': len(runtime), 'runtimeManifestSha256': canonical,
    'contents': rows,
    'qualification': 'All application runtime files, current sourced datasets, refresh builders/workflows, local assets/fonts and source/QA records. Includes historical unchanged selected material masters and new vector artwork. Current hosted certificates, when present at archive creation, retain their original source identities. Excludes Git, credentials, dependencies, raw provider caches and browser PNGs. The approved source remains the chat attachment; these material masters are implementation assets.'}
OUTPUT.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
OUTPUT.with_suffix('.sha256').write_text(digest + '  ' + OUTPUT.name + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'contents'}))
