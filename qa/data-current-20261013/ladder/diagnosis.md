# NFL ladder/default-view diagnosis — 13 October 2026 (Sydney)

Scope: read-only source and data inspection at `ef29763`. No browser launched; no production source changed.

## What is already correct

`assets/data/current.json`, retrieved `2026-10-12T08:44:57Z`, says regular season 2026, current Week 5, scores and player stats through Week 5. Its current-week standings **already include all retained Week 5 finals**. PIT is 3–2, DAL 2–3. This is not the former cold-load entering-Week-5/Through-4 issue.

Independent recomputation from the freshly fetched nflverse games CSV passes all 576 team/week snapshots (18 × 32), including W/L/ties, points for/against and percentage: `record-recomputation.json`. This validates arithmetic against that provider, not official tie-break ordering or the underlying facts across multiple providers.

There is no localStorage/sessionStorage persistence of the NFL selected week. The selection lives in JavaScript state for the open app session.

## Concrete remaining problems

1. `scripts/refresh-data.py:884–890`: current-week records use latest finals, but `leader_week = min(week - 1, stats_week)` forces current Week 5 leaders **and recap** to Week 4. Week 5 verified player rows already exist and future Week 6 has those rows, so the default Top Players/Weekly Recap lag unnecessarily. Recap is incorrectly tied to player-stat availability rather than verified final scores.
2. `assets/app.js:343–362` (`applySnapshot`): an implicit current-week selection is preserved when a new current week arrives because the old key still exists. That old week's regenerated snapshot becomes an entering-week historical view. An app left open across a week boundary can silently revert records by a week even after a successful data refresh.
3. `assets/nfl-dashboard.js:118–125,154`: PCT ordering is percentage, point differential, then abbreviation. The row number is its position in this custom order. This is explicitly disclaimed as not official playoff seeding, but it can differ from the official ladder where teams share a percentage. Need source-agent verification before deciding whether to use actual official ranks or keep a clearly labelled statistical sort. Do not fabricate NFL multi-team tie-break ranks from point differential.
4. Default `standingsExpanded=false` deliberately shows four leading teams plus PIT. If PIT is eighth it shows rows 1/2/3/4/8 and omits intervening teams. Values are correct, but an unlabelled compact view can look like an incorrect full ladder. Existing expansion exposes all 16. A small existing caption/footer qualification (or latest view expanded by default) can resolve this without changing the approved panel geometry.
5. `assets/nfl-dashboard.js:18–31`: form/splits derive finals solely from the union of recaps. If the latest final week is never represented in any recap (notably Week 18 with no Week 19, or source-stat delay), valid standings rows lose their verified form/splits. Separate score-based recap selection fixes the current path; ideally retain an explicit normalized completed-results collection so form does not depend on presentation panels.

## Recommended patch contract

* Current dashboard = all verified final scores as of retrieval, current verified stats week, and latest available final-score recap week. Use independent `throughWeek`, `leadersWeek`, and `recapWeek`; do not claim a partially completed week is complete.
* Explicit earlier-week research retains entering-week standings and previous available leader/recap week. Future selected weeks retain latest actually verified coverage, explicitly labelled. Week 1 before any finals stays unavailable rather than inventing zero leaders.
* Add a tiny state flag such as `weekMode: 'latest'`. Cold load and selecting the current week select latest mode. Selecting another week pins research mode. On `applySnapshot`, advance latest-mode selection to `data.currentWeek`; retain valid pinned selections. On failure restore both week and mode. Never reset conference/division/sort/tab/scroll solely because data updated.
* Fix zero-point shutout filters only if exercised: source CSV scores are strings and `'0'` is truthy today; any new normalized numeric filters must explicitly distinguish `0` from null/empty.
* Change existing provenance text to show score/stat/recap coverage independently and disclose partial-week results. Source timestamps must remain source retrieval times, not regeneration times.
* Official rank sourcing depends on independent source verification. If unavailable, retain factual records and clear statistical-sort labels rather than claim official standings position.

## Required focused tests

1. Current Week N contains one final and published stat rows for N: default records include that final and default leaders/recap show N, partial coverage qualified.
2. Current scores through N, latest stats N−1: records and recap show N; leaders explicitly show N−1.
3. Explicit historical week N−1 keeps entering-week N−2 records/leader/recap; future week uses latest coverage.
4. Week 1 pregame has no invented recap/leaders; Week 18 postseason boundary retains Week 18 finals and form/splits.
5. Latest state N receives current N+1 snapshot: selects N+1 and never reverts records. Pinned historical state remains pinned. Missing pinned key resets safely. Failed render rolls back week/mode/data.
6. All 32 current records/PF/PA/pct and complete form/home-away splits recompute from source finals; legitimate byes/ties/shutouts remain correct.
7. Official-vs-custom ranking, compact missing rows, conference/division/sort/expand state and week/source labels checked visibly in both phone sizes and desktop. No browser runs until the root assigns exclusive ownership.

Relevant existing checks: `qa/data.test.py` CoverageTests (future recap and partial-stat denominators), `qa/data-updates.test.cjs` snapshot/update safety, `qa/nfl-dashboard/controls.cjs` exact rows/leaders/form. Extend these meaningful contracts; source comparisons alone cannot detect a lagging default if the test expects the same lagging snapshot.
