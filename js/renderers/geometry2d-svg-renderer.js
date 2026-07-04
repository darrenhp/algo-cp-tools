/**
 * 二维几何 SVG 自绘渲染器
 * 纯原生 SVG 字符串构造，无第三方库。
 * 绘制层次：背景 -> 网格 -> 坐标轴 -> 刻度标签 -> 直线(无限) -> 长方形 -> 多边形 -> 线段 -> AABB -> 点。
 * 坐标变换：数学 y 向上 -> SVG y 向下（翻转）。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var VIEW_W = 640;
  var VIEW_H = 440;
  var PAD = 44; // svg 边距，留给刻度标签

  // 实体颜色
  var COL_POINT = '#6366f1';     // 点 / 线段
  var COL_LINE = '#0ea5e9';      // 直线（无限）
  var COL_POLY = '#16a34a';      // 多边形
  var COL_RECT = '#f59e0b';      // 长方形

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** nice interval：选取 1/2/5 x 10^k 的刻度间隔。返回 {step, start}。 */
  function niceTicks(min, max, target) {
    var range = max - min;
    if (range <= 0) range = 1;
    var raw = range / target;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    step *= mag;
    var start = Math.floor(min / step) * step;
    return { step: step, start: start };
  }

  function fmtNum(v, step) {
    var decimals = 0;
    if (step < 1) {
      decimals = Math.max(0, Math.ceil(-Math.log10(step)));
    }
    var s = v.toFixed(decimals);
    if (s === '-0' || s === '-0.0' || s === '-0.00') s = '0';
    return s;
  }

  /** Liang-Barsky：将无限直线裁剪到矩形 [xmin,ymin,xmax,ymax]。返回两端点或 null。 */
  function clipInfiniteLine(x0, y0, x1, y1, xmin, ymin, xmax, ymax) {
    var dx = x1 - x0, dy = y1 - y0;
    var p = [-dx, dx, -dy, dy];
    var q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
    var u1 = -Infinity, u2 = Infinity;
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > u2) return null; if (t > u1) u1 = t; }
        else { if (t < u1) return null; if (t < u2) u2 = t; }
      }
    }
    if (u1 > u2) return null;
    return { x0: x0 + u1 * dx, y0: y0 + u1 * dy, x1: x0 + u2 * dx, y1: y0 + u2 * dy };
  }

  /** 有向线段在终点处的箭头（SVG 坐标）。 */
  function arrowHead(x1, y1, x2, y2, size) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var a1 = ang + Math.PI - 0.42;
    var a2 = ang + Math.PI + 0.42;
    var p1x = x2 + size * Math.cos(a1), p1y = y2 + size * Math.sin(a1);
    var p2x = x2 + size * Math.cos(a2), p2y = y2 + size * Math.sin(a2);
    return '<polygon points="' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' ' +
      p1x.toFixed(2) + ',' + p1y.toFixed(2) + ' ' +
      p2x.toFixed(2) + ',' + p2y.toFixed(2) + '" fill="' + COL_POINT + '"/>';
  }

  /**
   * 渲染。
   * @param {Geometry2DModel} model
   * @param {HTMLElement} container
   * @param {Object} options { showAABB, showConnections, showGrid, showCoords, showIndex, indexBase }
   * @returns {Promise<string>} svg 源码
   */
  function render(model, container, options) {
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'graph-svg-wrap';
    container.appendChild(wrap);

    if (!model || model.isEmpty()) {
      wrap.innerHTML = '<div class="render-error">无几何数据，请输入点/线段/直线/多边形/长方形后再渲染。</div>';
      return Promise.resolve('');
    }
    options = options || {};
    var showAABB = options.showAABB !== false;
    var showConnections = options.showConnections === true;
    var showGrid = options.showGrid !== false;
    var showCoords = options.showCoords === true;
    var showIndex = options.showIndex !== false;
    var indexBase = options.indexBase || 0;

    var bounds = model.getBounds(1);
    if (!bounds) {
      wrap.innerHTML = '<div class="render-error">无法计算坐标范围。</div>';
      return Promise.resolve('');
    }

    var minX = bounds.minX, maxX = bounds.maxX;
    var minY = bounds.minY, maxY = bounds.maxY;
    var dataW = maxX - minX;
    var dataH = maxY - minY;
    var plotW = VIEW_W - PAD * 2;
    var plotH = VIEW_H - PAD * 2;

    function sx(x) { return PAD + ((x - minX) / dataW) * plotW; }
    function sy(y) { return PAD + plotH - ((y - minY) / dataH) * plotH; }

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" width="' + VIEW_W + '" height="' + VIEW_H + '">');

    // 背景
    parts.push('<rect x="0" y="0" width="' + VIEW_W + '" height="' + VIEW_H + '" fill="#ffffff"/>');
    parts.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + plotW + '" height="' + plotH + '" fill="#fafbff" stroke="#cbd5e1" stroke-width="1"/>');

    // 网格 + 刻度
    var xticks = niceTicks(minX, maxX, 10);
    var yticks = niceTicks(minY, maxY, 8);
    var gridParts = [];
    var labelParts = [];
    for (var xv = xticks.start; xv <= maxX + xticks.step * 0.001; xv += xticks.step) {
      var px = sx(xv);
      if (px < PAD - 0.5 || px > PAD + plotW + 0.5) continue;
      if (showGrid) {
        gridParts.push('<line x1="' + px.toFixed(2) + '" y1="' + PAD + '" x2="' + px.toFixed(2) + '" y2="' + (PAD + plotH) + '" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.5"/>');
      }
      labelParts.push('<text x="' + px.toFixed(2) + '" y="' + (PAD + plotH + 14) + '" font-size="10" fill="#64748b" text-anchor="middle" font-family="monospace">' + esc(fmtNum(xv, xticks.step)) + '</text>');
    }
    for (var yv = yticks.start; yv <= maxY + yticks.step * 0.001; yv += yticks.step) {
      var py = sy(yv);
      if (py < PAD - 0.5 || py > PAD + plotH + 0.5) continue;
      if (showGrid) {
        gridParts.push('<line x1="' + PAD + '" y1="' + py.toFixed(2) + '" x2="' + (PAD + plotW) + '" y2="' + py.toFixed(2) + '" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.5"/>');
      }
      labelParts.push('<text x="' + (PAD - 6) + '" y="' + (py + 3).toFixed(2) + '" font-size="10" fill="#64748b" text-anchor="end" font-family="monospace">' + esc(fmtNum(yv, yticks.step)) + '</text>');
    }
    parts.push(gridParts.join(''));

    // 坐标轴
    var axisColor = '#334155', axisW = 1.5;
    if (0 >= minX && 0 <= maxX) {
      var ax0 = sx(0);
      parts.push('<line x1="' + ax0.toFixed(2) + '" y1="' + PAD + '" x2="' + ax0.toFixed(2) + '" y2="' + (PAD + plotH) + '" stroke="' + axisColor + '" stroke-width="' + axisW + '"/>');
    }
    if (0 >= minY && 0 <= maxY) {
      var ay0 = sy(0);
      parts.push('<line x1="' + PAD + '" y1="' + ay0.toFixed(2) + '" x2="' + (PAD + plotW) + '" y2="' + ay0.toFixed(2) + '" stroke="' + axisColor + '" stroke-width="' + axisW + '"/>');
    }
    parts.push(labelParts.join(''));
    parts.push('<text x="' + (PAD + plotW) + '" y="' + (PAD + plotH + 30) + '" font-size="10" fill="#475569" text-anchor="end" font-family="monospace">x</text>');
    parts.push('<text x="' + (PAD - 30) + '" y="' + (PAD + 4) + '" font-size="10" fill="#475569" text-anchor="start" font-family="monospace">y</text>');

    // 直线（无限延伸，裁剪到绘图区）
    for (var li = 0; li < model.lines.length; li++) {
      var ln = model.lines[li];
      var clipped = clipInfiniteLine(ln.a.x, ln.a.y, ln.b.x, ln.b.y, minX, minY, maxX, maxY);
      if (!clipped) continue;
      parts.push('<line x1="' + sx(clipped.x0).toFixed(2) + '" y1="' + sy(clipped.y0).toFixed(2) + '" x2="' + sx(clipped.x1).toFixed(2) + '" y2="' + sy(clipped.y1).toFixed(2) + '" stroke="' + COL_LINE + '" stroke-width="1.5" stroke-dasharray="2 3" stroke-opacity="0.8"/>');
      if (showIndex) {
        var lmx = (sx(clipped.x0) + sx(clipped.x1)) / 2;
        var lmy = (sy(clipped.y0) + sy(clipped.y1)) / 2;
        parts.push('<text x="' + (lmx + 4).toFixed(2) + '" y="' + (lmy - 4).toFixed(2) + '" font-size="9" fill="' + COL_LINE + '" font-family="monospace">L#' + (li + indexBase) + '</text>');
      }
    }

    // 长方形（对角线两端点 -> 轴对齐矩形）
    for (var ri = 0; ri < model.rectangles.length; ri++) {
      var r = model.rectangles[ri];
      var rx1 = Math.min(r.a.x, r.b.x), rx2 = Math.max(r.a.x, r.b.x);
      var ry1 = Math.min(r.a.y, r.b.y), ry2 = Math.max(r.a.y, r.b.y);
      var rx = sx(rx1), ry = sy(ry2);
      var rw = ((rx2 - rx1) / dataW) * plotW;
      var rh = ((ry2 - ry1) / dataH) * plotH;
      parts.push('<rect x="' + rx.toFixed(2) + '" y="' + ry.toFixed(2) + '" width="' + rw.toFixed(2) + '" height="' + rh.toFixed(2) + '" fill="rgba(245,158,11,0.08)" stroke="' + COL_RECT + '" stroke-width="1.5"/>');
    }

    // 多边形（闭合，填充+描边）
    for (var pi = 0; pi < model.polygons.length; pi++) {
      var poly = model.polygons[pi];
      if (poly.length < 2) continue;
      var coords = [];
      var pcx = 0, pcy = 0;
      for (var pj = 0; pj < poly.length; pj++) {
        coords.push(sx(poly[pj].x).toFixed(2) + ',' + sy(poly[pj].y).toFixed(2));
        pcx += poly[pj].x; pcy += poly[pj].y;
      }
      parts.push('<polygon points="' + coords.join(' ') + '" fill="rgba(22,163,74,0.1)" stroke="' + COL_POLY + '" stroke-width="1.5"/>');
      if (showIndex) {
        pcx /= poly.length; pcy /= poly.length;
        parts.push('<text x="' + (sx(pcx) + 4).toFixed(2) + '" y="' + (sy(pcy) - 4).toFixed(2) + '" font-size="9" fill="' + COL_POLY + '" font-family="monospace">P#' + (pi + indexBase) + '</text>');
      }
    }

    // 线段（有向则带箭头）
    for (var si = 0; si < model.segments.length; si++) {
      var seg = model.segments[si];
      var sx1 = sx(seg.a.x), sy1 = sy(seg.a.y), sx2 = sx(seg.b.x), sy2 = sy(seg.b.y);
      parts.push('<line x1="' + sx1.toFixed(2) + '" y1="' + sy1.toFixed(2) + '" x2="' + sx2.toFixed(2) + '" y2="' + sy2.toFixed(2) + '" stroke="' + COL_POINT + '" stroke-width="1.8" stroke-opacity="0.85"/>');
      if (seg.directed) {
        parts.push(arrowHead(sx1, sy1, sx2, sy2, 7));
      }
      // 端点小圆点
      parts.push('<circle cx="' + sx1.toFixed(2) + '" cy="' + sy1.toFixed(2) + '" r="3" fill="' + COL_POINT + '"/>');
      parts.push('<circle cx="' + sx2.toFixed(2) + '" cy="' + sy2.toFixed(2) + '" r="3" fill="' + COL_POINT + '"/>');
      if (showIndex) {
        var smx = (sx1 + sx2) / 2, smy = (sy1 + sy2) / 2;
        parts.push('<text x="' + (smx + 4).toFixed(2) + '" y="' + (smy - 4).toFixed(2) + '" font-size="9" fill="' + COL_POINT + '" font-family="monospace">S#' + (si + indexBase) + '</text>');
      }
    }

    // AABB 包围盒（虚线）
    if (showAABB) {
      var aabb = model.getAABB();
      if (aabb) {
        var aax = sx(aabb.minX), aay = sy(aabb.maxY);
        var aaw = (aabb.width / dataW) * plotW, aah = (aabb.height / dataH) * plotH;
        parts.push('<rect x="' + aax.toFixed(2) + '" y="' + aay.toFixed(2) + '" width="' + aaw.toFixed(2) + '" height="' + aah.toFixed(2) + '" fill="rgba(168,85,247,0.06)" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="6 4"/>');
        parts.push('<text x="' + (aax + 4).toFixed(2) + '" y="' + (aay + 12).toFixed(2) + '" font-size="9" fill="#a855f7" font-family="monospace">(' + esc(fmtNum(aabb.minX, 1)) + ',' + esc(fmtNum(aabb.maxY, 1)) + ')</text>');
        parts.push('<text x="' + (aax + aaw - 4).toFixed(2) + '" y="' + (aay + aah + 12).toFixed(2) + '" font-size="9" fill="#a855f7" text-anchor="end" font-family="monospace">(' + esc(fmtNum(aabb.maxX, 1)) + ',' + esc(fmtNum(aabb.minY, 1)) + ')</text>');
      }
    }

    // 点的顺序连接线
    var pts = model.points;
    if (showConnections && pts.length >= 2) {
      var pcoords = [];
      for (var k = 0; k < pts.length; k++) {
        pcoords.push(sx(pts[k].x).toFixed(2) + ',' + sy(pts[k].y).toFixed(2));
      }
      parts.push('<polyline points="' + pcoords.join(' ') + '" fill="none" stroke="' + COL_POINT + '" stroke-width="1.5" stroke-opacity="0.5"/>');
    }

    // 点（实心圆 + 序号/坐标标签）
    for (var i = 0; i < pts.length; i++) {
      var cx = sx(pts[i].x), cy = sy(pts[i].y);
      parts.push('<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="4" fill="' + COL_POINT + '" stroke="#ffffff" stroke-width="1.5"/>');
      if (showIndex) {
        parts.push('<text x="' + (cx + 7).toFixed(2) + '" y="' + (cy - 6).toFixed(2) + '" font-size="9" fill="#475569" font-family="monospace">#' + (i + indexBase) + '</text>');
      }
      if (showCoords) {
        parts.push('<text x="' + (cx + 7).toFixed(2) + '" y="' + (cy + 12).toFixed(2) + '" font-size="9" fill="#64748b" font-family="monospace">(' + esc(fmtNum(pts[i].x, 1)) + ',' + esc(fmtNum(pts[i].y, 1)) + ')</text>');
      }
    }

    parts.push('</svg>');
    var svg = parts.join('');
    wrap.innerHTML = svg;
    return Promise.resolve(svg);
  }

  NS.renderers.geometry2dSvgRenderer = { render: render };
})();
