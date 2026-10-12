# Game Report refresh reliability evidence

The final frozen generator passed **79 isolated checks**: 68 parser, cache, outage, staging, exact-player-conflict and dependent-aggregate cases, plus 11 full-catalog validation cases. See [the final acceptance receipt](hardening-v6/acceptance.json).

- Generator SHA-256: `1e0bb61a60cb5033f2f48eea17b6ca8315b8f789669f01c19a11a26c8b82526e`.
- Report index SHA-256: `cd43314dc28faead43694a5c8658fd009cbdcf23caa16ce6221e0349dd679208`.
- Acceptance receipt SHA-256: `43671faabad7e3e10645bbef04e3ccd9a8eeea31d3fdaf39e85c67af95788f93`.

Read-only production validation also passed for 444 final-game reports, 28,405 player box-score contributors, 80,462 plays, 9,504 drives and 888 team-quarter checks. The index contains 425 currently linked games and 19 previously verified archives retained for existing bookmarks.

The `verified` report count concerns event identity and final scores. It does **not** mean every sporting field is available or undisputed. The source-integrity catalog contains 109 records: 18 true disagreements and 91 venue-label disclosures. Conflicting numeric or event-context cells stay unavailable, with their source alternatives retained. Cleveland's dependent team sack-loss aggregate also stays unavailable when its contributing player loss is disputed; the audit does not invent a second provider's team total.

## Preserved review history

| Evidence | Outcome and qualification |
| --- | --- |
| [Original 26-case receipt](receipt.json) and [initial review summary](review-summary.json) | Preserves the actual null-provider/cache failures and staging findings before hardening. |
| [v2 receipt](hardening-v2/receipt.json) | Diagnostic only: source changed during setup; passing cases were not accepted as the final source binding. |
| [v3 acceptance](hardening-v3/acceptance.json) | 44 source-stable resilience checks passed after null/cache/staging corrections. |
| [v4 receipt](hardening-v4/receipt.json) and [catalog receipt](hardening-v4/catalog-validation-receipt.json) | Preserves missing explicit source/value-reading failures and the later incompatible-fixture diagnostic. Neither result was accepted. |
| [v5 acceptance](hardening-v5/acceptance.json) | 78 source-stable checks passed after five known basic-player conflicts gained correctly named provider readings. |
| [v6 acceptance](hardening-v6/acceptance.json) | Final 79 checks passed, including the dependent Cleveland aggregate and idempotence. |

Earlier receipts and their reproducer/source snapshots are retained byte-for-byte. Large isolated fixture directories and the complete ESPN source cache remain outside Git; this directory contains compact evidence and code only. Production source, index and report bodies were unchanged during the final reviews.

## Verification and reproduction

From the exact source/data snapshot, the ordinary offline release check is:

```sh
python3 scripts/refresh-game-reports.py --check
```

The isolated-review helper files are preserved audit inputs, not commands to run directly: their original output paths refer to the historical review directories. Use [the self-contained runner](hardening-v6/reproduce-v6-self-contained.py) and [its instructions](hardening-v6/REPRODUCE-SELF-CONTAINED.md) to produce a **new** outside-repository result:

```sh
python3 qa/game-report/reviews/refresh-reliability/hardening-v6/reproduce-v6-self-contained.py --repo /workspace/project-dollers --output /workspace/recovery-qa/new-game-report-review
```

This runner validates the selected Dallas ESPN summary and strict-TLS receipt already saved in the repository, then seeds only that source into the new output directory. It makes no provider request and needs no external cache or older backup body. Its [separate rerun receipt](hardening-v6/self-contained-reproduction.json) confirms all 79 cases passed, followed by current validation of 444 reports and 888 quarter checks.

The runner deliberately reconstructs only the five selected unmasked input cells from source-bound ESPN readings. Its Cleveland aggregate input `999` is a controlled negative-test fixture, never an assertion about the historical game. The earlier [portable runner](hardening-v6/reproduce-v6.py) and its successful receipt are preserved as historical evidence; that version still needs the selected Dallas cache under `/workspace/recovery-qa/game-report-source-cache`, so prefer the self-contained version for a fresh machine.

The tested installation sequence stages and validates the candidate before replacing the report directory and index. Those replacements are two separate atomic filesystem operations. Tested ordinary installation failures restore the prior pair; the browser's report hash/size check rejects a transient mixed read. A published Git snapshot contains the complete index/detail pair. This is not a claim of a multi-file filesystem transaction.

## Archived primary source recovery

[The local search receipt](old-nflverse-local-search.json) records an unsuccessful search of local CSV/gzip files and preserved ZIP entries for an older NFLverse body. Independent QA subsequently recovered that exact body from its public Git history with verified HTTPS: [recovered-body receipt](../../independent/source-check/old-nflverse-recovery/recovered-games.receipt.json).

The recovered body is 2,183,648 bytes and has SHA-256 `1d32c849f27b42337776295bf889c3815ba8acfd14715b7801d48bcb2c03f86d`, matching the original source metadata of the 19 retained report archives. Its later recovery does not rewrite the original retrieval times or substitute the current provider body for the historical one.
