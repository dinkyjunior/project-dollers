/* Matchup hardware lighting. Native CSS clocks follow route, clipping and
   lifecycle state; no per-frame JavaScript, playback seeking or data mutation. */
(() => {
  'use strict';
  const page = document.querySelector('.page[data-page="matchup-breakdown"]');
  if (!page) return;
  const scroller = page.querySelector('.page-scroll') || page;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const zones = new Set();
  const paused = new Set();
  const svgNS = 'http://www.w3.org/2000/svg';
  let suspended = false;
  let queued = false;
  const style = document.createElement('style');
  style.dataset.mbMotion = 'true';
  style.textContent = [
    '.page[data-page="matchup-breakdown"]{--mb-motion-play-state:paused}',
    '.page[data-page="matchup-breakdown"][data-mb-motion-state="running"]{--mb-motion-play-state:running}',
    '.page[data-page="matchup-breakdown"] .mb-motion-zone{--mb-zone-play-state:paused}',
    '.page[data-page="matchup-breakdown"] .mb-motion-zone[data-mb-motion-visibility="in"]{--mb-zone-play-state:var(--mb-motion-play-state)}',
    '.page[data-page="matchup-breakdown"] .mb-reflection{position:absolute;inset:7px;overflow:hidden;pointer-events:none;z-index:-1;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)}',
    '.page[data-page="matchup-breakdown"] .mb-reflection-sweep{position:absolute;inset:-15% -25%;pointer-events:none;background:linear-gradient(114deg,transparent 33%,#007bff0d 42%,#8eefff1c 48%,transparent 57%);opacity:.46;animation:mb-stadium-reflection 23s ease-in-out infinite;animation-play-state:var(--mb-zone-play-state,paused)}',
    '.page[data-page="matchup-breakdown"] .mb-ambient{overflow:hidden}',
    '.page[data-page="matchup-breakdown"] .mb-ambient>.mb-reflection,.page[data-page="matchup-breakdown"] .mb-brand>.mb-reflection{inset:0;z-index:0}',
    '.page[data-page="matchup-breakdown"] .mb-perimeter-light{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:6}',
    '.page[data-page="matchup-breakdown"] .mb-perimeter-light path{fill:none;stroke:#b5faff;stroke-width:1.55;stroke-linecap:round;stroke-dasharray:58 942;filter:drop-shadow(0 0 2px #19bcff);opacity:.78;animation:mb-perimeter-circuit 12.4s linear infinite;animation-play-state:var(--mb-zone-play-state,paused)}',
    '.page[data-page="matchup-breakdown"] .mb-frame-glints{position:absolute;inset:0;pointer-events:none;z-index:7;background:radial-gradient(ellipse 8px 3px at 21% 2px,#fff9 0%,#69dfff61 24%,transparent 76%),radial-gradient(ellipse 3px 8px at calc(100% - 2px) 72%,#fff9 0%,#69dfff61 24%,transparent 76%),radial-gradient(ellipse 9px 3px at 76% calc(100% - 2px),#fff9 0%,#69dfff61 24%,transparent 76%);opacity:.42;animation:mb-hardware-breathe 7.2s ease-in-out infinite;animation-play-state:var(--mb-zone-play-state,paused)}',
    '.page[data-page="matchup-breakdown"] .mb-diamond-spark{position:absolute;top:50%;left:5px;width:17px;height:17px;pointer-events:none;z-index:7;background:linear-gradient(90deg,transparent 44%,#fff 49% 51%,transparent 56%),linear-gradient(0deg,transparent 45%,#fff 49% 51%,transparent 55%);opacity:.16;transform:translateY(-50%);animation:mb-diamond-scintillation 9.4s ease-in-out infinite;animation-play-state:var(--mb-zone-play-state,var(--mb-motion-play-state,paused))}',
    '.page[data-page="matchup-breakdown"] .mb-diamond-spark.is-right{left:auto;right:5px;animation-delay:-4.7s}',
    '@keyframes mb-perimeter-circuit{from{stroke-dashoffset:0}to{stroke-dashoffset:-1000}}',
    '@keyframes mb-stadium-reflection{0%,100%{transform:translate3d(-9%,-1%,0);opacity:.35}50%{transform:translate3d(9%,1%,0);opacity:.65}}',
    '@keyframes mb-hardware-breathe{0%,100%{opacity:.4}50%{opacity:.8}}',
    '@keyframes mb-diamond-scintillation{0%,37%,60%,100%{opacity:.12;transform:translateY(-50%) scale(.84)}46%{opacity:.82;transform:translateY(-50%) scale(1.07)}52%{opacity:.24;transform:translateY(-50%) scale(.93)}}',
    '@media(prefers-reduced-motion:reduce){.page[data-page="matchup-breakdown"] .mb-perimeter-light path,.page[data-page="matchup-breakdown"] .mb-frame-glints,.page[data-page="matchup-breakdown"] .mb-diamond-spark,.page[data-page="matchup-breakdown"] .mb-reflection-sweep{animation:none!important}.page[data-page="matchup-breakdown"] .mb-perimeter-light path{opacity:.3;stroke-dasharray:0 1000}.page[data-page="matchup-breakdown"] .mb-frame-glints{opacity:.46}.page[data-page="matchup-breakdown"] .mb-diamond-spark{opacity:.16;transform:translateY(-50%)}.page[data-page="matchup-breakdown"] .mb-reflection-sweep{opacity:.35;transform:none}}'
  ].join('\n');
  document.head.append(style);

  function updateOutline(frame) {
    const svg = [...frame.children].find(child => child.classList.contains('mb-perimeter-light'));
    if (!svg) return;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w < 24 || h < 24) return;
    const c = Math.min(10, w / 8, h / 8);
    const d = 'M' + c + ' 2H' + (w - c) + 'L' + (w - 2) + ' ' + c + 'V' + (h - c) +
      'L' + (w - c) + ' ' + (h - 2) + 'H' + c + 'L2 ' + (h - c) + 'V' + c + 'Z';
    if (svg.getAttribute('viewBox') !== '0 0 ' + w + ' ' + h) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    if (svg.firstChild.getAttribute('d') !== d) svg.firstChild.setAttribute('d', d);
  }

  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => {
    for (const entry of entries) if (zones.has(entry.target)) updateOutline(entry.target);
    schedule();
  }) : null;
  const intersections = 'IntersectionObserver' in window ? new IntersectionObserver(schedule, { threshold: [0, .01] }) : null;

  function addZone(zone) {
    if (zones.has(zone)) return;
    zones.add(zone);
    zone.classList.add('mb-motion-zone');
    if (resizeObserver) resizeObserver.observe(zone);
    if (intersections) intersections.observe(zone);
  }

  function reconcile() {
    for (const zone of zones) {
      if (zone.isConnected && page.contains(zone)) continue;
      if (resizeObserver) resizeObserver.unobserve(zone);
      if (intersections) intersections.unobserve(zone);
      zones.delete(zone);
    }
    page.querySelectorAll('.mb-framed,.mb-bottom-nav').forEach(frame => {
      // An empty nav is populated by the controls module on first entry.
      // Decorating it early would make its `children.length` guard misleading.
      if (frame.classList.contains('mb-bottom-nav') && !frame.querySelector('button')) return;
      addZone(frame);
      if ([...frame.children].some(child => child.classList.contains('mb-perimeter-light'))) {
        updateOutline(frame);
        return;
      }
      const svg = document.createElementNS(svgNS, 'svg');
      svg.classList.add('mb-perimeter-light');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('pathLength', '1000');
      svg.append(path);
      const glints = document.createElement('span');
      glints.className = 'mb-frame-glints';
      glints.setAttribute('aria-hidden', 'true');
      frame.append(svg, glints);
      updateOutline(frame);
    });
    page.querySelectorAll('.mb-ambient,.mb-brand,.mb-framed,.mb-bottom-nav').forEach(zone => {
      if (zone.classList.contains('mb-bottom-nav') && !zone.querySelector('button')) return;
      addZone(zone);
      if ([...zone.children].some(child => child.classList.contains('mb-reflection'))) return;
      const reflection = document.createElement('span');
      reflection.className = 'mb-reflection';
      reflection.setAttribute('aria-hidden', 'true');
      const sweep = document.createElement('span');
      sweep.className = 'mb-reflection-sweep';
      reflection.append(sweep);
      zone.append(reflection);
    });
    page.querySelectorAll('.mb-diamond-button').forEach(button => {
      addZone(button);
      if (button.querySelector('.mb-diamond-spark')) return;
      for (const side of ['left', 'right']) {
        const spark = document.createElement('span');
        spark.className = 'mb-diamond-spark is-' + side;
        spark.setAttribute('aria-hidden', 'true');
        button.append(spark);
      }
    });
  }

  function visibleRect(element, clip) {
    const r = element.getBoundingClientRect();
    return !element.closest('[hidden]') && r.width > 0 && r.height > 0 &&
      Math.min(r.right, clip.right) > Math.max(r.left, clip.left) &&
      Math.min(r.bottom, clip.bottom) > Math.max(r.top, clip.top);
  }

  function sync() {
    let reason = 'active';
    if (reduced.matches) reason = 'reduced-motion';
    else if (suspended) reason = 'pagehide';
    else if (document.hidden) reason = 'hidden';
    else if (!page.isConnected || page.hidden || !page.classList.contains('active')) reason = 'inactive';
    const pageRect = page.getBoundingClientRect();
    const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (reason === 'active' && !visibleRect(page, screen)) reason = 'offscreen';
    const state = reason === 'active' ? 'running' : reason === 'reduced-motion' ? 'reduced' : 'paused';
    if (page.dataset.mbMotionState !== state) page.dataset.mbMotionState = state;
    if (page.dataset.mbMotionReason !== reason) page.dataset.mbMotionReason = reason;
    const scrollRect = scroller.getBoundingClientRect();
    for (const zone of zones) {
      const r = zone.closest('.page-scroll') ? scrollRect : pageRect;
      const clip = { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(innerWidth, r.right), bottom: Math.min(innerHeight, r.bottom) };
      const visibility = state === 'running' && visibleRect(zone, clip) ? 'in' : 'out';
      if (zone.dataset.mbMotionVisibility !== visibility) zone.dataset.mbMotionVisibility = visibility;
    }
    if (typeof page.getAnimations !== 'function') return;
    const animations = page.getAnimations({ subtree: true });
    const present = new Set(animations);
    for (const a of paused) if (!present.has(a)) paused.delete(a);
    for (const a of animations) {
      const effect = a.effect;
      const target = effect && effect.target;
      if (!target || !page.contains(target) || !a.animationName || !a.animationName.startsWith('mb-') || effect.getComputedTiming().iterations !== Infinity) continue;
      const zone = target.closest('.mb-motion-zone');
      const css = getComputedStyle(target, effect.pseudoElement || null);
      const active = state === 'running' && !target.closest('[hidden]') && css.visibility !== 'hidden' && css.display !== 'none' && (!zone || zone.dataset.mbMotionVisibility === 'in') && css.animationPlayState !== 'paused';
      if (!active && a.playState === 'running') { a.pause(); paused.add(a); }
      else if (active && paused.has(a)) { if (a.playState === 'paused') a.play(); paused.delete(a); }
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; reconcile(); sync(); });
  }
  new MutationObserver(schedule).observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  document.addEventListener('pd:matchup-render', schedule);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => { suspended = true; sync(); });
  window.addEventListener('pageshow', () => { suspended = false; schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  scroller.addEventListener('scroll', schedule, { passive: true });
  if (reduced.addEventListener) reduced.addEventListener('change', schedule);
  else reduced.addListener(schedule);
  if (document.fonts) {
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
  }
  reconcile();
  sync();
})();
