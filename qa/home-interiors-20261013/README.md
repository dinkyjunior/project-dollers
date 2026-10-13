# Compact Home: interior sport scenes

The latest user approval retains the compact Home frame and Project Dollar
wordmark. This pass removes all four research taglines and the visible names
beside the four selector icons, enlarges those genuine icons, and replaces the
NBA, NRL and UFC outdoor scenes with the supplied reference's interior views.
NFL remains the only sport with an implemented research entry.

## Implementation

- The NBA scene shows the complete wood court with two end baskets and a
  central scoreboard, with blue and red arena lighting.
- The NRL scene shows the full diagonal rugby-league pitch, both H posts and
  emerald lighting beneath a narrow dusk skyline.
- The UFC scene shows a complete fenced octagon, red ceiling trusses and white
  overhead lights.
- The three new scenes retain their native 3:2 composition at full Home width;
  feathered edges blend into the black canvas. Neither side is cropped, and the
  images are not stretched. See `assets/home/editorial-interior-scenes-provenance.json`.
- Selector rows contain enlarged authentic logos and availability labels,
  keeping the accessible selection names. They select previews; unavailable
  sports cannot open NFL data. The primary entry and research shortcuts remain
  available only on the NFL preview.
- The approved NFL aerial scene, refined wordmark and Home/NFL frame contract
  remain unchanged. Existing research markup, controllers and datasets stay
  separate from this Home release.

## Validation

`native-interiors-v1/results.json` records a native Chromium run at
393 × 852 and 430 × 896 with DPR 2, plus 768 × 1024 and 1440 × 1000.
All four sport states were captured at each size. The checks passed for removed
text, accessible selection labels, enlarged unstretched icons, decoded scene
sources, NFL-only entry, selection and return behavior, menu handling, reduced
motion, console/request errors and horizontal overflow. The exact Home frame
matches the NFL frame at all four sizes.

`asset-audit.json` contains a separate browser and asset-quality review. Only
the selected sport's interior was requested, all six encodings decoded, and
their receipt hashes matched the retained native masters. Mobile files are
860 × 573, downsampled from 1536 × 1024; no image was upscaled. The NBA, NRL
and UFC mobile files are respectively 214,954, 217,484 and 191,264 bytes.

`preservation-frames/` records a separate production-preservation audit against
`fb96ffc68c311c547c23d135b626597afce7ffb6`: 741 protected existing files,
including all 452 data files, remain byte-identical. NFL-and-later markup and
all non-Home stylesheet/script includes are unchanged.

The native PNGs support visual comparison with the user's three-panel arena
reference. This pass verifies decorative scenery and Home behavior; it does
not verify NFL standings freshness, activate a data-refresh workflow, certify
Safari, or establish hosted deployment delivery. The environment's HTTPS proxy
continues to block access to the GitHub Pages origin, so the production Git
push must be distinguished from an independently verified live page.
