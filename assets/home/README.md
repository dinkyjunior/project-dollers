# Aperture Home league assets

The four league marks are served locally. Source URLs, retrieval/review times,
SHA-256 hashes, source context and transformation notes are recorded in
`asset-provenance.json`.

| League | Runtime path | Format |
| --- | --- | --- |
| NFL | `assets/home/nfl.svg` | Genuine official NFL vector paths |
| NBA | `assets/home/nba.svg` | Current official-colour logoman vector, Commons source |
| NRL | `assets/logos/nrl.webp` | Existing native 500 × 500 lossless WebP |
| UFC | `assets/logos/ufc.svg` | Existing scalable wordmark |

Retain each logo's original colour and aspect ratio. Use `object-fit: contain`;
NBA is intrinsically tall, UFC is wide, and the NFL/NRL square source boxes
retain transparent margins. The large gate treatment and selector treatment
must not stretch or recolour the marks. The NRL source is retained at native
resolution; it has not been enlarged into a purported higher-resolution file.

The NFL SVG is the public vector variant of the image identified as “NFL Logo”
in the official NFL site's header/footer. It contains no embedded raster. The
NBA SVG was inspected in the local browser and contains no image, script or
foreign-object elements. Alternate NBA script and naval “NRL” search results
were rejected because they are different marks.

## Decorative implementation artwork

`gate-brand.webp` is a transparent 1800 × 693 material wordmark, downsampled
from a native 2022 × 778 generated image at WebP quality 93. It implements the
approved diamond PROJECT, polished gold DOLLAR and emerald velvet money bag.

`gate-scenes-nfl.webp`, `gate-scenes-nba.webp`, `gate-scenes-nrl.webp` and
`gate-scenes-ufc.webp` are 1200 × 1200 decorative sport environments,
downsampled from native 1254 × 1254 images at WebP quality 89. They are
implementation artwork generated with `image_gen` from the approved chat
concept: blue football, fixed left-blue/right-red basketball, green rugby and
red cage lighting. They do not depict verified official venues or actual
events, and do not provide league/player photography. No AI player faces were
used. All overlays, selectors, labels, routing and motion remain real HTML,
CSS and JavaScript rather than a flattened interactive screenshot.

Native generation identifiers, local source paths, original/optimized hashes,
dimensions, processing commands and visual review context are included in
`asset-provenance.json`. Original PNGs are in `/workspace/generated_images`;
the optimized runtime assets are bundled here. The original chat reference
bytes were unavailable: these are not cropped/exported reference panels.
The native images and actual local 393 × 852 DPR2 brand rendering were
visually inspected for sharpness and appropriate material/scene detail.

The existing wider asset/license documentation remains in `ASSET_SOURCES.md`.
League marks remain trademarks of their owners; provenance is not a commercial
trademark-use license.

## Segmented metal entrance artwork

`gate-metal.webp` is a separate, transparent 1254 × 1254 decorative portal
layer. Its dimensional black-chrome housing, precision brushed-steel bevels,
structural brackets and recessed blue light bands implement the metal entrance
in the user-approved four-phone render. It contains no league mark, brand,
venue or player photograph; the existing genuine league logos and original
venue/brand assets remain separate and byte-identical.

The artwork was generated with `image_gen` using the two chat images reattached
for this correction pass as visual references. The white freehand marks in the
current-site screenshot were treated as annotations, not desired artwork.
This is generated implementation artwork, not an export or crop of the approved
render. The attachment's original file bytes remain unavailable.

The native RGBA source was encoded to WebP quality 92, method 6, without resizing
or changing its alpha channel. The transparent opening has native bounds
approximately x217–1034, y208–1015 and a centre near (627, 610): about 64% of the
art width, slightly above the canvas midpoint. The stadium layer must extend
behind the inner bevel rather than leave an uncovered gap. At a 418 CSS-pixel
rendered art width, 1254 native pixels supply exactly three native pixels per
CSS pixel; larger rendering sizes must report their actual ratio.

Only this decorative metal layer may receive sport-colour filters. Official
logos, the emerald money bag and the original stadium artwork retain their
original colours. NBA uses fixed blue-left/red-right treatment; filters must
not rotate that split around the ring. Moving highlights are separate live
CSS layers, preserving the stationary metal geometry and authentic controls.

## Current chrome correction

`aperture-refined.webp` is a controlled decorative edit of the prior photographic casting, removing bulky joins while preserving polished concentric rails and sapphire channels. Its1315×1197 native dimensions and alpha are unchanged by WebP compression; runtime size307,862 bytes. The generated original and honest geometry limits are recorded in `reference/HOME_REFINED_CHROME_PROVENANCE.json`. It is implementation artwork, not the approved chat image. The original tapered casting remains preserved. The current Enter face uses the original native gemstone atlas.
