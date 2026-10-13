# Independent all-sports Home visual review

Reviewer: `/root/home_visual_review`.

Reviewed production release: `bcecaa4`; UI source was not edited by this reviewer.

Result: **PASS**, with hosted verification and functionality covered separately by their respective audits.

## Reference and scope

The latest approved editorial Home render supplies the visual hierarchy: horizontal diamond/gold Project Dollar branding, a plain hamburger, league mark and name, large white two-line headline, lavender research copy, a sunset skyline and full stadium, a rounded white primary control, tracked research topics, four horizontal sport selectors and a quiet footer. The subsequently approved sport states retain this composition while NBA uses blue/red lighting, NRL uses emerald lighting and UFC uses ruby lighting. Only NFL has an entry route.

## Actual output inspected

- All four native 393-pixel sport captures under `native-production-release/`.
- Native 430-pixel NBA, NRL and UFC captures, plus the earlier NFL phone layout and footer review.
- Native 1440-pixel NRL composition and earlier NFL desktop framing.
- The three 860 × 1290 mobile scene assets directly, at their supplied resolution.

Shared headline geometry, brand, stadium perspective, skyline, exterior framing, primary-control height, selector alignment and quiet status treatment remain consistent between states. The NBA court, rugby field with H posts and fenced UFC octagon read clearly. Authentic sport marks retain their proportions. The selected rail and action colours match their sport. NFL's original corrected framing is preserved.

No remaining material composition, alignment or image-quality blocker was found. The artwork is reconstructed illustration, not an assertion that the scene is an actual venue or an exact pixel reproduction of the approved render. Mobile assets support the tested 2× phone sizes. Desktop master resolution is recorded in the separate asset audit and does not imply 2× sampling at every desktop canvas size.

## Image-presentation cross-check

Some default `view_image` presentations appeared to omit parts of static headings or selector labels. That concern was investigated before signoff, rather than prompting an unverified CSS change. The QA owner confirmed that the original production PNGs were not overwritten; additional paint probes were saved separately.

The raw screenshots are RGB PNGs. Direct pixel inspection found the heading and every sport name in every 393- and 430-pixel sport capture. At 393 pixels the heading region has 581 bright pixels in each state; all four name regions contain 625–823 bright pixels. At 430 pixels the heading region has 774 bright pixels in each state; all four name regions contain 734–1010 bright pixels. Original-detail inspection of the NRL 393-pixel image also showed all labels intact. The default-presentation concern is therefore retracted as evidence of an application defect. No app source patch was made for it.

## Limits

This review signs off visual composition against the approved direction. It does not replace interaction, route, data, reduced-motion or hosted-site verification. Native 393 × 852 and 430 × 896 screenshots are the phone evidence; taller composition captures are explicitly presentation aids, not substitutes for native viewport testing.
