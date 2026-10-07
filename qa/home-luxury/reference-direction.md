# Page 1 luxury rebuild: independent reference direction

**Status: HOLD the existing metal release. This document is an implementation direction, not visual approval of a new build.** The user has rejected that release as dull, stretched, basic and cheap. Earlier functional passes and six prior agent approvals do not establish satisfaction with this higher visual requirement. The final candidate must receive a fresh independent visual review before publication.

The visual authority remains the user's attached four-phone **PROJECT DOLLAR — FINAL HOME CONCEPT** board. The white strokes in the other NFL attachment mark problem regions and must never become design lines. Source-board ratios below are visual estimates from the chat attachment, not measurements from original saved pixels. Current-build measurements come from actual browser capture manifests and images.

## What is wrong with the current composition

I inspected the current hosted phone screenshots and the actual 1440×1000 desktop screenshot under `qa/home-metal/`. The failure is not lack of another stronger shadow declaration. The current entrance is a freestanding industrial wheel with broad grey face plates, black bolted pods and large feet. Its circular appliance silhouette differs from the approved board's integrated, luminous, receding sports entrance. The grey material occupies too much attention and reduces the perceived colour, luxury and venue depth.

The original implementation protects logos and inside venues, but the small clear opening makes the centre feel crowded and separates the ring from the rest of the architecture. Simple repeated wall gradients, large diagonal brackets and a short blurred reflection leave the impression of independent HTML layers rather than one coherent illuminated space. A floor that paints correctly can still look visually mediocre.

The page also spreads its controls too far apart. The portal-to-CTA region expands on taller screens, instead of retaining the compact composition in the approved board. Desktop displays a long, top-flush rectangle surrounded by a large quiet void, with little polished framing. Thin condensed control typography and broad homogeneous fuzzy halos reinforce the unfinished appearance. Making the same wheel brighter will not resolve these failures.

| Existing actual measurement | 393×852 | 430×896 |
| --- | --- | --- |
| Masthead artwork box | 345×132.8125px | 376×144.75px |
| Masthead width relative to panel | 87.8% | 87.4% |
| Portal envelope | 381×381px | 418×418px |
| Portal opening width | approximately 66% of envelope | approximately 66% of envelope |
| Portal material depth | approximately 17% of diameter | approximately 17% of diameter |
| Portal box bottom | y=573px | y=618px |
| CTA box top | y=639px | y=679px |
| Portal-to-CTA gap | 66px | 61px |
| Sport-selector row height | 86px | 88px |

The current desktop Home canvas is approximately **430×932px** at 1440×1000. Its floor can absorb roughly 100px or more between the hardware and entry control. The source board's phone panels read closer to a height/width ratio of roughly **1.9**, while the current desktop canvas is roughly **2.17**. That is a composition difference, independent of image aspect ratios.

## One coherent direction

Build a **compact, illuminated sports entrance in polished black chrome and luminous glass**, with the original diamond/gold/velvet masthead above it. The architecture must recede toward the retained stadium/court/arena. A refined annular front edge, angled side structures, reflected light and glossy ground should form one scene. Chrome acts as a reflector for sport light, rather than a large static grey feature.

Remove the appliance feet and large repetitive bolted blocks from the new decorative shell. Preserve mechanical credibility with precision panel divisions, dark PVD construction, narrow polished bevels, recessed joins and a small number of deliberate mounting details. Use deeper light and shadow on those details rather than making everything white. The ring should belong to the surrounding tunnel; it must not float in front of unrelated walls.

Root has chosen **locally bundled Archivo Black for the entry control and Inter 600 for small interface text**, with proper licences. Use those fonts to give the real controls a stronger, wider, cleaner product finish. Keep the approved masthead artwork unchanged; changing interface fonts is not a request to regenerate the logo.

## Responsive composition targets

Targets are design constraints for the new native artwork and responsive layout. The UI owner may make small practical adjustments for safe areas and touch targets, but must retain the compact relationship between components.

| Element | 393px panel target | 430px panel target | Constraint |
| --- | --- | --- | --- |
| Compact Home canvas | approximately 750–778px high | approximately 790–824px high | Fit the real content. The original **1.96× panel width** estimate guides compactness, not a mandatory aspect ratio or permission to add spacer height. |
| Masthead visible width | 314–326px | 344–357px | Approximately 80–83% of panel width, retaining native image aspect. |
| Entry envelope width | 362–373px | 396–408px | Approximately 92–95% of panel width; supports should connect into the edges. |
| Entry envelope height | approximately 326–351px | approximately 356–383px | New artwork must have a **natural** height/width ratio near 0.90–0.94. |
| Clear opening width | approximately 74–80% of envelope | approximately 74–80% of envelope | Broader venue view and less grey hardware dominance; root/asset target near 76%. |
| Visible ground between entry and CTA | 18–28px | 18–28px | A short glossy contact/reflection region, never a 60–110px floor spacer. |
| Entry control height | 50–54px | 50–54px | Remain at least 44px as a real touch control. |
| Selector row height | 68–74px | 68–74px | Four consistent compact cells with genuine marks and short labels. |
| Navigation height | 52–56px plus required safe area | 52–56px plus required safe area | Readable labels, aligned icons and at least 44px touch targets. |

Use the native proportions of a newly designed entrance asset. **Do not squash the existing square ring with `scaleY`, stretch the venue photograph, stretch the masthead or distort a league logo** to hit these dimensions. Crop the retained venue with `object-fit: cover` inside the appropriate opening; keep each league logo upright with `object-fit: contain`. The broader opening should restore venue context around the existing marks. Judge actual painted logo proportions, not just their CSS container dimensions.

Keep the tagline-to-entry distance small and intentional, around **6–12px** of visible separation. Group the entry control, sport choices and navigation closely. Surplus viewport height belongs outside the compact main composition, in an intentional atmospheric sport-colour background. It must not create unexplained black strips, inflate the floor spacer or spread the buttons down a long column.

At desktop sizes, present a centered framed app approximately **400×780px**, bounded by the available viewport. Give it balanced outside margins, a polished black-PVD edge, subtle bevel, restrained dimensional shadow and a thin sport-coloured edge reflection. Show the full functioning app with every control accessible. Keep the surrounding canvas cinematic and quiet enough to focus attention on the entrance, while allowing deliberate sport light and slow reflection movement. Do not make a new marketing landing page, add unrelated copy or expand the phone artwork to desktop width.

The UI owner's measured content-fit candidate around **756px at 393px**, **803px at 430px** and **400×770px on desktop** is consistent with this direction. Preserve compact painted relationships instead of padding that stack to the earlier approximate ratio. Judge the visible material-to-control distance, not only the portal's transparent image box.

At narrow/short phone sizes, keep native assets and touch targets intact. Prefer a practical compact layout or controlled vertical scrolling over clipped controls or squeezed text. Test the 320px breakpoint separately; do not let a narrow-screen fix silently alter the two primary approved phone compositions.

## Material, lighting and typography

The new artwork should include dark polished black-chrome construction, small sharp brushed facets, convincing bevel reflections, a broader clear opening and saturated translucent light bands. Its illuminated architecture should point toward the venue centre, with varied light pools and glossy striated ground. Flat repeated wall gradients and oversized bracket handles cannot carry the atmosphere alone. Retain strong black areas for depth, but make the coloured energy clearly visible across the whole environment rather than confined to one cyan line.

Use three distinct lighting scales: a crisp luminous core, a controlled nearby halo and a broader soft reflection behind the material. A small white core or localized specular hit can be extremely bright; a large uniformly white annulus should be rejected. Broad blur must not replace shape and metal detail. The control border should have a bright 2–3px sport-coloured core, a polished inset edge and localized travelling/reflected highlights; it should not be a plain flat pill surrounded by a fuzzy uniform cloud. Selected sports need similarly precise bright edges and calm dark interiors.

| Sport | Required visual distribution |
| --- | --- |
| NFL | Electric blue with deeper royal-blue atmosphere and brighter cyan/white localized hits. Avoid pale monochrome cyan covering all materials. |
| NBA | Fixed blue on the left and neon red on the right, including the entrance, architecture, floor and selected control. The change of side is coherent light on shared material, not two unrelated half-images with a black join. |
| NRL | Saturated emerald/neon green with controlled brighter green highlights. Avoid acid-yellow dominance, grey washed bands or large unrelated pink/lilac reflections. |
| UFC | Saturated neon red with localized red/white or pink-white light hits. Avoid an orange/copper ring becoming the main energy colour. Fighters remains the navigation label. |

Archivo Black entry copy should read compact and solid, around **17–19px**, rather than tall thin Barlow lettering. Inter 600 small labels should use approximately **10–11px** for selector/navigation copy and a compact, carefully tracked masthead tagline. Confirm actual font loading and the rendered glyph weight; passing a declaration check is insufficient. Keep controls precisely centered and maintain a clear hierarchy: masthead, entrance/league mark, entry control, sport choices, navigation.

Motion must add light and life without changing fixed structure. Maintain a bright constant base, then add a tight travelling sector around the full entrance band, localized surface reflections, subtle ambient breathing, reflected wall/floor pools and a small number of deliberate glints. The motion owner proposes a circuit near **9 seconds**, a soft breath near **5.6–6 seconds** and emitting-layer minima near **0.86**. The low phase must still look vibrant. Do not rotate the metal texture, rotate the NBA colour split, oscillate every component, flash the page or animate expensive large blur/shadow filters every frame. Respect reduced motion and inactive/hidden/offscreen pauses.

## Scope that must stay fixed

Keep the approved diamond PROJECT, solid gold DOLLAR, emerald velvet money bag and gold dollar sign. Preserve genuine sport marks and the current venue source assets. Do not generate player faces or invent source data. All four Home selectors remain interactive; only NFL enters an implemented dashboard. Other sports remain Coming soon without Preview only. UFC uses Fighters. Keep the duplicated large sport-name/research block below the central logo removed. Preserve existing navigation and Pages 2–3. Do not create or modify Page 4.

## Independent acceptance gate

An attractive screenshot of one sport is insufficient. The final candidate must be independently compared against each corresponding approved board panel for **all four sports at 393×852 and 430×896 in both Chromium and genuine WebKit**, plus the framed desktop presentation. Review material, opening/mark proportions, compact spacing, coherent tunnel perspective, vibrant fixed colours, lighting at a low pulse phase, font weight, actual image quality, ground/reflection contact and every control's legibility.

Reject a candidate that still reads as a freestanding grey clock/appliance, has large pedestal feet, fills the floor with spacer height, restores thin cheap control lettering, relies on homogeneous fuzzy bloom, distorts native art, has a hard black NBA join, washes red/green into another colour or leaves desktop as a long top-flush rectangle. A brighter version of the old geometry does not meet this direction.

Save raw screenshots and source-bound manifests in this new `qa/home-luxury/` evidence area, preserving prior `qa/home-metal/` evidence as historical. For tool inspection, use **one small contact sheet at a time, no larger than approximately 1200×1600px**, then individual focused native crops where required. Do not repeatedly submit many full DPR2 phone images in one tool result. Original chat source bytes remain unavailable; do not claim a registered source pixel-diff or fabricate an approved-reference file.

All assigned agents must give fresh explicit acceptance of the final source before publication. Functional/motion/asset/accessibility checks remain separate from this visual gate. After deployment, inspect the actual hosted phone and desktop result before reporting completion; an engine discrepancy in the hosted paint must reopen the gate even if tests and hashes pass.
