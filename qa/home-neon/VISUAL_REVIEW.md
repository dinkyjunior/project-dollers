# Independent stronger-neon Home review

Reviewed 7 October 2026 (Australia/Sydney). Current acceptance covers the approved Home refinement, not a new concept. The original approved gate reference is the chat attachment; original attachment bytes were unavailable for saving or pixel registration.

Two independent QA reviewers inspected all eight final Chromium primary captures against the eight corresponding preceding actual hosted captures, with the approved chat concept available to native vision. The independent reviewer also inspected all eight final genuine WebKit phone captures. The root reviewer separately inspected the final NFL 430, NBA 393 and UFC 430 screens. The complete hosted acceptance and unpaused capture record will be added after deployment.

## Visible changes and quality

- The duplicate sport heading and second research subtitle below the gate are removed. The diamond/gold Project Dollar artwork and single SPORTS DATA & RESEARCH brand line remain crisp.
- The gate is visibly larger and physically thicker. Its outer illuminated lip, white core, inner neon and bloom make the entrance substantially more prominent than the previous implementation.
- Entry and selected-sport boxes have thicker illuminated borders with stronger diffuse light. Their text remains clear and positioned inside the borders; the selected sport is easy to identify.
- Architecture/wall lighting and reflected floor light are stronger without obscuring controls. Generated decorative venue artwork stays inside the gate; legitimate league logos retain their correct proportions and local vector/Retina rendering.
- NFL blue, NRL green and UFC red themes are visually coherent. NBA's hard ring, entry and selected-box splits remain fixed blue-left/red-right. Increased opposing diffuse blue/red blooms produce a small violet/magenta overlap near the CTA centre/floor; the root reviewer accepted this as natural additive lighting. This is explicitly not a claim of zero optical colour mixing.
- Both phone sizes retain aligned selectors and navigation, readable labels and no visible clipped controls. UFC displays Fighters. Compact, tablet and desktop geometry is checked in the browser suite.
- Frozen frames show more floor reflection behind the sport dock in WebKit and more between the ring and entry in Chromium, leaving a darker WebKit gap. Decorative phase/composition differs while core gate, controls and readability remain consistent. No claim of pixel-identical cross-engine decoration is made.

## Motion and functional evidence

Static images do not establish animation. The independent browser suite records actual ring and venue transform changes plus naturally changing opacity for the outer halo, inner halo, CTA bloom and selected-sport bloom. It uses bounded rendered-frame sampling without seeking animation time. Reduced motion stops the loops; offscreen and inactive Home pause the same layers. Existing NFL/Steelers navigation, filters, tabs, source-matched histories and complete expanded-card football motion remain separate regression checks.

The hard borders satisfy at least 4px for entry and 3px for the selected sport. Browser checks also verify native 44px targets, width/viewport fit, control hit targets, local Retina images and readable control-label bounds. These checks support, rather than replace, the visual inspection above.

## Evidence and limits

`local-chromium/results.json` passed all five sizes, and `local-webkit/results.json` passed genuine WebKit at 393×852 and 430×896. Both reports retain the same 183-file runtime manifest and record zero JavaScript/console, HTTP, genuine request or external-asset failures. The existing player history regression compares 700 recent-game and 695 relevant-opponent fields per phone; complete-card football and travelling light cover all four sides with zero phase difference and less than 0.8px maximum border distance. The explicit accessible-name probe passed all five Chromium and both WebKit sizes in `accessible-local.json`.

`local-comparison/index.html` contains eight labelled old actual hosted versus new local WebKit boards. The new functional images pause only during exposure, and the old images are unpaused. The actual hosted run, unpaused refined captures and final hosted-to-hosted boards remain pending publication. Original browser pixels are preserved in comparisons, with matching viewport/DPR and transparent source labels.

An apparent omission of inactive UFC navigation glyphs in one full-image preview was cross-checked against the exact saved PNG (SHA-256 `2b1ec92b73f33205c097822f21f85c703af3ecf30468a4404ed178e708fc53e7`). Its original pixel crop contains all five icons. The crop and descriptive pixel evidence are preserved under `paint-probes/`; no missing glyph exists in that source screenshot, and no runtime change was indicated.

No physical iPhone, Safari browser chrome, physical screen reader or hardware FPS result is claimed. Cloud animation-frame timings are software/container measurements. No Page 4 was added or modified.
