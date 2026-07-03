/**
 * 二维几何 SVG 自绘渲染器
 * 纯原生 SVG 字符串构造，无第三方库。
 * 绘制层次：背景 -> 网格 -> 坐标轴 -> 刻度标签 -> AABB -> 点。
 * 坐标变换：数学 y 向上 -> SVG y 向下（翻转）。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var VIEW_W = 640;
  var VIEW_H = 440;
  var PAD = 44; // svg 边距，留给刻度标签

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * nice interval：根据范围与目标格数选取 1/2/5 x 10^k 的刻度间隔。
   * 返回 {step, start}（start 为对齐到 step 的起始刻度）。
   */
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
    // 根据 step 决定小数位数
    var decimals = 0;
    if (step < 1) {
      decimals = Math.max(0, Math.ceil(-Math.log10(step)));
    }
    var s = v.toFixed(decimals);
    // 去除负零
    if (s === '-0' || s === '-0.0' || s === '-0.00') s = '0';
    return s;
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

    if (!model || model.size() === 0) {
      wrap.innerHTML = '<div class="render-error">无点集数据，请输入点后再渲染。</div>';
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

    // 绘图区
    var plotW = VIEW_W - PAD * 2;
    var plotH = VIEW_H - PAD * 2;

    // 数学坐标 -> SVG 坐标
    function sx(x) {
      return PAD + ((x - minX) / dataW) * plotW;
    }
    function sy(y) {
      // y 翻转
      return PAD + plotH - ((y - minY) / dataH) * plotH;
    }

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" width="' + VIEW_W + '" height="' + VIEW_H + '">');

    // 背景
    parts.push('<rect x="0" y="0" width="' + VIEW_W + '" height="' + VIEW_H + '" fill="#ffffff"/>');
    parts.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + plotW + '" height="' + plotH + '" fill="#fafbff" stroke="#cbd5e1" stroke-width="1"/>');

    // 网格 + 刻度
    var xticks = niceTicks(minX, maxX, 10);
    var yticks = niceTicks(minY, maxY, 8);

    // 垂直网格线 + x 轴刻度标签
    var gridParts = [];
    var labelParts = [];
    for (var xv = xticks.start; xv <= maxX + xticks.step * 0.001; xv += xticks.step) {
      var px = sx(xv);
      if (px < PAD - 0.5 || px > PAD + plotW + 0.5) continue;
      if (showGrid) {
        gridParts.push('<line x1="' + px.toFixed(2) + '" y1="' + PAD + '" x2="' + px.toFixed(2) + '" y2="' + (PAD + plotH) + '" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.5"/>');
      }
      var label = fmtNum(xv, xticks.step);
      labelParts.push('<text x="' + px.toFixed(2) + '" y="' + (PAD + plotH + 14) + '" font-size="10" fill="#64748b" text-anchor="middle" font-family="monospace">' + esc(label) + '</text>');
    }
    for (var yv = yticks.start; yv <= maxY + yticks.step * 0.001; yv += yticks.step) {
      var py = sy(yv);
      if (py < PAD - 0.5 || py > PAD + plotH + 0.5) continue;
      if (showGrid) {
        gridParts.push('<line x1="' + PAD + '" y1="' + py.toFixed(2) + '" x2="' + (PAD + plotW) + '" y2="' + py.toFixed(2) + '" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.5"/>');
      }
      var ylabel = fmtNum(yv, yticks.step);
      labelParts.push('<text x="' + (PAD - 6) + '" y="' + (py + 3).toFixed(2) + '" font-size="10" fill="#64748b" text-anchor="end" font-family="monospace">' + esc(ylabel) + '</text>');
    }
    parts.push(gridParts.join(''));

    // 坐标轴：若原点在范围内则穿过原点，否则贴左/下边
    var axisColor = '#334155';
    var axisW = 1.5;
    // y 轴（x=0 若在范围内）
    if (0 >= minX && 0 <= maxX) {
      var ax0 = sx(0);
      parts.push('<line x1="' + ax0.toFixed(2) + '" y1="' + PAD + '" x2="' + ax0.toFixed(2) + '" y2="' + (PAD + plotH) + '" stroke="' + axisColor + '" stroke-width="' + axisW + '"/>');
    }
    // x 轴（y=0 若在范围内）
    if (0 >= minY && 0 <= maxY) {
      var ay0 = sy(0);
      parts.push('<line x1="' + PAD + '" y1="' + ay0.toFixed(2) + '" x2="' + (PAD + plotW) + '" y2="' + ay0.toFixed(2) + '" stroke="' + axisColor + '" stroke-width="' + axisW + '"/>');
    }

    // 刻度标签
    parts.push(labelParts.join(''));

    // 轴标题
    parts.push('<text x="' + (PAD + plotW) + '" y="' + (PAD + plotH + 30) + '" font-size="10" fill="#475569" text-anchor="end" font-family="monospace">x</text>');
    parts.push('<text x="' + (PAD - 30) + '" y="' + (PAD + 4) + '" font-size="10" fill="#475569" text-anchor="start" font-family="monospace">y</text>');

    // AABB 包围盒（虚线）
    if (showAABB) {
      var aabb = model.getAABB();
      if (aabb) {
        var ax = sx(aabb.minX);
        var ay = sy(aabb.maxY); // 左上角（y 翻转）
        var aw = (aabb.width / dataW) * plotW;
        var ah = (aabb.height / dataH) * plotH;
        parts.push('<rect x="' + ax.toFixed(2) + '" y="' + ay.toFixed(2) + '" width="' + aw.toFixed(2) + '" height="' + ah.toFixed(2) + '" fill="rgba(168,85,247,0.08)" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="6 4"/>');
        // 四角标注 min/max
        parts.push('<text x="' + (ax + 4).toFixed(2) + '" y="' + (ay + 12).toFixed(2) + '" font-size="9" fill="#a855f7" font-family="monospace">(' + esc(fmtNum(aabb.minX, 1)) + ',' + esc(fmtNum(aabb.maxY, 1)) + ')</text>');
        parts.push('<text x="' + (ax + aw - 4).toFixed(2) + '" y="' + (ay + ah + 12).toFixed(2) + '" font-size="9" fill="#a855f7" text-anchor="end" font-family="monospace">(' + esc(fmtNum(aabb.maxX, 1)) + ',' + esc(fmtNum(aabb.minY, 1)) + ')</text>');
      }
    }

    // 连接线（按输入顺序连接相邻点）
    var pts = model.points;
    if (showConnections && pts.length >= 2) {
      var coords = [];
      for (var k = 0; k < pts.length; k++) {
        coords.push(sx(pts[k].x).toFixed(2) + ',' + sy(pts[k].y).toFixed(2));
      }
      parts.push('<polyline points="' + coords.join(' ') + '" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-opacity="0.7"/>');
    }

    // 点（实心圆 + 序号/坐标标签）
    for (var i = 0; i < pts.length; i++) {
      var cx = sx(pts[i].x);
      var cy = sy(pts[i].y);
      parts.push('<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="4" fill="#6366f1" stroke="#ffffff" stroke-width="1.5"/>');
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

  function generateCode(model, options) {
    // 复用 render 的逻辑：先 render 到临时容器取 svg 字符串较重，
    // 这里直接构造与 render 一致的字符串。
    // 为保持简单，generateCode 返回 render 产出的 svg；
    // 调用方应使用 render 的 Promise 结果作为代码。
    return '';
  }

  NS.renderers.geometry2dSvgRenderer = {
    render: render,
    generateCode: generateCode
  };
})();
