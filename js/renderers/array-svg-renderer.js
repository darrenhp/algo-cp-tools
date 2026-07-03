/**
 * 一维数组 SVG 渲染器
 * 统一处理 8 种可视化模型的 SVG 绘制。
 * 接口与现有渲染器一致：generateCode(model) 返回 SVG 字符串，render(model, container) 返回 Promise。
 *
 * vizType 分派：
 *   scatter    - 散点图 (i, A[i])
 *   histogram  - 柱状图
 *   bits       - 位解析（二进制 01，横向/竖向）
 *   graph      - 图（函数式图/置换环，横向数组布局）
 *   cartesian  - 笛卡尔树（复用 tree-layout）
 *   heap       - 完全二叉树
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var COLORS = {
    axis: '#475569',
    grid: '#e2e8f0',
    gridMinor: '#f1f5f9',
    text: '#334155',
    textLight: '#64748b',
    point: '#6366f1',
    pointGlow: '#818cf8',
    bar: '#6366f1',
    barHighlight: '#f59e0b',
    barBest: '#10b981',
    node: '#6366f1',
    nodeFill: '#eef3ff',
    nodeStroke: '#6366f1',
    edge: '#64748b',
    edgeArrow: '#475569',
    bitOn: '#6366f1',
    bitOnFill: '#eef3ff',
    bitOff: '#f1f5f9',
    bitOffText: '#94a3b8',
    bitSign: '#f87171',
    cycleColors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16']
  };

  // ======================== SVG 辅助 ========================

  function el(tag, attrs, text) {
    var s = '<' + tag;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"';
      });
    }
    s += '>';
    if (text != null) s += text;
    s += '</' + tag + '>';
    return s;
  }

  function elSelf(tag, attrs) {
    var s = '<' + tag;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"';
      });
    }
    s += '/>';
    return s;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ======================== 坐标系辅助 ========================

  /**
   * 计算坐标轴范围。
   * @returns {{minX,maxX,minY,maxY}} 带padding的范围
   */
  function computeRange(model, values, usePrefixSum) {
    var n = values.length;
    var dataY = usePrefixSum ? model.getPrefixSums() : values;
    var minY = 0, maxY = 0;
    for (var i = 0; i < dataY.length; i++) {
      if (dataY[i] < minY) minY = dataY[i];
      if (dataY[i] > maxY) maxY = dataY[i];
    }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    var yPad = (maxY - minY) * 0.1;
    return {
      minX: model.base - 0.5,
      maxX: model.base + n - 0.5,
      minY: minY - yPad,
      maxY: maxY + yPad
    };
  }

  /**
   * 生成坐标系（轴+网格+标签）SVG 片段。
   * @param {object} range - {minX,maxX,minY,maxY}
   * @param {number} W - SVG 宽度
   * @param {number} H - SVG 高度
   * @param {number} margin - 边距
   * @param {object} opts - {xLabel,yLabel,stepX,stepY}
   * @returns {{frag:string, toPx:function, toPy:function}}
   */
  function drawAxes(range, W, H, margin, opts) {
    opts = opts || {};
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var rangeX = range.maxX - range.minX;
    var rangeY = range.maxY - range.minY;

    function toPx(x) { return margin.left + ((x - range.minX) / rangeX) * plotW; }
    function toPy(y) { return margin.top + plotH - ((y - range.minY) / rangeY) * plotH; }

    var frag = '';

    // 背景
    frag += elSelf('rect', {
      x: margin.left, y: margin.top, width: plotW, height: plotH,
      fill: '#ffffff', stroke: 'none'
    });

    // 网格线
    var stepX = opts.stepX || 1;
    var stepY = opts.stepY || 1;
    var startX = Math.ceil(range.minX / stepX) * stepX;
    for (var gx = startX; gx <= range.maxX + 0.001; gx += stepX) {
      var px = toPx(gx);
      frag += elSelf('line', {
        x1: px.toFixed(2), y1: margin.top, x2: px.toFixed(2), y2: margin.top + plotH,
        stroke: COLORS.gridMinor, 'stroke-width': 1
      });
      frag += el('text', {
        x: px.toFixed(2), y: (margin.top + plotH + 14).toFixed(2),
        'text-anchor': 'middle', 'font-size': 10, fill: COLORS.textLight
      }, esc(Math.round(gx)));
    }
    var startY = Math.ceil(range.minY / stepY) * stepY;
    for (var gy = startY; gy <= range.maxY + 0.001; gy += stepY) {
      var py = toPy(gy);
      frag += elSelf('line', {
        x1: margin.left, y1: py.toFixed(2), x2: margin.left + plotW, y2: py.toFixed(2),
        stroke: COLORS.gridMinor, 'stroke-width': 1
      });
      frag += el('text', {
        x: (margin.left - 6).toFixed(2), y: (py + 3).toFixed(2),
        'text-anchor': 'end', 'font-size': 10, fill: COLORS.textLight
      }, esc(Math.round(gy)));
    }

    // Y=0 轴（如果范围内）
    if (range.minY < 0 && range.maxY > 0) {
      var zeroY = toPy(0);
      frag += elSelf('line', {
        x1: margin.left, y1: zeroY.toFixed(2), x2: margin.left + plotW, y2: zeroY.toFixed(2),
        stroke: COLORS.axis, 'stroke-width': 1.5
      });
    }

    // 主轴
    frag += elSelf('line', {
      x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotH,
      stroke: COLORS.axis, 'stroke-width': 1.5
    });
    frag += elSelf('line', {
      x1: margin.left, y1: margin.top + plotH, x2: margin.left + plotW, y2: margin.top + plotH,
      stroke: COLORS.axis, 'stroke-width': 1.5
    });

    // 轴标签
    if (opts.xLabel) {
      frag += el('text', {
        x: (margin.left + plotW / 2).toFixed(2), y: (H - 4).toFixed(2),
        'text-anchor': 'middle', 'font-size': 11, fill: COLORS.text, 'font-weight': 600
      }, esc(opts.xLabel));
    }
    if (opts.yLabel) {
      frag += el('text', {
        x: 12, y: (margin.top + plotH / 2).toFixed(2),
        'text-anchor': 'middle', 'font-size': 11, fill: COLORS.text, 'font-weight': 600,
        transform: 'rotate(-90 12 ' + (margin.top + plotH / 2).toFixed(2) + ')'
      }, esc(opts.yLabel));
    }

    return { frag: frag, toPx: toPx, toPy: toPy, plotW: plotW, plotH: plotH };
  }

  // ======================== 散点图 ========================

  function renderScatter(model, W, H) {
    var n = model.values.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 20, right: 20, bottom: 36, left: 44 };
    var range = computeRange(model, model.values, false);
    var ax = drawAxes(range, W, H, margin, { xLabel: '索引 i', yLabel: 'A[i]', stepY: niceStep(range.maxY - range.minY) });
    var frag = ax.frag;

    // 连线（可选）
    if (model.scatterConnect && n >= 2) {
      var pts = [];
      for (var ci = 0; ci < n; ci++) {
        pts.push(ax.toPx(model.base + ci).toFixed(2) + ' ' + ax.toPy(model.values[ci]).toFixed(2));
      }
      frag += elSelf('polyline', {
        points: pts.join(' '),
        fill: 'none', stroke: COLORS.point, 'stroke-width': 1.5,
        opacity: 0.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      });
    }

    // 散点
    for (var i = 0; i < n; i++) {
      var x = model.base + i;
      var y = model.values[i];
      var px = ax.toPx(x);
      var py = ax.toPy(y);
      // 光晕
      frag += elSelf('circle', { cx: px.toFixed(2), cy: py.toFixed(2), r: 8, fill: COLORS.pointGlow, opacity: 0.25 });
      // 点
      frag += elSelf('circle', { cx: px.toFixed(2), cy: py.toFixed(2), r: 4, fill: COLORS.point, stroke: '#fff', 'stroke-width': 1 });
      // 标签
      frag += el('text', {
        x: px.toFixed(2), y: (py - 10).toFixed(2),
        'text-anchor': 'middle', 'font-size': 9, fill: COLORS.textLight
      }, esc(y));
    }
    return wrapSvg(frag, W, H);
  }

  // ======================== 柱状图 ========================

  function renderHistogram(model, W, H) {
    var n = model.values.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 20, right: 20, bottom: 36, left: 44 };
    var range = computeRange(model, model.values, false);
    var ax = drawAxes(range, W, H, margin, { xLabel: '索引 i', yLabel: 'A[i]', stepY: niceStep(range.maxY - range.minY) });
    var frag = ax.frag;

    var barW = (ax.plotW / n) * 0.7;

    for (var i = 0; i < n; i++) {
      var x = model.base + i;
      var y = model.values[i];
      var px = ax.toPx(x);
      var py0 = ax.toPy(0);
      var py = ax.toPy(y);
      var barH = Math.abs(py0 - py);
      frag += elSelf('rect', {
        x: (px - barW / 2).toFixed(2), y: Math.min(py0, py).toFixed(2),
        width: barW.toFixed(2), height: barH.toFixed(2),
        fill: COLORS.bar, stroke: '#fff', 'stroke-width': 1, rx: 2
      });
      // 值标签
      frag += el('text', {
        x: px.toFixed(2), y: (Math.min(py0, py) - 4).toFixed(2),
        'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text
      }, esc(y));
    }

    return wrapSvg(frag, W, H);
  }

  // ======================== 位解析 ========================

  /**
   * 将数组元素展开为二进制 01 矩阵。
   * model.bitOrient: 'horizontal'（默认）每个元素占一行，位从左(低位)到右(高位)
   *                  'vertical'   每个元素占一列，位从上(低位)到下(高位)
   * 位顺序：b0（最低位）在前，b(bw-1)（最高位）在后。
   * 元素标签与索引统一放在网格最下方。
   */
  function renderBits(model, W, H) {
    var data = model.getBits();
    var rows = data.rows;
    var n = rows.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var bw = data.bitWidth;

    var orient = model.bitOrient === 'vertical' ? 'vertical' : 'horizontal';

    // 底部元素标签预留高度
    var labelH = 34;
    var margin = { top: 30, right: 30, bottom: 30 + labelH, left: 30 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;

    // 单元格尺寸
    var cellSize;
    if (orient === 'horizontal') {
      // n 行 × bw 列
      cellSize = Math.min(plotW / bw, plotH / n, 36);
    } else {
      // n 列 × bw 行
      cellSize = Math.min(plotW / n, plotH / bw, 36);
    }
    cellSize = Math.max(cellSize, 14);

    var gridW, gridH;
    if (orient === 'horizontal') {
      gridW = cellSize * bw;
      gridH = cellSize * n;
    } else {
      gridW = cellSize * n;
      gridH = cellSize * bw;
    }
    var startX = margin.left + (plotW - gridW) / 2;
    var startY = margin.top + (plotH - gridH) / 2;

    var frag = '';

    // 标题
    var bitOrder = model.bitOrder === 'msb' ? 'msb' : 'lsb';
    var orderDesc = bitOrder === 'lsb' ? '低位在前' : '高位在前';
    var title = '位解析（位宽 ' + bw + '，' + (orient === 'horizontal' ? '横向' : '竖向') + '，' + orderDesc + '）';
    frag += el('text', { x: 10, y: 18, 'font-size': 12, fill: COLORS.text, 'font-weight': 600 }, esc(title));

    // 位顺序：原 bits 从 MSB 到 LSB
    //   lsb 模式：反转，b0 在前（横向从左到右，竖向从上到下）
    //   msb 模式：不反转，b(bw-1) 在前
    var dispRows = rows.map(function (r) {
      var bits = (bitOrder === 'lsb') ? r.bits.slice().reverse() : r.bits.slice();
      return { idx: r.idx, displayIdx: r.displayIdx, value: r.value, sign: r.sign, bits: bits };
    });

    // 绘制每个元素的位矩阵
    for (var r = 0; r < n; r++) {
      var row = dispRows[r];
      var x0, y0; // 元素网格起点
      if (orient === 'horizontal') {
        x0 = startX;
        y0 = startY + r * cellSize;
      } else {
        x0 = startX + r * cellSize;
        y0 = startY;
      }

      // 负数标记（横向放左侧，竖向放元素标签上方）
      if (row.sign) {
        if (orient === 'horizontal') {
          frag += el('text', {
            x: (x0 - 6).toFixed(2), y: (y0 + cellSize / 2 + 3).toFixed(2),
            'text-anchor': 'end', 'font-size': 9, fill: COLORS.bitSign, 'font-weight': 600
          }, esc('(负)'));
        }
      }

      // 绘制每一位（b0 在前 → 横向从左到右，竖向从上到下）
      for (var b = 0; b < bw; b++) {
        var bitVal = row.bits[b];
        var cx, cy;
        if (orient === 'horizontal') {
          cx = x0 + b * cellSize;
          cy = y0;
        } else {
          cx = x0;
          cy = y0 + b * cellSize;
        }
        var isOn = bitVal === 1;
        // 单元格背景
        frag += elSelf('rect', {
          x: cx.toFixed(2), y: cy.toFixed(2),
          width: cellSize.toFixed(2), height: cellSize.toFixed(2),
          fill: isOn ? COLORS.bitOnFill : COLORS.bitOff,
          stroke: COLORS.grid, 'stroke-width': 1
        });
        // 位值文本
        frag += el('text', {
          x: (cx + cellSize / 2).toFixed(2), y: (cy + cellSize / 2 + 4).toFixed(2),
          'text-anchor': 'middle', 'font-size': Math.max(10, cellSize * 0.5),
          fill: isOn ? COLORS.bitOn : COLORS.bitOffText, 'font-weight': 600
        }, esc(bitVal));
      }

      // 元素外框（长方形，包围该元素的所有位）
      frag += elSelf('rect', {
        x: x0.toFixed(2), y: y0.toFixed(2),
        width: (orient === 'horizontal' ? gridW : cellSize).toFixed(2),
        height: (orient === 'horizontal' ? cellSize : gridH).toFixed(2),
        fill: 'none', stroke: row.sign ? COLORS.bitSign : COLORS.axis, 'stroke-width': 1.5, rx: 2
      });
    }

    // 元素标签 + id：统一放在网格最下方
    // 计算标签 Y：在 gridH 下方预留空间
    var labelY = startY + gridH + 14;
    for (var li = 0; li < n; li++) {
      var lr = dispRows[li];
      var lx, ly;
      if (orient === 'horizontal') {
        // 横向：每个元素占一行，标签放在该行下方（网格内底部右侧）
        lx = startX + gridW + 6;
        ly = startY + li * cellSize + cellSize / 2 + 3;
        frag += el('text', {
          x: lx.toFixed(2), y: ly.toFixed(2),
          'text-anchor': 'start', 'font-size': 10, fill: COLORS.text, 'font-weight': 600
        }, esc('A[' + lr.displayIdx + ']=' + lr.value));
      } else {
        // 竖向：每个元素占一列，标签放在该列底部下方
        lx = startX + li * cellSize + cellSize / 2;
        ly = labelY;
        // 第一行：索引
        frag += el('text', {
          x: lx.toFixed(2), y: ly.toFixed(2),
          'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600
        }, esc('[' + lr.displayIdx + ']'));
        // 第二行：值
        frag += el('text', {
          x: lx.toFixed(2), y: (ly + 12).toFixed(2),
          'text-anchor': 'middle', 'font-size': 9, fill: COLORS.textLight
        }, esc(String(lr.value)));
      }
    }

    // 位序标签 —— 放在无标签侧，位号根据 bitOrder 计算
    for (var bi = 0; bi < bw; bi++) {
      var bitNum = (bitOrder === 'lsb') ? bi : (bw - 1 - bi);
      if (orient === 'horizontal') {
        // 横向：位标签放在网格上方
        var bx = startX + (bi + 0.5) * cellSize;
        frag += el('text', {
          x: bx.toFixed(2), y: (startY - 6).toFixed(2),
          'text-anchor': 'middle', 'font-size': 9, fill: COLORS.textLight
        }, esc('b' + bitNum));
      } else {
        // 竖向：位标签放在网格左侧
        var by = startY + (bi + 0.5) * cellSize;
        frag += el('text', {
          x: (startX - 6).toFixed(2), y: (by + 3).toFixed(2),
          'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight
        }, esc('b' + bitNum));
      }
    }

    return wrapSvg(frag, W, H);
  }

  // ======================== 图（函数式图 / 置换环） ========================

  /**
   * 横向单行布局：所有节点在同一水平线上，按内部索引从左到右排列。
   * 有向边 i -> A[i]：
   *   - 前向边（i < j）：从节点上方出发，向上弯曲的弧线
   *   - 后向边（i > j）：从节点下方出发，向下弯曲的弧线
   *   - 自环：节点正上方画小圆
   * 边按环着色，便于辨识置换环结构。箭头颜色与边一致。
   */
  function renderGraph(model, W, H) {
    var data = model.getGraph();
    var nodes = data.nodes;
    var n = nodes.length;
    if (n === 0) return emptySvg(W, H, '无数据');

    // 横向单行布局
    var margin = { top: 40, right: 30, bottom: 40, left: 30 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var nodeR = Math.min(18, plotW / n / 2.5);
    nodeR = Math.max(nodeR, 10);
    var rowY = margin.top + plotH / 2;
    var step = n > 1 ? (plotW - 2 * nodeR) / (n - 1) : 0;
    var startX = margin.left + nodeR;

    // 节点位置：按内部索引（即序号顺序）横向排列
    var positions = {};
    for (var i = 0; i < n; i++) {
      positions[i] = {
        x: n === 1 ? margin.left + plotW / 2 : startX + i * step,
        y: rowY
      };
    }

    // 为每个节点确定所属环的颜色（用于边/节点着色）
    var nodeColor = {};
    var palette = COLORS.cycleColors;
    var usedColors = {}; // 记录用到的颜色，用于生成 marker
    for (var c = 0; c < data.cycles.length; c++) {
      var color = palette[c % palette.length];
      usedColors[color] = true;
      for (var k = 0; k < data.cycles[c].length; k++) {
        var dispIdx = data.cycles[c][k];
        var internalIdx = dispIdx - model.base;
        if (internalIdx >= 0 && internalIdx < n) nodeColor[internalIdx] = color;
      }
    }

    var frag = '';

    // 将颜色转为 marker id（替换 # 为空）
    function colorToMarkerId(col) {
      return 'arr-arrow-' + String(col).replace(/[^a-zA-Z0-9]/g, '');
    }

    // 有向边 i -> A[i]
    data.edges.forEach(function (e) {
      var from = positions[e.from], to = positions[e.to];
      if (!from || !to) return;
      var edgeColor = nodeColor[e.from] || COLORS.edge;
      usedColors[edgeColor] = true;
      var markerId = colorToMarkerId(edgeColor);

      if (e.from === e.to) {
        // 自环：节点正上方画小圆
        frag += elSelf('circle', {
          cx: from.x.toFixed(2), cy: (from.y - nodeR - 8).toFixed(2), r: 7,
          fill: 'none', stroke: edgeColor, 'stroke-width': 1.6,
          'marker-end': 'url(#' + markerId + ')'
        });
        return;
      }

      var dx = to.x - from.x, dy = to.y - from.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var sx = from.x + ux * nodeR;
      var sy = from.y + uy * nodeR;
      var ex = to.x - ux * (nodeR + 3);
      var ey = to.y - uy * (nodeR + 3);
      // 横向边用上下弯曲区分方向：from < to 向下弯，from > to 向上弯
      var bend = Math.min(50, Math.max(16, len * 0.25));
      var ctrlY = (e.from < e.to) ? rowY + bend : rowY - bend;
      frag += elSelf('path', {
        d: 'M ' + sx.toFixed(2) + ' ' + sy.toFixed(2) +
           ' Q ' + ((sx + ex) / 2).toFixed(2) + ' ' + ctrlY.toFixed(2) +
           ', ' + ex.toFixed(2) + ' ' + ey.toFixed(2),
        fill: 'none', stroke: edgeColor, 'stroke-width': 1.6,
        'marker-end': 'url(#' + markerId + ')'
      });
    });

    // 节点
    nodes.forEach(function (node) {
      var p = positions[node.idx];
      var col = nodeColor[node.idx] || COLORS.nodeStroke;
      frag += elSelf('circle', {
        cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR,
        fill: '#fff', stroke: col, 'stroke-width': 2
      });
      frag += el('text', {
        x: p.x.toFixed(2), y: (p.y + 4).toFixed(2),
        'text-anchor': 'middle', 'font-size': 11,
        fill: COLORS.text, 'font-weight': 600
      }, esc(node.displayIdx));
    });

    return wrapSvgWithGraphArrows(frag, W, H, Object.keys(usedColors));
  }

  // ======================== 笛卡尔树 ========================

  function renderCartesian(model, W, H) {
    var opts = {
      rootMode: model.cartesianRootMode === 'max' ? 'max' : 'min',
      tieMode: model.cartesianTieMode === 'large' ? 'large' : 'small'
    };
    var data = model.getCartesianTree(opts);
    var nodes = data.nodes;
    var n = nodes.length;
    if (n === 0) return emptySvg(W, H, '无数据');

    // 构建 childrenMap
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.idx] = []; });
    data.edges.forEach(function (e) {
      if (!childrenMap[e.from]) childrenMap[e.from] = [];
      childrenMap[e.from].push(e.to);
    });
    Object.keys(childrenMap).forEach(function (k) {
      childrenMap[k].sort(function (a, b) { return a - b; });
    });

    var treePos = NS.utils.treeLayout.computeLayout(data.root, childrenMap);
    // 缩放到 SVG 坐标
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var maxX = 0, maxY = 0;
    Object.keys(treePos).forEach(function (id) {
      if (treePos[id].x > maxX) maxX = treePos[id].x;
      if (treePos[id].y > maxY) maxY = treePos[id].y;
    });
    maxX = maxX || 1; maxY = maxY || 1;
    var nodeR = Math.min(18, plotW / (maxX + 1) / 2);

    var positions = {};
    Object.keys(treePos).forEach(function (id) {
      var x = margin.left + (maxX === 0 ? plotW / 2 : (treePos[id].x / maxX) * plotW);
      var y = margin.top + (maxY === 0 ? plotH / 2 : (treePos[id].y / maxY) * plotH);
      positions[id] = { x: x, y: y };
    });

    var frag = '';
    // 边
    data.edges.forEach(function (e) {
      var from = positions[e.from], to = positions[e.to];
      if (!from || !to) return;
      frag += elSelf('line', {
        x1: from.x.toFixed(2), y1: from.y.toFixed(2), x2: to.x.toFixed(2), y2: to.y.toFixed(2),
        stroke: COLORS.edge, 'stroke-width': 1.5
      });
    });

    // 节点
    nodes.forEach(function (nd) {
      var p = positions[nd.idx];
      if (!p) return;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: COLORS.nodeFill, stroke: COLORS.nodeStroke, 'stroke-width': 2 });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(nd.value));
      // 节点下方标注索引
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + nodeR + 12).toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc('[' + nd.displayIdx + ']'));
    });

    var rootDesc = opts.rootMode === 'max' ? '最大值为根' : '最小值为根';
    var tieDesc = opts.tieMode === 'large' ? '相等时下标大优先' : '相等时下标小优先';
    frag += el('text', { x: 10, y: 16, 'font-size': 11, fill: COLORS.textLight }, esc('笛卡尔树（' + rootDesc + '，' + tieDesc + '），中序遍历 = 原数组'));

    return wrapSvg(frag, W, H);
  }

  // ======================== 完全二叉树 ========================

  function renderHeap(model, W, H) {
    var data = model.getHeapTree();
    var nodes = data.nodes;
    var n = nodes.length;
    if (n === 0) return emptySvg(W, H, '无数据');

    var margin = { top: 30, right: 20, bottom: 30, left: 20 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var depth = Math.floor(Math.log2(n)) + 1;
    var levelH = plotH / Math.max(depth, 1);
    var nodeR = Math.min(18, levelH / 3, plotW / Math.pow(2, depth) / 2);
    nodeR = Math.max(nodeR, 8);

    var positions = {};
    nodes.forEach(function (nd) {
      var level = Math.floor(Math.log2(nd.idx + 1));
      var posInLevel = (nd.idx + 1) - Math.pow(2, level);
      var countInLevel = Math.pow(2, level);
      var x = margin.left + (posInLevel + 0.5) / countInLevel * plotW;
      var y = margin.top + level * levelH + levelH / 2;
      positions[nd.idx] = { x: x, y: y };
    });

    var frag = '';
    // 边
    data.edges.forEach(function (e) {
      var from = positions[e.from], to = positions[e.to];
      if (!from || !to) return;
      frag += elSelf('line', {
        x1: from.x.toFixed(2), y1: from.y.toFixed(2), x2: to.x.toFixed(2), y2: to.y.toFixed(2),
        stroke: COLORS.edge, 'stroke-width': 1.5
      });
    });

    // 节点
    nodes.forEach(function (nd) {
      var p = positions[nd.idx];
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: COLORS.nodeFill, stroke: COLORS.nodeStroke, 'stroke-width': 2 });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(nd.value));
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + nodeR + 12).toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc('[' + nd.displayIdx + ']'));
    });

    frag += el('text', { x: 10, y: 16, 'font-size': 11, fill: COLORS.textLight }, esc('完全二叉树（隐式结构），i 的左子=2i，右子=2i+1'));

    return wrapSvg(frag, W, H);
  }

  // ======================== 辅助函数 ========================

  function niceStep(range) {
    if (range <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log10(range)));
    var n = range / pow;
    var step;
    if (n < 1.5) step = 1;
    else if (n < 3) step = 2;
    else if (n < 7) step = 5;
    else step = 10;
    return step * pow;
  }

  function wrapSvg(content, W, H) {
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;">' +
      content + '</svg>';
  }

  function wrapSvgWithArrows(content, W, H) {
    var defs = '<defs><marker id="arr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + COLORS.edgeArrow + '"/></marker></defs>';
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;">' +
      defs + content + '</svg>';
  }

  function wrapSvgWithGraphArrows(content, W, H, colors) {
    // 为每种颜色生成独立 marker，使箭头颜色与边一致
    var colorToMarkerId = function (col) {
      return 'arr-arrow-' + String(col).replace(/[^a-zA-Z0-9]/g, '');
    };
    var defs = '<defs>';
    var list = colors && colors.length ? colors : [COLORS.edge];
    for (var i = 0; i < list.length; i++) {
      var col = list[i];
      var id = colorToMarkerId(col);
      defs += '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + col + '"/></marker>';
    }
    defs += '</defs>';
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;">' +
      defs + content + '</svg>';
  }

  function emptySvg(W, H, msg) {
    return wrapSvg(el('text', { x: (W / 2).toFixed(2), y: (H / 2).toFixed(2), 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.textLight }, esc(msg)), W, H);
  }

  // ======================== 主入口 ========================

  function generateCode(model) {
    var n = model.size();
    // 动态尺寸
    var W = Math.max(360, n * 38 + 80);
    if (W > 900) W = 900;
    var H = 340;
    // 树/图类需要更多空间
    if (model.vizType === 'graph' || model.vizType === 'cartesian' || model.vizType === 'heap') {
      W = 640; H = 420;
    }
    if (model.vizType === 'bits') {
      // 位矩阵：根据方向动态调整
      var bitsData = model.getBits();
      var bw = bitsData.bitWidth;
      var orient = model.bitOrient === 'vertical' ? 'vertical' : 'horizontal';
      if (orient === 'horizontal') {
        W = Math.max(420, bw * 40 + 100);
        H = Math.max(340, n * 40 + 80);
      } else {
        W = Math.max(420, n * 40 + 100);
        H = Math.max(340, bw * 40 + 80);
      }
      if (W > 900) W = 900;
      if (H > 700) H = 700;
    }

    switch (model.vizType) {
      case 'scatter': return renderScatter(model, W, H);
      case 'histogram': return renderHistogram(model, W, H);
      case 'bits': return renderBits(model, W, H);
      case 'graph': return renderGraph(model, W, H);
      case 'cartesian': return renderCartesian(model, W, H);
      case 'heap': return renderHeap(model, W, H);
      default: return emptySvg(W, H, '未知模型');
    }
  }

  function render(model, container) {
    var code = generateCode(model);
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'graph-svg-wrap arr-svg-wrap';
    wrap.innerHTML = code;
    container.appendChild(wrap);
    return Promise.resolve(code);
  }

  NS.renderers.arraySvgRenderer = { generateCode: generateCode, render: render };
})();
