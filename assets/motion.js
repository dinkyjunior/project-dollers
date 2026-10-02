(() => {
  "use strict";
  const shell = document.querySelector(".app-shell");
  if (!shell) return;

  // Keep every decorative layer still in background tabs, including browsers
  // that use the stylesheet's fallback instead of the measured SVG card path.
  function syncVisibility() {
    shell.classList.toggle("motion-paused", document.hidden);
  }
  document.addEventListener("visibilitychange", syncVisibility);
  window.addEventListener("pagehide", () => shell.classList.add("motion-paused"));
  window.addEventListener("pageshow", syncVisibility);
  syncVisibility();
  if (!window.ResizeObserver || !window.IntersectionObserver ||
      !CSS.supports("offset-path", 'path("M 0 0 L 1 1")')) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const tracked = new Map();
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      entry.target.classList.toggle("motion-in-view", entry.isIntersecting);
    }
  }, { threshold: 0 });

  function roundedPerimeter(width, height, radius) {
    // Half-pixel inset aligns the path with the centre of the 1px card border.
    const x = .5, y = .5, right = width - .5, bottom = height - .5;
    const r = Math.max(0, Math.min(radius - .5, (width - 1) / 2, (height - 1) / 2));
    return `M ${x + r} ${y} H ${right - r} A ${r} ${r} 0 0 1 ${right} ${y + r} V ${bottom - r} A ${r} ${r} 0 0 1 ${right - r} ${bottom} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${bottom - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }

  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target;
      const track = tracked.get(card);
      if (!track) continue;
      const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
      const width = box ? box.inlineSize : card.offsetWidth;
      const height = box ? box.blockSize : card.offsetHeight;
      // Hidden pages report zero; keep their prior track until displayed again.
      if (width < 2 || height < 2) continue;
      const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 16;
      const geometry = `${width}:${height}:${radius}`;
      if (track.geometry === geometry) continue;
      track.geometry = geometry;
      const d = roundedPerimeter(width, height, radius);
      track.svg.setAttribute("width", String(width));
      track.svg.setAttribute("height", String(height));
      track.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      for (const path of track.paths) path.setAttribute("d", d);
      card.style.setProperty("--card-perimeter", `path("${d}")`);
      // Long research cards get a longer lap, rather than sending the football
      // racing down thousands of pixels. Both light paths share this duration.
      const r = Math.max(0, Math.min(radius - .5, (width - 1) / 2, (height - 1) / 2));
      const perimeter = 2 * (width + height - 2) - 8 * r + 2 * Math.PI * r;
      card.style.setProperty("--orbit-duration", `${Math.max(9, perimeter / 110).toFixed(3)}s`);
      card.classList.add("motion-track-ready");
    }
  });

  function attach(card) {
    if (tracked.has(card)) return;
    let ball = card.querySelector(".orbit-football");
    if (!ball) {
      ball = document.createElement("span");
      ball.className = "orbit-football";
      ball.setAttribute("aria-hidden", "true");
      card.append(ball);
    }
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("card-perimeter-light");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const paths = ["perimeter-light-bloom", "perimeter-light-core"].map((name) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.classList.add(name);
      path.setAttribute("pathLength", "100");
      svg.append(path);
      return path;
    });
    card.append(svg);
    tracked.set(card, { svg, paths, geometry: "" });
    sizes.observe(card);
    visibility.observe(card);
  }

  function reconcile() {
    for (const card of tracked.keys()) {
      if (card.isConnected) continue;
      sizes.unobserve(card);
      visibility.unobserve(card);
      tracked.delete(card);
    }
    shell.querySelectorAll(".player-card").forEach(attach);
  }
  // Roster filters, week selection and verified-data refreshes replace cards.
  // Observe structural changes only; no frame loop or animation-time layout read.
  new MutationObserver(reconcile).observe(shell, { childList: true, subtree: true });
  reconcile();
})();
