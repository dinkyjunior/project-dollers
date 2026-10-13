# Independent NFL weekly integration and preservation audit

Final native audit: **PASS** against the frozen NFL implementation.

- 18 integration checks cover all four Home states, NFL-only entry, exact approved 393/430 enclosure dimensions, Week 5 fixture/card projection, genuine city/nickname/logo identities and exact event scores.
- The selected TB-at-Dallas report is independently matched to its retained checksum-bound payload. Compare, team form, an upcoming NYJ-at-New England matchup, refresh, Back-to-NFL and the existing team-origin Back flow are exercised with actual browser controls.
- A separate first-load Home Matchups test clicked while the weekly source was still loading. It opened the exact IND-at-Pittsburgh report after verification completed. A ready-state shortcut then opened the selected Week 6 NYJ-at-New England matchup; Back retained Week 6 and that event.
- 6,981 tracked files remain byte-identical to production baseline `dfe92c810aff1f250267ab4608d115541ccc9d3b`, including all 452 data files and 6,137 previous QA/archive files. Home and other research markup remain exact outside the NFL slice and three allowed cache-version strings.
- The narrowly authorized matchup-controller exception is restricted to `header`, `writeRoute`, `enter` and `route`. Original bytes are retained; all logic outside those functions is exact. Manual diff review confirms only persisted safe `return=nfl`, its back label and optional caller argument changed.

No console, page, HTTP or request errors occurred in the final integration run. Each browser closed and all inspected source hashes stayed stable.

Reproduce under the GitHub Pages subpath with a local server on port 8809:

```sh
node qa/nfl-weekly-20261013/preservation-integration/check-integration.cjs
node qa/nfl-weekly-20261013/preservation-integration/check-home-shortcut-cold.cjs
python3 qa/nfl-weekly-20261013/preservation-integration/check-preservation.py
```

The canonical receipts are `integration-results.json`, `home-shortcut-cold-results.json` and `preservation-results.json`. Earlier successful receipts and one supplementary helper selector failure are retained explicitly. The selector failure assumed Team Details Home used `data-td-action="home"`; the actual control uses `data-open="home"`. Only the helper changed to correct that assumption.

These checks use retained source snapshots, native local Chromium and real application navigation. They do not independently establish current official NFL data currency, remote publication delivery or Safari behavior. No app-state, DOM, clock, CSS or response substitution was used.
