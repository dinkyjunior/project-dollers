# Luxury Home asset and typography direction

This is a new assessment after the user rejected the earlier published gate.
Previous functional or material-review passes do not establish acceptance of
this new visual direction. The approved four-phone gate render in the chat
remains the source, with the separately approved removal of duplicate labels.

## The actual weakness

The current files already carry enough native detail at the main phone sizes:
1254 pixels across the metal at 418 CSS pixels is exactly 3×, the 1800-pixel
brand is about 4.8× its display width, and the 1200-pixel scene is about 3.7×.
Adding pixels or sharpening does not fix the cheap impression. The current
metal has broad repetitive brushed-grey plates, coarse grain and standing feet;
its silhouette resembles a separate appliance. The procedural rails and floor
also have a different material language from the photoreal hero.

The source calls for a luminous architectural entrance: polished dark PVD/black
chrome, precision layered bevels, deep saturated glass light channels, varied
localized specular reflections, and receding walls/floor that connect to the
portal. It needs a broad clear opening and a natural nearly circular perspective,
with no large feet or bolted appliance boxes. Bright white belongs in small
highlight cores, rather than a chalk-white outline over all the metal.

## Preserve the approved originals

The diamond/gold/emerald wordmark, the four existing inside venues and all four
genuine league marks remain unchanged. Their SHA-256 hashes and native sizes
are recorded in `asset-direction.json`.

The NFL, NBA and UFC marks are genuine local vectors. Retain their colours and
aspect ratios. The genuine NRL raster is native 500 × 500: at its largest current
225 CSS-pixel element it provides 2.22 native pixels per CSS pixel, not 3×. It is
adequate at the tested DPR2 size; do not upscale it into a supposed higher-detail
file. An accessible legitimate vector would be preferred if available.

The busy diamond grain in the wordmark is a material/content characteristic,
rather than a low-resolution file. Preserve the approved logo identity and
avoid blurring, arbitrary sharpening or changing its lettering. The inside
venue artwork is decorative generated art, not verified official stadium
photography, and contains no generated player faces.

## Local font assets prepared

| Use | Local file | Native font | Size |
| --- | --- | --- | --- |
| Wide heavy CTA display | `assets/fonts/PDArchivoBlack-Latin.woff2` | Archivo Black Regular | 26,648 bytes |
| Crisp small labels/navigation | `assets/fonts/PDInter-Latin.woff2` | Inter variable, weight 100–900, optical size 14–32 | 149,332 bytes |

These are legitimate Google Fonts source fonts, with original design and
attribution retained. The SIL Open Font License 1.1 files are bundled as
`ArchivoBlack-OFL.txt` and `Inter-OFL.txt`. The Google Fonts CSS endpoint returned
a proxy 403, so the original font files were fetched from the public Google
Fonts GitHub repository with HTTP 200. Their exact source URLs, hashes, license
URLs, subset coverage and output hashes are recorded in `asset-direction.json`.

Archivo Black has a visually heavy black design but static metadata weight 400.
Use its natural weight without synthetic emboldening. Inter supplies real 600
for navigation/tagline and 650–700 for selector labels. The local WOFF2 files
cover Latin/extended Latin, punctuation and the current UI labels; both were
decoded and their label coverage verified. Use `font-synthesis: none`, keep text
untransformed, and avoid horizontal font stretching. Root owns the Home-only
font stylesheet, preload and application wiring.

## Geometry candidates held

Two imagegen edits improved polished material and removed the feet, but neither
obeyed the required opening geometry. They remain unintegrated implementation
artwork, with their original PNGs retained in `/workspace/generated_images`.

| Candidate | Native size | Actual outer height/width | Actual clear opening | Decision |
| --- | --- | --- | --- | --- |
| `exec-d092488b-a709-46f7-b696-8bbbad8339c9.png` | 1464 × 1075 | 0.738 | 53.9% of width | HOLD: flattened oval and narrow opening |
| `exec-a9084d93-d526-4583-80fc-6835308ed2b3.png` | 1254 × 1254 | 0.971 | About 58.5% width / 55.0% height on centre lines | HOLD: still too small an opening |

Do not describe these as 76% openings or stretch them to fabricate the target.
Root then prepared a geometry guide for a controlled edit, preserving the
polished material while correcting the transparent opening. The measured
successful result below uses a distinct filename, with native resolution and
alpha intact; neither held candidate became a runtime asset.

All four rendered themes then need inspection: prevent coral/washed red,
acid-yellow green, unrelated pink chrome or an obvious NBA colour seam. Native
file quality and font validity are supporting checks; final acceptance requires
all 16 actual Chromium/WebKit phone captures against the approved chat source.

## Valid guided portal prepared

Root's geometric guide corrected the repeated generation failure. The selected
native source is `exec-a609bd3b-daab-429e-b673-44614e2a33cf.png`, generated using
`source-art/gate-geometry-guide.png` and the polished material direction. It is
a native 1254 × 1254 RGBA asset with a genuinely wider clear opening. The old
two candidates remain held, and the old `gate-metal.webp` is unchanged.

The new distinct runtime file is `assets/home/luxury-portal.webp`: 643,560 bytes,
encoded losslessly without resizing. Its entire decoded RGBA pixel array is
byte-identical to the native PNG, including alpha. This deliberate single-asset
quality budget prevents lossy chroma/edge compression from adding another
variable to the user's sharpness concerns; all themed copies/reflections can
reuse the same browser-cached file.

At alpha <20 the connected opening is centred near native (626.5, 610.5), or
49.96% left / 48.69% top, with centre-line dimensions **968 × 894 pixels**:
**77.19% width / 71.29% height**. Its clear bounds are x143–1110, y160–1061.
The structural alpha ≥128 bounds are x13–1240, y67–1155; visible light at alpha
≥20 occupies x11–1241, y56–1170. Faint outer bloom extends further, so the image
remains square while its visible architectural envelope is naturally elliptical.

Keep the artwork's native aspect ratio. A stage with height/width 0.92 may crop
the transparent/faint-bloom margins through natural `object-fit`, but must not
squeeze the square source into a short rectangle. The original venue should
extend slightly under the measured inner lip, around 78% width / 72.5% height
on the native source coordinate system, and retain its own correct image ratio.
At 418 CSS-pixel art width the native source supplies exactly 3×; at 430 it
supplies 2.92×. Actual browser geometry must determine the stated ratio.

The source image has been inspected for polished precision facets, strong cyan
glass, clear alpha opening and removal of large feet. This is implementation
artwork generated from the approved visual direction, not a crop/export of the
original approved render. Its source, guide, runtime hashes and exact geometry
are recorded in `asset-direction.json`. Actual theme/engine acceptance is pending.

The asset agent has edited no existing app, CSS, index or active artwork.

## NRL vector sourcing

The approved modern green NRL shield remains the original local 500 × 500 RGBA
file. The official NRL and Wikipedia page requests returned a proxy 403; the
public ESPN SVG and 1000-pixel raster candidates returned 404. Public GitHub
logo collections and NRL application repositories were accessible, but the
only NRL vector found was an obsolete yellow/green crest with a football and
does not match the approved modern emblem. That vector was rejected, and no
tracing, invented redraw or replacement was applied.

At the first 393-pixel candidate's 191.25 CSS-pixel contained logo width, the
retained native file supplies 2.61× detail. Final rendered geometry must verify
that the larger target also retains at least 2×. The mark remains sharp enough
for Retina delivery at these dimensions; this is a measured raster-quality
claim, rather than a claim that a verified modern SVG was obtained. The source
search and decisions are recorded in `asset-direction.json`, and sourcing does
not prevent the portal, typography and environment refinements from proceeding.
