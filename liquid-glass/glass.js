/*!
 * Liquid Glass — zero-blur optical refraction for the web. MIT License.
 * https://github.com/itsemreyldz/veblen-releases/tree/main/liquid-glass
 *
 * The centre of a surface passes the backdrop through untouched; only a band along the edge bends it like a convex
 * lens, with a slight colour split. Works in Chromium engines (Chrome, Edge, Brave, Opera, WebView2), which are the
 * ones that accept an SVG filter inside `backdrop-filter`. Elsewhere the surface falls back to its plain tint.
 *
 * Usage:  <link rel="stylesheet" href="liquid-glass.css">
 *         <div data-liquid-glass>…</div>
 *         <script src="glass.js"></script>
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var defaults = { bezel: 22, strength: 1.7, chroma: 0.09 };

  /** Edge profile of the lens: 1 at the very edge, 0 where the band meets the flat centre. */
  function lensProfile(t) {
    var k = Math.max(0, Math.min(1, t));
    return 0.6 * (1 - Math.sqrt(1 - k * k)) + 0.4 * k * k;
  }

  /**
   * Displacement map (RGBA) of a rounded rectangle, pill or circle. R = horizontal, G = vertical, 128 = no shift.
   * Pixels are always pulled from further inside, so nothing outside the surface is sampled.
   */
  function lensMap(w, h, radius, bezel) {
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 128; data[i + 3] = 255; }
    var r = Math.max(0, Math.min(radius, w / 2, h / 2)), hx = w / 2, hy = h / 2, band = Math.ceil(Math.max(bezel, r)) + 1;
    for (var y = 0; y < h; y++) {
      var nearY = y < band || y >= h - band;
      for (var x = 0; x < w; x++) {
        if (!nearY && x === band && w - band > band) x = w - band; // flat centre: stays neutral
        var px = x + 0.5 - hx, py = y + 0.5 - hy;
        var qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
        var dist = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
        if (dist < 0 || dist >= bezel) continue;
        var nx = 0, ny = 0; // inward unit normal
        if (qx > 0 && qy > 0) { var l = Math.hypot(qx, qy); nx = -Math.sign(px) * (qx / l); ny = -Math.sign(py) * (qy / l); } else if (qx > qy) nx = -Math.sign(px); else ny = -Math.sign(py);
        var m = lensProfile(1 - dist / bezel), j = (y * w + x) * 4;
        data[j] = 128 + Math.round(nx * m * 127);
        data[j + 1] = 128 + Math.round(ny * m * 127);
      }
    }
    return data;
  }

  function node(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function mapUrl(w, h, radius, bezel) {
    var k = w * h > 400000 ? 0.5 : 1; // large surfaces: half-resolution map, visually identical
    var mw = Math.max(1, Math.round(w * k)), mh = Math.max(1, Math.round(h * k));
    var cv = document.createElement('canvas');
    cv.width = mw; cv.height = mh;
    cv.getContext('2d').putImageData(new ImageData(lensMap(mw, mh, radius * k, bezel * k), mw, mh), 0, 0);
    return cv.toDataURL('image/png');
  }

  /** Height map → one displacement pass per colour channel (each bends slightly differently) → recombine. */
  function buildFilter(id, w, h, href, scale, chroma) {
    var f = node('filter', { id: id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    f.appendChild(node('feImage', { href: href, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }));
    [['r', 1 + chroma, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'], ['g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'], ['b', 1 - chroma, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']].forEach(function (p) {
      f.appendChild(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: (scale * p[1]).toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + p[0] }));
      f.appendChild(node('feColorMatrix', { in: 'd' + p[0], type: 'matrix', values: p[2], result: p[0] }));
    });
    f.appendChild(node('feBlend', { mode: 'screen', in: 'r', in2: 'g', result: 'rg' }));
    f.appendChild(node('feBlend', { mode: 'screen', in: 'rg', in2: 'b' }));
    return f;
  }

  var chromium = typeof navigator !== 'undefined' && (!!root.chrome || !!(navigator.userAgentData && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); })));
  var items = new Map(); // element → { filter, key }
  var svg = null, observer = null, counter = 0, forced = false;
  var reduced = function () { return !forced && root.matchMedia && root.matchMedia('(prefers-reduced-transparency: reduce)').matches; };

  function option(el, name) {
    var v = parseFloat(el.getAttribute('data-lg-' + name));
    return isFinite(v) ? v : defaults[name];
  }

  function render(el) {
    var item = items.get(el);
    if (!item) return;
    if (reduced()) { el.style.removeProperty('--lg-filter'); item.key = ''; el.classList.add('lg-fallback'); return; }
    el.classList.remove('lg-fallback');
    var w = el.offsetWidth, h = el.offsetHeight;
    if (w < 8 || h < 8) return;
    var cs = getComputedStyle(el);
    var radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
    var bezel = Math.round(Math.max(4, Math.min(option(el, 'bezel'), Math.min(w, h) * 0.34)));
    var strength = option(el, 'strength'), chroma = option(el, 'chroma');
    var key = [w, h, Math.round(radius), bezel, strength, chroma].join(':');
    if (key === item.key) return;
    item.key = key;
    var id = item.id, href = mapUrl(w, h, radius, bezel);
    var next = buildFilter(id, w, h, href, Math.round(bezel * strength), chroma);
    var img = new Image(); img.src = href;
    // Attach only once the map is decoded, otherwise the first frame samples an empty map.
    img.decode().catch(function () {}).then(function () {
      if (items.get(el) !== item || item.key !== key) return;
      if (item.filter) item.filter.remove();
      item.filter = next;
      svg.appendChild(next);
      el.style.setProperty('--lg-filter', 'url(#' + id + ')');
    });
  }

  function setup() {
    if (svg) return;
    svg = node('svg', { 'aria-hidden': 'true', width: 0, height: 0 });
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(svg);
    observer = new ResizeObserver(function (entries) { entries.forEach(function (e) { render(e.target); }); });
    if (root.matchMedia) root.matchMedia('(prefers-reduced-transparency: reduce)').addEventListener('change', refresh);
  }

  function attach(el) {
    if (!chromium) { el.classList.add('lg-fallback'); return false; }
    setup();
    if (!items.has(el)) {
      items.set(el, { id: 'liquid-glass-' + ++counter, filter: null, key: '' });
      observer.observe(el, { box: 'border-box' });
    }
    render(el);
    return true;
  }

  function detach(el) {
    var item = items.get(el);
    if (!item) return;
    observer.unobserve(el);
    if (item.filter) item.filter.remove();
    el.style.removeProperty('--lg-filter');
    items.delete(el);
  }

  /** Re-reads data attributes and sizes (call after changing data-lg-* values). */
  function refresh() { items.forEach(function (item, el) { item.key = ''; render(el); }); }

  var api = {
    attach: attach, detach: detach, refresh: refresh, lensMap: lensMap, lensProfile: lensProfile, supported: chromium,
    /** Show the effect even if the operating system asks for reduced transparency (an explicit user choice). */
    force: function (on) { forced = on !== false; refresh(); },
    get reduced() { return reduced(); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LiquidGlass = api;
  if (typeof document !== 'undefined') {
    var start = function () { document.querySelectorAll('[data-liquid-glass]').forEach(attach); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
