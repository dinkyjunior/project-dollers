# New premium pass: initial QA audit

The current presentation is rejected for the new visual request even though the baseline captures pass image/error/overflow checks. Twelve actual, naturally running Chromium screenshots preserve all four sports at 393×852, 430×896 and 1440×1000 in `baseline-local-chromium/`. No complete functional suite was run.

The desktop phone shell is 430×932 at y0. A fixed 418px gate ends at y618, but the CTA starts at 715: 97px apart, compared with 61–66px on the requested phones. Extra desktop height expands a blurred floor band rather than the entry. The new design should keep a deliberate portrait composition rather than letting a flexible row consume spare height.

Native asset quality is adequate: the actual metal remains square and renders with 3× or greater density, the brand 4.8× or greater and stadium 3.7× or greater. The weak impression comes from material/paint and composition. Repeated striped CSS walls, a flattened duplicate-ring reflection, broad even bloom and a plain black rounded CTA expose the component construction. The next pass needs a coherent atmospheric ground/environment, more deliberate metallic light contrast and richer—but readable—control edges.

Keep crisp brand/league marks, true aspect ratios, strong selected-sport identity, all existing interactions and reduced-motion behavior. Final visuals need independent inspection in Chromium and genuine WebKit at both phone sizes, plus narrow/tablet/desktop regression. Existing metal/neon evidence remains untouched; only `qa/home-luxury/` is owned by this QA pass.
