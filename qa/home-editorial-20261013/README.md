# Approved editorial Home implementation

Implemented the user's 13 October 2026 Home render as live components: a horizontal diamond/gold wordmark, menu disclosure, NFL identity, two-line editorial headline, dusk stadium scene, white Explore NFL entry, research shortcuts, four sport rows and a quiet footer. The former portal and gem controls are retained on disk but removed from Home's loaded markup and asset includes. Existing research-screen typography remains available through the shared font declarations.

Both NFL entry points use the existing dashboard route. Standings and Players select their existing NFL panels. Matchups uses the dashboard's source-selected fixture action, including the completed-game Report destination. NBA, NRL and UFC remain on Home and announce Coming soon. Menu keyboard navigation, Escape, outside dismissal and focus return are implemented. Decorative wordmark reflection and stadium lighting pause on hidden pages and respect reduced motion.

## Visual review

Independent reviewers inspected actual browser screenshots against the approved attachment. Iteration fixes enlarged the transparent-canvas NFL shield, lowered the skyline/stadium by 7.8% of page width, strengthened the selected row's graphite fill and feathered the background's top edge. Final native 393 × 852 and 430 × 896 captures passed visual review. Tablet and desktop use the same composition, capped at 848px instead of stretching the artwork.

- `native-final-feather/COMPOSITION-home-393.png` and `COMPOSITION-home-430.png` show the complete composition at taller viewports. These are previews, not evidence of a native 852/896px viewport.
- Native phone screenshots and measurements are preserved in `native-final-phones/` and `native-final-feather/`.
- Natural content heights are 890px at 393px and 957px at 430px. The footer is reachable with normal vertical scrolling; there is no fixed Home bottom navigation.
- `iteration1/home-393-full.png` was an early layout-composition capture made by temporarily expanding the scroller. It is not a native mobile QA result. The corresponding top screenshot is native.

## Functional and preservation checks

Independent native Chromium audits passed at 393 × 852 and 430 × 896 with DPR 2/touch, tablet 768px and desktop 1440px. Menu, coming-soon notices, both NFL entries, research shortcuts, direct URLs, refresh and Home return work. No JavaScript/console errors, failed HTTP requests, broken images or horizontal overflow were found. Reduced motion removes Home's decorative animations.

The separate integration review passed 75 native interactions including roster filters/research and all four historical Report tabs. All 452 saved files under `assets/data` remained byte-identical. Eight existing current-week controller tests passed. Exact helpers, source manifests, original helper failures and their corrections are retained; no app or dataset substitution was used to obtain passes. See `MOBILE_QA_SUMMARY.md` and `regression/README.md` for the evidence and limitations.

The legacy `qa/run.cjs` assumes the previous sport-selection hero and Home bottom navigation, and also predates the linked Matchup/Report contracts. It was not treated as proof of this new Home. The native helpers in this directory test the implemented routes instead. Physical iPhone Safari/WebKit verification remains unrun in the current restricted environment.

## Assets and delivery

Local production scenery is 860 × 1290 for phones (369,782 bytes) and native 1024 × 1536 for larger screens (518,320 bytes). The transparent wordmark is 2156 × 384 (331,278 bytes). Responsive picture selection downloads one scene variant. NFL, NBA and UFC use existing local SVGs; NRL uses the existing 500px raster mark. Original generated masters and provenance receipts are retained under `reference/`. No poor images were upscaled or player faces generated.

Scene and branding are reconstructed illustrative assets following the approved render, not a pixel-identical export of its artwork or verified venue photography. Text, controls and layout remain native HTML, CSS and JavaScript.

## Release state

This pass changes Home only; the previously pending NFL data work is preserved. Local visual and integration checks do not certify fresh official NFL agreement, an active production daily refresh or hosted deployment. The environment settings save is still rejected without an identified field; official/API/hosted access and final live-site verification remain unresolved. Do not claim that the website was deployed merely because this implementation was saved or pushed to a review branch.
