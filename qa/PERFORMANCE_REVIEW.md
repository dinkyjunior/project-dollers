# Performance and accessibility review — Pages 1–3

Independent read-only browser audit of the current premium refinement, sampled at `2026-10-01T15:39:02Z` (2 October in Sydney). Chromium `151.0.7922.173`, headless Linux, device scale factor 2, fresh browser contexts at 393×852 and 430×896. The app was served from an isolated local static server on port 8911. This is a desktop browser performance observation at mobile dimensions, not a physical iPhone benchmark or a claim of guaranteed 60fps on hardware.

## Measured results

| Check | 393×852 | 430×896 |
|---|---:|---:|
| Initial resource requests, excluding HTML document | 29 | 29 |
| Initial encoded resource body bytes, uncompressed local HTTP | 1,427,701 | 1,427,701 |
| HTML document body bytes | 19,298 | 19,298 |
| Startup long task observed | 57ms | 56ms |
| Home rAF median / p95 | 16.7 / 16.7ms | 16.7 / 16.8ms |
| NFL rAF median / p95 | 16.7 / 16.7ms | 16.7 / 16.7ms |
| Steelers rAF median / p95 | 16.7 / 16.7ms | 16.7 / 16.7ms |
| Animation sample intervals >25ms | 0 | 0 |
| Running football tracks after expanding 77-player roster | 6 | 6 |
| Animations remaining under reduced motion | 0 | 0 |
| JavaScript exceptions / failed requests | 0 / 0 | 0 / 0 |

Each rAF sample lasted three seconds after the page transition, with about 180 intervals. A stable rAF cadence establishes that no obvious main-thread stall appeared during this short run; it does not establish paint/compositor cost, sustained battery use, or actual device frame delivery. Other agents own the wider functional, visual, WebKit and hosted deployment checks.

## Asset loading and rendering

The principal initial bodies were the sourced dataset (428,168 bytes) and the locally bundled stadium WebP (422,220 bytes). Runtime fonts are preloaded WOFF2 files, with `font-display: swap`; the two used faces total 39,304 bytes. UI icons and UFC are vectors. NFL/team logos are lossless local 500px WebP assets. The five initial player photographs total 162,332 bytes and each decodes at 600×436. No player face generation or raster enlargement is involved.

The weakest measured raster source density among the visible mobile images was 4.04 source pixels per CSS pixel at 393, and 3.87 at 430, both well above the tested 2× display density. Player photos use `contain`, and logos retain their correct proportions. Browser image decode and styling checks found no stretched or broken image in the three default pages.

One optional loading improvement remains: Home presently prepares hidden NFL/team content, so 16 hidden image elements have already decoded at startup, including the first five player portraits. The additional logos and portraits trade some first-load transfer for instant navigation. They are local and reasonably sized, but could use `loading="lazy"` while hidden, with selected-page loading priority raised on entry. This should be benchmarked before adoption to avoid introducing visible placeholder flashes.

Full roster expansion does not eagerly transfer all 76 photographs. In this run, 16 portrait resources had loaded shortly after expansion, totaling 522,776 bytes; browser lazy loading prefetches a nearby scroll window. Scrolling should be checked on a slow network for photo timing as well as card geometry. The uncompressed local server byte total must not be confused with hosted compressed transfer size; HTML/CSS/JS/JSON compression and cache behavior need to be measured on the actual deployment.

## Motion and page lifecycle

The football and corresponding travelling light use the same measured rounded path around the **complete outer player-card rectangle**. The path is resized from the card border box; it is not derived from the portrait. The established QA samples all four edges and the light/football phase relationship. The card track uses CSS motion-path and SVG stroke-dashoffset, with no JavaScript per-frame layout loop.

`ResizeObserver` updates geometry only when the border box changes. `IntersectionObserver` pauses offscreen player tracks. Expanding the full roster created 77 cards but ran six intersecting tracks, both at the top and after scrolling to the bottom. `MutationObserver` cleans up replaced cards. Inactive pages pause their decorative motion; `visibilitychange` pauses the app when the document is hidden. Frame breathing and stadium depth/reflection mainly animate opacity and transforms. SVG travelling strokes still incur rendering work and should be profiled on actual iPhone hardware if heat or battery use is noticeable.

`prefers-reduced-motion: reduce` removed all active browser animations in the sampled roster page, including the ball and travelling border light. Motion decoration is hidden from assistive technology. Tap responses use short transforms rather than layout changes.

## Accessibility, touch geometry and viewport handling

- All five bottom-navigation buttons have visible labels and their SVG icons at both target sizes. Targets measured 75×53px at 393 and about 82×53px at 430. The settings and close controls are at least 44px.
- Main tabs and week controls are 40px high; conference and position controls are 36px high. The Steelers entry inside a standings row is 29px high. No sampled default-page control was below 24×24px, but the compact controls fall below the recommended 44px iPhone target. Enlarging every dense control would move more content below the fold; larger invisible hit areas or selectively increasing important entry points could preserve the reference density.
- Controls have visible focus outlines. Tab lists provide arrow-key, Home and End behavior, selected-state ARIA, and one tab stop for the selected tab. Filters and conferences expose their pressed state. Inactive pages and panels use the native `hidden` attribute.
- The Sources modal has a labelled native dialog. Tab traversed its close button and source links; no background control became focusable. Escape closed it and restored focus to the invoking Sources control. Native dialog behavior may include browser chrome/body focus at the end of sequential navigation, so this check is not a claim of a custom JavaScript focus trap.
- The About dialog initially lacked an accessible name. Recommended small fix: add `aria-labelledby="about-title"` to its existing dialog and `id="about-title"` to its existing heading. Its close button is already labelled, and Escape restored focus to More.
- Representative secondary text colors had strong contrast against black: metadata roughly 8.9–12.7:1, standings rank 7.0:1, and player-stat labels 11.0:1. These are sampled color calculations, not a complete WCAG certification; actual gradients, images, focus states and glows also require visual review. Small 11px secondary copy preserves reference density, so device zoom and real-screen readability merit a final hardware pass.
- The shell uses `100dvh` with a `100vh` fallback; scroll content ends above reserved navigation space. Top/bottom safe-area insets are present. Browser audit found no horizontal document overflow at both target sizes. Real Safari toolbar movement, notch/home-indicator interaction and pinch zoom cannot be reproduced fully by desktop Chromium dimensions.

## Review disposition

No severe performance regression or broken accessibility interaction was found in this audit. The concrete low-risk fix is the About dialog name. Initial hidden-content loading and larger compact touch targets are optional refinements to weigh against instant navigation and approved screen density. Physical iPhone performance, Safari toolbar behavior and actual hosted transfer/cache characteristics remain separate checks; passing a build or these short samples does not replace them.
