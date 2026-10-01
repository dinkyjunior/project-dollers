# Rebuild Pages 1–3 with bundled visual assets and offline mobile QA

The prototype relied on runtime image hotlinks, causing core logos and player photography to disappear when external hosts were unavailable. Pages 1–3 now use bundled league/team logos, real headshots, font, stadium imagery and vector interface art. The rebuild adds the metallic/gold/cyan home masthead, compact aligned NFL table and leader panels, and equal Steelers player cards with footballs moving around the entire perimeter.

Navigation, week/conference selection, NFL/team tabs, all position filters, bottom-nav shortcuts and About operate inside the three-page scope. Data is a clearly labeled and verified historical 2025 snapshot; unsupported live records, rankings, starter labels and the previous fictional Friday fixture are not asserted. Page 4 and production `main` are untouched.

Validation: `npm ci` and `npm test`. Offline Chromium checks passed at 393×852 and 430×896 with zero external requests, missing images, HTTP errors or console errors. Tests cover navigation/history/direct loads, filters and tabs, layout alignment and overflow, all four perimeter edges and reduced motion. Six screenshots, a contact sheet and machine-readable results are under `qa/`. Asset sources, hashes and attribution are in `ASSET_SOURCES.md`.

This remains a draft. The approved original render was absent from the expected reference path on the remote branch, so `REFERENCE_SPEC.md` guided the implementation. Exact side-by-side render comparison and user visual acceptance remain pending. Safari/hardware QA was not run; an optional WebKit download was denied by the network proxy. Do not merge to `main` before approval.
