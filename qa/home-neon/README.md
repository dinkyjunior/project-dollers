# Stronger-neon Home QA

The current pass refines Page 1 only: one brand research subtitle, a thicker illuminated gate and stronger breathing light around the gate, entry button, selected sport and walls. All existing routes and Pages 2–3 data remain in scope for regression. Previous evidence under `qa/home-gate/` is preserved.

From `/workspace/project-dollers`, using the already installed Chromium and verified genuine WebKit runtime:

```sh
node qa/home-gate.cjs
node qa/home-gate.cjs --engine webkit --mobile-only
node qa/home-neon/accessible-controls.cjs
```

The first command covers 393×852, 430×896, 320×700, 768×1024 and 1440×1000. WebKit covers both primary mobile sizes at DPR2 with touch enabled. Each viewport captures all four sports and verifies selection, disabled Coming-soon entry, UFC Fighters, keyboard selection, remembered state, guarded unavailable navigation, refresh and direct routes. The phone cases additionally check live ring/venue/four pulse layers, reduced motion, offscreen/inactive pauses and the existing NFL/Steelers statistics and complete expanded-card football perimeter.

`accessible-controls.cjs` separately checks actual accessible button names, pressed state, entry disabled state and the polite availability live region. The hero gate is decorative and excluded from the accessibility tree; its image description does not establish screen-reader identity.

After the exact tested runtime is deployed:

```sh
node qa/home-gate.cjs --engine webkit --mobile-only --base https://dinkyjunior.github.io/project-dollers/
node qa/home-neon/accessible-controls.cjs --base https://dinkyjunior.github.io/project-dollers/
node qa/home-neon/live-capture.cjs
python3 qa/home-neon/compare.py
```

Final results go to `local-chromium/`, `local-webkit/` and `hosted-webkit/`. Hosted verification retains strict TLS and checks every delivered runtime file against the tested SHA-256 manifest. Source data is never substituted. Console/JavaScript errors, genuine failed requests, HTTP errors, runtime hotlinks, broken images, overflow and obscured controls fail the suite.

The functional screenshots pause CSS animations only during exposure; motion is independently proved through bounded naturally rendered samples. `live-captures/` instead records eight actual hosted WebKit screenshots with animation running throughout. `before-after/` compares those unaltered browser pixels against the preceding unpaused hosted screenshots. It labels both implementations and records source hashes; it is not a pixel-registered concept comparison. The approved concept remains the chat attachment, whose original file bytes were unavailable.

Local comparison boards can be generated before deployment without overwriting the final hosted boards:

```sh
python3 qa/home-neon/compare.py --after-dir qa/home-neon/local-webkit --output-dir qa/home-neon/local-comparison --local-paused
```

These are real browser-engine tests in a cloud container, not physical iPhone/Safari-controls, screen-reader or device-FPS certification. The offscreen check uses an isolated temporary transform of the decorative gate, restores its exact style and never captures that harness as product evidence. Actual background-tab visibility is not certified; real document departure/pagehide and inactive navigation are checked. NBA's hard split stays blue-left/red-right while diffuse blue/red light can overlap optically around the centre.
