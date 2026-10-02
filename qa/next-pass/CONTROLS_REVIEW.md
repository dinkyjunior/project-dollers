# Existing control audit — next refinement pass

Independent preflight captured 2026-10-02T00:23:39Z (2 October 2026, 10:23 AEST). Scope: existing Pages 1–3 controls only; no proposed AI or new screen. The current runtime was read and exercised in Chromium at 393×852 under `/project-dollers/`. No application files were changed. Detailed observed values are in `controls-preflight.json`.

## Confirmed defects to fix

1. **Selected fixture opens a different opponent.** Selecting Week 1 shows Steelers–Falcons, final 20–13. Opening that fixture displays the Week 4 Browns matchup instead. `renderTeamMatchup()` always uses `steelers.upcomingGame` and `steelers.matchup`, while week controls only call `renderDashboard()`. Preserve selected-week fixture/opponent across the dashboard, team matchup and player opponent-history context. A bye must have an explicit no-opponent state; do not fall back to a different week.
2. **Closed player control keeps a “Close” accessible label.** Open Rodgers, then Warren. Rodgers has `aria-expanded="false"` but still “Close Aaron Rodgers research.” Reset every closed player's label when changing accordion selection.
3. **A successful refresh/retry resets the chosen week.** `loadData()` sets `state.week` to `currentWeek` for every successful response. Revalidate the existing week against the new feed and retain it when present. Automatic updates must also preserve open research, roster filter/expansion, conference, tabs and scroll/focus where still applicable.
4. **A failed subsequent fetch can produce a mixed last-good/empty UI.** The failure path retains the old `data` object but clears roster, fixture and Sources content while leaving other old panels. New refresh behavior should keep the complete last verified snapshot visible with a clear failed/stale update state. The initial-load failure must remain explicit and recoverable.
5. **Freshness title is only set on stale data, never cleared.** On a future successful fresh update, reset stale attributes as well as the visible badge.

## Requested capability gaps

- Existing player details display only two game values selected by position. Observed Warren columns: `WK / OPP`, `RUSH YDS`, `TD`. There is no receiving/receptions/targets/passing/defense/kicking breakdown, cross-season last-five view, or personal last-five against the selected weekly opponent.
- Browser feed loading occurs only on initial load and explicit failure Retry. No focus/online/provider-update checks exist; the repository currently uses scheduled six-hour refreshes.
- Schedule rows are presentation only. Making a known fixture a selectable entry into the same existing matchup/research context would be useful; do not imply interaction unless implemented.

## Existing controls already implemented

Home NFL entry; Home/Teams/Matchups/Insights/More navigation; Steelers back; AFC/NFC; all available week options and compact week buttons; featured/all conference teams; NFL ladder/leaders/recap tabs; all eight roster filters; complete roster expansion; player accordion; all four team tabs; Sources/About dialogs and close/Escape; direct hash routes and refresh; keyboard tab navigation. Other sports are correctly marked Coming soon and are not falsely active. The existing five-viewport regression suite covers these controls, but did not compare selected fixture identity to the destination matchup.

## Final QA additions recommended

- Assert every selected week's fixture identity and opponent agree with the destination matchup, including bye and historical weeks.
- Compare every shown player game-stat field with the exact source row, without substituting zero for missing values.
- Compare personal opponent history against the selected opponent and assert maximum five, reverse chronology, dates/seasons and no duplicate game IDs.
- Test history category switches, absent history/stat categories, both mobile widths and narrow 320px layout.
- Intercept a newer valid snapshot and trigger focus/online/manual refresh; assert new source values become visible while selected week/filter/open player/tab/scroll survive.
- Intercept a refresh failure after valid data; assert last-good values stay visible and failed update status is explicit; initial failure/retry still works.
- Verify every accordion trigger label matches expanded state, and that the football track encloses all detailed research and remains synchronized after history-category changes.

This is a preflight report, not a final pass claim. The product implementation and evidence will be rechecked after integration.

## Final integrated verification

The completed refinement passed `npm test` at **2026-10-02T00:55:14.553Z** (2 October 2026, **10:55 AEST**). All sixteen runtime/data hashes were identical before and after the final run. `qa/results.json` records the exact tested content and screenshot hashes. The earlier run deliberately failed its content-consistency guard when a position-order refinement landed during QA; it was rerun completely after that change.

All five viewports passed: 393×852, 430×896, 320×700, 768×1024 and 1440×1000 at 2× DPR. Existing navigation, conference/week/roster controls, native detail expansions, tabs, dialogs, direct hash routes and reloads remain functional. NBA/NRL/UFC now give explicit accessible Coming soon feedback while retaining the existing Home screen. The selected Week 1 Falcons fixture and Week 9 bye preserve their exact matchup and personal-opponent context.

At 393px, the browser compared **8,848 visible mapped, raw and distance-list fields** across the five featured players plus a defensive player and kicker. Each other viewport independently compared 1,395 fields. Recent games and personal opponent games use the exact GSIS ID/game ID order in the verified bundle; original clubs/seasons/weeks and source times remain visible. Rodgers includes Green Bay meetings, Metcalf includes Seattle meetings, and Pittman includes Indianapolis. Metcalf's three Browns records and Pittman's one remain unpadded. Passing, rushing and receiving are available together; the player's primary position category appears first. A player with no verified rows shows explicit unavailable history.

History is fetched lazily. Deliberate checksum corruption and a real AbortController timeout both rejected unverified rows, retained season statistics and recovered through Retry history. The timeout regression shortens only the test's twenty-second timer to one second; production timeout behavior is unchanged. A subsequent feed 503 retained the complete last-good snapshot, all selections, expanded season/game research and scroll. A complete newer snapshot replaced the baseline atomically; an older response was rejected. A reconnection event immediately checked for an updated feed. Isolated transport fixtures changed retrieval metadata only; they did not write product data or capture test statistics in screenshots.

Expanded research and complete per-game statistics remain inside the synchronized football perimeter. No horizontal overflow, clipped statistic values, broken images, runtime external requests, HTTP failures, JavaScript exceptions or console errors were observed. Final screenshots include personal opponent histories and complete game statistics at both requested iPhone sizes.

The screenshot harness now waits for two paint frames after pausing motion and independently decodes the actual PNG pixels. Every normal-screen capture contains painted pixels for all five navigation icons and labels. For example, the 393px full-game-statistics capture contains 313 bright Matchups icon pixels and 519 bright label pixels. Some `view_image` previews omit middle/bottom navigation visually; the saved PNG payload and DOM/SVG geometry both confirm the navigation is present. No product change was made in response to that preview artifact.

Actual Safari/physical iPhone testing remains unrun because WebKit is unavailable in this environment. Local Chromium QA does not establish actual hosted-site behavior or a provider push connection; publication and hosted transport checks are separate reviews.
