# Immersive portrait Home native audit

`native-immersive-v1/results.json` records a passing frozen-source audit at 393 × 852 and 430 × 896 with DPR 2 and touch, plus 768 × 1024 and 1440 × 1000 desktop. Sixteen top-state screenshots and four native bottom screenshots are retained.

All four selected backgrounds have native 2:3 portrait dimensions, fill the complete canvas width, begin above the branded header and extend behind the entire entry button. NBA, NRL and UFC use the new explicit `editorial-immersive-{sport}` asset paths. Their hashes differ from both the earlier outdoor pictures and the separate landscape interior strips. The approved NFL scene pair and refined wordmark remain byte-identical to the saved baseline.

The taglines and sport-row name nodes remain absent. Larger logos retain `object-fit: contain` and accessible Select NFL/NBA/NRL/UFC labels. Only NFL enables entry and research topics. The menu, Escape focus return, entering NFL and returning to Home passed. Home and NFL shell position, width and height match exactly at all four sizes.

The bottom audit confirms every larger sport selector and the footer are reachable inside the native scrolling frame. Four-state reduced motion passed. No broken accessible references, horizontal overflow, JavaScript, console, HTTP or failed-request errors were found. Source manifests remained unchanged during execution, and all contexts and browsers were closed.

Original-detail visual review shows continuous venue scenery through the header and entry, with the entire basketball court, rugby field and large cage visible. The pictures are decorative generated scenery, not verified venue photography or sports data.

These results certify local Chromium behavior and layout. Safari, hosted delivery and current NFL data accuracy remain separate checks.
