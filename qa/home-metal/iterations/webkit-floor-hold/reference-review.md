# Independent Page 1 reference and material review

**Decision: ACCEPT the final local visual candidate at both requested phone sizes.** Reviewer: `metal_reference_design`. This is an independent visual comparison against the user-reattached four-sport approved board. It authorizes progressing to the remaining QA gates; it does not claim that deployment or functional QA has passed.

The approved source is the chat attachment headed “PROJECT DOLLAR — FINAL HOME CONCEPT”. The other reattached NFL screenshot contains the user's white freehand problem annotations; those annotations were not copied into the design. Original attachment bytes were unavailable for a repository copy or a registered pixel comparison. No generated implementation image is presented as a copy of those original bytes.

## Exact candidate reviewed

I viewed all eight original-resolution browser PNGs in [the frozen local gallery](approved-local-captures/index.html), individually, and compared each sport against its corresponding approved phone panel. Captures are actual Chromium 151 browser output at device scale factor 2, with touch/mobile emulation, without pausing animation or substituting a source image. The capture completed at **12:12:34 pm AEDT, 7 October 2026**.

The [capture manifest](approved-local-captures/manifest.json) SHA-256 is `3e305aa84d8194c8403760f3f993fe9b226d12dda551a319ddac98f3e3a1170b`. Its 184-file runtime manifest binds this review to the following Home implementation:

| File | SHA-256 |
| --- | --- |
| `index.html` | `d593350ee4dcb19df92c2a6d5ecf2732f77eebf679cdfbf24142e4b371c757df` |
| `assets/home-premium.css` | `72db4bde8cc1eb23548457a4237973ed3736e6afc974273d5477317ea76e4bd5` |
| `assets/home-gate-motion.css` | `83200c4fcbaaf7cdcc9ec381ea0a64ca0bb4c947718a73f23c3173b97bdfeddb` |
| `assets/home-gate-motion.js` | `ecb169a2832853d7cae5d83218fbf567ed1dd64632c5474261367da12d8434c2` |
| `assets/home/gate-metal.webp` | `96bcb4c55bc67caa78051b704af210d5a5208062672b9eff5eba3e9a0ab3759d` |

Later changes to the reviewed Home runtime require another visual check. Changes confined to evidence/documentation do not alter these reviewed pixels.

## Per-screen decisions

| Sport and viewport | Decision | Independent visual findings |
| --- | --- | --- |
| NFL, 393×852 | ACCEPT | The thin uniform annulus is replaced by raised brushed-steel panels, recessed dark sections, bevels, bolted side housings and a substantial pedestal. Bright electric-blue channels illuminate the front and inner throat; steel shadows remain visible. The retained NFL artwork sits centrally over the retained stadium without intersecting the chassis. The feet meet the reflected floor, and the headline-to-gate void is gone. |
| NFL, 430×896 | ACCEPT | The 418px entrance fills the available width with crisp metal and visible depth rather than enlarged thin outlines. The blue channel, structural walls and mirrored ground form one environment. Extra phone height is used for reflected floor beneath the gate, with clear separation before Enter NFL and the selector row. No heading or research line has been restored below the league logo. |
| NBA, 393×852 | ACCEPT | The physical metal geometry is consistent with NFL while the fixed blue-left/red-right split continues through the gate, wall light, reflection, CTA and active selector. Corrected red reads as neon red rather than an orange entrance. The tall official logo remains fully visible within the opening, with venue context around it. The central split is intentional and aligned. |
| NBA, 430×896 | ACCEPT | Wider geometry preserves both opposing light environments without stretching the brand, logo or metal asset. The upper metal surfaces retain distinct brushed facets and black panel recesses. Blue/red reflected native metal beneath the pedestal replaces the earlier floating black strip; the darkened ground prevents a generic tiled-dashboard appearance. Coming soon remains legible without Preview only. |
| NRL, 393×852 | ACCEPT | Green light runs through the complete structural environment and recessed portal. The revised colour treatment reduces the earlier acid-yellow cast; retained green NRL artwork remains distinct against the stadium. Metal highlights and shadows reveal separate construction planes instead of a continuous pale outline. Soft native ground reflection keeps the heavy pedestal visually anchored. |
| NRL, 430×896 | ACCEPT | The larger entrance keeps the green opening, logo and structural housing proportionate. Dim regular tile seams and irregular wet streaks allow the mirrored metal/green reflections to dominate the ground, closer to the supplied cinematic entrance. Original brand/tagline, selector labels and coming-soon control remain crisp and clear. |
| UFC, 393×852 | ACCEPT | Red recessed lighting, corrected red metal reflections, the retained red UFC logo and red arena now form a cohesive red environment. The source's strong black/chrome/illuminated hierarchy is represented by substantial side cases and thick bevelled panels. Pedestal reflection fills the marked lower environment. Fighters is visible in navigation; Preview only and duplicate hero labels remain absent. |
| UFC, 430×896 | ACCEPT | The 418px red portal retains dark structural material despite strong bloom and bright localized highlights. The native metallic reflection joins the feet to the glossy floor without obscuring the CTA. Logo, cage/arena interior, coming-soon copy, selectors and Fighters remain readable and correctly proportioned. The current ring is materially stronger than the rejected shallow wheel at this larger target. |

## Geometry and material evidence

The final capture manifest reports the same intentional portal geometry across all four sports at each target size:

| Measurement, CSS pixels | 393×852 | 430×896 |
| --- | --- | --- |
| Portal outer box | x=6, y=192, 381×381 | x=6, y=200, 418×418 |
| Tagline bounding-box to portal gap | 7.59375 | 5.125 |
| Portal radial material depth | 64.7734375 | 71.0625 |
| Depth as fraction of portal diameter | approximately 17% | approximately 17% |

The small computed gap plus the image's transparent top edge yields a small visible, intentional separation beneath the tagline. It resolves the former roughly 40px empty upper region. The final entrance has three readily visible depth planes: dark rear construction, raised segmented metal faces, and the recessed illuminated inner throat. Unequal faceted pieces, seam depths, bolts and side structures replace the rejected evenly spaced plain bars. The pedestal and mirrored native artwork create floor contact rather than a hovering ring above a black rectangle.

The new 1254×1254 local metal image supplies three native pixels per CSS pixel at the 418px target, and more at 381px. It is not an enlargement of poor source material. The original brand, league artwork and venue plates are retained. In these eight inspected screenshots I found no visibly blurry logo, stretched image, fuzzy metal edge, clipped housing, white line dominating the sport lighting, glow covering text or restored duplicate hero label.

## Review and correction loop

I did not accept the first asset integration as finished. Its metal volume and smaller upper gap were good, but the feet still floated above a roughly 30px dark ground break. The following contact correction removed that break; I then independently challenged the conspicuous regular CSS floor tiles and the orange/coral red tint. The final candidate adds a compressed, vertically mirrored native metal reflection under the feet, fades it into irregular wet streaks, subdues the regular grid, changes red to `hue-rotate(150deg) saturate(1.25)` and green to `hue-rotate(-60deg) saturate(1.12)`. I re-opened every final sport/size PNG after those changes before accepting.

The approved board has shorter phone-panel proportions than the two required modern phone targets. The final layout preserves the strong header/entry hierarchy while using additional height as a believable illuminated floor, instead of enlarging the empty gap above the gate. User-approved exceptions to the older board remain intentional: no repeated sport name/research block below the central logo; no Preview only; UFC uses Fighters; only NFL enters its dashboard.

## Limits and outstanding gates

This is a material, geometry and visual-hierarchy acceptance against the visible chat attachment, **not a claim of pixel-identical source artwork**. The reconstructed metallic hardware and responsive layout are implementation artwork; source bytes were not available for an exact registered difference image. Physical iPhone/Safari controls and device GPU frame rate were not tested by this review. Single screenshots cannot prove a continuous animation or lifecycle pause; those require the separate motion and functional reports. Local Chromium captures do not prove the hosted site has deployed the candidate.

No further design blocker remains for this frozen candidate. Publication still requires all assigned agents' acceptance, complete appropriate browser/functional checks, preservation of any incoming remote changes and actual hosted verification after deployment. This reviewer did not modify production code, push a branch or deploy a site.
