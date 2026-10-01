# Pages 1–3 visual and functional evidence

The user's **approved eight-screen chat attachment** guided this refinement. Its first three top-row panels were visually compared with actual Chromium output at **393×852** and **430×896**, followed by sequential Home → NFL → roster iteration. The source attachment was visible but its file bytes were not exposed; the user explicitly authorized proceeding. See [reference provenance](../reference/CHAT_SOURCE.md).

## Visual evidence

| Page | 393 × 852 | 430 × 896 | Side-by-side comparison |
| --- | --- | --- | --- |
| Home | [Capture](home-393.png) | [Capture](home-430.png) | [393](comparisons/home-393.jpg), [430](comparisons/home-430.jpg) |
| NFL | [Capture](nfl-393.png) | [Capture](nfl-430.png) | [393](comparisons/nfl-393.jpg), [430](comparisons/nfl-430.jpg) |
| Steelers | [Capture](steelers-393.png) | [Capture](steelers-430.png) | [393](comparisons/steelers-393.jpg), [430](comparisons/steelers-430.jpg) |

[All six current captures](contact-sheet.jpg) and the [detailed attachment-based comparison](REFERENCE_COMPARISON.md) document layout, proportions, type, glow, image clarity and density. The side-by-side files pair the preserved **previous draft** with the **refined browser output**, not the inaccessible source-image bytes. Each sheet identifies the approved source as the chat attachment. Original reference pixels are not substituted or fabricated.

The screenshots freeze normal animation at a repeatable time. Original stadium art is a standalone background asset; interactive components remain HTML/CSS. All player portraits are authentic downloaded photographs. Five equal roster cards and enlarged jersey labels follow the source's rhythm. The footer frame/navigation, broad slanted masthead, league grid boundaries, compact NFL columns and gold/orange perimeter treatment are materially closer to the supplied render.

## Functional validation

`npm test` starts a temporary Python server under `/project-dollers/`, runs Chromium, blocks all external requests and tests both viewports. It exits nonzero on failed checks and stops only its own server/browser.

Passed at both sizes:

- Home → NFL → Steelers → NFL → Home; browser back/forward; direct hash loads and refresh on all three pages.
- NFL tabs, AFC/NFC controls, week selector/chips, team tabs, all seven roster filters, bottom navigation and About.
- Keyboard tab navigation, reduced motion, aligned table rows and equal five-card bounds.
- Football animation sampled at 32 points: all four perimeter edges visited without leaving the card boundary.
- Every local image decoded; zero external requests, HTTP errors, console errors or JavaScript exceptions.
- No horizontal overflow or clipped default page content at either required size.
- Exactly three app pages; player-detail Page 4 is not added.

`results.json` records browser version and run outcomes. Npm dependencies are QA tooling only; the application is static and requires no live services or credentials.

## Scope and remaining differences

Verified historical 2025 data is retained. Michael Pittman Jr. is not inserted into that year's Steelers roster; Roman Wilson is the verified fifth receiver. The fixture and actual records/stats differ from the source's illustrative values. [Asset/data provenance](../ASSET_SOURCES.md) documents those choices.

Visual comparison establishes a material reduction in the gap, not pixel equality or user visual approval. Fine metallic highlights, flare patterns and portrait crops remain different. Safari/iPhone hardware testing remains unrun; an optional WebKit download was blocked by the network proxy. Publication/merge to `main` is outside this task.

## Reproduce

From `/workspace/project-dollers`:

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
```

Python 3, Node and `/usr/bin/chromium` are required. `CHROMIUM_EXECUTABLE` can override the browser path. The test uses port 8765 and expects a checkout named `project-dollers`; it fails if its server cannot bind. Local development uses `python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace` and the `/project-dollers/` path. No localhost preview link is needed for the saved evidence.
