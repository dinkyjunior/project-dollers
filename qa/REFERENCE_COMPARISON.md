# Approved-reference visual comparison: Pages 1–3

The visual source of truth for this review is the **eight-screen image attached by the user in this chat**. Its corresponding top-row panels are Home, NFL dashboard, and Pittsburgh Steelers roster. The attachment was visible for human visual inspection but was not exposed as downloadable file bytes in this execution environment. A copy could therefore not be saved as `reference/approved_eight_screen_reference.jpg`. As the user explicitly instructed, this did not block the comparison or refinements.

Actual Chromium browser captures were inspected at **393 × 852** and **430 × 896** against those three approved panels. The preserved captures in `before/` show the draft before this reference-led refinement; the current captures show the resulting implementation. These are before/after browser comparisons, not composites containing the original attachment. Approximate proportions below were visually estimated from the attached panels, not computed through pixel registration.

[Side-by-side before/after sheets](comparisons/) show each page at both required sizes.

## Browser evidence

| Page | Before, 393 × 852 | Current, 393 × 852 | Before, 430 × 896 | Current, 430 × 896 |
| --- | --- | --- | --- | --- |
| Home | [Before](before/home-393.png) | [Current](home-393.png) | [Before](before/home-430.png) | [Current](home-430.png) |
| NFL dashboard | [Before](before/nfl-393.png) | [Current](nfl-393.png) | [Before](before/nfl-430.png) | [Current](nfl-430.png) |
| Steelers roster | [Before](before/steelers-393.png) | [Current](steelers-393.png) | [Before](before/steelers-430.png) | [Current](steelers-430.png) |

## Page 1: Home

The earlier draft had a relatively narrow, upright masthead, short tiles, a separately boxed illustrated football scene, and extra captions. The approved panel instead has a wide slanted metallic masthead, taller logo tiles and a stadium image that flows into the surrounding light effects.

The current masthead uses bundled italic display type, metallic white/blue PROJECT lettering, gold DOLLAR lettering and a cyan dollar sign. Its angled subtitle and blue edge lighting follow the reference's hierarchy. The NFL tile has a much brighter cyan/white rim, NBA has a purple edge, NRL a green edge, and UFC a red edge. Larger official league marks, condensed tile titles and restrained metadata reduce the earlier mismatch. An original bundled stadium/football background now replaces the clean vector football and visible floor-grid fallback; bright stadium rows, blue/orange illumination and the textured ball more closely reproduce the approved lower-screen composition.

The grid began at about **23%** and ended at **64%** of the smaller draft capture. It now spans approximately **26–74%** at both sizes, close to the attachment's approximately **26–75%**. The current stadium occupies approximately **75–93%** of screen height, with compact navigation immediately below. This materially improves the reference silhouette at both required sizes.

Remaining differences are decorative: the approved masthead has more complex metallic highlights and finer scattered light streaks; the current original stadium background uses its own football angle and lighting arrangement. The implementation does not use the reference panel as a flattened interface image.

## Page 2: NFL dashboard

The earlier draft used widely tracked small text, looser ladder rows and a relatively flat fixture panel. Bundled condensed typography now makes the header, team names, leaders and metadata closer to the approved sports-research presentation. The segmented AFC/NFC control, cyan ladder borders, precisely aligned highlighted Steelers row, paired leader panels, gold week selection and illuminated lower fixture card follow the approved component hierarchy.

On the smaller viewport, the ladder previously extended from roughly **23–49%** of screen height; it now spans roughly **23–45%**, close to the attachment's **23–44%**. Current leader panels span approximately **46–67%** at 393 × 852 and **46–67%** at 430 × 896, close to the approved panel's **45–67%**. The current fixture card spans approximately **75–91%** and **74–90%**, respectively; the approved panel is approximately **76–92%**. The structure is therefore close without reproducing unsupported source data.

Remaining differences include the approved panel's slightly more concentrated blue illumination around the fixture and finer edge highlights. Current text is deliberately rendered clearly at the actual mobile viewport rather than imitating compression artifacts from the supplied montage.

## Page 3: Steelers roster

The draft showed four relatively tall, quiet gold cards. The approved panel shows five tighter cards, strongly illuminated gold/orange rims, larger left-side portraits, jersey/name/position hierarchy, compact stat strips and chevrons. The current implementation restores that five-card rhythm, condensed typography, tighter vertical spacing, larger genuine player portraits, gold controls and brighter perimeter energy.

At 393 × 852 the current cards span approximately **24–90%** of screen height; at 430 × 896 they span approximately **23–90%**. The approved panel's five-card stack spans roughly **24–92%**. The fifth player is visible above navigation at both sizes, and all card edges and stat columns share consistent geometry. The football animation remains a real component traveling around each complete card perimeter, rather than being embedded in a screenshot.

A final edge pass replaced the long interior loops with shorter irregular edge sparks, reduced the strand width/opacity, and enlarged jersey labels. The approved treatment still has more intricate flare detail; genuine portrait crops also differ from the approved artwork. These are remaining decorative differences, not a claim that the treatment is pixel-identical.

## Intentional historical-data differences

The implementation retains a clearly labeled, verified **2025 historical snapshot** instead of copying illustrative or unsupported numbers from the approved render. These differences are intentional and are documented with sources in [ASSET_SOURCES.md](../ASSET_SOURCES.md):

- Dashboard records and leaders are derived from the selected historical week. The selected-team table does not claim an official conference ranking; the rank column remains unpopulated rather than inventing ranks.
- The verified default Week 4 fixture is Steelers–Vikings on September 28, 2025. It replaces the render's unsupported Friday Steelers–Browns fixture. Historical framing replaces a misleading “tomorrow” claim.
- Roster statistics are verified cumulative 2025 Weeks 1–3 values. Starter/depth-chart labels and AFC North placement are not asserted without verification.
- Roman Wilson supplies the fifth verified 2025 Steelers roster card. Michael Pittman Jr., pictured as a Steelers receiver in the approved illustration, is not substituted into the verified 2025 Pittsburgh roster.

Every runtime image and font is bundled under relative repository paths. Browser validation blocks external requests so hotlinked-image availability cannot affect the captured output.

## Review limits and scope

This review establishes a material reduction in the visible layout, typography, density and lighting gaps against the **user's attached render**. It does **not** establish original-image pixel equality or user visual approval. No separate public reference URL was required. Safari/iPhone hardware behavior is not established by Chromium viewport captures.

Only Pages **1–3** were compared and refined. Page 4 is out of scope; this evidence does not authorize merging or deploying to `main`.
