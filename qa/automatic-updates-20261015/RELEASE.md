# Automatic NFL browsing and validated updates

The original saved snapshot remains `currentWeek=5`, retrieved October 12, 2026. The UI derives Week 6 from the sourced October 13–19 New York Tuesday–Monday window. Fixture selection is separate from selected-week records/statistics coverage and each source's actual retrieval date.

Initial load follows the current browsing week. Active checks, resume, focus and pageshow follow calendar rollover. Selecting a historical week preserves it through refresh/resume/rollover; Follow current week returns to following. Initial loads retry with a bounded backoff and timeout; failed league schedule loads retry while retaining verified games. Genuinely changed snapshots recheck the league schedule; unchanged snapshots do not, and ETags avoid downloading unchanged large schedule books.

The scheduled pipeline retains hourly and game-window checks and forces a genuine full validated fetch daily at 19:17 UTC. Main pushes and automated data publications request Pages builds. The deployment verifier requires the exact commit's successful Pages build and matching hosted hashes for all runtime controllers/styles, top-level data books and changed assets. A failed source/validation step cannot publish a partial data set.

Validation: calendar tests (saved Week 5 versus Week 6, New York Tuesday boundary, DST and bye fixture); both-phone browser behavior and automatic initial/schedule retry tests; existing updater, source-monitor, data and state-preservation integration tests; all four saved-data validators. Independent visual audit passed 393×852 and 430×896, including native Follow clicks, Home/NFL/recap/Steelers views, no overflow, console errors or missing assets. Captures are included here. Independent preservation audit confirms Home, data, research rendering, artwork, references and archives remain intact.

A genuine nflverse refresh succeeded at 2026-10-14T23:10:09Z, but ESPN requests returned proxy 403 responses and downstream reconciliation refused the incomplete candidate. The entire last validated data set was retained byte for byte; the successful partial attempt is not presented as fresh published data.

Deployment access blocker: ordinary `gh api repos/dinkyjunior/project-dollers/pages` returned Forbidden, and the exact live Pages URL failed at the CONNECT proxy with HTTP 403. Git access works. Git publication alone does not establish successful deployment or matching hosted files; those checks are automated in the workflow but cannot currently be observed from this environment.
