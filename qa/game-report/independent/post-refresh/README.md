# Bounded audit after the production data refresh

This helper compares the exact refreshed data bytes against the independently reviewed Game Report snapshot. It performs no source requests, production writes, refresh build, native button audit or deployment. It imports no production builder.

The preserved baseline binds the reviewed report index (`cd43314d…`), all 444 report body hashes, per-report sporting-fact hashes, selected event identities/scores, source dependencies, explicit catalog readings and the actual Dallas–Houston facts. It does not replace the independent raw-source audits already completed for that snapshot.

## Release refresh sequence

1. Wait for any older production refresh job to finish before publishing the approved generator/schema release.
2. After that release is on `main`, dispatch **`force_refresh=true`, `refresh_history=false`**. This workflow fetches current data, commits to `main` and requests a Pages rebuild; it is a production action.
3. Verify the actual job succeeds, record its printed `summariesToRetrieve` and elapsed duration, then obtain the resulting bot commit/data snapshot. Check that its diff from the reviewed release changes only the authorized data files; changed runtime code requires its own review.
4. Run the four ordinary offline dataset checks already required by the workflow, then run this bounded comparison against that checkout:

```sh
python3 scripts/refresh-data.py --check
python3 scripts/refresh-team-details.py --check
python3 scripts/refresh-matchup-breakdown.py --check
python3 scripts/refresh-game-reports.py --check
python3 qa/game-report/independent/post-refresh/audit-refresh.py --repo /path/to/refreshed-checkout --output /workspace/recovery-qa/new-post-refresh-audit.json
```

Use a **new** output filename. The helper refuses to overwrite evidence or write inside application assets. The default limits are 800 reports and 2 MiB per detail; an unexpectedly larger release requires an explicit review before raising them.

The workflow now repeats all four dataset `--check` commands **after `git pull --rebase` and before push**. This closes the reviewed stale-checkout validation gap: a rebased generator/book combination must still pass before publication. Waiting for older jobs remains appropriate because a job started from an older workflow does not gain those new commands.

## What the result means

- **Exit 0 / `passed`:** exact index/detail size and hashes, Core/Team/Matchup/PlayerHistory dependency joins, event keys/seasons/weeks/home-away/scores, ESPN aliases, all current linked finals, retained bookmarks, quarter/offense arithmetic and all explicit catalog readings pass. Existing sporting facts and Dallas–Houston facts match the reviewed baseline. Timestamp/source metadata changes are reported separately.
- **Exit 2 / `needs_targeted_data_review`:** structural checks pass, but a new report, sporting-fact change, source-reading change, changed Dallas fact or failed provider revalidation requires targeted verification. The receipt lists exact game IDs, changed sections, old/new scores and hashes, or retained retrieval failures. Corroborate those specific facts with newly retrieved authoritative bytes and honest source receipts; rerunning every native button is unnecessary when runtime code is unchanged.
- **Exit 1 / `failed`:** a checksum, dependency, selected-game identity, source/canonical-player context, unavailable conflict cell, catalog mapping, archive retention or arithmetic gate failed. Preserve the receipt, investigate, and do not call the refreshed snapshot verified.

Matching source URLs, declared checksums and timestamps cannot independently establish a changed sporting fact. This helper deliberately does not turn those metadata claims into a fresh raw-source audit. It also rejects newly unavailable report verification for this release check even though the application correctly displays unavailable data during a provider outage.

The metadata comparison excludes retrieval/generation times and source/provenance bookkeeping. Scores, quarters, named players and all player statistics, team statistics, drives, plays, scoring, actual availability, venue/neutral/kickoff context and disagreement values remain in the sporting-fact digest. The actual historical Dallas–Houston values are **34–30; Dallas quarters 3,3,14,14 and Houston 10,6,7,7; total offense 399–397; net passing 324–335; rushing 75–62**. The original render's illustrative statistics are not the baseline.

## CI cost and limits

Ordinary/forced-current refresh reuses committed checksum/context-verified archives and retrieves only new finals plus current/preceding feed-week finals. At this reviewed snapshot that is **30 requests**, capped at four workers. `force_refresh` does not enable `refresh_history`. Temporary raw caches under `RUNNER_TEMP` are not persisted across jobs, so recent finals usually download again; committed archived report bodies remain reusable.

Assuming healthy 2–5-second responses, request-only estimates are:

| Case | Requests | Four-worker request time |
| --- | ---: | ---: |
| Current routine refresh | 30 | about 16–40 seconds |
| Explicit history refresh of current links | 425 | about 3m34s–8m55s |
| Hypothetical cold 444-report crawl | 444 | about 3m42s–9m15s |

These are estimates, not measured job promises. They exclude checkout, Core/Team/Matchup builders, validation and staging. The existing 444-summary cache totals about 243 MB. A 35-second first attempt alone makes a cold 444-report request phase roughly 65 minutes; up to three attempts, backoff and socket-read timing can make it longer. Therefore a complete cold/history crawl is **not guaranteed to fit the 20-minute workflow**. A timeout or failed validation stops publication and preserves the previous remote snapshot.

The 19 retained rotated-window archives are preserved rather than recrawled by `refresh_history`; that flag currently refetches the 425 finals still in the current linked union. Use the ordinary forced-current run for this release verification, and assess any broader archival correction crawl separately.
