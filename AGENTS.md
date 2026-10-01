# AGENTS.md — Project Dollar$

## Mission
Build and refine Project Dollar$ as a premium mobile-first sports data and research interface.

## HARD SCOPE GATE
Only Pages 1–3 are in scope until the user explicitly approves them:
1. Home / sport selection
2. NFL dashboard
3. Pittsburgh Steelers roster

DO NOT add Page 4 or later screens.

## Source of truth
The approved eight-screen Project Dollar$ render from the ChatGPT project is the visual source of truth. The current website is NOT the visual source of truth.

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
