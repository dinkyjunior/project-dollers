# Saved app standings awaiting official NFL comparison

Official reference: https://www.nfl.com/standings/conference/2026/REG

Saved source: 2026 regular season, Current Week 5, records through Week 5; retrieved 2026-10-12T19:44:57+11:00 Sydney.

These are the **app values**, not an assertion that they match official NFL values. The user reports an official contradiction. Independent comparison with the exact NFL payload is pending root-owned retrieval. Same-provider arithmetic checks do not resolve this contradiction.

| Conference | Team | W | L | T | PCT | PF | PA | DIFF |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| AFC | Kansas City Chiefs | 4 | 0 | 0 | 1.000 | 118 | 77 | +41 |
| AFC | Jacksonville Jaguars | 4 | 1 | 0 | 0.800 | 123 | 70 | +53 |
| AFC | Baltimore Ravens | 4 | 1 | 0 | 0.800 | 146 | 119 | +27 |
| AFC | Buffalo Bills | 3 | 1 | 0 | 0.750 | 127 | 107 | +20 |
| AFC | Cincinnati Bengals | 3 | 2 | 0 | 0.600 | 128 | 109 | +19 |
| AFC | New England Patriots | 3 | 2 | 0 | 0.600 | 110 | 94 | +16 |
| AFC | Las Vegas Raiders | 3 | 2 | 0 | 0.600 | 132 | 129 | +3 |
| AFC | Pittsburgh Steelers | 3 | 2 | 0 | 0.600 | 111 | 109 | +2 |
| AFC | Denver Broncos | 3 | 2 | 0 | 0.600 | 97 | 111 | -14 |
| AFC | Cleveland Browns | 3 | 2 | 0 | 0.600 | 93 | 112 | -19 |
| AFC | New York Jets | 2 | 3 | 0 | 0.400 | 93 | 96 | -3 |
| AFC | Indianapolis Colts | 2 | 3 | 0 | 0.400 | 124 | 138 | -14 |
| AFC | Houston Texans | 1 | 4 | 0 | 0.200 | 110 | 112 | -2 |
| AFC | Los Angeles Chargers | 0 | 5 | 0 | 0.000 | 84 | 129 | -45 |
| AFC | Tennessee Titans | 0 | 5 | 0 | 0.000 | 58 | 109 | -51 |
| AFC | Miami Dolphins | 0 | 5 | 0 | 0.000 | 70 | 132 | -62 |
| NFC | San Francisco 49ers | 5 | 0 | 0 | 1.000 | 154 | 93 | +61 |
| NFC | Minnesota Vikings | 5 | 0 | 0 | 1.000 | 109 | 64 | +45 |
| NFC | New York Giants | 3 | 1 | 1 | 0.700 | 109 | 106 | +3 |
| NFC | Seattle Seahawks | 3 | 2 | 0 | 0.600 | 134 | 105 | +29 |
| NFC | Chicago Bears | 3 | 2 | 0 | 0.600 | 119 | 96 | +23 |
| NFC | Detroit Lions | 3 | 2 | 0 | 0.600 | 164 | 148 | +16 |
| NFC | Green Bay Packers | 3 | 2 | 0 | 0.600 | 104 | 112 | -8 |
| NFC | Carolina Panthers | 2 | 2 | 0 | 0.500 | 121 | 109 | +12 |
| NFC | Los Angeles Rams | 2 | 2 | 0 | 0.500 | 85 | 83 | +2 |
| NFC | Dallas Cowboys | 2 | 3 | 0 | 0.400 | 138 | 136 | +2 |
| NFC | Atlanta Falcons | 2 | 3 | 0 | 0.400 | 119 | 122 | -3 |
| NFC | Philadelphia Eagles | 2 | 3 | 0 | 0.400 | 92 | 112 | -20 |
| NFC | Washington Commanders | 1 | 3 | 1 | 0.300 | 115 | 149 | -34 |
| NFC | Tampa Bay Buccaneers | 1 | 4 | 0 | 0.200 | 100 | 112 | -12 |
| NFC | New Orleans Saints | 1 | 4 | 0 | 0.200 | 118 | 151 | -33 |
| NFC | Arizona Cardinals | 1 | 4 | 0 | 0.200 | 108 | 162 | -54 |

Historical Week 4 is an entering-week view through Week 3. Current Week 5 includes all source finals through Week 5. Neither a historical cutoff nor display sorting should be presumed to explain different wins/losses without comparing the official rows.

App ordering is PCT → point differential → abbreviation; official seeds are null. Compact AFC display chooses the top four sorted rows plus Pittsburgh. Compare all 32 clubs by identity, not row number.

No app or data files changed and no network requests were made for this audit.
# Standalone comparison guard checkpoint

`scripts/compare-nfl-standings.py` now validates and compares a reviewed adapter's
normalized official input with the app's current 32-team table. It reports both
readings on numeric disagreement and separates source ordering from records.
Sixteen focused tests and 52 independent cases pass. The original independent
failure receipt is retained; strict coverage types and impossible regular-season
game counts were corrected.

This guard does not fetch or parse NFL.com. Valid metadata is not retrieval proof.
Real page capture, content-based season validation, parser implementation and
daily workflow integration remain pending. No official comparison or production
data correction has been claimed from these synthetic tests.

The user's reported examples are Baltimore and Jacksonville. Saved app values
are 4–1 for each (custom AFC positions 3 and 2); official readings remain unknown.
The escalated diagnostic returned HTTP status `000` and proxy CONNECT status
`403`, proving that the cloud proxy rejected the connection before NFL responded.
The saved domain changes still need to be applied in the environment editor.

