# Native controls audit — NFL weekly dashboard

The final frozen local build passed **78 checks and 293 real actions** in Chromium using Australia/Sydney time, with no console errors, page errors, HTTP errors or non-cancellation request failures. `FINAL/results.json` is the complete receipt; its before/after implementation and preserved-source hashes are identical. Its `executed-helper.cjs` records the exact helper that ran.

Covered:

- All 32 conference team-name links open the correct genuine Team Details page and return to the ladder. All 16 rows share the same treatment, with no inline summary or repeated “Team details” button.
- The Weekly matchup section precedes Standings. Week 5 exposes all 15 retained source fixtures, Week 6 all 14 and Week 9 all 15 even though Pittsburgh has a bye. Next/previous wrap through every event; dropdown selection and native ArrowDown retain focus and exact event identity.
- All 14 completed Week 5 primary actions open their event-specific Game Report. Quarter/OT rows and totals equal the selected retained report, including provider-authored team abbreviations. Return preserves selected week and fixture.
- Scheduled fixture actions open the matching Matchup Breakdown and return to the dashboard.
- Recap cards identify both teams by city, nickname, genuine local logo and sourced score. Team filtering, expandable details, Enter toggling, report return and upcoming-game return work. Unplayed games show unavailable scores and cannot display an invented final result.
- Native 393 × 852 and 430 × 896 phones at DPR 2, 1440 × 900 desktop and reduced-motion mode maintain the compact Home/NFL frame, without horizontal overflow or clipped controls. Final native screenshots cover top/middle/bottom, all-16 standings, collapsed/expanded/filtered Recap and upcoming results.

This audit establishes retained-source and local application consistency. It does **not** independently establish current official standings, data freshness or GitHub Pages delivery.

Earlier receipts are preserved honestly: `functional-1` stopped on the helper’s initial canonical WAS expectation while the report’s own provider label correctly read WSH. The helper was corrected from the payload. `functional-2` completed its interaction checks but rejected an intentional concurrent NFL JS polish at the final hash guard. No application or data was changed to satisfy these failed expectations; `FINAL` ran against the subsequent frozen implementation.

## Frozen implementation

- `index.html`: `9ec678e455d26097af3dc85de64da83e1565a6007f3db5be937be6ebecd797fb`
- `assets/nfl-dashboard.js`: `6b0f953aac1185f6211a0094c5c5b68546a749c23e09f23a557fc11d29b405ae`
- `assets/nfl-editorial.css`: `bdec390a44d050a855cfb50780d712410f09ea61168167a206bf4884293cc994`
