# Final Page 1 cross-engine UI review

Reviewer: `metal_ui`, responsible for Home presentation.
Reviewed: 7 October 2026, 13:02 AEDT (Australia/Sydney).

**Accept all 16 frozen actual-browser captures:** NFL, NBA, NRL and UFC at
393×852 and 430×896 in both Chromium and WebKit. This is the UI role's visual
acceptance; other agents' acceptance, functional QA and hosted verification
are separate publication requirements.

I compared both eight-screen browser contact sheets and native screenshot
details against the approved four-gate render attached in the chat. The white
strokes in the annotated current screenshot were feedback marks, not artwork.
The reference board's original bytes were unavailable, so this is a human
reference comparison rather than a pixel-diff or a claim of pixel identity.

The substantial raised chrome sectors, dark steel chassis, recessed lighting,
bolts, side brackets and pedestal now provide the robust metal entrance missing
from the rejected smooth CSS ring. The masthead gap is close to the source;
the retained brand, genuine league artwork and venue images remain crisp and
well framed. The fixed NBA blue/red halves, NRL emerald lighting and UFC red
lighting are coherent throughout the housing, environment and controls. The
duplicate hero heading remains absent, Coming soon omits Preview only, and UFC
navigation says Fighters.

The WebKit floor blocker is resolved in these actual images. Both engines now
show illuminated ground immediately beneath the feet and a matching native
metal reflection leading toward the entry control. The dark air gap and exposed
wall-shaft region in the previous WebKit evidence are gone. Moving floor beams
remain inside the ground plane; neither engine paints broad diagonal streaks
across the sport dock. Natural glow/venue phases differ, as expected, but the
ground position and control hierarchy are visually consistent.

The 2D floor correction preserves the metallic depth through real artwork and
its reflected image, with subdued wet striations rather than a prominent grid.
No remaining material, layout, color, image-quality or floor-paint blocker was
found in the 16 reviewed captures. Physical iPhone testing and final hosted
verification are not asserted by this local visual review.

## Frozen source and evidence

Both capture sets are natural, unpaused actual browser output at device scale 2.
Their runtime manifests bind the same 184-file candidate.
These are fresh captures after the final compact-width floor gutter correction;
the previous capture approvals were not relabelled. The correction changes only
viewports of 360px or less, and the two primary viewport designs remain intact.

| Source | SHA-256 |
| --- | --- |
| `index.html` | `4060e98aa1fa81b7d8faf553f66af83ec7c772e2bfcf2de2864976d669cec112` |
| `assets/home-premium.css` | `0935eadb330ab4a76460f3b9e009030cec170898a3b648205c419cf0bb4c4a1a` |
| `assets/home-gate-motion.css` | `83200c4fcbaaf7cdcc9ec381ea0a64ca0bb4c947718a73f23c3173b97bdfeddb` |
| `assets/home/gate-metal.webp` | `96bcb4c55bc67caa78051b704af210d5a5208062672b9eff5eba3e9a0ab3759d` |
| `approved-local-captures/manifest.json` (Chromium) | `e029a517da3660342dd870c1b0357bab4800f6c64927191605598ee0cb953a18` |
| `cross-engine-local-webkit/manifest.json` (WebKit) | `bdcc9f336a72a141acddd7c03a630e2b54e27a3f5c804da6a4a347e4059d6688` |

Chromium captures are in `approved-local-captures/`; corresponding WebKit
captures are in `cross-engine-local-webkit/`.

| Capture | Chromium SHA-256 | WebKit SHA-256 |
| --- | --- | --- |
| `home-nfl-393x852-live.png` | `3519628e09041ae559da1859dace69d81b19e5f2d9c2ed02fff16d1eaebaa828` | `1d949328f085b2db8868b11d3ef319167132d1d55a8f5c64a3a14eb621326ea4` |
| `home-nba-393x852-live.png` | `e77c240cc72a71e62a5f4962318a53ec78ad04ff6af378be4dafd6c46898fd46` | `4d9a33e788674190fb589798939e692ac2723a4c21be7eb09b77b899bbf7a2e7` |
| `home-nrl-393x852-live.png` | `f83629c69589333a41de588aaf1b106524212155578d69ab62fce3accc00ac7e` | `38b2ec7dd15a3bb21e6d5937e4186a5109a6aa92d763fb9ac83bca17d1505037` |
| `home-ufc-393x852-live.png` | `7ed216059e931aede0327ffe5af10e7771752230a5069966a474dd32ad2cdff4` | `d4c563240081e0383ef78d7c9ee92b2e01afbe358d715a87c092e77651f3ab20` |
| `home-nfl-430x896-live.png` | `f95faa3d8df6a4764f8fd5215cbaa6e4a40fcbf9dbc0d0490183c10fc4814cdf` | `8151281af9fe93d819aad53fffdf183c4759fd31e7a76184e71cd6c02ab351ea` |
| `home-nba-430x896-live.png` | `336c935b7a7611838d2d4b475f017cd36051e52feec4c8c2e29b274d4c4a887d` | `2c91fc52c83306258f465b23264e536b86a812c60534583194ed66b7b0b10101` |
| `home-nrl-430x896-live.png` | `90e6294509f45b29dccd9db4b9751b4a662fd777d57627c185771e884721b432` | `d2babef883e42c19275e6a9a60c44b845b41f8b92d588193294e1b2ab36c6c7b` |
| `home-ufc-430x896-live.png` | `a7527448f5db569299b54e6e678d962d2f5e82667c06bc19631157525099c754` | `4a6780483047469e3e029325ec0ff6dd9494ac04cf0add1b33a48940ba14dddc` |

The previous approval and affected WebKit evidence are preserved in
`iterations/webkit-floor-hold/`. The reason for the correction is documented
in `ui-webkit-floor-assessment.md`.
