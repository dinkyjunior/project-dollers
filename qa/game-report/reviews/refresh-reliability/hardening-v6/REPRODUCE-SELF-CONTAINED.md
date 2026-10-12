# Self-contained reproduction of the final 79-case audit

Use `reproduce-v6-self-contained.py` for a fresh matching checkout. The earlier `reproduce-v6.py` remains as an immutable workspace-specific artifact; it required the selected summary in `/workspace/recovery-qa/game-report-source-cache`. This new runner removes that prerequisite. Original acceptance and portable receipts have not been replaced.

Keep these three small files together:

- `reproduce-v6-self-contained.py`
- `isolated-review-v6.py`
- `catalog-validation-v6.py`

The matching repository snapshot must also include these saved independent source files:

- `qa/game-report/independent/source-check/espn-401872967.json`
- `qa/game-report/independent/source-check/espn-401872967.receipt.json`

Run from the matching repository snapshot:

```sh
python3 qa/game-report/reviews/refresh-reliability/hardening-v6/reproduce-v6-self-contained.py --repo /workspace/project-dollers --output /workspace/recovery-qa/new-self-contained-report-review
```

Replace `--repo` with the actual checkout path. Choose a NEW `--output` outside that checkout. The runner refuses existing outputs and refuses different source/index hashes before creating any fixtures. Its accepted generator is `1e0bb61a60cb5033f2f48eea17b6ca8315b8f789669f01c19a11a26c8b82526e`, and its accepted index is `cd43314dc28faead43694a5c8658fd009cbdcf23caa16ce6221e0349dd679208`. Later automatic snapshots require returning to the matching committed release to reproduce this exact audit.

Only the selected Dallas/Houston source summary is seeded in the new output. The runner first verifies its exact HTTP200/TLS receipt, endpoint, body length, SHA-256, event identity and timezone-aware original retrieval timestamp. It derives cache metadata from that verified receipt, retaining the original retrieval time; it does not fabricate a fresh provider retrieval. The helper's CACHE path is replaced with this new, selected-source-only directory. No external recovery cache, provider request or browser is used.

Five isolated unmasked player inputs are reconstructed from explicit ESPN source-bound readings in verified reports. The dependent CLE aggregate input is deliberately **999 as a controlled test fixture**, then required to become unavailable. That number is not a historical claim and never changes production. Three old backup bodies are not needed.

The runner verifies source/data hashes before and after its 68 reliability/reconciliation/aggregate cases, 11 complete-catalog checks and current `--check`. It writes fresh receipts and temporary datasets outside Git. Copy only compact code/receipts into QA evidence; exclude the large fixture directories.

The new runner itself completed **79/79 cases**, then verified **444 reports and 888 quarter checks** using only repository source/data/evidence and new outside-repository fixtures. `self-contained-reproduction.json`, `self-contained-case-receipt.json` and `self-contained-catalog-receipt.json` preserve that separate run. Original `acceptance.json` remains unchanged.
