# Saved environment access correction

The running app development workflow is ready: pinned Chromium/Playwright and Python can render and test the static site under `/project-dollers/`. All required local functional, data, source-monitor, automatic-update and integrity checks pass.

Reading the saved cloud configuration found a restricted allowlist containing only `a.espncdn.com`, `commons.wikimedia.org` and `upload.wikimedia.org`, plus the package-manager preset. The required hosted website and API/browser verification destinations were absent. The saved startup text also described the previous hotlink prototype and unimplemented controls, which is now obsolete.

Using [cloud-environment-onboarding:setup](skill://plugin_connector_1p_ed5feb9070a08191b08c81c47947bc16/setup/SKILL.md), a configuration draft was saved successfully with:

- Updated complete `start_skill` instructions for the current local assets, checksum-linked lazy history, full controls and actual repository QA commands.
- Network destinations preserving the three existing image hosts and adding the exact public website, GitHub/API/raw/release destinations, public ESPN/official verification hosts and official Playwright download hosts.
- The existing installation instructions, secrets and unrelated configuration fields left in place.

Draft persistence was confirmed with `status: saved`. No secret values were inspected, copied or requested. No API/provider subscription was invented.

The skill explicitly states: **“Saving persists configuration; it does not execute scripts, apply runtime changes, or publish.”** Its [onboarding contract](skill://plugin_connector_1p_ed5feb9070a08191b08c81c47947bc16/setup/references/onboarding.md) distinguishes saved drafts from the running machine. The user can apply the draft in environment settings; hosted/API/WebKit access then needs a real retry before any readiness claim. Saving this draft is not evidence those destinations became reachable.

This configuration review does not block application refinement or Git publication. Actual hosted browser QA and Safari verification remain separate until their required access is applied and the tests pass.
