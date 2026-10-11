# Home brand source and material audit

Read-only source/material review of the installed implementation, 2026-10-11. No browser, clock manipulation, source edits, or tests were performed by this reviewer. Native image inspection and decoded pixel comparison were used for the asset receipt. Natural-time browser acceptance remains the browser QA agent's responsibility.

## Asset preservation

`assets/home/gate-brand-lossless.webp` is 2022 × 778 RGBA, SHA256 `c729d40d997a0a873fa103dc88d80c5598121d7006a1d4bdd335df9b275e2531`. `reference/home-brand-original-master.png` is 2022 × 778, SHA256 `22a50dcba81eb50d9e691fd881f7ee1ed9cd074c8e07bb8a04940994278866fd`. Decoded RGBA bytes are exactly equal. Hashes match `reference/HOME_BRAND_LOSSLESS_PROVENANCE.json`. The image stays native-sized in the Home markup at `index.html:101`; CSS/runtime links remain `index.html:39` and `index.html:53`.

## Geometry and materials

`assets/home-aperture-motion.js:165` documents the existing normalized 1800 × 693 overlay space. Its aspect differs from the native raster by only about 0.06%. PROJECT face/counter paths are retained at `:171`, and DOLLAR face/counter paths at `:189`. Their maximum x coordinates are 1366 and 1355; they end before the green moneybag. Every added band, facet and pin is inside these explicit front-face clips, with even-odd counter exclusions at `:302` and `:332`. No bag mask, recoloring or movement is introduced.

The 98 sampled PROJECT locations produce 27 pin glints and 71 three-plane facet flashes through `:245` and `:308`. Facets use pale white/blue planes (`:262`), rather than making every point a star. At a 300px wordmark width, nominal facet spans are about 3.3–6.3 CSS px before rotation; pin rays span about 5–7.7px. Gold adds 18 warm pin sites and six thin edge accents (`:321`, `:338`). Existing letters, counters, dark bevels and crystal shadows remain visible under these sparse overlays.

One common diamond band (`:293`) and one common gold band (`:311`) cross the respective clipped materials. Gradient definitions at `:213` and `:219` have bright narrow centers and soft cool/cream shoulders. Maximum nominal center alpha is approximately .43 for crystal (.46 × .93) and .38 for gold (.4 × .94). CSS cycles are 6.4s and 7.8s, with the bands entirely beyond the masks before an invisible reset (`assets/home-brand-lighting.css:82`, `:89`). This fixes the former independently delayed gold-letter sweeps.

## Playback and rendering

Every animated brand class consumes `--home-motion-play-state` (`assets/home-brand-lighting.css:21`, `:39`, `:46`, `:52`). The existing Home lifecycle sets running only for active visible Home (`assets/home-gate-motion.css:5`; `assets/home-gate-motion.js:63`) and handles document hidden, inactive route, offscreen, pagehide and reduced motion. Native infinite animation objects that remain installed are paused/resumed at events while retaining their phases (`assets/home-gate-motion.js:33`); navigation through `display:none` and reduced-motion `animation:none` can cancel/recreate CSS objects, so uninterrupted navigation phase retention is not claimed. Installation is guarded against duplication (`assets/home-aperture-motion.js:164`), and fixed negative delays are assigned once (`:255`). The brand installer has no animation frame or interval loop.

Reduced motion removes animation from pins, facets, both bands and edges (`assets/home-brand-lighting.css:104`); pins, facets and bands become invisible, leaving only a tiny stationary edge accent. Overlay SVG is decorative, nonfocusable and pointer-free (`assets/home-aperture-motion.js:199`; `assets/home-brand-lighting.css:15`).

Only opacity and the two band transforms animate. There are no animated filters/blur, no broad glow filter and no blanket `will-change` promotion. These are compositor-friendly properties; source review does not establish GPU-only execution for clipped SVG descendants. Moving band count drops from six to two, but total native animation targets are approximately 124 versus 122 previously, so no overall animation-count reduction is claimed.

## Review result

No blocking source/material/lifecycle issue found. Browser QA should confirm natural motion visibility and that the six long gold edge strokes do not read as animated outlines at phone size; if they do, reducing their peak opacity from .76 to roughly .5 is a targeted adjustment. No browser acceptance or measured performance claim is made by this source receipt.
