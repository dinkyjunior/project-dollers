# AGENTS.md — Project Dollar$

## Mission
Build and refine Project Dollar$ as a premium mobile-first sports data and research interface.

## HARD SCOPE GATE
The user's subsequent approvals expanded the original Pages 1–3 scope to the implemented team details, matchup research and, on 12 October 2026, a historical NFL Game Report linked from completed-game results. These approved screens and their existing linked controls are in scope. On 13 October 2026, the user approved a new Home render: horizontal diamond/gold branding, an editorial NFL headline, an aerial stadium at sunset, a white Explore NFL button and four horizontal sport rows. This approval supersedes the previous Home freeze and metal-portal concept. Preserve existing research screens and data while implementing that Home pass.

Do not add unrelated screens or abandoned concept features. Preserve existing work, original artwork and backups. Game Report must use verified event-specific scores, quarters and statistics; the supplied render's sample values are design examples, not factual authority.

The user also approved matching Home previews for NFL, NBA, NRL and UFC with sport selection. All sport rows select their Home preview; only NFL's primary entry and NFL research links open implemented destinations. NBA, NRL and UFC must remain coming soon. Publish the approved Home implementation while preserving production's existing research controllers and datasets; the pending NFL data reconciliation remains separate.

The latest Home refinement matches the NFL dashboard's actual frame dimensions and centring: 430px maximum on phones and 400px wide with a 770px height cap from the 700px breakpoint. Remove the visible editorial headline, the repeated hero sport name and the 01–04 row labels. The widened refined wordmark must read PROJECT DOLLAR, including two distinct gold Ls, and keep its natural aspect ratio.

The user then approved that compact frame and branding and requested removal of all four research taglines and the visible sport-selector names. Enlarge the genuine selector icons, preserve their accessible labels and availability status, and replace only the NBA/NRL/UFC scenes using the latest three-panel interior-arena reference. Preserve the approved NFL aerial scene and refined wordmark. Only NFL remains enterable.

The user's subsequent clarification supersedes the landscape-strip implementation: the three images are inspiration, not exact-copy panels. Create realistic portrait arena scenes that fill the Home background behind Project Dollar, the sport badge and the entry area, blending into the lower controls exactly as the approved NFL page does. Keep native proportions; extend the scene's composition rather than distorting a landscape raster. NBA should show a central scoreboard and court with exactly two end hoops; NRL the full pitch and both H posts; UFC a complete fenced octagon and red overhead trusses. Preserve all previous artwork and research data.

## Source of truth
The latest user instructions and supplied renders guide Home. The interior sport examples are inspirational; the approved NFL page establishes the continuous portrait background and overlay layout. The earlier approved screen renders remain the reference for the corresponding research screens. The current website is NOT the visual source of truth.

## Repository / deployment
Repository: https://github.com/dinkyjunior/project-dollers
Branch: main
GitHub Pages source: main / (root)
Live site: https://dinkyjunior.github.io/project-dollers/

## Critical design requirements
- Primary visual language: black cinematic background.
- Electric-blue outer lighting and crisp cyan accents.
- Project Dollar$ branding must feel close to the approved render.
- Use real league/team logos, not generic placeholders.
- Use real player photography where legally/technically practical; do not invent AI faces.
- No giant emoji sports icons.
- No generic “space” star-field aesthetic unless directly supported by the approved reference.
- Do not replace the approved visual hierarchy with a simpler generic dark dashboard.
- Steelers page changes to black + gold/orange energy treatment.
- Player cards must be aligned consistently.
- Football animation travels around the ENTIRE player-card perimeter.
- Motion should be premium and restrained: glow breathing, reflections, stadium light movement, smooth transitions.
- Mobile-first, especially iPhone.
- No stretched screenshots as the interface.
- Avoid blurry or low-resolution raster assets.
- Prefer SVG / CSS / high-resolution real assets where possible.

## Mobile QA
Minimum viewports:
- 393 x 852
- 430 x 896

Must not have:
- horizontal scroll
- stretched text
- misaligned columns
- clipped controls
- unexplained black/white gaps
- blurry player images
- Safari-hostile viewport behavior

Vertical scrolling is fine where the design genuinely needs it.

## Functional scope
Must support:
- Home -> NFL
- NFL -> Steelers
- Steelers -> NFL
- NFL -> Home
- position filters on roster if kept in the design
- every implemented control must work

## Visual QA rule
A build is NOT acceptable merely because automated tests pass.
For each page, render actual browser output and compare it side by side with the approved reference.

Check:
- silhouette
- layout
- proportions
- spacing
- typography hierarchy
- image quality
- glow placement
- border shape
- component density

If it still reads as “premium render vs cheap HTML approximation,” continue iterating.

## Development discipline
Work sequentially:
Page 1 -> visual QA -> Page 2 -> visual QA -> Page 3 -> visual QA -> integration QA.

Do not silently lower visual fidelity to save time.
Do not fabricate stats or research data.
If a data field is not verified, leave it clearly marked/unpopulated rather than inventing it.

## Deployment
The site must work at the GitHub Pages subpath `/project-dollers/`.
Use relative assets or otherwise ensure subpath-safe routing.
Do not assume root-domain hosting.

Before finishing:
- run via local HTTP server under `/project-dollers/`
- check console errors
- check 404s
- check refresh/direct load
- check GitHub Pages compatibility
