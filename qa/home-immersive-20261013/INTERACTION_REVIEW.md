# Immersive Home interaction review

Bounded read-only verification of the frozen four-sport Home against `http://127.0.0.1:8000/project-dollers/`. The existing edge helper was updated in `/tmp` to target the new immersive image filenames. No application code, artwork, data or previous QA files were edited.

**7/7 native Chromium checks passed**, with zero JavaScript errors and the browser closed. The receipt is `interaction-edge-results-v1.json`; `interaction-edge-check.cjs` is the executed helper.

- Initial NFL artwork was actually decoded before readiness.
- A deliberately delayed NBA image followed by NRL → NFL selection retained the latest NFL scene. NBA entry and topics were disabled synchronously, before decoding.
- A deliberately failed UFC image hid the previous venue, kept UFC unavailable for entry and recovered when NFL was selected. The intentional image fault is identified separately in the receipt.
- NBA selection survived a direct Home refresh while retaining disabled entry.
- Resizing 393 → 431 → 393 px loaded the correct immersive desktop/mobile portrait source, without changing the selected sport.
- A direct NFL route retained the hidden selected Home preview and paused its motion.
- Blocked optional session storage did not break selection; refresh safely used NFL as the default.

Source review confirms that the four selectors, accessible names and pressed states remain independent of removed visible copy. Menu links explicitly target existing NFL research destinations. Only NFL enables Home entry and topic controls. The latest-selection guards cover both image success and failure; image failure cannot leave another sport's venue presented as the selected scene.

This receipt certifies the bounded local native checks above. Hosted delivery, Safari and sports-data freshness are separate checks.
