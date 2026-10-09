# Matchup Breakdown component and visual audit map

Approved authority: [the user-attached second render](../../reference/MATCHUP_BREAKDOWN_CHAT_SOURCE.md).
Each component is live, source-driven HTML inside the new isolated
`[data-page="matchup-breakdown"]` route. Existing Home/NFL/Dallas/Steelers styles
are unchanged by the dedicated stylesheet.

| Render element | Native component / class | Required destination or behaviour |
| --- | --- | --- |
| Back to Dallas | `.mb-back` | Restore the originating team-details context |
| Project Dollar and NFL marks | `.mb-brand`, `.mb-season` | Local original artwork, correct aspect ratio |
| NFL / Ladder / Dallas / Upcoming Game | `.mb-breadcrumb`, `.mb-crumbs` | Actual NFL/ladder/team/current-fixture routes |
| Matchup title | `.mb-title.mb-framed` | Crisp metallic display typography, no baked text |
| Star / fixture / flag / diamonds | `.mb-fixture.mb-framed` | Verified event/date/week/venue and real local marks |
| Three major tabs | `.mb-tabs` | Separate Form & H2H, Players & QB, Lineup & Travel panels |
| Window and statistical mode | `.mb-context`, `.mb-select` | Actual filtered team-game window and totals/per-game recomputation |
| Source status and refresh | `.mb-verification`, `.mb-refresh` | Actual source revalidation, preserve user context |
| Dallas/Tampa Bay rushing leaders | `.mb-leader-grid`, `.mb-leader-table` | Actual current-roster statistical-game rows ranked by source-backed yards; statistical rows alone do not establish appearances |
| Dallas/Tampa Bay receiving leaders | `.mb-leader-grid`, `.mb-leader-table` | Actual targets, receptions, yards, TD and coverage; GP means source-recorded stat games |
| Player row and chevron | `.mb-player-button`, `.mb-player-open` | Open that player; both keyboard and native pointer controls |
| Selected player and team-game log | `.mb-player-detail`, `.mb-game-strip` | Actual five eligible team games, DNP ≠ zero |
| Receiver insight buttons | `.mb-player-insights` | Selected player's source-backed detail context |
| QB cards and status | `.mb-qb-grid`, `.mb-qb-card`, `.mb-qb-heading` | Correct QB/team; verified vs inferred selection explicit |
| QB passing and rushing metrics | `.mb-stat-table` | Correct window and source-derived aggregation |
| QB recent/opponent/pressure/venue | `.mb-qb-tabs` | Update mode or open corresponding scoped research |
| Six QB insight controls | `.mb-insight-grid` | Actual context detail, explicit missing metrics rather than invented values |
| Continue with diamond ends | `.mb-continue`, `.mb-diamond-button` | Activate Lineup & Travel for this same fixture |
| Bottom Home/Teams/Matchups/Insights/More | `.mb-bottom-nav` | Preserve existing Home/team routes; Matchups selected |
| Sources/footer | `.mb-footer` | Reach actual linked provenance and retrieval context |

## Review targets

- Dense paired cards stay two-column at 393 and 430; visible initial/surname
  labels fit fully. Suffixes are removed only from compact table labels, while
  full names remain in accessible names, titles and detail headings.
- Form & H2H team-game tables use full-width stacked panels inside the compact
  enclosure, with single-line headers and native Report controls. The approved
  paired rushing/receiving panels remain two-column. Generic long surnames may
  wrap naturally; full names and club identity remain accessible. Non-Dallas
  Back controls wrap within their hardware without changing Back to Dallas.
- Gold metallic chamfers, thin crisp cyan inner rails, controlled blue bloom,
  diamond ends and local stadium atmosphere must remain visible naturally.
- Header, breadcrumb, title and fixture proportions follow the attachment; no
  giant desktop stretching or default generic card geometry.
- Tables use native condensed local fonts and tabular numerals. Glow must not
  blur table text or cover values. Logo shapes keep their aspect ratios.
- Every row/button/tab/filter is independently audited against its actual
  target and statistics. Preview sample names and status are never copied as
  verified values. GP counts source-recorded statistical games and does not
  independently establish participation or a start. Unavailable and disputed
  values remain distinct in provenance; advanced metrics receive explanations.
- Motion uses paint-independent native transforms/opacity where applicable,
  respects reduced motion and hidden/inactive route lifecycle, and never blocks
  touch or pointer targets.
- Final screenshots must be personally inspected by all six specialists before
  acceptance. Build output or synthetic DOM assertions alone do not establish
  visual acceptance.
