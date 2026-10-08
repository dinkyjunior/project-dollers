/* Team-details light hardware. Native animation clocks follow real route,
   clipping and lifecycle state; no polling or synthetic animation phases. */
(() => {
  'use strict';
  const page = document.querySelector('.page[data-page="team-details"]');
  if (!page) return;
  const scroller = page.querySelector('.page-scroll') || page;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const zones = new Set();
  const paused = new Set();
  const svgNS = 'http://www.w3.org/2000/svg';
  let pageSuspended = false;
  let queued = false;
  const style = document.createElement('style');
  style.dataset.tdMotion = 'true';
  style.textContent = [
    '.page[data-page="team-details"]{--td-motion-play-state:paused}',
    '.page[data-page="team-details"][data-td-motion-state="running"]{--td-motion-play-state:running}',
    '.page[data-page="team-details"] .td-motion-zone{--td-zone-play-state:paused}',
    '.page[data-page="team-details"] .td-motion-zone[data-td-motion-visibility="in"]{--td-zone-play-state:var(--td-motion-play-state)}',
    '.page[data-page="team-details"] .td-stadium-reflection{position:absolute;inset:7px;overflow:hidden;pointer-events:none;z-index:-1;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)}',
    '.page[data-page="team-details"] .td-stadium-reflection-sweep{position:absolute;inset:-15% -25%;pointer-events:none;background:linear-gradient(114deg,transparent 33%,#007bff12 42%,#8eefff22 48%,transparent 57%);opacity:.55;animation:td-stadium-reflection 23s ease-in-out infinite;animation-play-state:var(--td-zone-play-state,paused)}',
    '.page[data-page="team-details"] .td-ambient{overflow:hidden}',
    '.page[data-page="team-details"] .td-ambient>.td-stadium-reflection,.page[data-page="team-details"] .team-brand>.td-stadium-reflection{inset:0;z-index:0}',
    '.page[data-page="team-details"] .td-framed::after{animation:td-join-breathe 6.8s ease-in-out infinite;animation-play-state:var(--td-zone-play-state,paused)}',
    '.page[data-page="team-details"] .td-perimeter-light{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:6}',
    '.page[data-page="team-details"] .td-perimeter-light path{fill:none;stroke:#b5faff;stroke-width:1.65;stroke-linecap:round;stroke-dasharray:62 938;filter:drop-shadow(0 0 2px #19bcff);opacity:.85;animation:td-perimeter-circuit 11.4s linear infinite;animation-play-state:var(--td-zone-play-state,paused)}',
    '.page[data-page="team-details"] .td-frame-glints{position:absolute;inset:0;pointer-events:none;z-index:7;background:radial-gradient(ellipse 9px 3px at 21% 2px,#fff9 0%,#69dfff61 24%,transparent 76%),radial-gradient(ellipse 3px 9px at calc(100% - 2px) 72%,#fff9 0%,#69dfff61 24%,transparent 76%),radial-gradient(ellipse 10px 3px at 76% calc(100% - 2px),#fff9 0%,#69dfff61 24%,transparent 76%);opacity:.44;animation:td-hardware-breathe 7.2s ease-in-out infinite;animation-play-state:var(--td-zone-play-state,paused)}',
    '.page[data-page="team-details"] .td-diamond-spark{position:absolute;top:50%;left:7px;width:22px;height:22px;pointer-events:none;z-index:7;background:linear-gradient(90deg,transparent 44%,#fff 49% 51%,transparent 56%),linear-gradient(0deg,transparent 45%,#fff 49% 51%,transparent 55%);opacity:.17;transform:translateY(-50%);animation:td-diamond-scintillation 9.4s ease-in-out infinite;animation-play-state:var(--td-zone-play-state,var(--td-motion-play-state,paused))}',
    '.page[data-page="team-details"] .td-diamond-spark.is-right{left:auto;right:7px;animation-delay:-4.7s}',
    '@keyframes td-perimeter-circuit{from{stroke-dashoffset:0}to{stroke-dashoffset:-1000}}',
    '@keyframes td-stadium-reflection{0%,100%{transform:translate3d(-9%,-1%,0);opacity:.4}50%{transform:translate3d(9%,1%,0);opacity:.74}}',
    '@keyframes td-join-breathe{0%,100%{opacity:.7}50%{opacity:1}}',
    '@keyframes td-hardware-breathe{0%,100%{opacity:.42}50%{opacity:.86}}',
    '@keyframes td-diamond-scintillation{0%,37%,60%,100%{opacity:.12;transform:translateY(-50%) scale(.84)}46%{opacity:.86;transform:translateY(-50%) scale(1.07)}52%{opacity:.24;transform:translateY(-50%) scale(.93)}}',
    '@media(prefers-reduced-motion:reduce){.page[data-page="team-details"] .td-perimeter-light path,.page[data-page="team-details"] .td-frame-glints,.page[data-page="team-details"] .td-diamond-spark,.page[data-page="team-details"] .td-stadium-reflection-sweep,.page[data-page="team-details"] .td-framed::after{animation:none!important}.page[data-page="team-details"] .td-perimeter-light path{opacity:.36;stroke-dasharray:0 1000}.page[data-page="team-details"] .td-frame-glints{opacity:.48}.page[data-page="team-details"] .td-diamond-spark{opacity:.17;transform:translateY(-50%)}.page[data-page="team-details"] .td-stadium-reflection-sweep{opacity:.45;transform:none}.page[data-page="team-details"] .td-framed::after{opacity:.84}}'
  ].join('\n');
  document.head.append(style);

  function updateOutline(frame) {
    const svg = [...frame.children].find(child => child.classList.contains('td-perimeter-light'));
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

  function reconcile() {
    for (const frame of zones) {
      if (frame.isConnected && page.contains(frame)) continue;
      if (resizeObserver) resizeObserver.unobserve(frame);
      if (intersections) intersections.unobserve(frame);
      zones.delete(frame);
    }
    page.querySelectorAll('.td-panel,.td-hero,.td-upcoming,.td-bottom-nav').forEach(frame => {
      if (!zones.has(frame)) {
        zones.add(frame);
        frame.classList.add('td-motion-zone');
        if (resizeObserver) resizeObserver.observe(frame);
        if (intersections) intersections.observe(frame);
      }
      if ([...frame.children].some(child => child.classList.contains('td-perimeter-light'))) {
        updateOutline(frame);
        return;
      }
      const svg = document.createElementNS(svgNS, 'svg');
      svg.classList.add('td-perimeter-light');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('pathLength', '1000');
      svg.append(path);
      const glints = document.createElement('span');
      glints.className = 'td-frame-glints';
      glints.setAttribute('aria-hidden', 'true');
      frame.append(svg, glints);
      updateOutline(frame);
    });
    page.querySelectorAll('.td-ambient,.team-brand,.td-hero,.td-upcoming').forEach(zone => {
      if (!zones.has(zone)) {
        zones.add(zone);
        zone.classList.add('td-motion-zone');
        if (resizeObserver) resizeObserver.observe(zone);
        if (intersections) intersections.observe(zone);
      }
      if ([...zone.children].some(child => child.classList.contains('td-stadium-reflection'))) return;
      const reflection = document.createElement('span');
      reflection.className = 'td-stadium-reflection';
      reflection.setAttribute('aria-hidden', 'true');
      const sweep = document.createElement('span');
      sweep.className = 'td-stadium-reflection-sweep';
      reflection.append(sweep);
      zone.append(reflection);
    });
    page.querySelectorAll('.td-diamond-button').forEach(button => {
      if (!zones.has(button)) {
        zones.add(button);
        button.classList.add('td-motion-zone');
        if (resizeObserver) resizeObserver.observe(button);
        if (intersections) intersections.observe(button);
      }
      if (button.querySelector('.td-diamond-spark')) return;
      for (const side of ['left', 'right']) {
        const spark = document.createElement('span');
        spark.className = 'td-diamond-spark is-' + side;
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
    else if (pageSuspended) reason = 'pagehide';
    else if (document.hidden) reason = 'hidden';
    else if (!page.isConnected || page.hidden || !page.classList.contains('active')) reason = 'inactive';
    const pageRect = page.getBoundingClientRect();
    const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (reason === 'active' && !visibleRect(page, screen)) reason = 'offscreen';
    const state = reason === 'active' ? 'running' : reason === 'reduced-motion' ? 'reduced' : 'paused';
    if (page.dataset.tdMotionState !== state) page.dataset.tdMotionState = state;
    if (page.dataset.tdMotionReason !== reason) page.dataset.tdMotionReason = reason;
    const scrollRect = scroller.getBoundingClientRect();
    for (const zone of zones) {
      const r = zone.closest('.page-scroll') ? scrollRect : pageRect;
      const clip = { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(innerWidth, r.right), bottom: Math.min(innerHeight, r.bottom) };
      const visibility = state === 'running' && visibleRect(zone, clip) ? 'in' : 'out';
      if (zone.dataset.tdMotionVisibility !== visibility) zone.dataset.tdMotionVisibility = visibility;
    }
    if (typeof page.getAnimations !== 'function') return;
    const animations = page.getAnimations({ subtree: true });
    const present = new Set(animations);
    for (const a of paused) if (!present.has(a)) paused.delete(a);
    for (const a of animations) {
      const effect = a.effect;
      const target = effect && effect.target;
      if (!target || !page.contains(target) || !a.animationName || !a.animationName.startsWith('td-') || effect.getComputedTiming().iterations !== Infinity) continue;
      const zone = target.closest('.td-motion-zone');
      const css = getComputedStyle(target, effect.pseudoElement || null);
      const active = state === 'running' && !target.closest('[hidden]') && css.visibility !== 'hidden' && css.display !== 'none' && (!zone || zone.dataset.tdMotionVisibility === 'in') && css.animationPlayState !== 'paused';
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
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => { pageSuspended = true; sync(); });
  window.addEventListener('pageshow', () => { pageSuspended = false; schedule(); });
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
