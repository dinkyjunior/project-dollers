/* Home's existing event-driven visibility controller owns playback. This file
   installs lightweight, pointer-free decorations once; it has no frame loop,
   interval, route observer, data listener or animation restart on refresh. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home || home.dataset.homeGemMotionInstalled === 'true') return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const selectorSports = new Set(['nfl', 'nba', 'nrl', 'ufc']);
  const selectorCircuits = new Map();

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
        class: 'home-gem-selector-' + part, pathLength: '1000',
        fill: 'none', stroke: part === 'pin' ? '#f4ffff' : 'url(#' + id + ')',
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      circuit.append(path);
    }
    button.append(circuit);
    selectorCircuits.set(button, circuit);
    measureSelectorCircuit(button);
  }

  function measureSelectorCircuit(button) {
    const circuit = selectorCircuits.get(button);
    if (!circuit) return;
    const width = button.offsetWidth;
    const height = button.offsetHeight;
    if (!width || !height) return;
    const radius = Math.min(12, width / 2, height / 2);
    circuit.setAttribute('viewBox', `0 0 ${width + 4} ${height + 4}`);
    // SVG coordinates use this native button's measured pixels. The highlight
    // follows the actual twelve-pixel corner rather than stretching a square.
    const d = `M${2 + radius} 2H${2 + width - radius}Q${2 + width} 2 ${2 + width} ${2 + radius}V${2 + height - radius}Q${2 + width} ${2 + height} ${2 + width - radius} ${2 + height}H${2 + radius}Q2 ${2 + height} 2 ${2 + height - radius}V${2 + radius}Q2 2 ${2 + radius} 2Z`;
    circuit.querySelectorAll('path').forEach(path => path.setAttribute('d', d));
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

  function installBrandLighting() {
    const brand = home.querySelector('.home-header .brand');
    if (!brand || brand.querySelector('.home-brand-lighting')) return;
    // These coordinates belong to the approved, unchanged 1800 × 693 wordmark.
    // Inset face outlines exclude the gold mounts, letter counters, background
    // and green moneybag. Points were sampled on existing bright crystal facets.
    // This gives every PROJECT letter distributed scintillation; the individual
    // diamonds in the raster artwork are not separately editable objects.
    const crystalLetters = [
      ['P', 'M72 76H220L245 99V204L220 229H146V305H72V267H86V120H72Z M145 124H193V184H145Z',
        [[167,90],[128,111],[233,90],[92,153],[218,147],[143,150],[230,210],[95,192],[152,213],[137,252],[185,216],[107,225],[143,291],[89,267],[104,294]]],
      ['R', 'M288 76H417L446 104V201L403 224L446 305H386L345 235H338V305H288Z M335 120H394V184H335Z',
        [[383,117],[416,93],[311,84],[317,153],[428,150],[398,144],[365,198],[311,198],[428,198],[389,219],[404,258],[326,240],[404,294],[296,270],[329,288]]],
      ['O', 'M510 76H612L638 103V277L612 303H510L484 277V103Z M530 121H591V266H530Z',
        [[543,99],[588,93],[513,105],[615,153],[501,135],[630,123],[519,204],[495,183],[630,192],[603,213],[609,243],[498,231],[552,282],[510,282],[618,285]]],
      ['J', 'M775 77H822V279L797 305H695L677 286V224H719V266H775Z',
        [[802,112],[775,91],[814,85],[799,151],[775,130],[811,202],[781,196],[793,235],[688,244],[718,247],[778,286],[733,295],[811,280]]],
      ['E', 'M857 76H982V123H909V172H975V217H909V266H982V305H857Z',
        [[949,105],[892,99],[865,84],[871,126],[907,162],[868,156],[883,198],[961,177],[964,210],[907,258],[868,255],[907,219],[937,297],[868,288],[967,279]]],
      ['C', 'M1050 76H1151L1180 103V147H1128V123H1062V266H1128V224H1180V277L1151 304H1050L1022 277V103Z',
        [[1153,99],[1075,117],[1048,84],[1144,141],[1030,126],[1030,162],[1051,210],[1060,180],[1168,258],[1141,225],[1030,258],[1123,279],[1090,282],[1060,270]]],
      ['T', 'M1222 77H1366V123H1320V305H1270V123H1222Z',
        [[1341,97],[1308,121],[1308,85],[1275,139],[1314,166],[1278,199],[1317,208],[1278,169],[1287,253],[1317,256],[1296,286]]]
    ];
    // Conservative polished front faces leave the deep counters and shaded
    // bevels intact. The large $ on the moneybag is deliberately outside them.
    const goldLetters = [
      ['D', 'M69 353H224L250 379V586L223 612H69Z M130 395H196L206 413V551L189 567H130Z', [[74,358],[245,385],[75,607]]],
      ['O', 'M319 352H464L489 379V586L463 612H319L289 584V381Z M337 398H414L431 416V549L414 567H337Z', [[321,357],[483,384],[322,607]]],
      ['L1', 'M544 352H600V554H679V612H544Z', [[549,357],[595,357],[673,607]]],
      ['L2', 'M730 352H790V554H870V612H730Z', [[735,357],[785,357],[864,607]]],
      ['A', 'M981 353H1040L1112 612H1059L1040 554H964L946 612H908Z M977 397H1030L1052 518H949Z', [[984,360],[1037,360],[1062,605]]],
      ['R', 'M1164 353H1318L1355 377V442L1311 484L1355 612H1296L1262 523H1225V612H1164Z M1210 400H1310L1315 452L1295 472H1210Z', [[1170,358],[1348,380],[1350,607]]]
    ];
    const lighting = svgElement('svg', {
      class: 'home-brand-lighting', viewBox: '0 0 1800 693',
      preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false'
    });
    const defs = svgElement('defs', {});
    const goldSun = svgElement('linearGradient', {
      id: 'home-brand-gold-sun', x1: '0%', y1: '0%', x2: '16%', y2: '100%'
    });
    for (const [offset, colour, opacity] of [
      ['0%', '#fff7c6', '.85'], ['25%', '#ffdc77', '.3'],
      ['53%', '#ffd450', '.08'], ['80%', '#ffe893', '.2'], ['100%', '#fff5be', '.5']
    ]) goldSun.append(svgElement('stop', { offset, 'stop-color': colour, 'stop-opacity': opacity }));
    const goldSweep = svgElement('linearGradient', {
      id: 'home-brand-gold-sweep', x1: '0%', y1: '0%', x2: '100%', y2: '22%'
    });
    for (const [offset, colour, opacity] of [
      ['0%', '#ffca59', '0'], ['36%', '#ffe499', '0'], ['44%', '#fff2b6', '.3'],
      ['49%', '#fff9d1', '.8'], ['52%', '#fff6c4', '.55'], ['60%', '#ffd975', '0'], ['100%', '#ffcf66', '0']
    ]) goldSweep.append(svgElement('stop', { offset, 'stop-color': colour, 'stop-opacity': opacity }));
    const crystalHalo = svgElement('radialGradient', { id: 'home-brand-crystal-pin-bloom' });
    const goldHalo = svgElement('radialGradient', { id: 'home-brand-gold-pin-bloom' });
    for (const [offset, opacity] of [['0%', '.72'], ['28%', '.22'], ['100%', '0']]) {
      crystalHalo.append(svgElement('stop', { offset, 'stop-color': '#e8f4ff', 'stop-opacity': opacity }));
      goldHalo.append(svgElement('stop', { offset, 'stop-color': '#ffebb0', 'stop-opacity': opacity }));
    }
    defs.append(goldSun, goldSweep, crystalHalo, goldHalo);
    lighting.append(defs);

    let pointOrdinal = 0;
    function addPoint(parent, x, y, metal) {
      const ordinal = pointOrdinal++;
      const size = metal ? 15 + ordinal % 4 * 2 : 9 + ordinal % 5 * 1.7;
      const duration = metal ? 11.6 + ordinal % 6 * .69 : 5.7 + ordinal % 13 * .31;
      const point = svgElement('g', {
        class: 'home-brand-point home-brand-point-' + (metal ? 'gold' : 'crystal'),
        transform: `translate(${x} ${y})`
      });
      // Independent, deterministic phases do not restart on sport selection.
      point.style.setProperty('--brand-point-duration', duration.toFixed(2) + 's');
      point.style.setProperty('--brand-point-delay', (-(ordinal * .61803398875 % 1) * duration).toFixed(3) + 's');
      const waist = metal ? 1.6 : 1.15;
      const halfArm = size * .54;
      point.append(svgElement('circle', {
        class: 'home-brand-point-bloom', r: (size * .68).toFixed(2),
        fill: 'url(#home-brand-' + (metal ? 'gold' : 'crystal') + '-pin-bloom)'
      }));
      point.append(svgElement('path', {
        class: 'home-brand-point-rays',
        d: `M0 ${-size}L${waist} ${-waist}L${size} 0L${waist} ${waist}L0 ${size}L${-waist} ${waist}L${-size} 0L${-waist} ${-waist}Z`
      }));
      point.append(svgElement('path', {
        class: 'home-brand-point-fine',
        d: `M${-halfArm} ${-halfArm}L.7 -.7L${halfArm} ${halfArm}L-.7 .7Z M${halfArm} ${-halfArm}L.7 .7L${-halfArm} ${halfArm}L-.7 -.7Z`
      }));
      point.append(svgElement('circle', { class: 'home-brand-point-core', r: metal ? '2.2' : '1.75' }));
      parent.append(point);
    }

    crystalLetters.forEach(([letter, face, points]) => {
      const id = 'home-brand-crystal-face-' + letter;
      const clip = svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
      clip.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      defs.append(clip);
      const scintillation = svgElement('g', {
        class: 'home-brand-crystal-letter', 'data-brand-letter': letter, 'clip-path': 'url(#' + id + ')'
      });
      points.forEach(([x, y]) => addPoint(scintillation, x, y, false));
      lighting.append(scintillation);
    });
    goldLetters.forEach(([letter, face, points], index) => {
      const id = 'home-brand-gold-face-' + letter;
      const clip = svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
      clip.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      defs.append(clip);
      const reflection = svgElement('g', {
        class: 'home-brand-gold-letter', 'data-brand-letter': letter, 'clip-path': 'url(#' + id + ')'
      });
      reflection.append(svgElement('rect', {
        class: 'home-brand-gold-warmth', x: '0', y: '330', width: '1390', height: '300',
        fill: 'url(#home-brand-gold-sun)'
      }));
      const sweep = svgElement('rect', {
        class: 'home-brand-gold-reflection', x: '0', y: '330', width: '1390', height: '300',
        fill: 'url(#home-brand-gold-sweep)'
      });
      sweep.style.setProperty('--brand-gold-delay', (-index * .51 - 3.2) + 's');
      reflection.append(sweep);
      points.forEach(([x, y]) => addPoint(reflection, x, y, true));
      lighting.append(reflection);
    });
    brand.append(lighting);
  }

  addRingSpecularGradient();

  [...home.querySelectorAll('[data-home-select]')].forEach((button, index) => {
    addSelectorCircuit(button, button.dataset.homeSelect, index);
  });

  const entry = home.querySelector('[data-home-entry]');
  if (entry) {
    // The original native CTA and its accessible label/navigation are intact.
    // The photographic gemstone atlas remains underneath these small glints.
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
    // These points belong to the restored photographic casting's outer metal.
    // The entrance scene and emblem remain clear of synthetic glints.
    [[14, 30], [86, 30], [32, 94], [68, 94]].forEach(([x, y], index) => {
      addGlint(gate, x, y, 'ring', 10 + index);
    });
  }

  // Measure only at native layout events. Resizing a viewport or returning to
  // Home updates the real perimeter; animation remains entirely CSS driven.
  if ('ResizeObserver' in window) {
    const selectorResize = new ResizeObserver(entries => {
      entries.forEach(({ target }) => measureSelectorCircuit(target));
    });
    selectorCircuits.forEach((circuit, button) => selectorResize.observe(button));
  } else {
    window.addEventListener('resize', () => {
      selectorCircuits.forEach((circuit, button) => measureSelectorCircuit(button));
    }, { passive: true });
  }

  installBrandLighting();

  home.dataset.homeGemMotionInstalled = 'true';
})();
