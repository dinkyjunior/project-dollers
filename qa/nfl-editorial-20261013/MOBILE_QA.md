# Native editorial NFL QA — 13 October 2026

**PASS for the frozen local v4 implementation.** This is native Chromium 151 using the pinned Playwright 1.58.2 runtime and actual files under `/project-dollers/`. No request, route, dataset, font, animation or DOM-style substitutions were used. Browsers and contexts were closed after both completed runs; the root-managed server on port 8808 was left intact.

## Evidence

- `before-nfl-393.png` and `before-nfl-valid-receipt.json`: native old NFL baseline at commit `d7f6863c8d580b09f57e7bf2676b7a1c7d641661`.
- `native-editorial-v4-rerun/results.json`: 393×852 and 430×896 at DPR 2 with touch, 1440×1000 desktop, and a separate reduced-motion phone context. Nine original PNGs show top/middle/bottom scroll positions; screenshots retain native viewport sizes.
- `native-editorial-v4-states/results.json`: selected-team expansion, receiving leaders and weekly recap at 393×852, plus native 768×1024 top/bottom and exact frame comparison. Five original PNGs.
- `native-audit.cjs` and `state-captures.cjs`: reproducible local helpers. Both ran against port 8808; application-source hashes were unchanged throughout.

The first v4 control run is retained separately. Its readiness helper incorrectly required standings to be visible after returning from a recap report, even though the existing app correctly preserves the selected Recap panel. Only the QA assumption was corrected. The completed rerun passed without application changes. The earlier failed baseline receipt records the obsolete port 8000 transport failure; its valid replacement used an independently started local server that was stopped immediately afterward.

## Functional and layout results

The completed audit recorded **47 control checks**, including 39 comprehensive checks on the 393 phone, plus the bounded extra-state/tablet run. It verified source-backed season/week controls; AFC/NFC and division filters; four-/five-game form; PCT/PF/PA/DIFF sorting; actual first-five standings and full-conference expansion; selected-team details; QB/RB/WR tabs and keyboard operation; all three source-backed full-player links; primary tabs and recap reports; current completed-game report, Week 6 upcoming matchup and Week 9 bye/schedule preview; compare Form & H2H; team form; source dialog, links and Escape; manual refresh; Home entry/return; and direct hash reload.

There were no page/console errors, HTTP failures or failed requests. There was no document/scroller horizontal overflow, no unresolved ARIA reference and no clipped horizontal control. Visible imagery was decoded at its natural aspect ratio before capture. The old mechanical rails, neon panel shadows and NFL bottom icon navigation were absent. The source footer and all compact leader controls were reachable through native scrolling. Reduced motion retained usable controls without running decorative animations.

| Viewport | Home and NFL shell, identical |
| --- | --- |
| 393×852 | x 0, y 47.90625; 393×756.171875 |
| 430×896 | x 0, y 46.65625; 430×802.671875 |
| 768×1024 | x 184, y 127; 400×770 |
| 1440×1000 | x 520, y 115; 400×770 |

The before/after originals show a photographic stadium header, compact editorial hierarchy, restrained teal controls, continuous native card borders, one switchable leaders card and an inline source footer. I inspected the native 393 top/selected-team, 430 bottom and desktop originals; no visual blocker was found. The separate design reviewer owns the final comparison against the supplied 198×491 reference.

## Data qualification

Displayed W–L/ties, percentages, leader names/yards/touchdowns, position counts and sorted preview values match the **retained source snapshot**. This snapshot is season 2026, records through Week 5, with Week 4 leader coverage; those periods remain visibly distinct. The current completed fixture is source ID `2026_05_IND_PIT`; comparison and report routing preserve the real selected ID. The independent regression audit separately checks derived form, source kickoff times and event-specific report quarters.

This local UI audit does **not** independently reconcile current official NFL.com standings, establish newly refreshed external data, test Safari or prove hosted publication. The retained-source reconciliation remains separate; the footer correctly exposes snapshot freshness.
