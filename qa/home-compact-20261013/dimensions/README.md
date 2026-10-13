# Independent Home / NFL size contract review

Native Chromium measured the actual existing pages at 393 × 852, 430 × 896, 768 × 1024 and 1440 × 900. No DOM, style, response or clock substitution was used. Source hashes before/after each run are included; both runs were source-stable and all browser contexts closed.

Before: Home expanded to the viewport with an 848px desktop canvas, while NFL used its established compact enclosure. The desktop Home headline was 92.432px.

After: Home and NFL have exactly equal width, height, horizontal/vertical location and 18px radius at all four sizes. Desktop/tablet are 400 × 770. Phone frames measure 393 × 756.171875 and 430 × 802.671875. The NFL measurements themselves are unchanged from the independent before baseline.

Home canvas now equals the enclosure width. The visible headline is removed as requested; its screen-reader heading remains. Entry text scales from the real canvas width (15.6px on desktop), and no horizontal overflow or JavaScript/console errors occurred. Scrollable content height is distinct from the enclosure height.

The preserved production gate remains green: all 737 existing production assets, scripts and workflows, including 452 data files, are byte-identical to ef29763; NFL and later index markup is also unchanged. The preservation receipt records HEAD bb0411b as the candidate's base commit; the then-uncommitted Home changes are bound by the after-size run's actual source hashes.

This is local geometry and preservation evidence, not actual hosted verification, measured FPS or physical iPhone Safari certification. Full Home control/visual checks are recorded separately by their reviewers.
