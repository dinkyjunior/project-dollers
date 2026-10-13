# Compact Home native audit

The frozen compact Home passed all four sport states at native 393 × 852 and 430 × 896 with DPR 2 and touch, plus 768 × 1024 and 1440 × 1000 desktop. Results and sixteen native screenshots are in `native-compact-final-v2/`.

Home and NFL shell bounds matched exactly after entering NFL and returning to Home:

| Viewport | Shell x / y | Shell width / height |
|---|---|---|
| 393 × 852 | 0 / 47.90625 | 393 / 756.171875 |
| 430 × 896 | 0 / 46.65625 | 430 / 802.671875 |
| 768 × 1024 | 184 / 127 | 400 / 770 |
| 1440 × 1000 | 520 / 115 | 400 / 770 |

The old visible hero headline, repeated hero sport name and numbered sport-row labels are removed. The tagline remains. The refined wordmark supports Retina width and does not overlap the 44px menu target. All four scenes decoded correctly; sport selection, NFL-only entry and topic gating, menu keyboard focus and Escape, and Home → NFL → Home passed. No broken accessible references, horizontal overflow, JavaScript, console, HTTP or failed-request errors were found. Four-state reduced motion passed. Source manifests remained stable and every browser context was closed.

`native-compact-final/results.json` preserves the initial helper failure: Chromium's `checkVisibility()` regarded the new clipped, 1px `sr-only` accessibility heading as visible. The old visual headline was already absent. The helper was corrected to inspect the actual rendered box and screen-reader-only class before the successful run; no application patch was required for that failure.

Independent original-detail visual inspection confirmed the wider branding, clearer Project and DOLLAR lettering, clean spacing beside the menu, unchanged venue artwork and compact frame. Vertical scrolling within the frame is intentional.

This is local Chromium evidence. Safari, hosted delivery and NFL data accuracy remain separate checks.
