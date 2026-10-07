"""Audit incoming automatic JSON metadata without ignoring factual changes."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--before', required=True)
    parser.add_argument('--incoming', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    prior = json.loads((ROOT / 'qa/home-neon/post-refresh/source-diff.json').read_text())
    patterns = prior['ignoredMetadataPathPatterns']
    reports, differences = {}, []
    for p, rules in patterns.items():
        raw_before = subprocess.check_output(['git', 'show', args.before + ':' + p], cwd=ROOT)
        raw_after = subprocess.check_output(['git', 'show', args.incoming + ':' + p], cwd=ROOT)
        assert raw_after == (ROOT / p).read_bytes(), 'Workspace must preserve incoming data'
        a, b = json.loads(raw_before), json.loads(raw_after)
        regexes = [re.compile('^' + '[^/]+'.join(re.escape(part) for part in rule.split('*')) + '$') for rule in rules]
        counts = dict(factualLeavesCompared=0, metadataLeavesCompared=0, changedMetadataLeaves=0,
                      dictionaryShapesCompared=0, listLengthsCompared=0)
        changed = []

        def walk(x, y, path=''):
            if type(x) != type(y):
                differences.append({'file': p, 'path': path, 'reason': 'type'})
            elif isinstance(x, dict):
                counts['dictionaryShapesCompared'] += 1
                if x.keys() != y.keys():
                    differences.append({'file': p, 'path': path, 'reason': 'keyset'})
                else:
                    for key in x:
                        walk(x[key], y[key], path + '/' + str(key))
            elif isinstance(x, list):
                counts['listLengthsCompared'] += 1
                if len(x) != len(y):
                    differences.append({'file': p, 'path': path, 'reason': 'length'})
                else:
                    for index, (xx, yy) in enumerate(zip(x, y)):
                        walk(xx, yy, path + '/' + str(index))
            else:
                metadata = any(r.match(path) for r in regexes)
                counts['metadataLeavesCompared' if metadata else 'factualLeavesCompared'] += 1
                if x != y:
                    if metadata:
                        counts['changedMetadataLeaves'] += 1
                        changed.append(path)
                    else:
                        differences.append({'file': p, 'path': path, 'reason': 'value', 'before': x, 'after': y})

        walk(a, b)
        reports[p] = {**counts, 'beforeSha256': hashlib.sha256(raw_before).hexdigest(),
                      'afterSha256': hashlib.sha256(raw_after).hexdigest(),
                      'workspaceMatchesIncomingGitObject': True, 'changedMetadataPaths': changed}
    frozen = json.loads((ROOT / 'qa/home-metal/approved-local-captures/manifest.json').read_text())['runtimeManifest']
    nondata = {p: h for p, h in frozen.items() if p not in patterns}
    changed_nondata = [p for p, h in nondata.items() if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != h]
    report = {'status': 'factual-values-preserved' if not differences and not changed_nondata else 'differences-found',
              'checkedAt': datetime.now(timezone.utc).isoformat(),
              'beforeApplicationCommit': args.before, 'incomingAutomaticDataCommit': args.incoming,
              'method': 'Every type, dictionary key set, list length and scalar is compared. '
              'Only same-type scalar differences at enumerated metadata paths are excluded. Incoming data is never edited.',
              'metadataPatterns': patterns, 'files': reports,
              'totalMetadataChanges': sum(r['changedMetadataLeaves'] for r in reports.values()),
              'totalFactualDifferences': len(differences), 'factualDifferences': differences,
              'nonDataRuntimeFilesByteIdentical': len(nondata) - len(changed_nondata),
              'changedNonDataRuntimeFiles': changed_nondata,
              'retrievalAfter': json.loads((ROOT / 'assets/data/current.json').read_text())['retrievedAt']}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['status', 'totalMetadataChanges', 'totalFactualDifferences',
                                          'nonDataRuntimeFilesByteIdentical', 'retrievalAfter']}))
    assert not differences and not changed_nondata, 'A changed fact or visual source requires further QA'


if __name__ == '__main__':
    main()
