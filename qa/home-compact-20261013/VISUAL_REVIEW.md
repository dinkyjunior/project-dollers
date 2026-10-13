# Independent compact Home visual review

Reviewer: `/root/home_visual_review`.

Result: **PASS** for the latest approved compact Home changes. No app or image source was edited by this reviewer.

## Changes checked

- Home uses the same compact frame dimensions as the NFL page, including the 400-pixel desktop presentation.
- The visible “See the whole game” headline, repeated league name beside the hero mark and sport-row numbers are removed.
- The larger horizontal branding retains its natural aspect ratio, clear diamond detail and brighter gold highlights.
- The wordmark reads **P R O J E C T** and **D O L L A R**. Two distinct L glyphs are visible both in the native 2164 × 375 asset and the actual phone header.
- The green moneybag and hamburger have a visible gap. Neither the wordmark nor the menu is clipped.
- Badge, research description, skyline and stadium follow an intentional compact hierarchy. There is no reserved blank block where the removed headline used to sit.
- The stadium field, court or octagon and front exterior remain visible. The primary control sits below the main venue rather than covering the playing surface.
- Sport rows use a compact logo/name/status layout without an empty number column.
- NBA blue/red, NRL emerald and UFC ruby lighting remain consistent with the previously approved scenes; NFL preserves its blue scene.
- NFL entry and Coming soon controls retain the shared pill geometry and readable labels.

## Native browser evidence inspected

Final images under `native-compact-final-v2/`:

- `home-393-nfl.png`
- `home-393-nba.png`
- `home-430-nrl.png`
- `home-430-ufc.png`

Initial compact 393-pixel and 1440-pixel output under `root-captures/` was also inspected. The independent mobile QA covers all four sizes and all four sports, including exact Home/NFL frame measurements and functional controls.

The last row and footer can require a short vertical scroll within the matching app frame. This is intentional scrollable content, not horizontal overflow or fixed-controls coverage.

## Screenshot presentation cross-check

Some tool image presentations again appeared to omit static labels. No source defect was inferred from that preview. Direct inspection of the original 430-pixel RGB PNGs confirms all four name regions contain text in every state: 743–1023 bright pixels per region. Original-detail views and independent QA are the visual evidence. No CSS patch or screenshot alteration was made to hide the presentation issue.

## Limits

This is a visual-layout and branding signoff. The scenes are illustrative artwork, not claims about real venues. The result follows the approved visual direction and subsequent compact changes; it is not a pixel-identical reproduction. Interaction, source integrity, current data and hosted deployment must be assessed by their separate audits.
