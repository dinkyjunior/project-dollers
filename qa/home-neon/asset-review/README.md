# Independent asset and loading review

Passed in Chromium 151 at 393 × 852 and 430 × 896, both at DPR3, on
7 October 2026 at 11:12 am Australia/Sydney. The reviewed source includes the
final powered outer lip. Exact runtime and protected artwork hashes, resource
responses, control/image bounds and all eight sport states are in `results.json`.

All eight actual screenshots were inspected. The thicker illuminated ring and
stronger entrance/selected-sport borders remain distinct and sharp. Their
bloom does not wash out the brand, button labels or league shapes. NBA retains
fixed blue-left/red-right lighting across the stage, inner/outer ring, CTA and
selected sport. No horizontal overflow or offscreen controls occurred.

All nine protected Home/league artwork hashes remain unchanged. Brand native
density is 5.22/4.79 pixels per CSS pixel and scene density is 3.38/3.08 at
393/430 respectively. NFL/NBA/UFC are vectors. The unchanged native 500px NRL
raster supports 2.43/2.22 pixels per CSS pixel; it remains clear in the DPR3
captures, but this is not a claim of newly created 3x NRL artwork.

Fresh Home loads only the NFL scene. NBA/NRL/UFC scenes each load once on their
first selection, then all four states reuse loaded resources. There were zero
external requests, duplicate URLs, failed requests, HTTP errors or browser
errors. Local startup response bodies total 2,782,594 bytes, including the
existing current-data snapshot. These are uncompressed local response-body
counts rather than production network-transfer measurements.

The independent DPR3 captures remain in `/tmp/pd-home-neon-assets`; duplicate
heavy PNGs are not committed. The final shared captures are in
`../local-chromium/` and `../local-webkit/`, with their own DPR qualifications.
This is browser-emulation evidence, not a physical iPhone test.

To rerun against an existing local server:

```sh
node qa/home-neon/asset-review/review.cjs --base http://127.0.0.1:8765/project-dollers/ --output /tmp/pd-home-neon-assets
```

The helper reuses the existing browser launcher and only reads production
files. It saves captures/results to the chosen output directory and checks
runtime hashes before/after the audit to reject concurrent runtime changes.
