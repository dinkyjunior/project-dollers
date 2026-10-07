# Independent Page 1 reference and material review

**Decision: ACCEPT the corrected candidate in both Chromium and genuine WebKit at both requested phone sizes.** Reviewer: `metal_reference_design`. I independently viewed all 16 native browser screenshots against the user-reattached four-sport approved board. This is fresh acceptance after a hosted WebKit floor-paint hold; it authorizes progressing to the remaining QA gates, and does not claim deployment or functional QA has passed.

The approved source is the chat attachment headed “PROJECT DOLLAR — FINAL HOME CONCEPT”. The other reattached NFL screenshot contains the user's white freehand problem annotations; those annotations were not copied into the design. Original attachment bytes were unavailable for a repository copy or a registered pixel comparison. No generated implementation image is presented as a copy of those original bytes.

## Exact candidate reviewed

I viewed all eight final original-resolution PNGs in [the corrected Chromium gallery](approved-local-captures/index.html) and all eight in [the genuine WebKit gallery](cross-engine-local-webkit/index.html), individually. Each sport/size was compared against its corresponding approved phone panel and against the other engine. Captures are actual browser output at device scale factor 2, with touch/mobile emulation, without pausing animation or substituting a source image. These fresh final captures include the narrow-screen floor-gutter correction: Chromium capture completed at **12:53:35 pm AEDT, 7 October 2026**; WebKit capture completed at **12:59:33 pm AEDT**. I reopened all 16 final PNGs after those fresh captures before updating this acceptance.

The [Chromium manifest](approved-local-captures/manifest.json) SHA-256 is `e029a517da3660342dd870c1b0357bab4800f6c64927191605598ee0cb953a18`. The [WebKit manifest](cross-engine-local-webkit/manifest.json) SHA-256 is `bdcc9f336a72a141acddd7c03a630e2b54e27a3f5c804da6a4a347e4059d6688`. Both contain eight exact PNG hashes and the same 184-file runtime manifest. I recomputed all 16 final PNG hashes and the current Home HTML/CSS/motion/metal hashes; they match these reviewed manifests. The binding Home implementation is:

| File | SHA-256 |
| --- | --- |
| `index.html` | `4060e98aa1fa81b7d8faf553f66af83ec7c772e2bfcf2de2864976d669cec112` |
| `assets/home-premium.css` | `0935eadb330ab4a76460f3b9e009030cec170898a3b648205c419cf0bb4c4a1a` |
| `assets/home-gate-motion.css` | `83200c4fcbaaf7cdcc9ec381ea0a64ca0bb4c947718a73f23c3173b97bdfeddb` |
| `assets/home-gate-motion.js` | `ecb169a2832853d7cae5d83218fbf567ed1dd64632c5474261367da12d8434c2` |
| `assets/home/gate-metal.webp` | `96bcb4c55bc67caa78051b704af210d5a5208062672b9eff5eba3e9a0ab3759d` |

Later changes to the reviewed Home runtime require another visual check. Changes confined to evidence/documentation do not alter these reviewed pixels.

## Per-screen decisions

Every ACCEPT below applies separately to its corrected Chromium PNG and its corrected genuine WebKit PNG. All 16 were opened; these decisions are not an inference from shared geometry or passing automated tests. Across all four sports and both sizes, both engines now paint the glossy floor immediately under the pedestal, retain the native reflected metal in that floor, and keep the broad reflection beams out of the selector dock. The previously observed WebKit dark under-foot region is absent. Minor font rasterization and moving-highlight phase differences remain normal between these unpaused captures; I do not claim identical engine pixels.

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

Both corrected capture manifests report the same intentional portal geometry across all four sports at each target size:

| Measurement, CSS pixels | 393×852 | 430×896 |
| --- | --- | --- |
| Portal outer box | x=6, y=192, 381×381 | x=6, y=200, 418×418 |
| Tagline bounding-box to portal gap | 7.59375 | 5.125 |
| Portal radial material depth | 64.7734375 | 71.0625 |
| Depth as fraction of portal diameter | approximately 17% | approximately 17% |

The small computed gap plus the image's transparent top edge yields a small visible, intentional separation beneath the tagline. It resolves the former roughly 40px empty upper region. The final entrance has three readily visible depth planes: dark rear construction, raised segmented metal faces, and the recessed illuminated inner throat. Unequal faceted pieces, seam depths, bolts and side structures replace the rejected evenly spaced plain bars. The pedestal and mirrored native artwork create floor contact rather than a hovering ring above a black rectangle.

The new 1254×1254 local metal image supplies three native pixels per CSS pixel at the 418px target, and more at 381px. It is not an enlargement of poor source material. The original brand, league artwork and venue plates are retained. In these eight inspected screenshots I found no visibly blurry logo, stretched image, fuzzy metal edge, clipped housing, white line dominating the sport lighting, glow covering text or restored duplicate hero label.

## Review and correction loop

I did not accept the first asset integration as finished. Its metal volume and smaller upper gap were good, but the feet still floated above a roughly 30px dark ground break. The following contact correction removed that break; I then independently challenged the conspicuous regular CSS floor tiles and the orange/coral red tint. The metal candidate adds a compressed, vertically mirrored native metal reflection under the feet, fades it into irregular wet streaks, subdues the regular grid, changes red to `hue-rotate(150deg) saturate(1.25)` and green to `hue-rotate(-60deg) saturate(1.12)`.

After the earlier Chromium acceptance and initial publication, independent hosted review found a real WebKit paint discrepancy: the floor remained dark beneath the feet while broad beams appeared at the selector dock. I opened the exact hosted WebKit PNG beside the accepted Chromium PNG and confirmed that it failed the intended ground/contact appearance, despite matching geometry and functional checks. The original acceptance, captures, functional runs and hosted evidence are preserved unchanged in [the WebKit floor-hold archive](iterations/webkit-floor-hold/); they have not been relabelled as passes for this corrected source.

The corrected implementation places the floor in the portal stage and uses a two-dimensional plane tied to the gate size. It starts just behind the actual feet, clips before the selector dock, and removes the former perspective transform/pseudo-element beam spill. The original metallic artwork, reflected metal artwork, branding, inner venue, league logos and accepted upper geometry remain unchanged. I independently reopened all 16 corrected local PNGs after that narrow fix: both engines now show continuous reflective ground from the pedestal toward the CTA, no black gap underneath the feet and no broad plane/beam over the dock. This resolves the hosted floor-paint hold in actual local pixels, rather than only in DOM bounding boxes.

The final source adds a floor-gutter adjustment limited to widths of 360px or less, after a separate 320px functional run identified narrow overflow. That media rule does not target the two primary phone sizes. Nonetheless, the final source was frozen and both primary eight-state capture sets were regenerated. I viewed all 16 final images again: the previously accepted primary metal, spacing, colours, floor contact/reflection and clear selector dock remain visually intact in both engines. This review is bound to that final CSS hash, rather than carrying forward the earlier source approval. The separate functional reports establish the narrow-screen overflow correction; this visual review does not substitute for those checks.

The approved board has shorter phone-panel proportions than the two required modern phone targets. The final layout preserves the strong header/entry hierarchy while using additional height as a believable illuminated floor, instead of enlarging the empty gap above the gate. User-approved exceptions to the older board remain intentional: no repeated sport name/research block below the central logo; no Preview only; UFC uses Fighters; only NFL enters its dashboard.

## Limits and outstanding gates

This is a material, geometry and visual-hierarchy acceptance against the visible chat attachment, **not a claim of pixel-identical source artwork**. The reconstructed metallic hardware and responsive layout are implementation artwork; source bytes were not available for an exact registered difference image. Physical iPhone/Safari controls and device GPU frame rate were not tested by this review. Single screenshots cannot prove a continuous animation or lifecycle pause; those require the separate motion and functional reports. Corrected local Chromium/WebKit captures do not prove the hosted site has deployed this new candidate or resolved the hosted hold. Actual post-deployment hosted screenshots must be inspected again.

No further local design blocker remains for this corrected frozen candidate. Publication still requires all assigned agents' fresh acceptance, complete appropriate browser/functional checks, preservation of incoming remote changes and actual hosted verification after deployment. The earlier publication's hosted visual hold remains historical evidence; completion must be based on the corrected hosted result. This reviewer did not modify production code, start a browser, push a branch or deploy a site during the floor correction.
