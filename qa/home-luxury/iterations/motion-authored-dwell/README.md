The first luxury motion run failed a test-only expectation that both early
natural frames must show architectural translation. The product keyframes
intentionally hold that reflection at its initial position from 0% through
15% of its 19-second cycle (2.85 seconds). No application source changed.

The exact failed helper, source manifest, report and captured frames are saved
here. The corrected helper observes bounded additional naturally running time
before requiring movement. It does not seek animation phases, modify duration,
pause for exposure, replace artwork, or relax the movement requirement.
