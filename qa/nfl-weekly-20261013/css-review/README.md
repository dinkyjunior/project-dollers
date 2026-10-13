# Weekly dashboard CSS review

Native Chromium 151 / pinned Playwright 1.58.2 at the real local GitHub Pages subpath, with 393 × 852 and 430 × 896 viewports and device scale factor 2. No DOM, CSS or image substitution was used for these captures.

The retained `*-before.png` screenshots show the initial two-line final score and city labels overlapping the helmet artwork. The final CSS gives the score a 64px centre column, an upright 18px tabular font and no wrapping. The 132px art region places 90px helmets above the identity labels; a dark lower band keeps both cities readable. The primary report button and every recap detail action have a 40px target.

`native-layout.json` records the real geometry of all 15 selected-week fixtures at both phone widths. `layout-check.json` confirms 30 fixture layout checks without score wrapping, identity overlap or horizontal art overflow. Both expanded recap cards retain 40px actions and readable 10px city labels. The final card captures include the real selected game, genuine team logos and the actual available report/matchup action.

These checks concern native CSS geometry, not current official data, hosted delivery or routing. The browser contexts for this helper used default UTC; the final design-agent review uses the user's Australia/Sydney timezone.

Preserved Home, application frame, other research screens, scene assets and datasets were not changed by this CSS pass.
