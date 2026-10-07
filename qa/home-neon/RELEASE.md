# Page 1 neon refinement release

Recorded 7 October 2026 (Australia/Sydney). **Current status: deployed and verified.** Final local QA, exact production deployment, actual-hosted mobile QA and independent hosted desktop/publication review passed for application `32f55a67d500bc8bf646679fb1879e318ef2f4b5`.

Production target: https://dinkyjunior.github.io/project-dollers/

## Approved refinement and scope

Retain the launched Project Dollar brand artwork, its SPORTS DATA & RESEARCH tagline and all four venue images inside the circular gate. Remove the repeated sport-name and DATA & RESEARCH hero block underneath the gate; an accessible current-sport identity must remain available. Make the entrance gate/ring visibly thicker, brighter and more illuminated, with strong neon glow/pulse across the ring, entry button, selected sport boxes and architecture/walls.

Keep a sharply defined illuminated core beneath the halo. The additional glow must preserve control labels, spacing, native image sharpness and the predominantly black environment. All four sports retain their fixed lighting systems: NFL blue, NBA blue-left/red-right, NRL green and UFC red. NBA's two-colour base must not rotate with its travelling highlight.

The existing functional controls remain: all four selectors work, only NFL opens its dashboard, other entry buttons say Coming soon without Preview only, and UFC Home uses Fighters. Preserve keyboard/accessibility state, persistent selection, reduced-motion handling, inactive/hidden/offscreen motion pauses and complete-card football animation. Pages 2–3 and data remain untouched. No Page 4 is included.

The source-boundary review against preceding evidence publication `eb2f89f7de2928dd174ab26bcaa1582315082310` confirms that the complete NFL/Steelers section markup, `assets/app.js`, `assets/data/current.json`, `assets/data/provenance.json` and `assets/data/player-history.json` are byte-identical. The retained brand/venue files also remain the approved preceding artwork. Four Home stylesheet/script URLs now use `?v=neon-20261007` before final QA, avoiding cached prior lighting without changing routing/data.

Runtime refinements are confined to `index.html`, `assets/home-premium.css`, `assets/home-gate-motion.css` and the obsolete-title handling in `assets/home-interactions.js`. QA helpers change only to reflect the removed repeated hero labels and verify stronger live illumination. The final local and both actual-hosted audits record the same 183-file application manifest.

## Visual source and preserved assets

The previously approved four-sport gate image in chat remains the starting authority, with the latest explicit neon/density changes above taking precedence. Existing runtime artwork and real league logos are preserved. No new concept, wordmark or venue generation is required. Original chat-reference bytes were unavailable for exporting source panels; no pixel-registered reference composite is claimed. Read `../home-gate/RELEASE.md` and `assets/home/asset-provenance.json` for the original implementation/asset qualification.

## Acceptance evidence — local and actual-hosted passed

Final acceptance included rendered comparisons with the preceding deployed Home at 393×852 and 430×896 plus compact, tablet and desktop layouts. Actual illumination was visually inspected for stronger glow, clear labels, clean spacing and image quality; NBA's hard base remained fixed. Genuine live-frame ring/pulse/background motion, reduced-motion stillness, lifecycle pauses and every implemented Home interaction passed. The existing NFL/Steelers routes, data/source histories and full-card football motion passed regression checks.

| Check | Status | Evidence |
| --- | --- | --- |
| Final responsive Chromium browser QA | Passed at 393×852, 430×896, 320×700, 768×1024 and 1440×1000; all four sports, 183 runtime hashes match current files, zero errors | `local-chromium/results.json`, completed 11:11:54 AEDT, 7 October |
| Final genuine WebKit mobile QA | Passed at 393×852 and 430×896, all four sports/controls/motion/reduced-motion/lifecycle and Pages 2–3 regressions; 183 runtime hashes match current files, zero errors | `local-webkit/results.json`, completed 11:17:36 AEDT, 7 October |
| Independent visual glow/geometry/readability review | Passed for inspected NFL430, NBA393, UFC393 and compact NRL320; stronger continuous rim/core and CTA/selected-box bloom, no label washout/clipped controls | Actual captures under `local-chromium/`; live/accessibility verification remains covered by browser checks |
| Independent asset/native-resolution review | Passed at DPR3 for all four states/both primary sizes; nine artwork hashes unchanged, local/reused scene requests, no errors or overflow | `asset-review/results.json`, completed 11:12:19 AEDT, 7 October |
| Pages 2–3 navigation/data/source histories/full-card motion regression | Passed in final local and actual-hosted primary-size suites | `local-chromium/results.json`, `local-webkit/results.json`, `hosted-webkit/results.json` |
| Exact production build/deploy | Passed for `32f55a67`; build/deploy/report jobs successful | [Pages run 37551374311](https://github.com/dinkyjunior/project-dollers/actions/runs/37551374311) |
| Actual-hosted mobile acceptance | Passed at 393×852 and 430×896/all four sports; controls/routes/refresh, natural motion/pulse, reduced-motion/lifecycle and Pages 2–3 regressions; all 183 delivered files HTTP 200/SHA exact, zero errors | `hosted-webkit/results.json`, completed 11:29:52 AEDT, 7 October |
| Independent actual-hosted desktop, pulse and delivered-file verification | Passed at 1440×1000/all four sports; ring/venue change and five pulse layers vary across 81 natural frames per sport; all 183 files HTTP 200/SHA exact, zero errors | `independent-hosted/results.json`, completed 11:26:27 AEDT, 7 October |
| Independent publication/API review | Passed: both branches at `32f55a67`, main/root HTTPS Pages built, exact successful workflow and all jobs | `independent-hosted/results.json` |
| Actual-hosted accessible selection after repeated-heading removal | Passed at both primary sizes; current-sport identity remains available | `accessible-hosted.json`, completed 11:23:11 AEDT, 7 October |

Physical iPhone hardware/Safari chrome and device FPS remain unverified unless a new actual-device result is recorded. Browser frame measurements must be qualified as container/emulation results.

The inspected NBA ring, CTA, selected box and architecture keep a hard fixed blue-left/red-right base. Diffuse glow/reflection can overlap to a mild purple at the centre; this is optical bloom, not a rotating/moving base palette. No claim of zero colour mixing is made.

Actual unpaused hosted presentation captures are saved in [live-captures/index.html](live-captures/index.html), with eight primary-size shots recorded in its manifest at 11:26:34 AEDT on 7 October. [Before/after boards](before-after/index.html) compare the preceding verified Home with the new actual captures; source pixel equality and hashes are recorded in `before-after/manifest.json`, completed at 11:27:08 AEDT. These are actual browser comparisons, not new concept renders or pixel-registered composites against unavailable chat-source bytes. Read `VISUAL_REVIEW.md` for inspection findings. They accompany the completed actual-hosted mobile and desktop reports; final documentation/capture publication preserves the tested runtime bytes.

Asset review preserves native quality rather than manufacturing a larger image: the retained NRL mark is 500×500 and supplies approximately 2.43/2.22 native pixels per CSS pixel at 393/430 widths. It is not claimed to provide three native pixels per CSS pixel at those sizes. Brand/venue artwork supports above 3× at primary display sizes; NFL/NBA/UFC vectors remain scalable. Read `asset-review/README.md` for exact qualification and request behaviour.

## Publication record — deployed and verified

- Working branch: `codex-rebuild`.
- Production source: GitHub Pages `main` / root, HTTPS enforced.
- Previous verified application: `ec35fb1b6bcc442cfee89716bc6d1948ba28b557`.
- Previous evidence-only publication: `eb2f89f7de2928dd174ab26bcaa1582315082310`.
- New application/local-evidence publication commit: `32f55a67d500bc8bf646679fb1879e318ef2f4b5`.
- Successful exact Pages workflow: [37551374311](https://github.com/dinkyjunior/project-dollers/actions/runs/37551374311), build/deploy/report jobs successful, completed 11:20:40 AEDT, 7 October.
- Independent actual-hosted desktop/publication acceptance completion: 11:26:27 AEDT, 7 October (`2026-10-07T00:26:27.777Z`).
- Actual-hosted mobile acceptance completion: 11:29:52 AEDT, 7 October (`2026-10-07T00:29:52.727Z`).

Fetch/rebase the latest working branch and preserve incoming production data before ordinary publication. Root owns staging/commits/pushes and deployment. Previous `qa/home-gate/` evidence remains historical; a Git push/build result does not replace actual-site verification.

Independent Git-object review confirms that all 183 runtime files committed in `32f55a67` match the final local WebKit manifest exactly. `assets/app.js` and the three current/history/provenance data files remain byte-identical to the preceding release. Fresh fetch/rebase completed immediately before ordinary branch publication; no incoming delta was observed then.

The independent actual-site review used genuine WebKit with strict TLS/hostname verification and the supplied CA scoped per run. It records the visible animated venue image rather than a static wrapper, uses natural requestAnimationFrame callbacks without forcing time/phase, and confirms the brand tagline remains while the repeated hero is absent. Opacity/pulse sampling is browser evidence, not a physical-device FPS certification. At its recorded verification time both public branch heads matched the application commit; later evidence-only commits must preserve the exact runtime bytes.
