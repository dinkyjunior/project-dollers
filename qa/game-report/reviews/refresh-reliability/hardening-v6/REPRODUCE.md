# Reproduce the final refresh reliability audit

The accepted source is `1e0bb61a60cb5033f2f48eea17b6ca8315b8f789669f01c19a11a26c8b82526e`; the report index is `cd43314dc28faead43694a5c8658fd009cbdcf23caa16ce6221e0349dd679208`. The runner rejects a different source/index before creating any fixtures. To reproduce this exact release after automatic updates, use its committed source/data snapshot in an isolated checkout.

Keep these three small files together:

- `reproduce-v6.py`
- `isolated-review-v6.py`
- `catalog-validation-v6.py`

From the matching repository snapshot, run:

```sh
python3 qa/game-report/reviews/refresh-reliability/hardening-v6/reproduce-v6.py --repo /workspace/project-dollers --output /workspace/recovery-qa/new-game-report-review
```

Use the actual checkout path for `--repo`. Choose a NEW `--output` outside that repository. The runner refuses existing output directories; it never overwrites prior evidence. All large fixture copies remain outside Git. No provider requests or browser are used. The runner verifies production source/data hashes before and after the audit.

The portable runner reconstructs the five isolated unmasked player input cells from explicit ESPN source-bound readings in the current verified reports. It does not need the three older backup bodies. The dependent CLE team-loss input is deliberately set to **999 as a controlled test fixture**, then required to become unavailable. That test input is not an assertion about the historical game and never touches production.

The output contains 68 reliability/reconciliation/aggregate cases, 11 full-catalog checks, and a current `--check` result: **79 cases passed, 444 reports verified, 888 quarter checks**. `reproduction.json` binds the source, index, both resulting receipts and the portable runner. The original review's `acceptance.json` and prior failure receipts remain immutable; the portable run produces fresh receipts separately.

Portable reproduction itself was executed successfully before handover. Its `portable-reproduction.json` is a compact copy of that separate result, not a replacement for the original acceptance receipt.
