# Home brand implementation and natural-time evidence

The original approved PROJECT diamond / DOLLAR gold / green moneybag artwork remains unchanged. Only `assets/home-brand-lighting.css` and `installBrandLighting()` in `assets/home-aperture-motion.js` implement the added light. The 2022 × 778 lossless raster still has SHA256 `c729d40d997a0a873fa103dc88d80c5598121d7006a1d4bdd335df9b275e2531`, and decoded pixels match the approved PNG master exactly.

PROJECT now has 27 sparse pin glints and 71 cut-shaped facet flashes, with one clipped cool reflected light crossing the letter faces. DOLLAR has a single coherent cream/gold reflected band and localized warm edge hits. All existing face and counter masks remain intact, and the green moneybag stays outside the lighting. Crystal glisten repeats over 4.9–6.74s per sampled facet; shared crystal/gold reflections repeat over 6.4s/7.8s. Border clocks remain unchanged.

## Actual browser evidence

These screenshots come from naturally elapsed Chromium sessions at 393 × 852 and 430 × 896. The browser QA agent performed capture; the implementation agent inspected the native crops. No forced animation clocks or substituted assets were used. Preview phases span roughly 6.5 seconds. The screenshots are native evidence files, without resampling or recompression by the implementation agent.

| Phone | Before | After, natural phase |
| --- | --- | --- |
| 393 × 852 | [Baseline](baseline-chromium/brand-393x852-0.png) | [After phase 2](preview-chromium/brand-393x852-2.png) |
| 430 × 896 | [Baseline](baseline-chromium/brand-430x896-0.png) | [After phase 4](preview-chromium/brand-430x896-4.png) |

Natural 393px after phases: [0](preview-chromium/brand-393x852-0.png), [1](preview-chromium/brand-393x852-1.png), [2](preview-chromium/brand-393x852-2.png), [3](preview-chromium/brand-393x852-3.png), [4](preview-chromium/brand-393x852-4.png), [5](preview-chromium/brand-393x852-5.png).

Natural 430px after phases: [0](preview-chromium/brand-430x896-0.png), [1](preview-chromium/brand-430x896-1.png), [2](preview-chromium/brand-430x896-2.png), [3](preview-chromium/brand-430x896-3.png), [4](preview-chromium/brand-430x896-4.png), [5](preview-chromium/brand-430x896-5.png).

Read-only preliminary [pixel analysis](preliminary-pixel-deltas.json) uses conservative material rectangles, not exact letter masks. Against each session's initial frame, crystal pixels changing by more than 3 RGB units rose from about 0.8–1.1% in baseline samples to 1.8–7.5% in after samples. Gold changes span 0.35–13.9% across the after phases. Every sampled moneybag rectangle has exactly zero changed pixels. Phase samples differ between baseline and preview, so these percentages establish increased sampled motion visibility rather than a controlled performance benchmark.

Native crop review found the raster sharp and readable. The warm band and cool facet catches remain localized; sampled gold edges did not read as moving letter outlines. Final exact thirteen-letter and WebKit validation belongs to the browser QA receipt.

## Lifecycle and rendering receipt

`node --check assets/home-aperture-motion.js` passed after installation. New motion uses only opacity and the two reflected-band translations. There are no frame scripts, timers, animated blur/filter effects or per-point layer promotions. All five animated brand classes consume `--home-motion-play-state`; reduced motion removes added moving highlights. Total brand animation targets change from 122 to 124, while moving bands change from six to two. These properties are compositor-friendly; GPU-only execution is not claimed for clipped SVG descendants.

The detailed [source/material audit](brand-source-audit.md) records asset provenance, masks and source locations. Browser visibility, navigation and reduced-motion checks remain in the QA agent's final runtime receipt.
