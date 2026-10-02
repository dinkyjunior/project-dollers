# Full player history and weekly-opponent data review

The player data layer now supplies full recorded game statistics across seasons, alongside the existing current-season cards. Pages 1–3 retain their scope; no Page 4 code is involved.

## Published data

- `assets/data/current.json` remains the initial dataset. Its roster keeps current-season `last5`, `seasonStats`, depth, injury and status fields. Season totals now include additional verified counting statistics; per-game efficiency/longest-distance fields are never summed into season totals.
- `assets/data/player-history.json` is a separate compact JSON bundle for loading when player research is opened. It covers all 77 retained Steelers GSIS IDs, 1,224 distinct player/game rows and the 14 opponents on the verified 2026 schedule. Each player's game pool deduplicates games shared by the overall and opponent lists.
- Every list contains at most five recorded completed **regular-season** games. Prior clubs remain visible. Playoff games, guessed appearances and padded rows are excluded.
- Each game carries 108 mapped statistics, 135 native numeric source fields and three native field-goal distance lists, plus season/week/date/kickoff, original club, canonical opponent, home/away, scores, result, GSIS ID, source IDs and separate statistics/schedule retrieval timestamps. Fields with missing cells stay `null`; an explicit source zero remains zero.
- Categories cover passing, sacks, rushing, receiving, touchdowns, receptions/targets, fumbles/lost fumbles, first downs, two-point conversions, air yards, yards after catch, defensive production, returns, kicking, punting and source efficiency/fantasy fields. `offensiveTD` means rushing plus receiving; `touchdownsAccountedFor` also includes passing. These distinct meanings prevent a passing touchdown being presented as a player's scored touchdown.
- Franchise joins account for SD/LAC, OAK/LV and STL/LA while preserving the original club abbreviations on historical rows.
- `steelers.matchupsByOpponent` gives every scheduled opponent its own positional allowance, recent results, Steelers matchup history and provenance context. Current verified season allowance data is explicitly separate from a historical pre-game reconstruction.

## Source quality and concrete coverage

All 22 public nflverse weekly player-statistics files for 2005–2026 returned HTTP 200. Source hashes and retrieval timestamps are retained in the bundle and provenance manifest. The raw archive CSVs stay outside the repository. All providers here are nflverse; independent recomputation does **not** imply a second-provider factual confirmation.

Aaron Rodgers' five recorded Cleveland games span 2009, 2013, 2021 and two 2025 meetings. Jaylen Warren and Pat Freiermuth each have five Cleveland rows. DK Metcalf has three recorded Cleveland games, including Seattle; Michael Pittman has one, with Indianapolis. Those shorter histories remain shorter. Seventeen retained roster IDs have no verified statistical row in the source range; their history is unavailable. That absence does not establish zero appearances or snaps.

Current required sources were retrieved at `2026-10-02T00:34:31Z` or later (2 October, 10:34 am AEST). The provider's current player-statistics entity was last modified `2026-10-01T16:26:22Z` and covers verified Week 3 statistics. Pittsburgh–Cleveland's Week 4 kickoff has passed, but this source has not supplied a verified final score/statistical row. It remains pending verification; no live result or stats are invented.

## Integrity and refresh behavior

`current.playerHistory` contains the exact file SHA-256 and the games, current player-statistics and roster content hashes. The saved provenance repeats the history checksum. `python3 scripts/refresh-data.py --check` checks the bundle, checksum, GSIS coverage and matching source versions together.

Ordinary refreshes reuse validated, capped archival rows and merge freshly retrieved current statistics. This avoids downloading approximately 164 MB of archives on every update. A new season, newly retained GSIS ID, newly scheduled opponent, missing/corrupt bundle or explicit `--refresh-history` triggers archive retrieval. The manual history refresh also permits archived statistical corrections to be fetched. Historical statistics keep their original retrieval timestamps instead of appearing freshly retrieved on every generation.

Cached historical rows are rejoined against the latest schedule on every refresh. Corrected scores/dates update the game context, while original statistical timestamps remain. A withdrawn final or identity disagreement excludes the row and marks history partial with an archival backfill note. Missing archive seasons are listed explicitly and mark latest-five coverage partial. Conflicting duplicate player/game rows are both excluded.

The current public source monitor can check entity validators during actual NFL game/provider windows and publish changed data. Public nflverse sources supply batch releases; this is source-driven updating, not a licensed live play-by-play stream or an already connected provider webhook.

## Checks completed

- `python3 qa/data.test.py`: **15 isolated regressions passed**, with no network requests or writes to published datasets. They cover dataset-specific coverage, absent columns/cells, cross-season ordering, GSIS identity, prior teams, opponent filtering, postseason exclusion, missing archives, cached refreshes, source-version mismatch, corrected/withdrawn historical finals, franchise aliases, conflicting duplicates and empty histories.
- `python3 scripts/refresh-data.py --check`: current snapshot, provenance and full history checks passed for 32 teams, 77 retained players and 1,224 game rows.
- Independent direct parsing of all 22 retrieved CSVs recomputed all 77 overall last-five lists and all 1,078 opponent lists. Every published numeric source cell, the mapped passing/rushing/receiving/TD/defense/kicking values and all score/context joins matched. **563 historical rows retain a prior club**. Evidence: `data-history-independent-audit.json`.
- A second agent independently repeated all-seasons recomputation and all 165,240 published numeric source-cell comparisons, then independently downloaded the 2025 source again. Evidence: `source-runtime-full-history-audit.json` and `source-runtime-history-audit.json`.
- Python compilation and scoped `git diff --check` passed.

The compact history bundle is 6,836,610 bytes raw and 192,529 bytes as standalone gzip. The initial dataset is approximately 1.03 MB raw / 45 KB standalone gzip. These are measured compression results, **not** a claim that hosted response compression has been verified. Browser loading is lazy so the archive does not affect opening Home/NFL. Actual UI rendering and mobile interaction evidence are owned by the corresponding QA reviewers.

At this review the history SHA-256 is `2cffbc6efc5d4c7b418bb35b8369a4f97c51de9072a80493c0fb6687b6a2f27b`; current dataset SHA-256 is `ab82352eebfa82c5c304b161caf04f237b818c85ccbf1218deca2c9e401a09a2`. A later authorized data refresh can legitimately change these files; the current provenance is the authoritative version pairing.
