"""Strict HTTPS receipt for the delivered app and final review evidence.

Run after hosted browser QA and the final evidence-only Pages deployment.
The output lives outside Git so recording its final commit cannot create a
recursive evidence/publication cycle. No application responses are substituted.
"""
import concurrent.futures
import hashlib
import json
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://dinkyjunior.github.io/project-dollers/'
CA = '/usr/local/share/ca-certificates/environment-proxy-ca.crt'


def main():
    hosted = json.loads((ROOT / 'qa/home-metal/hosted-webkit/results.json').read_text())
    assert hosted['status'] == 'passed', 'Complete hosted mobile QA must pass first'
    manifest = dict(hosted['runtimeManifest'])
    additional = [
        'CODEX_START.md', 'CODEX_HANDOFF_STATUS.md', 'CODEX_ENVIRONMENT.md',
        'DEPLOYMENT.md', 'qa/home-metal/RELEASE.md',
        'qa/home-metal/agent-acceptance.json', 'qa/home-metal/preservation.json',
        'qa/home-metal/reference-review.md', 'qa/home-metal/ui-review.md',
        'qa/home-metal/asset-review.md', 'qa/home-metal/asset-review.json',
        'qa/home-metal/mobile-visual-review.json',
        'qa/home-metal/motion-approved/acceptance.json',
        'qa/home-metal/review/visual-review.json',
        'qa/home-metal/review/hosted-visual-review.json',
        'qa/home-metal/review/results.json',
        'qa/home-metal/hosted-webkit/results.json',
        'qa/home-metal/HOSTED_QA_REVIEW.md',
        'qa/home-metal/hosted-qa-review.json',
        'qa/home-metal/refresh-integration/deployment-refresh-diff.json',
        'qa/home-metal/refresh-integration/deployed-data-check.json',
        'qa/home-metal/refresh-integration/deployed-data-tests.txt',
        'qa/home-metal/refresh-integration/manual-refresh.json',
        'qa/home-metal/refresh-integration/tooling-review.json',
    ]
    for directory in ['live-captures', 'before-after']:
        additional.extend(str(p.relative_to(ROOT)) for p in sorted(
            (ROOT / 'qa/home-metal' / directory).iterdir()) if p.is_file())
    for p in additional:
        manifest[p] = hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
    assert all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h
               for p, h in manifest.items()), 'Delivered receipt uses tested source'
    context = ssl.create_default_context(cafile=CA)

    def get(p):
        request = urllib.request.Request(BASE + p, headers={'Cache-Control': 'no-cache'})
        retries = []
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, context=context, timeout=30) as response:
                    data = response.read()
                    row = {'path': p, 'status': response.status, 'bytes': len(data),
                           'sha256': hashlib.sha256(data).hexdigest()}
                break
            except urllib.error.HTTPError as error:
                if error.code not in (502, 503, 504) or attempt == 2:
                    raise
                retries.append({'status': error.code, 'attempt': attempt + 1})
                time.sleep(attempt + 1)
        if retries:
            row['transientRetries'] = retries
        assert row['status'] == 200 and row['sha256'] == manifest[p], row
        return row

    started = datetime.now(timezone.utc).isoformat()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        delivered = list(pool.map(get, sorted(manifest)))
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    refs = {}
    for branch in ['main', 'codex-rebuild']:
        refs[branch] = subprocess.check_output([
            'gh', 'api', f'repos/dinkyjunior/project-dollers/git/ref/heads/{branch}',
            '--jq', '.object.sha'], cwd=ROOT, text=True).strip()
        assert refs[branch] == commit, refs
    report = {'status': 'passed', 'startedAt': started,
              'completedAt': datetime.now(timezone.utc).isoformat(),
              'base': BASE, 'evidenceCommit': commit, 'branchRefs': refs,
              'strictTLS': True, 'servedFiles': delivered,
              'qualification': 'Final evidence publication receipt. Complete actual-hosted '
              'mobile/desktop browser reports retain their tested application and source hashes.'}
    out = Path('/workspace/recovery-qa/home-metal-final-publication.json')
    out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'files': len(delivered), 'commit': commit,
                      'completedAt': report['completedAt'], 'receipt': str(out)}))


if __name__ == '__main__':
    main()
