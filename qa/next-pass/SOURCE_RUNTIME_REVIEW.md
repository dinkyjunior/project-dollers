# Source and automatic-update review — October 2, 2026 (Sydney)

## Independent provider verification

Normal authorized public requests returned HTTP 200 for the current schedules, 2026 weekly player statistics, 2025 historical statistics and 2026 depth chart. A second conditional HEAD request returned HTTP 304 for each, with no response body downloaded. The 2025 statistics CSV independently downloaded for audit contains 150 fields, 18,540 regular-season player/game rows and all 272 regular-season games. Its SHA-256 is `e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2`. Raw archival CSVs remain temporary audit inputs, rather than inflating the website bundle.

Provider documentation was retrieved directly from its public source repositories. The published documentation says:

| Dataset | Provider publication schedule |
| --- | --- |
| Games/schedule | Every five minutes during the season |
| Player/team statistics | Nightly after game days and at selected game-day windows |
| Rosters, depth charts and injuries | Daily around 07:00 UTC |
| Stat corrections | Recheck Wednesday night through Thursday |

The provider's workflow overview independently lists daily player-stat processing at 09:00 UTC, plus 05:00/05:30 UTC after Thursday, Sunday and Monday games and Sunday 22:00/Monday 00:00 UTC game windows. These are provider schedules, not guarantees of publication or completeness. The first source is [nflreadr's update documentation](https://raw.githubusercontent.com/nflverse/nflreadr/main/vignettes/articles/nflverse_data_schedule.Rmd); the second is [nflverse's workflow overview](https://raw.githubusercontent.com/nflverse/nflverse-data/master/workflows.md). Exact retrieval times, hashes and response headers are saved in `source-runtime-network.json`.

This public player-stat source cannot become a live in-game feed simply by requesting it more often. Source release, repository publication, Pages deployment/caching and browser revalidation are separate stages. The interface and update client distinguish those stages and do not label a check as newly retrieved sports statistics.

## Publication workflow

The production workflow now has an hourly fallback and additional checks at 15-minute intervals around actual verified NFL kickoffs and the documented provider batch windows. Its game window runs from one hour before kickoff through eight hours after kickoff. Kickoffs come from the sourced schedule; they are not guessed from fixed weekday assumptions. An off-window invocation exits after checking cadence, without contacting a sports source.

Eligible runs make six small HEAD requests. Existing ETag or Last-Modified validators are sent to the provider; matching validators or HTTP 304 avoid downloading unchanged datasets. A changed source, an explicit forced refresh, or the six-hour safety interval starts the full validated refresh. This avoids repeatedly downloading the 56 MB depth chart and the archival seasons at every short interval. A HEAD check never overwrites a source retrieval timestamp. A genuine full-body fetch retains its actual retrieval time. Required-source failures preserve the preceding snapshot; optional availability transitions remain explicitly unavailable until verified again.

The workflow validates before staging all three linked JSON files: `current.json`, `provenance.json` and `player-history.json`. It rebases before the normal production push and explicitly requests a Pages build only after a changed snapshot has been published. Manual workflow inputs can force a current fetch or re-fetch historical seasons for archival corrections. Ordinary current-data refreshes reuse the validated reduced archival bundle. Historical corrections are not claimed to have a connected push notification.

An authorized `repository_dispatch` event named `nfl-data-updated` can trigger an immediate source check. The event payload is never executed as shell code or accepted as player statistics. No upstream webhook relay is connected. GitHub's scheduled runs can be delayed, so this is source-change detection with practical timing limits, not guaranteed instant delivery.

## Runtime integrity

The separate same-origin update client checks on app open, resume, focus, reconnection and user refresh, with an active-page fallback and background pause. It accepts validated new snapshots, retains the preceding feed on failure, and avoids redrawing unchanged content. Its optional Server-Sent Event adapter is unconfigured by default. A real authorized notification can invalidate the cache, but streamed notification JSON cannot replace verified sports data.

The player-history contract ties the lazy bundle to the current schedule, roster and current-stat source hashes. Historical rows keep their individual season, week, original club, opponent, result, source IDs and actual retrieval time. Raw provider fields preserve available per-game statistics; missing numeric values remain unavailable, while legitimate zeroes remain zeroes. Lists contain up to five recorded regular-season statistical games and are never padded. A missing provider row does not establish that a player did not appear.

Independent review identified that cached historical rows must be rejoined against the latest verified schedule before asserting the new bundle's source version. The generator owner fixed that case and added a historical score-correction/withdrawn-final regression. Cached rows now receive corrected schedule context while preserving their original statistics retrieval time; a withdrawn final is excluded and the affected coverage is marked partial rather than silently padded.

The independent full raw-input audit checked all 22 statistical seasons from 2005 through 2026. Every CSV's content hash matches its published provenance. Independently recomputing the newest five overall and against every scheduled opponent passed for all 77 players and 1,078 opponent groups. All 1,224 retained game rows, score contexts and 165,240 numeric cells match the raw inputs, with zero discrepancies. This is independent recomputation against the same provider, not falsely claimed second-provider confirmation. An additional independently downloaded 2025 CSV check passed for 283 retained rows and 39,048 numeric cells. See `source-runtime-full-history-audit.json` and `source-runtime-history-audit.json` for their exact versions and retrieval context.

The full research bundle is lazy-loaded when a player is opened. The audited file is about 6.84 MB uncompressed; its gzip estimate is about 193 KB because the dense statistical keys and zero values compress well. The estimate does not assert that hosted HTTP compression was verified. Source-change refreshes reuse the reduced archival pool rather than downloading 164 MB of historical raw CSVs on every update.

## Validation and limits

`python3 qa/source-updates.test.py` passes seven isolated regression groups covering conditional HEAD/304 without resetting age, changed-validator publication, the six-hour safety refresh, required-source failure, optional availability transitions, exact game-window/hourly/manual cadence, and rejection of unexpected source URLs without a request.

`python3 qa/data.test.py` passes all 15 data/history regression groups, including the challenged cached historical schedule correction. `python3 scripts/refresh-data.py --check` verifies the current snapshot/provenance hash and the linked history checksum, source contracts and complete season coverage. The workflow YAML and every Bash step pass local syntax validation. A real post-refresh source-monitor run returned HTTP 304 for all six current sources and correctly chose no rebuild; source age remained 157 seconds rather than being reset. Its evidence is `source-monitor-check.json`.

The public hosted URL was retried at **October 2, 2026, 10:33 AEST** (`2026-10-02T00:33:09Z`). The environment CONNECT tunnel returned 403 before receiving an origin website response. This review does not claim to have verified the served application or newly configured workflow execution. No access controls, authentication requirements or browser security were bypassed.
