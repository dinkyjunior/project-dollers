/* CSS drives the Home light circuit and scenery. This event-driven lifecycle
   controls visibility and native playback; it never runs a frame loop or
   changes animation phases, and never touches NFL motion. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inViewport = true;
  let pageSuspended = false;
  let lastSport = home.dataset.homeSport;
  let revealSequence = false;
  let revealTimer;
  const suspendedAnimations = new Set();

  function clearReveal() {
    window.clearTimeout(revealTimer);
    delete home.dataset.homeReveal;
  }

  function revealSelectedLeague() {
    if (home.dataset.homeMotionState !== 'running') return;
    window.clearTimeout(revealTimer);
    // Alternating animation names restart a tiny selection arrival without a
    // forced layout or frame loop. This never moves the entrance or its colours.
    revealSequence = !revealSequence;
    home.dataset.homeReveal = revealSequence ? 'a' : 'b';
    revealTimer = window.setTimeout(clearReveal, 340);
  }

  function syncNativePlayback(state) {
    if (typeof home.getAnimations !== 'function') return;
    // WebKit can retain running native clocks after display:none even when its
    // computed CSS play-state is paused. Apply that same lifecycle decision to
    // native objects only at events; retain phases without a rendering loop.
    const animations = home.getAnimations({ subtree: true });
    const present = new Set(animations);
    for (const animation of suspendedAnimations) {
      if (!present.has(animation)) suspendedAnimations.delete(animation);
    }
    for (const animation of animations) {
      const effect = animation.effect;
      const target = effect && effect.target;
      if (!target || !home.contains(target) || effect.getComputedTiming().iterations !== Infinity) continue;
      const visibleSport = !target.closest('[hidden]');
      const style = getComputedStyle(target, effect.pseudoElement || null);
      const eligible = state === 'running' && visibleSport && style.animationPlayState !== 'paused';
      if (!eligible) {
        if (animation.playState === 'running') {
          animation.pause();
          suspendedAnimations.add(animation);
        }
      } else if (suspendedAnimations.has(animation)) {
        // Only resume objects this controller suspended and which remain in
        // this Home subtree; cancelled/replaced and hidden sports stay alone.
        if (animation.playState === 'paused') animation.play();
        suspendedAnimations.delete(animation);
      }
    }
  }

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
    if (state !== 'running') clearReveal();
    syncNativePlayback(state);
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
  const routeChanges = new MutationObserver(() => {
    syncMotion();
    const selectedSport = home.dataset.homeSport;
    if (selectedSport !== lastSport) {
      lastSport = selectedSport;
      revealSelectedLeague();
    }
  });
  routeChanges.observe(home, { attributes: true, attributeFilter: ['class', 'hidden', 'data-home-sport'] });

  if ('IntersectionObserver' in window) {
    const ring = home.querySelector('.aperture-gate') || home.querySelector('.aperture-rail') || home;
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
