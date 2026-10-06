/* CSS drives the Home light circuit and scenery. This small lifecycle only
   changes their play state; it never runs a frame loop or touches NFL motion. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inViewport = true;
  let pageSuspended = false;

  function syncMotion() {
    let reason = 'active';
    if (reducedMotion.matches) reason = 'reduced-motion';
    else if (pageSuspended) reason = 'pagehide';
    else if (document.hidden) reason = 'hidden';
    else if (!home.isConnected || home.hidden || !home.classList.contains('active')) reason = 'inactive';
    else if (!inViewport) reason = 'offscreen';

    const state = reason === 'active' ? 'running' : reason === 'reduced-motion' ? 'reduced' : 'paused';
    if (home.dataset.homeMotionState !== state) home.dataset.homeMotionState = state;
    if (home.dataset.homeMotionReason !== reason) home.dataset.homeMotionReason = reason;
  }

  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', () => {
    pageSuspended = true;
    syncMotion();
  });
  window.addEventListener('pageshow', () => {
    pageSuspended = false;
    syncMotion();
  });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', syncMotion);
  else reducedMotion.addListener(syncMotion);

  // Routing changes only this section's active class. Decorative-state data
  // attributes are intentionally excluded to avoid observing our own writes.
  const routeChanges = new MutationObserver(syncMotion);
  routeChanges.observe(home, { attributes: true, attributeFilter: ['class', 'hidden'] });

  if ('IntersectionObserver' in window) {
    const ring = home.querySelector('.aperture-rail') || home;
    const viewport = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inViewport = entry.isIntersecting && entry.intersectionRatio > 0;
      syncMotion();
    }, { threshold: [0, .01] });
    viewport.observe(ring);
  }

  syncMotion();
})();
