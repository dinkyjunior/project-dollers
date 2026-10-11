# Home brand, gemstone and corridor QA

The frozen local revision passed in Chromium 151.0.7922.173 and native WPE WebKit 26.0 at 393 × 852 and 430 × 896, with real mobile/touch emulation at DPR2. Both browsers are closed. The reports bind the same fifteen Home source hashes and seven unchanged data-input hashes; all twenty-two actual served bodies returned HTTP200 and matched the exact tested bytes.

| Evidence | Chromium | WebKit |
| --- | --- | --- |
| Closed source-bound report | [results.json](local-chromium/results.json) | [results.json](local-webkit/results.json) |
| Read-only native pixel/clock proof | [pixel-native-proof.json](local-chromium/pixel-native-proof.json) | [pixel-native-proof.json](local-webkit/pixel-native-proof.json) |
| Actual four-sport phone originals | 8 | 8 |
| Recorded native/keyboard/refresh actions | 30 | 30 |
| Naturally advancing original brand objects per phone | 124 | 124 |
| Implemented SVG face-clip interiors with changed pixels | 13 per phone | 13 per phone |
| Running brand clocks under reduced motion / on NFL | 0 / 0 | 0 / 0 |
| Running original brand clocks after reduced-motion restore / Home return | 124 / 124 | 124 / 124 |
| Shared 8.8-second perimeter clocks | 17 | 17 |

Each native brand sequence contains six original cropped paints with requested natural wall-time targets 0, 0.8, 1.9, 3.3, 4.8 and 6.5 seconds. Actual read-only sample spans are recorded: Chromium 6.50 seconds at both sizes; WPE 6.49 and 8.38 seconds. WPE screenshot serialization delayed the latter sequence. No clock was sought or paused for capture, no image decode was forced, and no application DOM/styles, data or responses were replaced.

The independent analyzer applies the thirteen implemented, hand-sampled SVG face-clip interiors through their real native screen-coordinate matrix. Every PROJECT and DOLLAR face interior has changed original pixels across the natural samples. The conservative moneybag interior has exactly zero changed pixels. This establishes visible local material lighting on preserved original artwork; it does not claim that individual raster diamonds are editable or that the approved attachment is a registered pixel reference.

The functional suite preserves the corrected venue helper's contracts: all four real selectors and the real entry fit both phone frames, remain at least 44 × 44 pixels, and are unobscured; no horizontal overflow or Home bottom navigation exists. NFL enters the actual dashboard with the exact current JSON data. The other sports remain coming-soon states. Keyboard navigation, sport persistence after refresh, NFL return and Home refresh pass. Native reduce/restore and route-away/return checks verify the complete Home lighting lifecycle, including all five new brand classes.

All seventeen native perimeter paths remain closed, normalized to pathLength 1000, on the same zero-delay 8.8-second loop. Multiple genuine time samples, sport changes, actual phone resizing, reduced-motion restoration and route return verify equal native start times/current times and normalized dash phase. The brand's independent scintillation clocks intentionally have separate durations and phases.

Every first natural sport-selection original contains the actual photographic venue, verified by a read-only pixel sample. Controls and materials were inspected in actual browser originals: the continuous jewel Enter surface keeps its end facets and readable translucent label; the four selector faces preserve official icons, visible floor texture and complete borders. The compact corridor uses its native material aspect ratio and fades below the dock. Narrow icy channels remain distinct from navy recesses and polished metal. NBA keeps blue-left/red-right lighting; NRL and UFC keep emerald/ruby. The original lossless wordmark remains sharp and readable while facet flashes and warm coherent gold reflection move within its face clips.

Chromium also verifies 1440 × 900, 768 × 1024, 393 × 600 and 320 × 700 geometry, scrolling and native final-selector access. The actual [desktop original](local-chromium/home-extra-1440x900-top.png) shows the complete 430-pixel column. Both engines have zero JavaScript/console errors, HTTP failures or failed native requests. This is native browser validation, not physical-iPhone frame-rate certification.

Original phone files are named `home-{nfl,nba,nrl,ufc}-{393x852,430x896}.png`. The `brand-*` files are genuine native crops. Motion, reduced/restored and route-return files retain genuine brand crops; selected lifecycle phases also retain complete perimeter crops. Together the two engines preserve 76,293,654 original PNG bytes, approximately 72.8 MiB. Fullscreen duplicates were avoided; original pixels were not recompressed or altered.

An initial material-review observation that the WPE 393-pixel Enter label was missing was withdrawn after root and the reviewer rechecked the original at full detail. `local-webkit/home-nfl-393x852.png` has report-matching SHA256 `3895567a566e0395b7b27432a988e74b66f625087c56e5663906f176fcf4f2b1`; root's read-only region check also found 846 neutral text pixels. Enter is clearly painted. No application fix, new sample or changed acceptance source was needed.

[LOCAL_RECEIPT.json](LOCAL_RECEIPT.json) records exact report/proof hashes and source/data manifests. [BASELINE_COMPARISON.md](BASELINE_COMPARISON.md) identifies immutable before/rejected-preflight evidence. Returning control, portal and performance specialists independently review the closed reports and saved originals. The approved chat attachment is unavailable as local original bytes; root owns the attachment-based qualitative reference comparison.

Reproduce only into a fresh immutable directory:

```sh
node qa/home-brand-jewels/final-native-brand.cjs --engine chromium --output /tmp/home-jewels-chromium-new
python3 qa/home-brand-jewels/analyze-native.py /tmp/home-jewels-chromium-new
node qa/home-brand-jewels/final-native-brand.cjs --engine webkit --output /tmp/home-jewels-webkit-new
python3 qa/home-brand-jewels/analyze-native.py /tmp/home-jewels-webkit-new
```

The helper uses the existing local server's `/project-dollers/` path. Pass `--base https://dinkyjunior.github.io/project-dollers/` for actual hosted verification after publication; TLS/hostname verification stays enabled and exact served-byte checks remain mandatory. Hosted verification is a separate receipt and is not established by these local passes.
