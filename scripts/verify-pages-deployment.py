#!/usr/bin/env python3
"""Require a successful Pages build for this commit and matching hosted bytes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def api(endpoint):
    return json.loads(subprocess.check_output(['gh', 'api', endpoint], text=True))


def hosted_files(commit):
    # Verify every application entry/controller/style, snapshot metadata, and
    # every asset changed by this publication (including game reports and artwork).
    paths = {'index.html', '404.html'}
    paths.update(str(p.relative_to(ROOT)) for p in (ROOT / 'assets/data').glob('*.json'))
    paths.update(str(p.relative_to(ROOT)) for p in (ROOT / 'assets').iterdir()
                 if p.is_file() and p.suffix in ('.js', '.css'))
    changed = subprocess.check_output(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', commit], cwd=ROOT, text=True)
    paths.update(p for p in changed.splitlines() if p.startswith('assets/') and (ROOT / p).is_file())
    return sorted(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--timeout', type=int, default=600)
    args = parser.parse_args()
    repo = os.environ['GITHUB_REPOSITORY']
    pages = api(f'repos/{repo}/pages')
    base = pages['html_url'].rstrip('/') + '/'
    deadline = time.monotonic() + args.timeout
    paths = hosted_files(args.commit)
    expected = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}
    pending = 'Pages build has not completed'
    while time.monotonic() < deadline:
        builds = api(f'repos/{repo}/pages/builds?per_page=20')
        matching = [build for build in builds if build.get('commit') == args.commit]
        # A newer queued build must not hide an already successful exact-commit
        # build. Hosted hashes still have to match before success is possible.
        build = next((item for item in matching if item.get('status') == 'built'),
                     matching[0] if matching else {})
        if matching and all(item.get('status') == 'errored' for item in matching):
            raise SystemExit(f"Pages build failed: {build.get('error')}")
        if build.get('commit') == args.commit and build.get('status') == 'built':
            mismatches = []
            for path in paths:
                try:
                    req = urllib.request.Request(base + path + '?deployment=' + args.commit,
                                                 headers={'Cache-Control': 'no-cache'})
                    with urllib.request.urlopen(req, timeout=30) as response:
                        actual = hashlib.sha256(response.read()).hexdigest()
                    if actual != expected[path]:
                        mismatches.append(path)
                except Exception as exc:
                    mismatches.append(f'{path}: {exc}')
            if not mismatches:
                print(json.dumps({'commit': args.commit, 'build': 'built', 'url': base,
                                  'hostedFilesVerified': paths}, indent=2))
                return
            pending = 'Hosted files do not match: ' + ', '.join(mismatches)
        else:
            pending = f"Matching Pages build: commit={build.get('commit')} status={build.get('status')}"
        print(pending, flush=True)
        time.sleep(15)
    raise SystemExit('Deployment verification timed out. ' + pending)


if __name__ == '__main__':
    main()
