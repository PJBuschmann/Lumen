/* Client-side rendering for the Lumen balance report. Vanilla JS, no dependencies. */
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('report-data').textContent);
  var SVG = 'http://www.w3.org/2000/svg';
  var tooltip = document.getElementById('tooltip');

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function html(name, className, text, parent) {
    var node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function seriesVar(index) {
    return 'var(--series-' + (index + 1) + ')';
  }
  function fmtTime(seconds) {
    if (!isFinite(seconds)) return 'not reached';
    if (seconds < 90) return Math.round(seconds) + ' s';
    if (seconds < 3600) return (seconds / 60).toFixed(seconds < 600 ? 1 : 0) + ' min';
    if (seconds < 86400 * 2) return (seconds / 3600).toFixed(1) + ' h';
    return (seconds / 86400).toFixed(1) + ' d';
  }
  function fmtShort(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm';
    return Math.round(seconds / 3600) + 'h';
  }
  function fmtExp(value) {
    return '1e' + (value >= 100 ? Math.round(value) : value.toFixed(1));
  }

  /* ---------------- tooltip ---------------- */
  function showTooltip(event, build) {
    while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
    build(tooltip);
    tooltip.hidden = false;
    var pad = 14;
    var rect = tooltip.getBoundingClientRect();
    var x = event.clientX + pad;
    var y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tooltip.style.left = Math.max(8, x) + 'px';
    tooltip.style.top = Math.max(8, y) + 'px';
  }
  function hideTooltip() {
    tooltip.hidden = true;
  }
  function tooltipRow(parent, colorVar, value, label) {
    var row = html('div', 'tt-row', null, parent);
    if (colorVar) {
      var key = html('span', 'tt-key', null, row);
      key.style.background = colorVar;
    }
    html('strong', null, value, row);
    html('span', 'tt-label', label, row);
  }

  /* ---------------- legend ---------------- */
  function legend(parent, names, kind) {
    var box = html('div', 'legend', null, parent);
    names.forEach(function (name, i) {
      var item = html('span', 'legend-item', null, box);
      var swatch = html('span', kind === 'line' ? 'legend-line' : 'legend-dot', null, item);
      swatch.style.background = seriesVar(i);
      html('span', null, name, item);
    });
  }

  /* ---------------- scales ---------------- */
  function logScale(d0, d1, r0, r1) {
    var a = Math.log(d0);
    var b = Math.log(d1);
    return function (v) {
      return r0 + ((Math.log(Math.max(v, d0)) - a) / (b - a)) * (r1 - r0);
    };
  }
  function linScale(d0, d1, r0, r1) {
    return function (v) {
      return r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    };
  }
  function niceStep(span, count) {
    var raw = span / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  }
  var TIME_TICKS = [60, 300, 900, 3600, 4 * 3600, 86400, 5 * 86400, 20 * 86400, 60 * 86400];

  /* ---------------- line chart: one quantity, all strategies ---------------- */
  function lineChart(container, spec) {
    var W = 720;
    var H = 300;
    var m = { l: 52, r: 96, t: 26, b: 34 };
    legend(container, spec.series.map(function (s) { return s.name; }), 'line');
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': spec.title }, container);

    var tMax = 60;
    var yMax = 1;
    spec.series.forEach(function (s) {
      if (s.t.length) tMax = Math.max(tMax, s.t[s.t.length - 1]);
      s.y.forEach(function (v) { if (v > yMax) yMax = v; });
    });
    var step = niceStep(yMax, 5);
    yMax = Math.ceil(yMax / step) * step;
    var x = logScale(30, tMax, m.l, W - m.r);
    var y = linScale(0, yMax, H - m.b, m.t);

    for (var v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }, svg);
      var label = el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      label.textContent = v === 0 ? '1' : fmtExp(v);
    }
    TIME_TICKS.forEach(function (t) {
      if (t > tMax) return;
      el('line', { x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }, svg);
      var label = el('text', { x: x(t), y: H - m.b + 18, 'text-anchor': 'middle', class: 'tick' }, svg);
      label.textContent = fmtTime(t);
    });
    // Pacing targets as quiet reference marks on the time axis.
    (spec.targets || []).forEach(function (target) {
      if (target.t > tMax) return;
      el('line', { x1: x(target.t), x2: x(target.t), y1: m.t, y2: H - m.b, class: 'ref' }, svg);
      var label = el('text', { x: x(target.t) + 4, y: m.t - 8, class: 'ref-label' }, svg);
      label.textContent = target.label;
    });

    var ends = [];
    spec.series.forEach(function (s, i) {
      if (!s.t.length) return;
      var d = '';
      for (var k = 0; k < s.t.length; k++) d += (k ? 'L' : 'M') + x(s.t[k]).toFixed(1) + ' ' + y(s.y[k]).toFixed(1);
      el('path', { d: d, class: 'line', style: 'stroke:' + seriesVar(i) }, svg);
      var ex = x(s.t[s.t.length - 1]);
      var ey = y(s.y[s.y.length - 1]);
      el('circle', { cx: ex, cy: ey, r: 4, class: 'end-dot', style: 'fill:' + seriesVar(i) }, svg);
      ends.push({ x: ex, y: ey, name: s.name });
    });
    // Direct end labels only where they do not collide; the legend carries the rest.
    ends.sort(function (a, b) { return a.y - b.y; });
    var lastY = -Infinity;
    ends.forEach(function (end) {
      if (end.y - lastY < 13) return;
      lastY = end.y;
      var label = el('text', { x: end.x + 8, y: end.y + 4, class: 'end-label' }, svg);
      label.textContent = end.name;
    });

    var cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' }, svg);
    var hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    var grid = spec.series.reduce(function (best, s) { return s.t.length > best.length ? s.t : best; }, []);
    function move(event) {
      var box = svg.getBoundingClientRect();
      var px = ((event.clientX - box.left) / box.width) * W;
      var bestIndex = 0;
      var bestDist = Infinity;
      for (var k = 0; k < grid.length; k++) {
        var dist = Math.abs(x(grid[k]) - px);
        if (dist < bestDist) { bestDist = dist; bestIndex = k; }
      }
      var t = grid[bestIndex];
      cross.setAttribute('x1', x(t));
      cross.setAttribute('x2', x(t));
      cross.setAttribute('visibility', 'visible');
      showTooltip(event, function (tt) {
        html('div', 'tt-title', fmtTime(t) + ' in', tt);
        spec.series.forEach(function (s, i) {
          var idx = Math.min(bestIndex, s.y.length - 1);
          if (idx < 0 || s.t[idx] === undefined) return;
          tooltipRow(tt, seriesVar(i), fmtExp(s.y[idx]), s.name);
        });
      });
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', function () {
      cross.setAttribute('visibility', 'hidden');
      hideTooltip();
    });
  }

  /* ---------------- milestone ratios: dot + range per strategy, per milestone ---------------- */
  function ratioChart(container, spec) {
    var rowH = 26;
    var groupGap = 18;
    var W = 720;
    var m = { l: 150, r: 24, t: 30, b: 34 };
    var groups = spec.milestones;
    var H = m.t + m.b + groups.length * (spec.policies.length * rowH + groupGap);
    legend(container, spec.policies, 'dot');
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': spec.title }, container);
    var x = logScale(0.25, 4, m.l, W - m.r);

    // The allowed band for the best-ROI bot, and the offline limit.
    el('rect', { x: x(spec.bandLo), y: m.t - 6, width: x(spec.bandHi) - x(spec.bandLo), height: H - m.t - m.b + 6, class: 'band' }, svg);
    var bandLabel = el('text', { x: (x(spec.bandLo) + x(spec.bandHi)) / 2, y: m.t - 12, 'text-anchor': 'middle', class: 'ref-label' }, svg);
    bandLabel.textContent = 'target ±' + Math.round((spec.bandHi - 1) * 100) + '%';
    el('line', { x1: x(spec.offlineLimit), x2: x(spec.offlineLimit), y1: m.t - 6, y2: H - m.b, class: 'ref' }, svg);
    var offLabel = el('text', { x: x(spec.offlineLimit) + 4, y: m.t - 12, class: 'ref-label' }, svg);
    offLabel.textContent = 'offline limit';

    [0.25, 0.5, 1, 2, 4].forEach(function (r) {
      el('line', { x1: x(r), x2: x(r), y1: m.t - 6, y2: H - m.b, class: r === 1 ? 'axis' : 'grid' }, svg);
      var label = el('text', { x: x(r), y: H - m.b + 18, 'text-anchor': 'middle', class: 'tick' }, svg);
      label.textContent = r + 'x';
    });
    var axisLabel = el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle', class: 'tick' }, svg);
    axisLabel.textContent = 'time to milestone, as a multiple of the active target';

    groups.forEach(function (group, g) {
      var top = m.t + g * (spec.policies.length * rowH + groupGap);
      var name = el('text', { x: 8, y: top + 16, class: 'row-label' }, svg);
      name.textContent = group.label;
      var target = el('text', { x: 8, y: top + 32, class: 'tick' }, svg);
      target.textContent = 'target ' + fmtTime(group.target);
      group.rows.forEach(function (row, i) {
        var cy = top + i * rowH + rowH / 2;
        if (!isFinite(row.median)) {
          var none = el('text', { x: x(4) - 4, y: cy + 4, 'text-anchor': 'end', class: 'tick' }, svg);
          none.textContent = 'not reached';
          return;
        }
        var lo = row.p10 / group.target;
        var hi = row.p90 / group.target;
        var mid = row.median / group.target;
        el('line', { x1: x(lo), x2: x(hi), y1: cy, y2: cy, class: 'range', style: 'stroke:' + seriesVar(i) }, svg);
        el('circle', { cx: x(mid), cy: cy, r: 5, class: 'dot', style: 'fill:' + seriesVar(i) }, svg);
        var target24 = el('rect', { x: Math.min(x(lo), x(mid) - 12), y: cy - 12, width: Math.max(24, x(hi) - x(lo)), height: 24, fill: 'transparent', tabindex: 0 }, svg);
        function show(event) {
          showTooltip(event, function (tt) {
            html('div', 'tt-title', group.label, tt);
            tooltipRow(tt, seriesVar(i), fmtTime(row.median), spec.policies[i] + ' (median)');
            tooltipRow(tt, null, fmtTime(row.p10) + ' – ' + fmtTime(row.p90), '10th–90th percentile');
            tooltipRow(tt, null, mid.toFixed(2) + 'x', 'of the ' + fmtTime(group.target) + ' target');
          });
        }
        target24.addEventListener('pointermove', show);
        target24.addEventListener('pointerleave', hideTooltip);
        target24.addEventListener('focus', function () {
          var box = target24.getBoundingClientRect();
          show({ clientX: box.left + box.width / 2, clientY: box.top });
        });
        target24.addEventListener('blur', hideTooltip);
      });
    });
  }

  /* ---------------- purchase gap histogram: one strategy ---------------- */
  function gapChart(container, spec) {
    var W = 340;
    var H = 190;
    var m = { l: 40, r: 10, t: 14, b: 44 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': spec.title }, container);
    var total = spec.counts.reduce(function (a, b) { return a + b; }, 0) || 1;
    var shares = spec.counts.map(function (c) { return c / total; });
    var top = Math.max.apply(null, shares);
    var step = niceStep(top, 4);
    var yMax = Math.ceil(top / step) * step || 1;
    var y = linScale(0, yMax, H - m.b, m.t);
    var band = (W - m.l - m.r) / shares.length;
    var barW = Math.min(24, band - 2);

    for (var v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }, svg);
      var label = el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      label.textContent = Math.round(v * 100) + '%';
    }
    // Mark where the 30-minute limit falls between buckets.
    var limitIndex = spec.buckets.findIndex(function (b) { return b > spec.limit; });
    if (limitIndex > 0) {
      var lx = m.l + band * limitIndex;
      el('line', { x1: lx, x2: lx, y1: m.t, y2: H - m.b, class: 'ref' }, svg);
      var limitLabel = el('text', { x: lx - 4, y: m.t + 8, 'text-anchor': 'end', class: 'ref-label' }, svg);
      limitLabel.textContent = fmtTime(spec.limit) + ' limit';
    }
    shares.forEach(function (share, i) {
      var cx = m.l + band * (i + 0.5);
      var h = y(0) - y(share);
      if (h > 0) {
        var r = Math.min(4, h);
        var x0 = cx - barW / 2;
        var d = 'M' + x0 + ' ' + y(0) + 'V' + (y(share) + r) + 'q0 -' + r + ' ' + r + ' -' + r + 'H' + (x0 + barW - r) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + y(0) + 'Z';
        el('path', { d: d, class: 'bar', style: 'fill:' + spec.color }, svg);
      }
      if (i % 3 === 0 || i === shares.length - 1) {
        var tick = el('text', { x: cx, y: H - m.b + 16, 'text-anchor': 'middle', class: 'tick' }, svg);
        tick.textContent = isFinite(spec.buckets[i]) ? '≤' + fmtShort(spec.buckets[i]) : 'more';
      }
      var hit = el('rect', { x: cx - band / 2, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 }, svg);
      function show(event) {
        showTooltip(event, function (tt) {
          var lower = i === 0 ? 0 : spec.buckets[i - 1];
          var range = isFinite(spec.buckets[i]) ? fmtTime(lower) + ' – ' + fmtTime(spec.buckets[i]) : 'over ' + fmtTime(lower);
          html('div', 'tt-title', 'Gap of ' + range, tt);
          tooltipRow(tt, spec.color, (share * 100).toFixed(share < 0.01 ? 2 : 1) + '%', 'of purchases');
          tooltipRow(tt, null, String(spec.counts[i]), 'gaps counted');
        });
      }
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', hideTooltip);
      hit.addEventListener('focus', function () {
        var box = hit.getBoundingClientRect();
        show({ clientX: box.left + box.width / 2, clientY: box.top });
      });
      hit.addEventListener('blur', hideTooltip);
    });
    var axisLabel = el('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'tick' }, svg);
    axisLabel.textContent = 'active time between purchases';
  }

  /* ---------------- build the page ---------------- */
  var targets = data.milestones.map(function (ms) { return { t: ms.target, label: ms.short }; });

  if (data.milestones.length) {
    ratioChart(document.getElementById('chart-ratios'), {
      title: 'Time to each milestone relative to its target, by strategy',
      policies: data.policies,
      milestones: data.milestones,
      bandLo: 1 - data.tolerance,
      bandHi: 1 + data.tolerance,
      offlineLimit: data.offlineFactor * (1 + data.tolerance),
    });
  }

  var growthHost = document.getElementById('charts-growth');
  data.quantities.forEach(function (quantity) {
    var card = html('div', 'chart-card', null, growthHost);
    html('h3', null, quantity.title, card);
    html('p', 'note', quantity.note, card);
    lineChart(card, {
      title: quantity.title,
      targets: targets,
      series: data.growth.map(function (g) {
        return { name: g.policy, t: g.t, y: g.series[quantity.key] };
      }),
    });
  });

  var gapHost = document.getElementById('charts-gaps');
  data.gaps.forEach(function (gap, i) {
    var card = html('div', 'chart-card small', null, gapHost);
    var head = html('h3', null, null, card);
    var dot = html('span', 'legend-dot', null, head);
    dot.style.background = seriesVar(i);
    head.appendChild(document.createTextNode(' ' + gap.policy));
    html('p', 'note', 'Longest gap ' + fmtTime(gap.maxGapWorst) + ' · typical run ' + fmtTime(gap.maxGapMedian), card);
    gapChart(card, {
      title: 'Purchase gaps for ' + gap.policy,
      color: seriesVar(i),
      buckets: data.gapBuckets.map(function (b) { return b === null ? Infinity : b; }),
      counts: gap.histogram,
      limit: data.maxGapSeconds,
    });
  });
})();
