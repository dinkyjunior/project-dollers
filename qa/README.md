# Pages 1–3 review evidence

The application was rebuilt on `codex-rebuild` using `REFERENCE_SPEC.md` as the permitted fallback. **The approved image is absent from this branch** at `reference/approved_eight_screen_reference.jpg`. These captures are browser evidence, not proof of an exact match or visual acceptance against the original render.

## Browser captures

| Page | 393 × 852 | 430 × 896 |
| --- | --- | --- |
| Home | [Capture](home-393.png) | [Capture](home-430.png) |
| NFL | [Capture](nfl-393.png) | [Capture](nfl-430.png) |
| Steelers | [Capture](steelers-393.png) | [Capture](steelers-430.png) |

[All six captures](contact-sheet.jpg) present the two viewports together. The snapshots freeze animation at a fixed time; the application animates normally. `results.json` records the browser version and observed results.

## Validation completed

`npm test` serves the repository under `/project-dollers/`, starts Chromium, blocks every external network request and exercises both required viewport sizes. It exits nonzero on failed checks and stops only its own server/browser.

Passed in Chromium 151.0.7922.173 at both sizes:

- Home → NFL → Steelers → NFL → Home; browser back/forward; direct hash loads and refresh for all three pages.
- NFL tabs, AFC/NFC controls, week select/chips, Steelers team tabs, all seven roster filters, bottom navigation shortcuts and About dialog.
- Keyboard tab navigation and reduced-motion behavior.
- Identical standings row columns and player-card bounds.
- Football animation sampled at 32 points; it stays on the complete card perimeter and visits all four edges.
- All bundled images decoded; zero external requests, console errors, JavaScript exceptions or HTTP errors.
- No horizontal overflow, clipped default page content, or default-page vertical overflow at the two tested sizes.

The runtime is static: there is no app build, server-side service, live API or credential requirement. Npm dependencies are for browser QA only.

## Visual review against the available specification

Page 1: metallic/gold/cyan masthead, small spaced subtitle, correct 2×2 logo grid, active cyan NFL frame, subdued other leagues, stadium/football lower composition and compact five-item navigation. The real logos, local font and vector football remain crisp. No star-field background or screenshot interface is used.

Page 2: NFL header, 2025 season, Week 4 selection, three tabs, gold AFC control, compact shared-grid five-row table, aligned cyan Steelers row, paired five-player leader panels, week chips and a compact team-logo fixture card. One density iteration shortened rows and panel gaps so the complete default content fits the smaller viewport.

Page 3: Steelers identity, gold controls, equal gold/orange cards, verified player photos on the left, jersey/name/position hierarchy and four aligned stat cells. A sizing iteration brought all four cards and the historical-data note into the default view. Perimeter footballs are visible in the captures and their full route is checked separately. Player cards do not open player-detail screens: Page 4 is out of scope.

Data differs intentionally from the old prototype's unsupported numbers. See `ASSET_SOURCES.md` for verified historical records, formulas and fixture corrections.

## Outstanding acceptance

- Restore the original approved image at `reference/approved_eight_screen_reference.jpg`, then compare each page side by side and iterate on any remaining differences. No original-render fidelity claim is made here.
- Safari/iPhone hardware testing was not run. Installing the optional Playwright WebKit browser was attempted, but the browser-download CDN was denied by the network proxy (403). CSS includes `100vh`/`100dvh` fallback, safe-area spacing, zoom support, reduced motion and a perimeter-animation fallback, but Chromium viewport checks do not prove Safari behavior.
- User visual approval and merging/deploying to `main` remain outstanding. Only Pages 1–3 are implemented.

## Reproduce

From `/workspace/project-dollers`:

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
```

Python 3, Node and `/usr/bin/chromium` are required. `CHROMIUM_EXECUTABLE` may override the browser path. The runner binds port 8765 and expects the checkout directory to be named `project-dollers`; it fails if that port is already occupied. To view locally for development, serve `/workspace` with `python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace` and request `/project-dollers/`.
