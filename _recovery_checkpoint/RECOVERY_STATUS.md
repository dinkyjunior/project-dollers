# Project Dollar recovery — 7 October 2026 (Australia/Sydney)

The original task's coding access is working again. The original checkout at
`/workspace/project-dollers` is present on `codex-rebuild`, HEAD
`9633c03cad6d069c51731795a9d098d713d3100a`. Staged documentation/QA and all three
untracked refresh-smoke files remain present. No source, index, branch or old QA
report was changed during recovery. The restored state was archived before edits.

## Verified readiness

- Native GitHub read access works with existing platform authentication.
- Remote `codex-rebuild`: `a3012937c32681404da17aed662a0d2cba4c7b6b`.
- Remote `main`: `1dc19c5e4a0625d94b3ce904fda33547f245b7cb`.
- The actual hosted homepage returns HTTP 200 with strict TLS and the documented
  supplied CA. Its HTML SHA256 matches the recovered local index.html.
- Fresh local browser smoke passes at 393x852 and 430x896: Home -> NFL ->
  Steelers -> NFL -> Home, direct load and refresh, no overflow, visible broken
  images, console errors, request failures or HTTP errors. Evidence is in this
  recovery-qa directory; existing repository QA was not overwritten.
- Recovered `qa/hosted/refresh-smoke.json` confirms the formerly unresolved
  October 2 targeted hosted test actually completed successfully at both sizes
  at 2026-10-02T02:27:13.268Z. This is recovered historical evidence, not a new
  hosted browser run today.

Current data freshness and today's complete hosted browser behavior were not
validated by the limited recovery checks. The pending Aperture Home was not
implemented or deployed during recovery.

## Approved Home requirements to preserve

Use the approved four-sport Aperture render in the chat as the Home authority.
Create real DOM controls over separate local assets, never a flattened screen.

- Brand: singular Project Dollar. Upright readable Tower Block PROJECT in
  refined icy-silver diamonds; DOLLAR in polished yellow gold. Both lines have
  equal widths and aligned left/right edges. A proportionate emerald velvet
  money bag with a raised shining gold dollar sign spans both lines to the right.
- Preserve the metallic circular gate, selected official league logo, venue
  depth, reflective black architecture, navigation and component proportions.
- All four Home sport selectors remain interactive. NFL enters the existing
  dashboard. NBA/NRL/UFC entries are disabled COMING SOON with no PREVIEW ONLY.
- UFC Home navigation displays Fighters in place of Teams. Restore Teams in
  other states and NFL/team routes.
- Whole-panel themes: NFL electric blue; NBA fixed left-blue/right-red split;
  NRL neon green; UFC neon red. Official logo and diamond/gold/bag colours stay
  unchanged. A separate highlight travels continuously around the entire ring
  while the theme-coloured rail stays stationary.
- Add restrained background movement, reflections and sunlight/material glints;
  respect reduced motion and pause hidden/offscreen animations.
- Preserve Pages 2-3, verified player statistics/history, source evidence,
  automatic updates, and football motion around the entire player-card border.
  Do not touch Page 4.
- The user already authorizes implementation and deployment after QA. No further
  design approval is needed. Fetch/rebase codex-rebuild before pushes and preserve
  incoming main automatic-data commits. Compare all states at both mobile sizes
  and desktop, save evidence, deploy and verify the actual hosted website.

## Next development actions

1. Retain/download the recovery archives; keep this original task.
2. Read AGENTS.md, CODEX_START.md, CODEX_HANDOFF_STATUS.md, CODEX_ENVIRONMENT.md
   and DEPLOYMENT.md, reconciling the latest approved Home requirements above.
3. Preserve staged/untracked work before integrating newer remote changes.
4. Implement the approved Home and perform the existing required QA/release flow.

The static site has no application compilation step. Node, pinned Playwright
1.58.2, Python and Chromium are already installed. Repository npm scripts provide
data, source, update, integration and browser checks. Preserve their original
evidence when running new checks.
