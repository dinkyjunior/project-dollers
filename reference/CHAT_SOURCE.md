# Approved source used for this refinement

The user supplied the approved eight-screen render as an image attachment in this chat and explicitly instructed that it is the visual source of truth. The user subsequently confirmed that no separate public URL is needed and that inability to write the attachment into the repository must not block visual QA.

The image is visible in the conversation. This environment did not expose its attachment bytes or a download file ID, so no copy was written to `reference/approved_eight_screen_reference.jpg`. That filename remains the expected location if the original attachment becomes directly accessible later. No replacement or reconstructed image is presented as the approved original.

The first three panels in the top row correspond to Home, NFL dashboard and Steelers roster. They were compared with actual browser output at 393×852 and 430×896. Only those three pages were refined. The other five panels were not implemented or modified.

See `qa/REFERENCE_COMPARISON.md` for attachment-based visual observations, `qa/comparisons/` for side-by-side before/after browser evidence, and `qa/results.json` for offline functional results. The comparison artifacts contain browser captures because the original image bytes were unavailable; they do not contain a substitute source panel. The saved results establish material visual improvement, not user approval or pixel identity.
