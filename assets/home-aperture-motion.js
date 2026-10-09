/* Home's existing event-driven visibility controller owns playback. This file
   installs lightweight, pointer-free decorations once; it has no frame loop,
   interval, route observer, data listener or animation restart on refresh. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home || home.dataset.homeGemMotionInstalled === 'true') return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const selectorSports = new Set(['nfl', 'nba', 'nrl', 'ufc']);
  const track = 'M16 4H84Q96 4 96 16V84Q96 96 84 96H16Q4 96 4 84V16Q4 4 16 4Z';

  function svgElement(name, attributes) {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function addRingSpecularGradient() {
    const channel = home.querySelector('.aperture-channel-art');
    if (!channel || channel.querySelector('#home-aperture-moving-specular')) return;
    let defs = channel.querySelector('defs');
    if (!defs) {
      defs = svgElement('defs', {});
      channel.prepend(defs);
    }
    const gradient = svgElement('linearGradient', {
      id: 'home-aperture-moving-specular', x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    for (const [offset, side] of [['0%', 'left'], ['49.9%', 'left'], ['50%', 'right'], ['100%', 'right']]) {
      gradient.append(svgElement('stop', {
        offset, 'stop-color': 'var(--home-motion-highlight-' + side + ')'
      }));
    }
    defs.append(gradient);
  }

  function addSelectorCircuit(button, sport, index) {
    if (button.querySelector('.home-gem-selector-circuit')) return;
    if (!selectorSports.has(sport)) return;
    const id = 'home-gem-circuit-' + sport;
    const circuit = svgElement('svg', {
      class: 'home-gem-selector-circuit', viewBox: '0 0 100 100',
      preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
    });
    circuit.style.setProperty('--home-gem-circuit-duration', (6.7 + index * .73) + 's');
    circuit.style.setProperty('--home-gem-circuit-delay', (-index * 1.61 - .42) + 's');
    const defs = svgElement('defs', {});
    const gradient = svgElement('linearGradient', {
      id, x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    // Each button owns its fixed sport colours. The selected sport changes
    // the surrounding room, never the four individual selector gradients.
    for (const [offset, side] of [['0%', 'left'], ['49.9%', 'left'], ['50%', 'right'], ['100%', 'right']]) {
      gradient.append(svgElement('stop', {
        offset, 'stop-color': 'var(--gem-selector-' + side + ')'
      }));
    }
    defs.append(gradient);
    circuit.append(defs);
    for (const part of ['tail', 'hot', 'pin']) {
      const path = svgElement('path', {
        class: 'home-gem-selector-' + part, d: track, pathLength: '1000',
        fill: 'none', stroke: part === 'pin' ? '#f4ffff' : 'url(#' + id + ')',
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      circuit.append(path);
    }
    button.append(circuit);
  }

  function addGlint(parent, x, y, kind, ordinal) {
    const glint = document.createElement('span');
    glint.className = 'home-gem-glint home-gem-glint-' + kind;
    glint.setAttribute('aria-hidden', 'true');
    glint.style.left = x + '%';
    glint.style.top = y + '%';
    // Randomised once per page load, so glints remain asynchronous without
    // animation frames, repeated layout writes or unpredictable route timers.
    const duration = (kind === 'ring' ? 9 : 5.8) + Math.random() * 4.8;
    glint.style.setProperty('--home-gem-glint-duration', duration.toFixed(3) + 's');
    glint.style.setProperty('--home-gem-glint-delay', (-Math.random() * duration - ordinal * .17).toFixed(3) + 's');
    glint.style.setProperty('--home-gem-glint-angle', (ordinal % 2 ? 18 : -12) + 'deg');
    parent.append(glint);
  }

  addRingSpecularGradient();

  [...home.querySelectorAll('[data-home-select]')].forEach((button, index) => {
    addSelectorCircuit(button, button.dataset.homeSelect, index);
  });

  const entry = home.querySelector('[data-home-entry]');
  if (entry) {
    // The original native CTA and its accessible label/navigation are intact.
    // The gemstone stylesheet turns these existing wrappers into clear caps.
    for (const [index, side] of ['left', 'right'].entries()) {
      let cap = entry.querySelector('.home-entry-diamond.is-' + side);
      if (!cap) {
        cap = document.createElement('span');
        cap.className = 'home-entry-diamond is-' + side;
        cap.setAttribute('aria-hidden', 'true');
        entry.append(cap);
      }
      if (!cap.querySelector('.home-gem-glint')) {
        // These points follow the white specular hits and cut intersections
        // in the native jewel endcaps, leaving the dark centre text clear.
        const facets = side === 'left'
          ? [[57, 10], [19, 72], [77, 48]]
          : [[43, 16], [81, 76], [23, 52]];
        facets.forEach(([x, y], ordinal) => {
          addGlint(cap, x, y, 'cap', index * 3 + ordinal);
        });
      }
      if (!cap.querySelector('.home-gem-facet-reflection')) {
        const reflection = document.createElement('span');
        reflection.className = 'home-gem-facet-reflection';
        reflection.setAttribute('aria-hidden', 'true');
        const duration = 9.7 + Math.random() * 4.4;
        reflection.style.setProperty('--home-gem-facet-duration', duration.toFixed(3) + 's');
        reflection.style.setProperty('--home-gem-facet-delay', (-Math.random() * duration).toFixed(3) + 's');
        cap.append(reflection);
      }
    }
    if (!entry.querySelector('.home-gem-glint-edge')) {
      addGlint(entry, 24, 4, 'edge', 7);
      addGlint(entry, 78, 94, 'edge', 8);
    }
  }

  const gate = home.querySelector('.aperture-gate');
  if (gate && !gate.querySelector('.home-gem-glint-ring')) {
    // Points sit on metal seams outside the emblem/venue; no highlight is
    // painted over a league logo or control label.
    [[14, 30], [86, 30], [32, 94], [68, 94]].forEach(([x, y], index) => {
      addGlint(gate, x, y, 'ring', 10 + index);
    });
  }

  home.dataset.homeGemMotionInstalled = 'true';
})();
