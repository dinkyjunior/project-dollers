# Cross-engine ground-plane assessment

Reviewer: `metal_ui`; 7 October 2026, 12:46 AEDT.

**The original WebKit floor needs correction.** I compared the actual hosted
NFL captures at 393×852 and 430×896 with the accepted local Chromium captures
and the approved gate render in the chat. Their portal, genuine logo and native
metal reflection align, but the surrounding floor does not. WebKit leaves a
dark area beneath the feet with exposed wall shafts and paints large light
streaks across the sport dock. Chromium paints the illuminated ground directly
under the pedestal and leaves the dock clear. Both local and hosted WebKit
evidence show the same difference.

Natural motion phases can explain differences in glow brightness and venue
framing. They do not justify accepting a ground plane that fails to cover the
wall beneath the pedestal, or decorative light painted over the dock. The
read-only ROI measurements in `floor-roi-observation.json` corroborate the
visible concern across eight states, but are not phase-controlled proof of an
engine internals diagnosis.

The likely cause is the old `.home-floor` hierarchy: a
`perspective(320px) rotateX(53deg)` parent containing animated transformed and
blurred children, all inside an overflow-clipped architectural container. The
children extended beyond that floor without their own bounded paint region.
WebKit and Chromium paint this hierarchy differently. The precise internal
flattening/compositing mechanism has not been established; no new browser was
started for this initial assessment.

## Isolated correction

After the pinned hosted desktop browser closed, root moved the existing floor
element from the architectural backdrop into `.aperture-stage`. I replaced only
the Home ground-plane CSS:

- The floor uses the same measured container size as the metal gate. Its top is
  `gate size − 4px`, which places the surface roughly 5–10px behind the metal
  feet at both primary phone sizes.
- It is a 2D surface with `transform: none`, explicit overflow clipping and an
  isolated stacking layer below the already working native metal reflection.
- Its bottom stops 60px below the stage, leaving the sport dock clear by 6–8px
  at the primary viewports. Animated beams stay inside this plane.
- A dark wet surface, faint irregular horizontal lines and subtle converging
  lines provide perspective without a nested 3D paint hierarchy. The existing
  moving shimmer, sport colors and reduced-motion lifecycle remain active.

Metal housing, brand, genuine league assets, venue artwork, control positions
and Pages 2–3 remain unchanged by this correction. No image was added.

Candidate source hashes:

| File | SHA-256 |
| --- | --- |
| `assets/home-premium.css` | `4f553b24a90493ac5302586d91f4779d46560ae73c408d11d9c2130ba569fe51` |
| `index.html` | `4060e98aa1fa81b7d8faf553f66af83ec7c772e2bfcf2de2864976d669cec112` |

The original acceptance and affected browser evidence are preserved under
`iterations/webkit-floor-hold/`. Those records do not approve this new candidate.
New actual Chromium and WebKit captures in all four sport states at both phone
sizes must demonstrate the same visible ground position, immediate reflected
foot contact and clear dock before acceptance or further publication.
