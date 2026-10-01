# QA_ACCEPTANCE.md

## Deployment checks
- [ ] `/project-dollers/` hosted path works
- [ ] direct load works
- [ ] refresh works
- [ ] no console errors
- [ ] no asset 404s
- [ ] no absolute root asset paths that break GitHub Pages
- [ ] no horizontal overflow
- [ ] Safari/iPhone-safe viewport

## Page 1
- [ ] overall silhouette matches approved render
- [ ] Project Dollar$ masthead proportion is close
- [ ] NFL/NBA/NRL/UFC logos are recognizable and sharp
- [ ] NFL active card has strong electric-blue glow
- [ ] no generic star-field takeover
- [ ] sport-card spacing/proportions match reference
- [ ] lower stadium/football treatment feels premium
- [ ] bottom nav matches visual density of reference

## Page 2
- [ ] league header aligned
- [ ] tabs aligned
- [ ] AFC/NFC control aligned
- [ ] standings columns align
- [ ] Steelers row aligns perfectly with other rows
- [ ] QB/RB leader cards are dense and legible
- [ ] Week 4 selector aligned
- [ ] matchup card matches reference proportions
- [ ] team logos are real/recognizable and sharp

## Page 3
- [ ] Steelers logo/header matches reference feel
- [ ] player card widths/heights align
- [ ] portraits are real and visually clean
- [ ] no generated/cross-eyed faces
- [ ] text/stat columns are aligned
- [ ] gold/orange glow is strong but controlled
- [ ] football animation traces entire card perimeter
- [ ] no card is offset relative to neighboring cards

## Required visual evidence
Capture:
- [ ] Page 1 @ 393x852
- [ ] Page 1 @ 430x896
- [ ] Page 2 @ 393x852
- [ ] Page 2 @ 430x896
- [ ] Page 3 @ 393x852
- [ ] Page 3 @ 430x896

Then produce side-by-side comparisons with the approved render.

## Acceptance rule
If a human can immediately say “the approved render looks premium, the browser version looks like a cheaper approximation,” the page fails and must be iterated again.
