# Independent native Home review

The new editorial Home passes the native Chromium layout and control audit. No application source, fonts, assets, data, storage or network routes were mocked during this review.

## Evidence

- `native-review-2/results.json`: initial integrated four-size audit at 393 × 852 and 430 × 896 with DPR 2 and touch, plus 768 × 1024 and 1440 × 1000. All passed, including coming-soon responses, menu keyboard focus and Escape, both NFL entry points, Home → NFL → Home, direct load and refresh, reduced motion, and error/overflow checks.
- `native-final-phones/results.json`: the two native phone sizes and reduced-motion checks passed again after the background crop and NFL row fill were refined.
- `native-final-feather/results.json`: bounded native render, image decode, horizontal overflow and reduced-motion checks passed after the final decorative top-feather patch. Natural Home heights remained 890px at 393px width and 957px at 430px width.
- Every audit closed its browser and contexts. Source manifests remained unchanged during each successful run.
- `native-review-1/results.json` preserves the initial helper failure: it expected a nonexistent `data-home-sport="nfl"` selector. The actual available NFL row uses `data-open="nfl"`. This was a test selector assumption, corrected before the successful integrated audit; it was not an application failure.

## Native final screenshots

- `native-final-feather/home-top-393.png`: actual 393 × 852 viewport at DPR 2.
- `native-final-feather/home-bottom-430.png`: actual 430 × 896 viewport at DPR 2 after scrolling to the footer.

## Full composition previews

- `native-final-feather/COMPOSITION-home-393.png`: 393 × 890 CSS viewport, rendered at DPR 2.
- `native-final-feather/COMPOSITION-home-430.png`: 430 × 957 CSS viewport, rendered at DPR 2.

These two previews resize only the browser viewport height to the natural content height. They do not alter DOM styles or source. They show the complete composition for desktop viewing, and are **not** evidence of the native 852px or 896px phone viewport.

## Visual review

The final crop retains the full field and stadium exterior, moves the skyline below the large headline, smooths the image's top edge, and preserves the render's header, two-line copy, white pill entry, editorial sport rows and quiet footer. The 860px mobile background supports 430px screens at DPR 2; the 2156px transparent wordmark and vector league marks render cleanly at their displayed sizes.

The NFL dashboard retains its compact 393px or 430px frame after entering from Home. Vertical Home scrolling is intentional, and the footer is reachable without horizontal overflow.

This evidence certifies local Chromium behavior and layout. It does not certify real iPhone Safari, the hosted release or current NFL data. Those remain separate verification requirements.
