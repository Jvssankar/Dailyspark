/*
 * DailySpark card generator.
 * Draws a quote onto a <canvas> using one of several templates.
 * Works in the browser and in Node (with the "canvas" package) for README previews.
 */
(function (root) {
  'use strict';

  var SERIF = '"Fraunces", Georgia, "Times New Roman", serif';
  var SANS = '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif';

  var FORMATS = {
    square: { label: 'Square', w: 1080, h: 1080 },
    portrait: { label: 'Portrait', w: 1080, h: 1350 },
    story: { label: 'Story', w: 1080, h: 1920 }
  };

  /* ---------- helpers ---------- */

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Small seeded random generator so stars/dots stay stable for one quote.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function vGradient(ctx, h, stops) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  function blob(ctx, x, y, r, color) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Curved four-point sparkle: the DailySpark logo mark.
  function spark(ctx, cx, cy, r, color) {
    var k = 0.26 * r;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
    ctx.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
    ctx.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
    ctx.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function wavePath(ctx, w, h, baseY, amp, len, phase) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    var steps = 60;
    for (var i = 0; i <= steps; i++) {
      var x = (w * i) / steps;
      ctx.lineTo(x, baseY + Math.sin((x / len) * Math.PI * 2 + phase) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
  }

  function hillPath(ctx, w, h, baseY, amp, seed) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    var steps = 80;
    for (var i = 0; i <= steps; i++) {
      var x = (w * i) / steps;
      var y = baseY +
        Math.sin(x / (w * 0.22) + seed) * amp +
        Math.sin(x / (w * 0.09) + seed * 2.3) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
  }

  /* ---------- text layout ---------- */

  function wrapLines(ctx, text, maxWidth) {
    var words = text.split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function fitText(ctx, text, t, maxWidth, maxHeight, u) {
    var maxSize = 98 * u;
    var minSize = 34 * u;
    var step = Math.max(1, 2 * u);
    var size = maxSize;
    var lines = [];
    var lh = t.lineHeight || 1.22;
    for (; size >= minSize; size -= step) {
      ctx.font = t.style + ' ' + t.weight + ' ' + size + 'px ' + t.font;
      lines = wrapLines(ctx, text, maxWidth);
      if (lines.length * size * lh <= maxHeight) break;
    }
    if (size < minSize) {
      size = minSize;
      ctx.font = t.style + ' ' + t.weight + ' ' + size + 'px ' + t.font;
      lines = wrapLines(ctx, text, maxWidth);
    }
    return { size: size, lines: lines, lineHeight: size * lh };
  }

  function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 1 && ctx.measureText(out + '\u2026').width > maxWidth) {
      out = out.slice(0, -1);
    }
    return out.trim() + '\u2026';
  }

  /* ---------- backgrounds ---------- */

  function bgAurora(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1b1147');
    g.addColorStop(0.55, '#102a5c');
    g.addColorStop(1, '#0a4a5e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    blob(ctx, w * 0.15, h * 0.12, w * 0.62, 'rgba(124,77,255,0.60)');
    blob(ctx, w * 0.95, h * 0.45, w * 0.55, 'rgba(0,229,195,0.38)');
    blob(ctx, w * 0.25, h * 0.98, w * 0.7, 'rgba(255,92,168,0.36)');
  }

  function bgSunrise(ctx, w, h) {
    ctx.fillStyle = vGradient(ctx, h, [[0, '#f0703a'], [0.55, '#d63a6a'], [1, '#4b2fa8']]);
    ctx.fillRect(0, 0, w, h);
    blob(ctx, w * 0.82, h * 0.1, w * 0.45, 'rgba(255,236,170,0.75)');
    ctx.fillStyle = '#fff3c9';
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.1, w * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  function bgMidnight(ctx, w, h, u, r) {
    ctx.fillStyle = vGradient(ctx, h, [[0, '#060a22'], [1, '#1d2661']]);
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < 170; i++) {
      var x = r() * w;
      var y = r() * h * 0.92;
      var rad = (0.6 + r() * 1.8) * u;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.5).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    for (i = 0; i < 6; i++) {
      spark(ctx, r() * w * 0.7, r() * h * 0.13 + 20 * u, (8 + r() * 10) * u, 'rgba(255,244,200,0.9)');
    }
    blob(ctx, w * 0.84, h * 0.11, w * 0.2, 'rgba(255,244,200,0.35)');
    ctx.fillStyle = '#f7f1d4';
    ctx.beginPath();
    ctx.arc(w * 0.84, h * 0.11, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,190,150,0.35)';
    ctx.beginPath();
    ctx.arc(w * 0.825, h * 0.1, w * 0.012, 0, Math.PI * 2);
    ctx.arc(w * 0.855, h * 0.122, w * 0.009, 0, Math.PI * 2);
    ctx.fill();
  }

  function bgLinen(ctx, w, h, u) {
    ctx.fillStyle = '#f2eee5';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1f2347';
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(46 * u, 46 * u, w - 92 * u, h - 92 * u);
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(62 * u, 62 * u, w - 124 * u, h - 124 * u);
    spark(ctx, w - 110 * u, 110 * u, 22 * u, '#f0603a');
  }

  function bgOcean(ctx, w, h, u) {
    ctx.fillStyle = vGradient(ctx, h, [[0, '#0a2f6b'], [0.6, '#0f7aa8'], [1, '#58cfd0']]);
    ctx.fillRect(0, 0, w, h);
    var layers = [
      [0.82, 30, 0.9, 0, 'rgba(255,255,255,0.08)'],
      [0.88, 32, 0.7, 1.7, 'rgba(255,255,255,0.12)'],
      [0.94, 24, 0.55, 3.1, 'rgba(255,255,255,0.18)']
    ];
    layers.forEach(function (l) {
      wavePath(ctx, w, h, h * l[0], l[1] * u, w * l[2], l[3]);
      ctx.fillStyle = l[4];
      ctx.fill();
    });
  }

  function bgForest(ctx, w, h) {
    ctx.fillStyle = vGradient(ctx, h, [[0, '#e3f4e3'], [1, '#a5d4a9']]);
    ctx.fillRect(0, 0, w, h);
    blob(ctx, w * 0.8, h * 0.14, w * 0.25, 'rgba(255,250,215,0.9)');
    var hills = [
      [0.885, 30, 1.1, '#5d9a6f'],
      [0.925, 26, 2.6, '#3f7d58'],
      [0.96, 20, 4.2, '#2a5f45']
    ];
    hills.forEach(function (hl) {
      hillPath(ctx, w, h, h * hl[0], hl[1] * (w / 1080), hl[2]);
      ctx.fillStyle = hl[3];
      ctx.fill();
    });
  }

  function bgNeon(ctx, w, h, u) {
    ctx.fillStyle = '#0b0720';
    ctx.fillRect(0, 0, w, h);
    blob(ctx, w * 0.5, h * 1.02, w * 0.9, 'rgba(255,43,214,0.28)');
    ctx.strokeStyle = 'rgba(255,43,214,0.14)';
    ctx.lineWidth = 2 * u;
    var gap = 90 * u;
    var x;
    var y;
    for (x = 0; x <= w; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (y = 0; y <= h; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 28 * u;
    ctx.strokeStyle = '#ff6ae6';
    ctx.lineWidth = 5 * u;
    ctx.strokeRect(54 * u, 54 * u, w - 108 * u, h - 108 * u);
    ctx.restore();
  }

  function bgSunbeam(ctx, w, h, u) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#14110f';
    ctx.beginPath();
    ctx.arc(w * 0.9, h * 0.07, w * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.115, w * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14110f';
    ctx.fillRect(0, h - 190 * u, w, 190 * u);
  }

  function bgBlush(ctx, w, h) {
    ctx.fillStyle = vGradient(ctx, h, [[0, '#ffe3ec'], [1, '#ffc4a8']]);
    ctx.fillRect(0, 0, w, h);
    blob(ctx, w * 0.1, h * 0.1, w * 0.55, 'rgba(255,140,190,0.45)');
    blob(ctx, w * 0.95, h * 0.75, w * 0.6, 'rgba(255,175,110,0.5)');
    blob(ctx, w * 0.55, h * 0.4, w * 0.35, 'rgba(255,255,255,0.45)');
  }

  /* ---------- templates ---------- */

  var TEMPLATES = [
    { id: 'aurora', name: 'Aurora', bg: bgAurora, font: SERIF, weight: 500, style: 'normal', align: 'center',
      text: '#ffffff', sub: '#c9f7ec', accent: '#7ef0d6', mark: true },
    { id: 'sunrise', name: 'Sunrise', bg: bgSunrise, font: SANS, weight: 800, style: 'normal', align: 'left',
      text: '#ffffff', sub: '#fff1c4', accent: '#fff3c9', mark: true, shadow: 'rgba(60,10,40,0.28)', lineHeight: 1.18 },
    { id: 'midnight', name: 'Midnight', bg: bgMidnight, font: SERIF, weight: 400, style: 'italic', align: 'center',
      text: '#f6f3ff', sub: '#c3c8ff', accent: '#ffe9a8', mark: false },
    { id: 'linen', name: 'Linen', bg: bgLinen, font: SERIF, weight: 600, style: 'normal', align: 'left',
      text: '#1f2347', sub: '#4a4f77', accent: '#f0603a', mark: true },
    { id: 'ocean', name: 'Ocean', bg: bgOcean, font: SANS, weight: 700, style: 'normal', align: 'center',
      text: '#ffffff', sub: '#d9fbff', accent: '#9ff3f0', mark: false, shadow: 'rgba(0,30,70,0.25)', footerText: '#0a2f6b' },
    { id: 'forest', name: 'Forest', bg: bgForest, font: SERIF, weight: 600, style: 'normal', align: 'left',
      text: '#12301f', sub: '#2f5a42', accent: '#2a7a4b', mark: true, footerText: '#effaf0' },
    { id: 'neon', name: 'Neon', bg: bgNeon, font: SANS, weight: 800, style: 'normal', align: 'left',
      text: '#ffffff', sub: '#ffb3f3', accent: '#4df3ff', mark: true, glow: '#4df3ff' },
    { id: 'sunbeam', name: 'Sunbeam', bg: bgSunbeam, font: SANS, weight: 800, style: 'normal', align: 'left',
      text: '#14110f', sub: '#3b3226', accent: '#ff4d6d', mark: true, footerBar: true, footerText: '#ffd23f', lineHeight: 1.16 },
    { id: 'blush', name: 'Blush', bg: bgBlush, font: SERIF, weight: 600, style: 'normal', align: 'center',
      text: '#3a1030', sub: '#6d2f5c', accent: '#d6336c', mark: true }
  ];

  function getTemplate(id) {
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].id === id) return TEMPLATES[i];
    }
    return TEMPLATES[0];
  }

  /* ---------- main renderer ---------- */

  function render(ctx, w, h, quote, templateId, opts) {
    var t = getTemplate(templateId);
    var u = w / 1080;
    var text = String((quote && quote.text) || '').trim();
    var author = String((quote && quote.author) || 'Unknown').trim();
    var label = (opts && opts.label) || '';

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    t.bg(ctx, w, h, u, rng(hashStr(t.id + text)));

    var pad = (h / w > 1.6 ? 112 : 96) * u;
    var footerBase = h - 96 * u;
    var authorBase = footerBase - 130 * u;
    var areaTop = Math.max(h * 0.16, 190 * u);
    var areaBottom = authorBase - 110 * u;
    var maxWidth = w - pad * 2;
    var x = t.align === 'center' ? w / 2 : pad;

    ctx.textAlign = t.align;
    ctx.textBaseline = 'alphabetic';

    var fit = fitText(ctx, text, t, maxWidth, areaBottom - areaTop, u);
    var blockH = fit.lines.length * fit.lineHeight;
    var blockTop = areaTop + (areaBottom - areaTop - blockH) / 2;

    if (t.mark) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = t.accent;
      ctx.font = '700 ' + 220 * u + 'px ' + SERIF;
      ctx.fillText('\u201C', x, blockTop + 28 * u);
      ctx.restore();
    }

    ctx.font = t.style + ' ' + t.weight + ' ' + fit.size + 'px ' + t.font;
    ctx.fillStyle = t.text;
    if (t.shadow) {
      ctx.shadowColor = t.shadow;
      ctx.shadowBlur = 14 * u;
      ctx.shadowOffsetY = 4 * u;
    }
    if (t.glow) {
      ctx.shadowColor = t.glow;
      ctx.shadowBlur = 26 * u;
    }
    fit.lines.forEach(function (line, i) {
      var baseline = blockTop + i * fit.lineHeight + fit.size * (0.5 * (fit.lineHeight / fit.size - 1) + 0.82);
      ctx.fillText(line, x, baseline);
    });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // accent rule + author
    var ruleW = 64 * u;
    ctx.fillStyle = t.accent;
    var ruleX = t.align === 'center' ? x - ruleW / 2 : x;
    ctx.fillRect(ruleX, authorBase - 58 * u, ruleW, 5 * u);

    ctx.font = '700 ' + 36 * u + 'px ' + SANS;
    ctx.fillStyle = t.sub;
    ctx.fillText(ellipsize(ctx, '\u2014 ' + author, maxWidth), x, authorBase);

    // footer
    var footColor = t.footerText || t.sub;
    ctx.textAlign = 'left';
    spark(ctx, pad + 15 * u, footerBase - 11 * u, 17 * u, t.footerText || t.accent);
    ctx.font = '800 ' + 30 * u + 'px ' + SANS;
    ctx.fillStyle = t.footerText || t.text;
    ctx.fillText('DailySpark', pad + 46 * u, footerBase);

    if (label) {
      ctx.textAlign = 'right';
      ctx.font = '600 ' + 26 * u + 'px ' + SANS;
      ctx.fillStyle = footColor;
      ctx.fillText(ellipsize(ctx, label, maxWidth * 0.55), w - pad, footerBase);
    }
    ctx.restore();
  }

  function draw(canvas, quote, templateId, opts) {
    opts = opts || {};
    var fmt = FORMATS[opts.format] || FORMATS.portrait;
    var w = opts.width || fmt.w;
    var h = opts.height || Math.round((w * fmt.h) / fmt.w);
    canvas.width = w;
    canvas.height = h;
    render(canvas.getContext('2d'), w, h, quote, templateId, opts);
    return canvas;
  }

  var api = {
    TEMPLATES: TEMPLATES,
    FORMATS: FORMATS,
    FONTS: { serif: SERIF, sans: SANS },
    getTemplate: getTemplate,
    draw: draw
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DailySparkCards = api;
  }
})(typeof window !== 'undefined' ? window : this);
