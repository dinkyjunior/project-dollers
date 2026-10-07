# Final Page 1 cross-engine UI review

Reviewer: `metal_ui`, responsible for Home presentation.
Reviewed: 7 October 2026, 12:50 AEDT (Australia/Sydney).

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

| Source | SHA-256 |
| --- | --- |
| `index.html` | `4060e98aa1fa81b7d8faf553f66af83ec7c772e2bfcf2de2864976d669cec112` |
| `assets/home-premium.css` | `4f553b24a90493ac5302586d91f4779d46560ae73c408d11d9c2130ba569fe51` |
| `assets/home-gate-motion.css` | `83200c4fcbaaf7cdcc9ec381ea0a64ca0bb4c947718a73f23c3173b97bdfeddb` |
| `assets/home/gate-metal.webp` | `96bcb4c55bc67caa78051b704af210d5a5208062672b9eff5eba3e9a0ab3759d` |
| `approved-local-captures/manifest.json` (Chromium) | `3ad3066c20826ab9b627df7ea6c48781bbaaaa5963b49837f77f584003e8273b` |
| `cross-engine-local-webkit/manifest.json` (WebKit) | `a723ac241e3ad4b2233aa80e10a6c4bee9cda41fefcb5c9d0de652bc33218676` |

Chromium captures are in `approved-local-captures/`; corresponding WebKit
captures are in `cross-engine-local-webkit/`.

| Capture | Chromium SHA-256 | WebKit SHA-256 |
| --- | --- | --- |
| `home-nfl-393x852-live.png` | `97658df9080c0cb84ecb5809004abcbd20b6ab921c5324098406bc49c0cf5965` | `7443f4233527e0882930335426be0010391aaf1b12dfa27f65b8bdd2c7e22384` |
| `home-nba-393x852-live.png` | `3b13bea10925ff2534fa4e5fb02ed2c0d162f0fb929347d3625330113e78a958` | `4c16ac024f8a51a431a3bc41ec8e6188ff60687407a3a1eae8f22cc2638b6638` |
| `home-nrl-393x852-live.png` | `b63cc98e7e8c1c0ad5b637417f91d80d525aa0ec390edf7388e4891f564bea66` | `9c2becf97cdc3610eb9b8592869d4eb6a0ee012639abc11955358271c5e17ffe` |
| `home-ufc-393x852-live.png` | `2be6b30b0c075b5d2ec42f253ef8207ca9aa927de628db0b1df2746a7d4a70df` | `a4253ba70bced4054c441b45aaba09304c60586c0012c6260162c97c0f51dd3c` |
| `home-nfl-430x896-live.png` | `9cac3fba6f5bed397ef55f6218f746c0727833f1b788e7aa2a82be340d30d9e2` | `8b4f2c1b75ed3ac7a99a632f6625833dacc38b593126e782ccbc53a67859dab7` |
| `home-nba-430x896-live.png` | `41a8666dd4c37e3f4d98dfbb74184ad9dd71bb045c69c77fef70b89636c3d37b` | `c5a1f88754dc9b3f3a487f093530a3098abb9fb9649089a0d31fc105cd914651` |
| `home-nrl-430x896-live.png` | `da3019722a98d8c7edd2c8339fd5ac99bac1ad0e8235639a7f4dd741621d77d6` | `0590f25a56d0aa99212a76ee31b3dbb2326cf3aa454b8233b99127027aa28a19` |
| `home-ufc-430x896-live.png` | `45e721e54b210aca14a7cdb6c92d09553fc95dc7bcc31738f7938b27da7c4347` | `351e17ac6a6543dc6724cbc995b3c877fcdc47212f5d6300ec40d7c17bd9c997` |

The previous approval and affected WebKit evidence are preserved in
`iterations/webkit-floor-hold/`. The reason for the correction is documented
in `ui-webkit-floor-assessment.md`.
