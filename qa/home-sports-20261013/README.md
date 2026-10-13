# Four sport Home toggle audit

`toggle-audit.cjs` passed against the frozen production release `bcecaa4` under local HTTP. The native results and twelve sport-state screenshots are in `native-production-release/`.

The native matrix is 393 × 852 and 430 × 896 with DPR 2 and touch, plus 1440 × 1000 desktop. The audit uses real local HTTP under `/project-dollers/` with no request, storage, data, font or animation mocks.

It checks all four sport selections, decoded scene identity, pressed state, accessible announcements, session refresh, keyboard selection, rapid selection races, menu focus and NFL navigation, preservation of the selected preview on returning from NFL, and reduced motion. NFL is the only enabled primary entry; preview entries and topics cannot route into NFL.

All four states passed at each size, including ten behavior checks per context. The four-state reduced-motion context also passed. No JavaScript, console, HTTP, failed-request or horizontal overflow errors were found. Source manifests remained stable throughout execution, and every browser context was closed.

An image-tool presentation initially appeared to omit some row labels and the sport heading. Independent direct decoding of the **original**, unchanged PNGs confirmed the heading and all four labels were present. `paint-probe-before/original-screenshot-byte-audit.json` retains original PNG hashes, file metadata and direct pixel counts within the actual label bounds. Natural early/settled captures also showed those pixels consistently with fonts loaded and scrolling stopped. The exact intermediate presentation behavior is not established; no application source patch was justified. The original twelve native audit PNGs remain unchanged; only redundant intermediate probe captures were pruned after analysis.

The original single-sport editorial Home evidence is retained in `qa/home-editorial-20261013/`; it must not be presented as proof of the later four-sport behavior.

Local native browser success does not certify current NFL facts, Safari or hosted delivery.
