# Local cross-engine floor review

Accepted by the mobile QA role after independently inspecting all sixteen new Chromium and genuine WebKit captures against the user-attached approved Home concept. This is local visual acceptance; complete functional testing and hosted verification remain separate gates.

The metal entry retains distinct brushed/chrome planes, recessed illuminated channels, brackets, bolts and a substantial pedestal. The new glossy floor is visible directly beneath the feet in both engines, including the mirrored ring reflection. The previous persistent black area under the WebKit pedestal and illumination crossing the sport dock are resolved. The fixed ring geometry and approved sport palettes remain intact.

Measured floor geometry is equal between engines: at 393×852, the floor starts at y563 around the gate feet (bottom573) and ends695, six pixels before the dock; at 430×896 it starts608 around the feet (bottom618) and ends735, eight pixels before the dock. The gate-anchored floor has no 3D transform and clips its own effects.

Evidence: `approved-local-captures/manifest.json`, `cross-engine-local-webkit/manifest.json`, and the exact screenshot/source hashes in `cross-engine-floor-review.json`. Both sets bind to the same 184-file runtime manifest, HTML `4060e98aa1fa81b7d8faf553f66af83ec7c772e2bfcf2de2864976d669cec112`, CSS `4f553b24a90493ac5302586d91f4779d46560ae73c408d11d9c2130ba569fe51`.

All four sports were reviewed at both phone sizes with naturally running animations. Loop phases differ between screenshots; the fixed metal and floor positions do not. The approved source is the chat attachment, whose original bytes are unavailable. No pixel-exact identity or physical iPhone/FPS certification is claimed.
