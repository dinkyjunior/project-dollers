# Matchup Breakdown release

This release implements the user's second approved chat render as the new
matchup destination. Complete Chromium (393/430/768/1440) and WebKit (393/430)
audits have passed, with 4,110 recorded native inputs and no unexercised enabled
controls in their audited states. All six specialists personally reviewed the
same 26 originals and accepted runtime `82ae9f0a`. The source-bound release gate
passes. Publication and actual hosted acceptance are the remaining steps.
Early failed or incomplete captures retain their original status.

Dallas **Open Matchup Breakdown** leads to `#matchup/DAL`. The NFL featured
matchup and comparison controls select their actual club and fixture, and Back
restores the originating team context. The screen includes Form & H2H,
Players & QB, Lineup & Travel, source provenance, native filtering and source
revalidation. Existing Home diamond controls, NFL dashboard and Steelers
research remain protected. Unrelated abandoned Page 4 features are excluded.

The [approved composition](../../reference/MATCHUP_BREAKDOWN_CHAT_SOURCE.md)
comes from the chat attachment. Its original binary is not exposed as a local
file. The component map records every intended destination; browser originals
must be personally compared with the attachment. No registered pixel identity,
physical iPhone test or device frame-rate certification is claimed.

Player rankings use actual verified yards. Last-five team games, statistical
game counts and confirmed quarterback starts have separate denominators.
Historical opponent logs retain original clubs, season and week. A short
sample is never padded; missing data is not zero. A recent uncertain starting
role occupies its chronological slot and cannot be silently replaced with an
older known start. Source disagreements remain explicit with both original
responses. Inferred starting quarterbacks are labelled projected rather than
confirmed. Missing routes, pressure tracking, official inactive confirmation,
forecast, verified travel and historical pre-game price remain unavailable.

The selected fixture uses its own source reports. The independently verified
Dallas–Tampa Bay Week 5 event was in progress when retrieved at 00:26:07 UTC;
its partial score and provider clock are labelled as a timestamped snapshot.
Live boxscore entries never enter completed-game or confirmed-start histories.
The actual current game stays available as the research fixture while the next
scheduled Week 6 game remains a separate destination. ESPN-reported INACTIVE
entries are attributed, partial provider reports, not an official complete list.
An injury bulletin repeated by a pre-event endpoint does not establish that
game's availability or quarterback, even after the core week advances. A
separate original same-week NFL injury report may support a labelled depth
inference; absent or stale reports cannot. The regression advances the core
week using the exact archived original bulletin. Missing reports remain unavailable.

The replaceable snapshot is lazy-loaded. Its builder checks exact dependencies
on the current NFL and team datasets, preserves actual source retrieval times,
and archives public response hashes. The reviewed event/quote map at
`data/starting-role-evidence.json` is required by the scheduled builder and must
travel with the source checkout. The independent audit uses separate raw-source
arithmetic and body checks, rather than importing the production formulas.

Browser updates check the published snapshot on entry, resume/reconnect,
manual refresh and while active. Repository monitoring checks provider changes
and publishes the linked snapshots atomically. GitHub schedules are best
effort; this is not an upstream push or instant live-play feed. Whole-body
corrections with unchanged retrieval time are applied; older, invalid or failed
updates retain the preceding snapshot. Open research dialog focus and context
survive a legitimate correction.

Rejected or incomplete early iterations retain their original status, source
identity and process receipts. Final acceptance must pass `verify-release.py`.
Actual publication must pass `verify-deployed.py`: exact successful Pages
build/report/deploy jobs, both branch heads and actual HTTPS file bodies.
Automatic source refresh must be restored and verified before completion.

Fetch and rebase both branches before every ordinary push. Preserve automatic
source updates; never force push. PR #1 is already merged, so release evidence
is recorded as a follow-up on that PR. Keep the final outside-Git publication
receipt separate to avoid recursively changing the commit being verified.

Current raw-source checks pass 712,248 independent assertions plus 1,549 fixture
context checks. All 94 response archives and all 38 fixture qualification outputs
are independently checked. The scoped updater hardening passes 26 source tests
with saved and separate runner manifests and changes no reviewed runtime bytes.
The failed Chromium v6 desktop result is retained: its before-refresh semantic
snapshot raced the native dialog close event in 12 of 40 diagnostic cycles. The
explicitly hashed rerun preload waits for the genuine close handler before the
unchanged snapshot reader; it removes no assertion or user action and changes
no app data, clocks, styles, requests or original helper file.

Read [the actual screenshots](gallery.html), [six accepted reviews](release/review.json)
and [download the application/source backup](../../backups/project-dollar-matchup-source.zip).
The backup is created after local acceptance and preserves exact reviewed runtime
bytes; later hosted evidence is retained in the repository/gallery separately.
