/* NFL illumination lifecycle. Browser-native transform/opacity clocks retain
   their phases, with no requestAnimationFrame loop or interval polling. */
(() => {
  'use strict';
  const nfl = document.querySelector('.page[data-page="nfl"].nfl-dashboard-root');
  if (!nfl) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const zones = new Set();
  const suspended = new Set();
  let pageSuspended = false;
  let inViewport = true;
  let queued = false;

  const zoneObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      entry.target.dataset.nflMotionVisibility = entry.isIntersecting && entry.intersectionRatio > 0 ? 'in' : 'out';
    }
    syncMotion();
  }, { root: nfl.querySelector('.page-scroll'), threshold: [0, .01] }) : null;

  function reconcileZones() {
    for (const zone of zones) {
      if (zone.isConnected && nfl.contains(zone)) continue;
      if (zoneObserver) zoneObserver.unobserve(zone);
      zones.delete(zone);
    }
    nfl.querySelectorAll('.nfl-motion-zone').forEach(zone => {
      if (zones.has(zone)) return;
      zones.add(zone);
      zone.dataset.nflMotionVisibility = zoneObserver ? 'out' : 'in';
      if (zoneObserver) zoneObserver.observe(zone);
    });
  }

  function syncNativePlayback(state) {
    if (typeof nfl.getAnimations !== 'function') return;
    const animations = nfl.getAnimations({ subtree: true });
    const present = new Set(animations);
    for (const animation of suspended) {
      if (!present.has(animation)) suspended.delete(animation);
    }
    for (const animation of animations) {
      const effect = animation.effect;
      const target = effect && effect.target;
      // Preserve the separate global card/Home controllers and finite route
      // transitions; this controller owns only its NFL decorative animations.
      if (!target || !nfl.contains(target) || effect.getComputedTiming().iterations !== Infinity) continue;
      const name = animation.animationName;
      if (name && !name.startsWith('nfl-')) continue;
      const zone = target.closest('.nfl-motion-zone');
      const style = getComputedStyle(target, effect.pseudoElement || null);
      const eligible = state === 'running' && !target.closest('[hidden]') &&
        style.visibility !== 'hidden' && style.display !== 'none' &&
        (!zone || zone.dataset.nflMotionVisibility === 'in') && style.animationPlayState !== 'paused';
      if (!eligible) {
        if (animation.playState === 'running') {
          animation.pause();
          suspended.add(animation);
        }
      } else if (suspended.has(animation)) {
        // Match computed CSS and native WebKit playback, resuming only clocks
        // paused here, with no currentTime writes or restarted light phases.
        if (animation.playState === 'paused') animation.play();
        suspended.delete(animation);
      }
    }
  }

  function syncMotion() {
    let reason = 'active';
    if (reducedMotion.matches) reason = 'reduced-motion';
    else if (pageSuspended) reason = 'pagehide';
    else if (document.hidden) reason = 'hidden';
    else if (!nfl.isConnected || nfl.hidden || !nfl.classList.contains('active')) reason = 'inactive';
    else if (!inViewport) reason = 'offscreen';
    const state = reason === 'active' ? 'running' : reason === 'reduced-motion' ? 'reduced' : 'paused';
    if (state === 'running' && nfl.dataset.nflMotionState !== state && zoneObserver) {
      // A masked scroll root may first be observed while its route is hidden.
      // Request fresh intersection entries on actual activation/restoration,
      // rather than retaining WebKit's earlier hidden-layout intersections.
      for (const zone of zones) {
        zoneObserver.unobserve(zone);
        zoneObserver.observe(zone);
      }
    }
    if (nfl.dataset.nflMotionState !== state) nfl.dataset.nflMotionState = state;
    if (nfl.dataset.nflMotionReason !== reason) nfl.dataset.nflMotionReason = reason;
    syncNativePlayback(state);
  }

  function reconcileAndSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      reconcileZones();
      syncMotion();
    });
  }

  new MutationObserver(reconcileAndSync).observe(nfl, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden']
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inViewport = entry.isIntersecting && entry.intersectionRatio > 0;
      syncMotion();
    }, { threshold: [0, .01] }).observe(nfl);
  }
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', () => { pageSuspended = true; syncMotion(); });
  window.addEventListener('pageshow', () => { pageSuspended = false; syncMotion(); });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', syncMotion);
  else reducedMotion.addListener(syncMotion);

  reconcileZones();
  syncMotion();
})();
