# Independent NFL data-integrity review

Reviewed 2 October 2026 (Australia/Sydney). The final public-source retrieval began at **2026-10-01T15:52:06Z**. The app contains a sourced snapshot, not live play-by-play.

## Current facts checked

- 2026 regular season, current Week 4; completed scores and released statistics through Week 3.
- All 32 conference records were independently recomputed from the scored schedule. Rows are sorted records, not asserted official playoff seeds or tie-break rankings.
- All 77 retained Steelers roster records were checked against the roster CSV: 53 active, 17 practice squad, seven reserve. Cut players are excluded. Names, positions, jersey numbers, roster status and available ESPN identifiers match; missing identifiers remain null.
- Every retained player's season totals and the ordering of their up-to-five recorded game IDs were compared with the player-stat CSV. Missing player rows display unavailable; lists are not padded to five. No current retained player has omitted same-season statistics from another team.
- Pittsburgh is 2–1 with 53 points scored and 60 allowed. Gross passing 700 minus 77 sack yards lost gives 623 net passing; plus 287 rushing gives **910 total yards**, or 303.3 per covered team game. Recorded points per game are 17.7 and points allowed 20.0.
- Next sourced Steelers fixture: away at Cleveland, Week 4, **2026-10-02T00:15:00Z**, Huntington Bank Field. Both entering records are 2–1. Kickoff converts from America/New_York using daylight saving; browser presentation follows the user's time zone. The schedule supplies four rest days for both teams.
- Cleveland allowance covers three verified offensive-stat games. QB passing allowed is 718/3 = 239.3 yards per game; RB rushing 318/3 = 106.0; WR receiving 458/3 = 152.7; TE receiving 198/3 = 66.0. All positional denominators use the same covered games.
- Four current-week Steelers injury rows match the source. Practice participation is kept separate from game designation. Blank designations and absent players do not establish healthy, available, or inactive status.
- Depth order uses the published source timestamp, 2026-10-01T14:25:58Z. “First on depth chart” is not represented as a confirmed game-day starter.
- Historical meetings retain each original season, week, date and final score. Archival moneylines remain in internal data with their source limitation. The interface does not present them as verified exact pre-game prices without bookmaker identity and capture time.

## Source and provenance checks

All six ordinary public nflverse requests returned HTTP 200 during the final refresh: schedule, team metadata, roster, player statistics, depth charts and injury reports. Their six content SHA-256 values were unchanged from the preceding 14:42 UTC snapshot. No current factual values changed during the integrity hardening.

The saved `current.json` and `provenance.json` passed `python3 scripts/refresh-data.py --check`, including their canonical snapshot hash. Each dataset identifies its sources, season/week context, verification/derivation status and limitations. Source records carry their actual retrieval timestamps and content hashes. Snapshot freshness uses the oldest required source retrieval; regeneration does not make cached data newer.

The reviewer independently verified matching raw bytes for the schedule, roster, player-stat and injury sources. Current displayed statistic columns contain explicit numeric source cells; their zeros are actual numeric zeros. Null propagation now also protects future releases with missing cells. The latest required stat schema must exist before a refresh can publish.

## Review findings fixed

1. **Partial-release denominators:** a new final score could previously increase a team/opponent denominator before that game's statistics arrived. Steelers totals now use only final game IDs with verified Steelers-stat rows. Opponent allowance uses final game IDs with verified opponent offensive-stat rows. Both expose their own coverage IDs and covered week. Latest records remain distinct from the statistics coverage period.
2. **Unknown values:** missing numeric cells or absent rows previously risked becoming zero during aggregation. Missing cells now propagate null through totals, ratios, net yardage and passer rating. Explicit zeros remain zero. Missing required stat columns reject the refresh before either published JSON is replaced.
3. **Future-week recap:** future selectors previously retained the latest available leaders while returning no recap. `recapWeek` and the included final scores now share the explicitly identified latest verified leader week. No future result is invented. UI recap headings use that actual week.
4. **Recorded games:** player per-game averages now explain that their denominator is games with recorded statistics, not independently confirmed appearances. No missing game is treated as a zero-stat appearance.
5. **Season context:** player last-five provenance uses the requested source season, rather than a hardcoded year.

Five isolated standard-library regressions pass with `python3 qa/data.test.py`: partial team/opponent release; shared positional game denominator; missing required source column; null numeric propagation; and future-week recap provenance. The synthetic test fixtures are used only by pure snapshot construction and never write production data, access the network or run the refresh publisher.

## External verification limits

Independent second-provider confirmation remains **partial**. Ordinary requests to these additional public pages at 2026-10-01T15:37:42Z failed at the environment's CONNECT tunnel with HTTP 403, before a provider response was reached:

- `https://sports.yahoo.com/nfl/teams/pittsburgh/`
- `https://www.foxsports.com/nfl/pittsburgh-steelers-team-schedule`
- `https://www.bbc.com/sport/american-football/nfl/scores-fixtures/2026-10-01`
- `https://fbschedules.com/2026-pittsburgh-steelers-schedule/`

Earlier official-team, ESPN, PFR and CBS attempts were also unavailable. This is not evidence that those providers disagree, nor independent official confirmation. Internal cross-dataset and arithmetic checks passed; no disagreement was found within the accessible source data. No blocked route, authentication, paywall or access control was bypassed.

Current weather forecasts, confirmed game-day inactives, team travel itinerary, and exact historical pre-game head-to-head prices are explicitly unavailable. Historical recorded conditions, sourced venue/home-away context and schedule rest days remain separate verified data.
