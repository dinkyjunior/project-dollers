# Production Home release isolation and compatibility

This is the production gate for bcecaa4eac39be083322dfcbf2fe53d15ded7f74, built from production ef29763d994389617566a5aaa5f1e976bd8a48d2 plus the Home editorial and sport-preview commits only. The pending NFL data, current-week, archive-flag and daily-refresh changes on the review branch are excluded.

`release-isolation.json` verifies every existing production asset, script and workflow: 737 files, including all 452 data files, match the production baseline byte-for-byte. All index markup from NFL onward is byte-identical. The protected/data manifests include SHA-256, Git blob IDs and lengths from the production commit.

`native-release-bridge.json` passes at 393 × 852, 430 × 896 and 1440 × 900 in native Chromium 151 with pinned Playwright 1.58.2, DPR 2 and native touch/keyboard/mouse inputs. It covers selector availability, NFL entry, conference/week controls, Home return, all three research shortcuts, source-selected Report, direct Team/Report refresh and exact saved report quarters. No DOM, style, clock, response or dataset substitution was used. No JavaScript, console, HTTP, genuine failed-request or horizontal-overflow failures occurred. All browsers closed.

`existing-updater-tests.json` records eight passing groups in the unchanged production client updater's existing model suite. These are distinct from the earlier work-branch current-week tests and do not certify an enabled production refresh workflow.

Earlier `qa/home-editorial-20261013/regression` evidence belongs to the saved review-branch app/data checkpoint. Its eight week-mode tests and archive manifests are historical evidence; they are not relabelled as tests of this isolated production release. This directory supplies the applicable production baseline and native compatibility gate.

Home-only byte preservation does not establish independent official NFL agreement or current source freshness. Official/API reconciliation and the production daily-refresh activation remain pending. This local evidence also does not certify hosted delivery or physical iPhone Safari. Hosted verification must be recorded separately.
