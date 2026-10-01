# Codex Start Here

You are working on the `codex-rebuild` branch of `dinkyjunior/project-dollers`.

Read these files before editing code:
1. `AGENTS.md`
2. `README_FOR_CODEX.md`
3. `CODEX_TASK.md`
4. `QA_ACCEPTANCE.md`
5. `REFERENCE_SPEC.md`

If the original approved eight-screen Project Dollar$ render is visible in the Codex conversation context, treat that image as the highest visual authority. If not, use `REFERENCE_SPEC.md` as the fallback until the image is available.

Immediate mission: rebuild/refine Pages 1–3 only. Do not create Page 4.

Work sequentially: Page 1 → visual QA → Page 2 → visual QA → Page 3 → visual QA → integration QA.

Do not push directly to `main`. Keep work on `codex-rebuild` and use the draft PR for review.

## Development and QA

Use the existing checkout; cloud tasks are already isolated. Do not create a Git worktree unless the user explicitly requests one. Check branch and working changes before editing.

The app is a static site. For local development serve the parent `/workspace` directory so `/project-dollers/` matches GitHub Pages:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace
```

For reproducible offline browser QA, from `/workspace/project-dollers`:

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
```

Npm is for QA tooling only; no app build or live API credentials are required. The test starts its own temporary Python server and Chromium and saves six screenshots under `qa/`. Read `qa/README.md` and `ASSET_SOURCES.md`. Never replace verified data with invented values or reintroduce runtime hotlinks. Keep attribution when changing the stadium or font.

The original approved image is currently missing at the expected path. Restore it before claiming original-render visual acceptance. The fallback guided the current draft rebuild; the captured browser output remains subject to exact reference comparison and user approval.
