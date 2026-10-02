# Pages 1–3 — independent visual review

The approved eight-screen chat attachment is the visual composition reference. Its original bytes were not exposed in this environment. The latest user direction adds a crisper, more exclusive Home, stronger borders and genuinely full personal game research. Actual browser before/after comparisons are labelled as such; none is presented as an approved-reference pixel composite or as user approval.

This review independently rendered Home, NFL and the Steelers roster at 393×852 and 430×896 in Chromium 151, at device scale 2 and Australia/Sydney time. The twelve screen/research captures under `visual/` have runtime and screenshot hashes recorded in `visual/captures.json`. All three main screens and the rich personal-game states were inspected at actual image resolution after rendering.

## Material findings

| Screen | Visual assessment |
| --- | --- |
| Home | The silver/gold/cyan slanted identity and approved two-by-two selection remain. The true outlined SVG wordmark is much crisper, including the raised top-right glyphs corrected after inspection. Blue stage lighting replaces crossing multicolour strands. Brighter consistent tile edges, local native league marks, restrained glass reflections and tactile responses materially improve the previously flat secondary cards. The stadium continues to anchor the bottom of the screen. |
| NFL | Blue light now outlines the tabs, conference control, table, leaders and fixture with a clear hierarchy. Bloom sits outside the panels; high-contrast text and aligned numerical columns remain clear. The five compact records, two leaders panels, week controls and complete featured fixture fit above navigation at both target widths. The 430px viewport also shows source freshness and update controls without hiding the fixture. |
| Steelers | Gold/orange lighting changes the environment immediately while preserving a black base. Five authentic photographs have consistent crops, jersey/name hierarchy and four aligned season values. The brighter rails and travelling football/light are confined to each complete card perimeter and avoid text or facial glare. All five featured cards fit; auxiliary complete-roster/source controls continue below the fold and are reached by scrolling. |
| Personal history | The two history controls, explicit weekly-opponent selector, source-aware chronology and compact three-column stat summaries make recent games and opponent history immediately comparable. Full breakdowns retain all recorded fields without converting missing values into fabricated zeroes. Game dates show the user's local date, alongside original season/week and club. The gold research surface stays consistent with the team environment and remains readable while scrolling. |

Warren's actual recent view shows rushing yards, receiving yards and separate passing/rushing/receiving TDs for each of five games. The opponent view shows five recorded Cleveland meetings across previous seasons. Metcalf's Cleveland view honestly shows **three** recorded meetings and identifies his original PIT/SEA clubs; it does not pad the list to five or relabel old games as current Steelers appearances.

## Challenge and correction

The first expanded RB game view began with nine passing fields, mostly zero or unavailable, before useful rushing/receiving detail. This was raised with the root reviewer and corrected in the final module. Recaptured Warren breakdowns now lead with **Rushing → Receiving → Passing**. WR/TE, defense and kicking groups similarly prioritize the player's position while retaining all fields. The source appendix remains collapsible so the main research view is dense without becoming an undifferentiated field dump.

The Home build/inspect cycles also corrected duplicated coming-soon text, harsh cone edges, one lighting phase, clipped SVG glyphs and crowded logo/title spacing. These are documented in `HOME_REVIEW.md`; the final Home screenshots were re-rendered after the corrections.

Whole-image previews occasionally omit central navigation marks. An independent real browser navigation-region capture (`visual/navigation-430.png`) confirms all five icons and labels are painted; this preview symptom was not treated as an application defect. Complete DOM, SVG and hit-target checks remain part of integration QA.

## Motion, readability and limits

The stronger blue/gold border cores remain narrow. Soft bloom supplies atmosphere around the cards without covering typography, source captions or player faces. Selected controls are clear, and the deep black surfaces retain room around dense rows. The Home loops and reflections are slow and restrained, with touch feedback kept short; reduced-motion checks disable added loops and tilt. Football motion follows the complete measured player card, including expanded research, with its travelling light synchronized.

This is a **material local visual pass** for the requested scope after repeated render/inspect/fix cycles. It establishes improved browser output and useful research presentation, not pixel identity, live-data latency, physical-iPhone frame-rate guarantees, a Safari engine pass or successful hosted verification. Source/update integrity and complete functional checks are recorded independently by the data, update and QA reviewers.

`contact-sheet.html` and `contact-sheet.jpg` show the six final integration captures. `comparison.html` and `comparison.jpg` compare the preserved previous published implementation under `before/` with those same final captures, for all three screens at both sizes. Both composite JPEGs were rendered by Chromium from their HTML viewers; screenshot pixels were not altered or reconstructed. `artifact-manifest.json` records each source and output hash.

Before generating the artifacts, all runtime files matched the final five-viewport QA manifest generated at **2026-10-02T00:55:14.553Z** (2 October, 10:55 AEST). `home-comparison.html` and `home-comparison.jpg` additionally preserve the Home-only before/after evidence. The approved source itself remains the original chat attachment.
