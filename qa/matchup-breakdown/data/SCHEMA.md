# Verified matchup research contract

`assets/data/matchup-breakdown.json` is a lazy-loaded, replaceable snapshot.
Run `python3 scripts/refresh-matchup-breakdown.py --cache-dir <shared-cache>`
after the core and team builders. Run `--check` before publication; it rejects
different core/team bytes. All builders should be published atomically.
`qa/matchup-breakdown/data.test.py` checks starters, unavailable values, genuine
numeric disagreements, cache integrity and complete play-by-play coverage.
For scheduled builds, emit fresh evidence with the builder's
`--evidence-dir <runner-proof-dir>` and test it using
`python3 qa/matchup-breakdown/data.test.py --source-manifest <runner-proof-dir>/source-manifest.json`.
The test refuses evidence from a different snapshot. Runner proof bodies may
use absolute paths; local release evidence keeps repository-relative paths.

The root contains `schemaVersion`, `season`, `currentWeek`, `throughWeek`,
`retrievedAt`, `generatedAt`, `sources`, `dependencies`, `teams`, `coverage`,
`disagreements` and `provenance`. Retrieval time is actual source retrieval;
generation, browser checking and source retrieval are separate events.

Every source has an ID, public URL, status, retrieval time and, for successful
responses, HTTP status, response SHA-256 and byte length. `team_*` IDs preserve
the original source metadata for facts taken from the linked team snapshot.
Current-season PBP, snaps and direct ESPN depth/roster sources expose `watch`
and `season`; a monitor may detect changes without claiming provider push.

`teams[abbr]` includes current identity/record, normalized `games`,
`upcomingGameId`, full `roster`, offensive `players` keyed by GSIS ID, `depth`,
`injuries`, `qbEvidence`, `dataStatus`, `headToHeadGames` and
`headToHeadCoverage`. Head-to-head games retain the latest five completed
regular-season meetings with the upcoming opponent since 2005; historical
team meetings are distinct from personal QB starts. `roster` excludes CUT/RET but includes
DEV and reported Out players for historical analysis. This pool does not
represent the confirmed active game-day lineup. Disputed jersey numbers are
null. Conflicting roster status is null with explicit `statusEvidence`.

Each player includes identity, source provenance, `gameLog` and bounded
`weeklyOpponentHistory` coverage. Game logs include every 2025–2026 published
regular-season statistical row and genuine earlier weekly-opponent rows across
2005–2024. Prior clubs are retained. Older archive rows fill the latest five personal games, weekly-opponent games
and explicit QB starts where 2025–2026 alone is insufficient; these windows
may differ.
Lists are never padded. A fixture from another week may have less historical
opponent coverage; the coverage label must remain visible.

A log row contains `gameId`, `season`, `week`, `team`, `opponent`, `homeAway`,
`kickoffUtc`, `espnEventId`, `stats`, `appearance`, `started`, `advanced`,
`sourceIds`, `provenance` and `advancedProvenance`, with optional `crosscheck`
and `disagreements`.

- `stats` uses existing camel-case keys: carries/rushingYards/rushingTD,
  targets/receptions/receivingYards/receivingTD, completions/attempts/
  passingYards/passingTD/interceptions/sacks/sackYardsLost/fumbles/fumblesLost,
  air yards/first downs/conversions, completionPct/passerRating/yardsPerAttempt.
  Sack loss is positive; passing yards are gross. Fumbles are distinct from
  fumbles lost. NFL passer rating clamps each of four components to 0–2.375.
- `appearance.status = recorded` means a statistical row. `unavailable` can preserve an explicit starting-QB role with
  all statistics null; it does not count as a statistical GP. `verified` means
  corroborated positive offensive snaps. Missing rows never establish DNP or
  zero. UI GP must identify its statistical-row denominator.
- `started.value = true` with `status = verified` means the published
  **starting quarterback** role. Schedule `home_qb_id`/`away_qb_id` are role
  evidence, never pass-attempt proxies. Event-matched AP recap contradictions
  set **both** affected roles to null/disputed with exact quotes, source hashes,
  dates and IDs. A schedule-only role with no statistical row is null/unavailable
  unless an explicit independent first-play statement corroborates it.
  `started.candidate = true` retains every source-designated/disputed role slot.
  QB windows filter candidates **before** selecting the newest five; unresolved
  slots cannot disappear and be replaced with older verified starts. A selected
  unknown role makes combined confirmed-start metrics unavailable. Each QB has
  `qbStartCoverage` and the root `coverage` exposes role disagreements and
  uncorroborated slots. An actual one-snap start can have all statistics null.
  If an updated schedule role agrees with the independently revalidated recap,
  the disagreement resolves; it is not a permanent hardcoded override.
- `advanced.snaps` and `offensiveSnaps` are aliases. `offensiveSnapPct` is the
  published game-level percentage, not an inferred full-window weighted share.
  Routes/pressures/blitz/blitzes/aDOT are unavailable. Hits are explicitly hits.
  Other nullable advanced keys are redZoneTargets/redZoneReceptions/
  redZoneReceivingTD/redZonePassAttempts/redZonePassTD/redZoneRushAttempts,
  dropbacks/qbHits/scrambles/scrambleYards/designedRuns/designedRunYards,
  deepAttempts/deepCompletions/deepYards/teamTargets/targetShare/sackRate.
  Per-value sources remain in `advancedProvenance.fieldSources`.

Team-window selections filter completed regular-season games by season and
venue **before** taking the newest 3/5/10. Player totals match both game ID and
club. Only complete numeric counting inputs can be summed. A disputed target
cell nulls its target total/share; agreeing yards can still determine rank.
Per-game counting values divide by actual GP, never an assumed five. Rushing
AVG is total yards/total carries, never an average of game-level averages.

`qbEvidence.status = inferred` and `projected = true` are explicitly future
projection from depth excluding reported Out/IR/inactive. `confirmed = false`.
Source disputes prevent projection. Reported Out is not a confirmed inactive
list. Injuries, practice participation, source dates and report week remain
available; absence from a report does not establish health.

PBP advanced values require an actual END GAME marker, final quarter/clock and
evolving scores matching the sourced final score. Static final-score columns
alone cannot establish complete coverage. No-play/deleted/two-point plays are
excluded. Red zone is opponent 1–20 yards; deep air yards >=20; scrambles remain
dropbacks, including rows that have only a rusher ID. Designed runs exclude
scrambles and kneels. Sack rate is sacks/dropbacks. Target share is player
targets/team targeted passes. Source failures retain the preceding snapshot;
optional failures become unavailable and do not erase known numeric disputes.

Weather forecast, verified travel itinerary, confirmed inactives and observed
pre-game betting price remain unavailable unless an actual provider supplies
and independently corroborates them. No concept-render number is data evidence.

`source-manifest.json` binds the audited snapshot and exact public response
bytes. Source files use lossless gzip packaging; decompression reproduces the
recorded response hash. Native PBP gzip files retain their original response
bytes and hash. The archive packaging does not transform statistical values.
# Current event context and future bulletins

`team.researchGameId` and `team.upcomingGameId` select an actual provider-reported live event when one exists; `team.nextScheduledGameId` retains the separately published next future fixture. The game clock does not establish live or final state. Historical windows continue to use corroborated completed regular-season games only.

`team.fixtureReports[gameId]` binds an exact ESPN event, season, week and both clubs. `eventStatus` includes the provider's state, completed flag, period and displayed clock. `liveScore` contains explicitly published home/away scores and `isFinal`; it is null for scheduled events. Every report retains source IDs, actual retrieval time and provider publication time where supplied. These are source snapshots, not an uninterrupted live connection.

`availability.players` contains provider-reported availability for that event. `reportedInactive: true` records the published ESPN fantasy INACTIVE field; `officialConfirmed: false` and `completeOfficialList: false` prevent this partial feed from becoming an exhaustive official inactive list. No entry establishes health or activation by absence. Published weekly practice remains separately available under `weeklyReport`; coach decisions are preserved as coach decisions.

For any pre-event response containing explicit fantasy INACTIVE entries, its endpoint can reuse current-team injury bulletins, even after the core week advances. Such rows belong to `availability.currentTeamBulletin`: `reportedInactive`, `gameId`, `eventId` and `week` are null; requested future IDs are separately named. An original `reportWeek`/`contextGameId` is attached only when the exact dated player/status/type record matches a retrieved current event. Reused bulletins never establish future game-day inactivity or a projected future starter.

`fixtureReports[gameId].qbEvidence` uses published depth, verified same-week injury evidence and this event's attributed availability. It remains inferred, disputed or unavailable, never confirmed from passing attempts. Future applicability is unavailable when only a reused current-team bulletin is available; `publishedDepthPlayerId` remains a separate historical-research entry point.
