# Publication gate contract

This contract describes the prepared read-only verifier. It is not a completed
publication, hosted review or browser acceptance receipt. The companion
`publication-verifier-preparation.json` binds the implementation inspected at
preparation time. Self-test fixtures are explicitly separate from real source
and browser evidence.

`qa/team-details/verify-publication.py` reads these coordinator documents:

- `release-review.json`: `status: all_six_reviews_accepted`, the original
  `runtimeManifestSha256`, `runtimeFiles: 231`, `applicationCodeHead`,
  `applicationCodeRef: refs/tags/team-details-reviewed-fe69378e`,
  `completeLocalChecksStatus: passed`, original-image `commonOriginals`,
  `completeLocalChecks` and six `reviewers`.
- `refresh-integration/release-integration.json`: `status: all_six_reviews_accepted`,
  `originalRuntimeManifestSha256`, `publishedRuntimeManifestSha256`,
  `incomingAudit`, `incomingAuditSha256`, `factualChanges: 0`,
  `structuralChanges: 0`, `unchangedOtherRuntimeFiles: 228`, six `reviewers`
  and actual completed `targetedNativeRefreshChecks`.
- `hosted-review.json`: `status: all_six_hosted_visual_reviews_accepted`,
  published `runtimeManifestSha256`, `runtimeFiles: 231`, six `reviewers`,
  and original-image `personallyInspectedCommonHostedOriginals`.
- `hosted-verification.json`: `status: passed`, published
  `runtimeManifestSha256`, `runtimeFiles: 231`, `applicationHead`,
  `applicationPagesRun` and actual completed hosted `checks`.

Reviewer rows are `{name, decision: accepted, evidence, evidenceSha256}`.
All six names and all six receipt paths must be distinct. Each receipt must
declare `status: accepted` or `passed` and bind the correct runtime through
`runtimeManifestSha256` or `runtimeManifest: {sha256, runtimeFiles: 231}`.
Integration receipts also explicitly bind `originalRuntimeManifestSha256` and
`publishedRuntimeManifestSha256`. Published binding takes precedence over an
original manifest field. A historical receipt from an earlier candidate does
not establish acceptance of the latest candidate.

Check rows are `{file, sha256, status: passed}`. The original JSON must itself
be passed, completed and exclude failure/capture-only acceptance. Full local
coverage must come from genuine original `qa/team-details/run.cjs` reports:
four Chromium viewports and both target-phone native WebKit viewports, with
312 actions, 24 filter cases, 20 game reports, 83 player disclosures, complete
control inventory, all 32 club routes at 393, actual phone motion and no
clipping or runtime errors. Both exact `regression-{chromium,webkit}-final-v3`
result/full-runtime-binding pairs are additionally mandatory: their original
44-file subset must match the accepted application; all five card tracks must
complete 32 samples across all four edges in the default and expanded-research
states, within the unchanged two-pixel/0.2 phase thresholds. The expanded state
measures all five cards while the originally selected research card is expanded.
These protected reports do not replace the new full native suite. Referenced test-helper
bytes must still match their original recorded hashes.

The narrowed integration reports use the real `post-refresh.cjs` output, not
the preceding NFL verifier's format. Both engines must each complete both
phone cases. The verifier checks transition hashes and every independently
classified changed leaf; all four actual public source bodies; team/current
manual response validation and exact HTTP 200 revalidation; six unchanged
DOM identities and `changed: false`; preserved filter context; source URLs,
retrieval time and all retained differences; the linked Steelers history
checksum; tabs, source-derived schedule/report checks and measured geometry.
These narrowed reports cannot replace the full original functional reports.

The explicitly authorized native operational extension is verified separately:
the original 2400-second receipt, effective 4800-second budget, exact owned
process identities, unchanged app/test bytes, supervisor exit and genuine
original-wrapper exit are mandatory preserved evidence. The raw native report
must finish within the recorded effective budget. Operational receipts do not
count as functional passes, and the original deadline is not relabeled.

Hosted acceptance requires completed strict-TLS `hosted-deployment.cjs` reports
for both target phones and desktop, all six hosted visual receipts, and the
separately mandatory complete frozen local suites. Each targeted hosted report
must hash all 231 actually delivered files, retain its exact completed provider
refresh child receipts, verify all four Home sport colors/availability guards,
source-linked refresh/DOM/focus/navigation and venue destinations, decoded images,
direct refresh and geometry, and natural/reduced/inactive Home/team motion.
Actual source bodies, player-history bridge, filter/report/schedule context and
the compact desktop frame are independently validated from the child receipts.
The hosted report explicitly does not claim to repeat the complete 312-action/
83-player-disclosure local suite. Full local coverage and targeted hosted
deployment coverage are recorded separately. The final
read-only check verifies main/codex-rebuild exact refs, the preserved original
application's lightweight GitHub tag, all 231 original and published Git blobs,
all three jobs of both applicable Pages runs, then exact HTTP 200 hashes for
all runtime files and selected evidence. It checks refs and local bytes again
after network verification.

Run self-test preparation with:

```sh
python3 qa/team-details/verify-publication.py --self-test
```

Only after all actual coordinator evidence exists and deployment completes:

```sh
python3 qa/team-details/verify-publication.py --pages-run RUN_ID --output FRESH_RECEIPT.json
```

Output paths are exclusive: an existing receipt is never overwritten. A missing,
incomplete or mismatched gate produces a preserved failure receipt rather than
claiming publication success.
