# Mobile, Safari availability and asset audit

Independent audit of the final refinement working tree on **2 October 2026, 01:39 Australia/Sydney**. No application code was changed by this reviewer.

## Browser coverage

**Actual Safari/WebKit execution is unavailable and has not passed QA.** The legitimate Playwright installation command was attempted:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/playwright-browsers npx playwright install webkit
```

Playwright requested WebKit 26.0, build 2248, from its official download endpoints. Both `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` returned HTTP 403, `Domain forbidden`, including the installer’s official fallback attempts. No installed WebKit or Safari executable was found. No access controls, certificate validation or authentication were bypassed. Physical iPhone Safari, its browser chrome and device GPU remain unverified.

The independent fallback used **Chromium 151.0.7922.173**, actual mobile/touch emulation, a three-device-pixels-per-CSS-pixel scale and an iPhone user-agent string. A Safari user-agent string does **not** turn Chromium into Safari. These results establish the tested mobile geometry and interactions only.

| Emulated mobile viewport | Additional reduced-height viewport | Screens tested | Outcome |
| --- | --- | --- | --- |
| 393 × 852 at 3× | 393 × 700 at 3× | Home, NFL, Steelers | Passed |
| 430 × 896 at 3× | 430 × 744 at 3× | Home, NFL, Steelers | Passed |

The reduced heights exercise available-space changes similar to expanded browser controls; they do not reproduce actual Safari controls. Full measurement evidence is saved in [webkit/chromium-mobile-fallback.json](webkit/chromium-mobile-fallback.json).

## Mobile findings

- All three screens retained their exact intended CSS viewport width. No horizontal scrolling was present in any of the twelve measured screen/height combinations.
- The application shell uses `100dvh` with a `100vh` fallback. Its height and bottom navigation tracked the available viewport after every height change. The navigation stayed inside the viewport, with five labelled, at-least-44 × 44 CSS-pixel touch targets.
- The viewport includes `viewport-fit=cover`. Top content and bottom-navigation sizing use `env(safe-area-inset-top/bottom)`. Chromium’s synthetic insets are zero; real notched-device inset rendering is not proven by this test.
- Real touch input completed Home → NFL → Steelers. Expanding the complete roster and scrolling reached the bottom at both widths, with content contained in the dedicated scrolling region above navigation.
- `prefers-reduced-motion: reduce` stopped every running infinite decorative animation. This independently confirms the reduced-motion behavior in Chromium.
- All runtime requests remained local. The audited runs produced zero external requests, JavaScript exceptions or console errors.

The final saved Home and Steelers 393-pixel screenshots were also inspected directly: typography and icons remained sharp; logos and portraits retained their proportions; player faces were clear; card statistics remained within the full illuminated rectangle; football/highlight motion was attached to the card perimeter rather than the photo.

## Visual-asset findings

All **146** entries in `assets/sources.json` were independently checked against their bundled file SHA-256 hashes; all matched. The runtime mappings prefer the optimized local assets rather than the historical PNG/TTF artifacts.

- Team and league raster marks retain 500 × 500 source pixels. The UFC wordmark and interface art remain vector SVG.
- Player photographs retain native 600 × 436 dimensions with no upscaling. Each available photograph is mapped to an identified ESPN source; the 77-record current roster has 76 available authentic photos and one explicit unavailable photo. No AI player faces or substitute identities are used.
- The 76 optimized player photographs total approximately 2.59 MB and are loaded as needed. Optimized logos total approximately 904 KB. The rendered home backdrop is a 422 KB WebP at unchanged native 1983 × 793 resolution; its generated, non-player artwork provenance is explicit.
- Every raster image visibly rendered during this audit had at least three source pixels per CSS pixel and used `object-fit: contain` or `cover`. The lowest measured density was **4.04×** at width 393 and **3.87×** at width 430. The native source quality supports a 3× display without enlargement.
- Anton, Barlow Black Italic and Barlow Condensed Semibold load from local WOFF2 subsets. Original fonts and each SIL Open Font License are bundled and were checked.

These source records establish the assets’ origin and identity; they are not a commercial rights grant. The exact remaining browser limitation is actual Safari/iPhone validation, not missing or hotlinked visual assets.
