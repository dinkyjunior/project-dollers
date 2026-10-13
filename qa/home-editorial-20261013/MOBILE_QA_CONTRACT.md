# Independent Home browser audit

The latest supplied render supersedes the previous Home freeze and gate design. This audit does not certify NFL source freshness or hosted delivery.

## Native browser matrix

- Chromium 151 with pinned Playwright 1.58.2, without network or route mocks.
- iPhone-sized viewports 393 × 852 and 430 × 896, device scale factor 2, touch enabled.
- Tablet 768 × 1024 and desktop 1440 × 1000.
- Separate reduced-motion context at 393 × 852.
- Serve the real checkout under the GitHub Pages subpath `/project-dollers/`.

## Checks

- Compare real native screenshots from the top and lower content with the approved reference: black base, dusk skyline and stadium, restrained typography, white pill NFL entry, four editorial sport rows, footer.
- Check header, hero, stadium crop, entry, sport list and footer geometry; document image intrinsic dimensions and displayed sizing.
- Inspect horizontal overflow at the document and active page-scroll levels, including menu-open state.
- Scroll the entire Home content; ensure every row and footer can be reached and controls retain visible focus.
- Exercise menu toggle, keyboard activation, Escape, focus return, menu destination, and touch input where available.
- Exercise both NFL entry points, Home → NFL → Home, direct NFL and Home refresh.
- Verify NBA, NRL and UFC remain clearly marked coming soon, without opening nonexistent screens.
- Verify reduced-motion settings stop the Home decorative animation while retaining controls.
- Collect JavaScript, console, HTTP and failed-request diagnostics for every context; close all contexts and browser even on failure.

## Known regression risks

- Old Home aperture, premium and gem style sheets use deeply scoped and pseudo-element rules that may override the new Home unless retired or isolated.
- Global `.app-shell`, `.page` and `.page-scroll` rules constrain width and scrolling. Home expansion must not make NFL or team research panels grow unexpectedly.
- App routing resets the active page's `.page-scroll`; that node must remain present. NFL direct refresh and a return to Home must use the existing route lifecycle.
- Asset dimensions must support Retina display. A decoded image alone does not prove it has adequate resolution or the correct crop.
- Chromium mobile emulation is not real iPhone Safari. WebKit remains a separate capability check, and hosted verification remains a separate release requirement.
