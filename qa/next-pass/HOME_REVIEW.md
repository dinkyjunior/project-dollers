# Home — exclusive visual refinement

The approved top-left Home panel supplied in chat remains the composition reference: large slanted Project Dollar$ branding, two-by-two league selection, a football/stadium stage and five-item bottom navigation. The original attachment bytes were unavailable. The user's latest direction calls for sharper branding, stronger blue lighting and more interactive motion while retaining these features.

The actual pre-pass browser output was captured before editing at 393×852 and 430×896. Its static multicolour energy strands crossed the masthead and lower tiles, and the secondary cards read as plain coloured boxes. The new Home removes those crossing strands, uses restrained cinematic blue lighting, and gives all league tiles a crisp illuminated edge with a travelling highlight. Native local league marks and the stadium source remain in use.

`assets/home-brand.svg` contains true vector paths outlined from the repository's legitimate, SIL Open Font License Barlow Black Italic font. Metallic reflections and a narrow dimensional edge are vector shapes; the text itself is not rasterised or blurred. The dollar sign retains its cyan distinction. There are no generated brand images, generated player images or fabricated resolutions. The SVG's viewBox was corrected after the first browser inspection so the raised top-right glyphs are fully enclosed, and path coordinates were compacted to three decimals without a visible change.

Glass reflections, soft stage light breathing and a rotating edge highlight provide continuous restrained movement. Pointer devices get a maximum 1.5° tile response and a light pool following the cursor; touch gets a short pressed response. The three unavailable leagues now respond to touch and Enter with a clear, announced coming-soon message. NFL continues to enter the existing dashboard. No new sports or app screens are introduced.

The added Home effects pause when Home is inactive or the shared shell is `.motion-paused`. `prefers-reduced-motion` removes the added loops and tilt response. The league status message supports Escape, uses `role=status` and occupies the stadium area temporarily without shifting cards or navigation.

## Browser review and verification

`node qa/next-pass/home-check.cjs` passes at both primary mobile viewports using Chromium 151 and device scale 2, touch input and Australia/Sydney time. It covers the four complete tiles above navigation, no horizontal overflow, genuine SVG branding, local raster logo density above 4.3 source pixels per CSS pixel, all coming-soon touch responses, keyboard Enter/Escape, Home→NFL→Home, fine-pointer response, zero JavaScript errors and reduced-motion suppression.

Repeated browser render/inspect/fix cycles addressed the repeated coming-soon label, a hard light-cone edge, the second cone's rotation phase, the SVG clipping and the logo-to-league-title spacing. The final screenshots are `home-after-393.png` and `home-after-430.png`; original captures are `home-before-393.png` and `home-before-430.png`. `home-comparison.html` presents the original and final browser images side by side; it does not substitute for or reconstruct the approved chat attachment.

This is meaningful local visual improvement, not a claim of user approval, pixel identity, physical-iPhone performance or a Safari engine pass. The root integration pass remains responsible for the complete data/player/navigation regression suite and publication.
