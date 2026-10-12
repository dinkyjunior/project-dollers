# Current-data update checkpoint — 13 October 2026, Sydney

This is a tested implementation checkpoint, not a completed production release.
Home design remains unchanged. Existing production Game Report implementation
is retained; production main was ef29763d at the last native Git fetch.

## Implemented

- Current follows verified week changes while manual historical selections remain
  pinned. Weekly leaders use the latest published statistics; recap follows final
  scores independently. Explicit missing weeks remain unavailable. Partial-week
  coverage is qualified separately for statistics and scores.
- Current retains a recently unresolved kickoff for eight hours; it does not
  claim verified live status or let indefinitely missing results pin an old week.
- Standings explicitly identify the selected sorted-record order, rather than
  claiming official playoff seeds. The existing compact/full-table controls stay.
- Scheduled daily full fetch at 17:07 UTC, with other-hour checks and existing
  game/provider windows. Required-source failure prevents publication.
- Installed a separately audited, conservative local archive correction:
  7,154 ambiguous condensed scoring-play flags across 414 reports become unknown.
  Original raw flag absence is not claimed verified. All sporting values, detailed
  plays and original provider retrieval times remain unchanged. All 444 reports
  passed candidate and installation validation.

## Verified and retained

Fresh public NFLverse bytes reproduce all 32 teams' records and points (224
independent checks). Week 5 had 14 of 15 games final at retrieval; Buffalo–Los
Angeles was not yet played. Current player statistics, roster and injury bytes
match the previously saved sources. Injuries beyond the released week remain
unavailable. Fresh Pittsburgh depth has two changes: Daequan Hardy RCB 3→4;
Doneiko Slaughter LCB 4→RCB 3. These depth changes are not installed into the
published books yet.

Six verified source files with genuine retrieval metadata are prepared in
`/workspace/current-nfl-source-cache`. The lossless CSV gzip files and exact
receipts under `freshness/` preserve source evidence if that external cache is
lost. `official/` contains the independent record/fixture comparison.

Focused producer, selection, coverage and daily-monitor tests passed. Native
Chromium baseline covered 393×852, 430×896 and desktop, with 177 real inputs and
27 untouched original screenshots. The original helper failure is preserved;
the report retry passed against the same frozen manifest. This is saved-book
verification, not certification of a newly refreshed or hosted dataset.
The final archive/visible-order delta has its own bounded native bridge receipt.

## Access and release work still required

Public ESPN, official NFL/team pages, api.github.com and the hosted Pages URL
are blocked by the current cloud-domain policy. Actual error:
`URLError: Tunnel connection failed: 403 Forbidden`.
This does not establish a website outage or identify the user's lost ChatGPT
stream error. The workspace and native Git access are available.

An additive environment network draft preserves the existing rules and adds
GitHub API, the project Pages host, ESPN public API hosts, official NFL/Steelers
hosts and official Playwright download hosts. The user must apply the saved
draft through **Edit environment → Save and publish**. A saved draft alone
does not change runtime access.

After activation, confirm actual source/API/TLS access; rebuild core → Team →
Matchup → Game Report books together, retaining honest historical source times;
run fresh-source and mobile QA; publish the reviewed branch; and verify the
actual HTTPS website and source hashes. Restore the existing data workflow,
which was paused for the previous publication audit. Its enabled state and a
successful production run must be checked; local YAML tests are insufficient.

Official playoff ordering remains unverified. Hosted browser verification and
official WebKit restoration remain pending. Do not report this pass as deployed,
all external facts as freshly verified, or automatic production refresh active.
