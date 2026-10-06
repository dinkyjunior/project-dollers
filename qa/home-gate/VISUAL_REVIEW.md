# Independent review of the approved Aperture Home

The authority is the four-sport **PROJECT DOLLAR — FINAL HOME CONCEPT** image
reattached by the user in chat immediately before approving implementation.
The source is visible in the conversation; original attachment bytes have not
been provided as a repository file. This review compares the actual browser
captures with that approved image visually, rather than claiming a registered
pixel-difference calculation or embedding invented reference pixels.

Actual Chromium output was inspected at **393×852** and **430×896**, for NFL,
NBA, NRL and UFC, plus the 1440×1000 desktop layout. The final Chromium suite
captures all four states at five sizes in `local-chromium/` and records runtime
hashes so the HTML, theme controller, motion layers, graphics and verified data
can be identified exactly. Each screenshot is an actual browser capture at
DPR2, not a flattened concept image used as the app.

The final composition materially matches the approved hierarchy: aligned
stacked diamond PROJECT and gold DOLLAR lettering with a full-height emerald
money bag, a circular stadium gate, foreground authentic league mark, league
heading and research subtitle, illuminated entry/availability control, four
sport selectors, and compact bottom navigation. The diamond and polished-gold
material plate remains clean at Retina capture size; official foreground marks
use local vector/high-resolution assets. Venue photography has native source
resolution above its rendered Retina requirement and preserves its aspect
ratio through a controlled circular crop.

NFL maintains electric-blue architecture, rim and entry lighting. NBA uses a
fixed blue-left/red-right split across architecture, venue, circle, button,
selected sport and active Home icon; the travelling white highlight does not
rotate that split. NRL and UFC change the full panel to neon green and red.
The primary labels remain white and readable inside the glow. Metallic wall
details, ring connectors, stage depth and floor reflections supply atmosphere
without decorating the text or covering controls.

Two material corrections were made after initial browser inspection: the
foreground marks were reduced to reveal more of each venue, and the ring/wall
chrome and reflection treatment gained depth and symmetry. Independent QA then
caught and resolved a 3px compact-only decorative overflow caused by a 12px
art offset against 9px compact padding. The final five-size Chromium run has no
horizontal overflow. All primary mobile controls fit above the bottom
navigation with touch targets at least 44px. The desktop layout preserves the
iPhone composition in a centred stage rather than stretching the artwork.

The requested text/behaviour refinements are visible: no **Preview only**, no
**NFA**, no entry chevron on Coming-soon controls, and **Fighters** for UFC.
Only NFL opens a research destination. The other league selectors work as Home
previews; their Teams/Fighters, Matchups and Insights actions give clear
availability feedback without entering NFL under another league's theme.

Motion is established by live rendered-frame evidence, independently of still
images: circle and venue transforms change naturally; reduced motion, inactive
Home and document departure stop them; the isolated decorative intersection
harness tests offscreen pausing. Screenshot exposure uses a temporary CSS pause
and restores motion, avoiding a WebKit WAAPI pause/resume measurement artifact.
An earlier fixed 280ms sampler could hit a single slow software-rendered WPE
frame; final checks wait for actual animation frames instead of imposing a
physical-device frame rate on a cloud browser.

This is a faithful functional rendition, **not a claim of pixel identity**.
The original concept's specific chrome flare arrangement and illustrative
stadium details differ from the independently layered implementation. Static
captures do not establish physical iPhone performance or actual Safari browser
chrome behaviour. Chromium and genuine WebKit browser reports, plus a separate
actual hosted-URL verification, establish the tested practical scope. The top
9:41/status row is decorative concept chrome, not a live device-status feed.
Pages 2–3 remain functional and receive source/interaction/perimeter regression
checks; Page 4 is excluded.

Hosted completion must be judged from `hosted-webkit/results.json` once it is
present with `status: "passed"` and delivered runtime hashes matching the
tested worktree. Local pass evidence alone is not a deployment claim.
