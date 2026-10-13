# Immersive Home: independent preservation and frame audit

Production baseline: `1310c794f89461d830fbcc7f9110a530b5ed43f7`. The frozen working candidate is bound by exact source SHA-256 values in the receipts; its base commit is `cdb55a077ce27a0a934abd37d21de902bd0d8566`.

The preservation gate passes for **6,843 existing files**. This includes 755 existing asset/script/workflow files, 452 data files, 6,009 prior QA files and 40 reference files. Existing file bytes compare against production Git blob identities. The NFL aerial scene, mobile variant and refined wordmark also retain their original SHA-256 values. NFL and later research markup and non-Home asset includes remain identical to production. New Home portrait assets are added under new paths; all prior artwork and evidence archives remain intact.

`final-native-frames/results.json` passes native Chromium geometry checks for NFL, NBA, NRL and UFC Home previews at 393×852, 430×896, 768×1024 and 1440×900. All 16 Home enclosures exactly match the corresponding main NFL width, height, position and 18px radius, with zero geometry deltas. Main NFL geometry also matches the independent prior production measurement. Every correct portrait scene loads, remains undistorted and shares NFL background geometry. No horizontal overflow, visible headline, JavaScript/console errors or source changes occurred. Browser contexts and the browser closed.

The exact executed helper and original results are retained. The first helper run stopped on a reviewer variable-scope error (`sport` used outside its loop); the second completed every viewport but rejected a numeric boundary because 14.62/430 evaluates to 0.033999999999999996. The final helper uses a 0.000001 tolerance for this decimal division. Both initial receipts/helpers remain archived here. No application changes were made for either helper issue.

This is bounded local preservation and geometry evidence, with no DOM/CSS/response/clock substitution. It does not certify provider freshness, hosted deployment, physical-device Safari, or visual approval of the art. The parallel Home visual and toggle reviewers own those checks.
