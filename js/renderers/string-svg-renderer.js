/**
 * 字符串 SVG 渲染器
 * 按 model.vizType 分派到 11 个 renderXxx 函数。
 * 接口与 array-svg-renderer 一致：generateCode(model) → SVG 字符串，render(model, container) → Promise<code>。
 *
 * 可视化形态：
 *   kmp / z / lyndon  — 字符串行 + 条形/着色分段
 *   sa                — 排序后缀列表 + SA/rank/height 表格 + LCP 条形
 *   border / suffix-tree / suffix-bst / ac / palindrome — 树形（复用 treeLayout）
 *   sam / sequence    — 分层 DAG，转移实线标字符，link/fail 虚线
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var COLORS = {
    bg: '#ffffff',
    grid: '#e2e8f0',
    gridMinor: '#f1f5f9',
    text: '#334155',
    textLight: '#64748b',
    axis: '#475569',
    primary: '#06b6d4',
    primaryFill: '#ecfeff',
    primaryDark: '#0891b2',
    accent: '#14b8a6',
    edge: '#94a3b8',
    edgeArrow: '#475569',
    link: '#a855f7',
    leaf: '#10b981',
    leafFill: '#ecfdf5',
    clone: '#f59e0b',
    cloneFill: '#fffbeb',
    end: '#ef4444',
    bar: '#06b6d4',
    barGlow: '#67e8f9',
    factorColors: ['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9', '#84cc16', '#f43f5e']
  };

  // ======================== SVG 辅助 ========================

  function el(tag, attrs, text) {
    var s = '<' + tag;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"'; });
    s += '>';
    if (text != null) s += text;
    s += '</' + tag + '>';
    return s;
  }

  function elSelf(tag, attrs) {
    var s = '<' + tag;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"'; });
    s += '/>';
    return s;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 左上角原串+索引小表格（2 行：索引行 / 字符行），置于最上层
  // rightAlign=true 时放在右上角，避免压住左侧的标题与图示内容
  function stringRefTable(s, base, canvasW, y, rightAlign) {
    var x = 8;
    y = y === undefined ? 34 : y;
    var n = s.length;
    if (n === 0) return '';
    var maxShow = Math.min(n, 18);
    var cellW = 14, cellH = 14;
    var w = maxShow * cellW;
    var h = cellH * 2 + 2;
    if (rightAlign) {
      x = Math.max(8, canvasW - w - 10);
    }
    var frag = '';
    frag += elSelf('rect', { x: (x - 3).toFixed(2), y: (y - cellH - 1).toFixed(2), width: w + 6, height: h + 6, fill: '#ffffff', stroke: COLORS.grid, 'stroke-width': 1, rx: 3, opacity: 0.96 });
    frag += el('text', { x: (x - 3).toFixed(2), y: (y - cellH - 4).toFixed(2), 'font-size': 8, fill: COLORS.textLight }, '原串 T');
    for (var i = 0; i < maxShow; i++) {
      var ix = x + i * cellW;
      frag += el('text', { x: (ix + cellW / 2).toFixed(2), y: y.toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc(String(base + i)));
    }
    for (var j = 0; j < maxShow; j++) {
      var cx = x + j * cellW;
      frag += elSelf('rect', { x: cx.toFixed(2), y: (y + 1).toFixed(2), width: cellW, height: cellH, fill: '#f8fafc', stroke: COLORS.grid, 'stroke-width': 0.5 });
      frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (y + 11).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text, 'font-family': 'monospace', 'font-weight': 600 }, esc(s.charAt(j)));
    }
    if (n > maxShow) {
      frag += el('text', { x: (x + w + 4).toFixed(2), y: (y + 11).toFixed(2), 'font-size': 8, fill: COLORS.textLight }, '…');
    }
    return frag;
  }

  function wrapSvg(content, W, H, refTable) {
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;">' +
      content + (refTable || '') + '</svg>';
  }

  function wrapSvgWithArrows(content, W, H, colors, refTable) {
    var defs = '<defs><marker id="str-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + COLORS.edgeArrow + '"/></marker>' +
      '<marker id="str-arrow-link" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + COLORS.link + '"/></marker></defs>';
    return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;">' +
      defs + content + (refTable || '') + '</svg>';
  }

  function emptySvg(W, H, msg) {
    return wrapSvg(el('text', { x: (W / 2).toFixed(2), y: (H / 2).toFixed(2), 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.textLight }, esc(msg)), W, H);
  }

  function title(text) {
    return el('text', { x: 10, y: 18, 'font-size': 12, fill: COLORS.text, 'font-weight': 600 }, esc(text));
  }

  /** 字符串行：每字符一格，可显示索引与逐格高亮。 */
  function drawStringRow(s, x0, y, cellW, cellH, opts) {
    opts = opts || {};
    var frag = '';
    for (var i = 0; i < s.length; i++) {
      var cx = x0 + i * cellW;
      var bg = '#ffffff';
      var stroke = COLORS.grid;
      var txtColor = COLORS.text;
      if (opts.highlight && opts.highlight[i]) {
        bg = opts.highlight[i].bg;
        stroke = opts.highlight[i].stroke || stroke;
        txtColor = opts.highlight[i].fg || txtColor;
      }
      frag += elSelf('rect', { x: cx.toFixed(2), y: y.toFixed(2), width: cellW.toFixed(2), height: cellH.toFixed(2), fill: bg, stroke: stroke, 'stroke-width': 1, rx: 2 });
      frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (y + cellH / 2 + 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 13, fill: txtColor, 'font-weight': 600 }, esc(s.charAt(i) === ' ' ? '␣' : s.charAt(i)));
      if (opts.showIdx) {
        frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (y + cellH + 12).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.textLight }, esc(opts.base + i));
      }
    }
    return frag;
  }

  /** 边标签：白底小矩形 + 文本，便于压在边上。 */
  function edgeLabel(x, y, text, fontSize) {
    fontSize = fontSize || 10;
    var w = Math.max(14, String(text).length * fontSize * 0.7 + 6);
    var h = fontSize + 4;
    var frag = elSelf('rect', { x: (x - w / 2).toFixed(2), y: (y - h / 2).toFixed(2), width: w.toFixed(2), height: h.toFixed(2), fill: '#ffffff', stroke: COLORS.grid, 'stroke-width': 0.5, rx: 2 });
    frag += el('text', { x: x.toFixed(2), y: (y + fontSize / 3).toFixed(2), 'text-anchor': 'middle', 'font-size': fontSize, fill: COLORS.text, 'font-weight': 600 }, esc(text));
    return frag;
  }

  /** 计算树布局并缩放到画布。 */
  function layoutTreeNodes(rootId, childrenMap, W, H, margin, skipVirtual) {
    var pos = NS.utils.treeLayout.computeLayout(rootId, childrenMap);
    var ids = Object.keys(pos).filter(function (id) { return !(skipVirtual && Number(id) === skipVirtual); });
    var maxX = 0, maxY = 0;
    ids.forEach(function (id) { if (pos[id].x > maxX) maxX = pos[id].x; if (pos[id].y > maxY) maxY = pos[id].y; });
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom - 24;
    var sx = maxX > 0 ? plotW / maxX : 0;
    var sy = maxY > 0 ? plotH / maxY : 0;
    var scaled = {};
    ids.forEach(function (id) {
      scaled[id] = {
        x: margin.left + (maxX > 0 ? pos[id].x * sx : plotW / 2),
        y: margin.top + pos[id].y * sy
      };
    });
    return { pos: scaled, maxX: maxX, maxY: maxY };
  }

  /** 分层布局：layers[layerIndex] = [nodeId,...]，返回 {id:{x,y}}。 */
  function layeredLayout(layers, W, H, margin) {
    var positions = {};
    var nLayers = layers.length;
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom - 24;
    var layerH = nLayers > 1 ? plotH / (nLayers - 1) : 0;
    layers.forEach(function (layer, li) {
      var cnt = layer.length;
      layer.forEach(function (id, ci) {
        var x = cnt > 1 ? margin.left + (ci / (cnt - 1)) * plotW : margin.left + plotW / 2;
        var y = (nLayers > 1) ? margin.top + li * layerH : margin.top + plotH / 2;
        positions[id] = { x: x, y: y };
      });
    });
    return positions;
  }

  // ======================== KMP ========================

  function renderKMP(model, W, H) {
    var data = model.getKMP();
    var s = data.string, pi = data.prefix, n = s.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 50, right: 30, bottom: 50, left: 40 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var cellW = Math.min(40, plotW / n);
    var x0 = margin.left + (plotW - cellW * n) / 2;
    var rowY = margin.top + 20;
    var cellH = 28;
    var frag = title('KMP 前缀函数 π（π[i] = s[0..i] 最长 border 长度；上方弧箭头 i → π[i]-1 为 border 链）');
    // border 链弧线箭头（在字符串上方）：i 指向其最长 border 末尾 π[i]-1
    // 按“区间重叠”分层着色：每条弧视为区间 [π[i]-1, i]，重叠区间分到不同高度层，避免覆盖
    var arcs = [];
    for (var ai = 0; ai < n; ai++) {
      if (pi[ai] <= 0) continue;
      arcs.push({ lo: pi[ai] - 1, hi: ai, src: ai });
    }
    arcs.sort(function (a, b) { return a.lo - b.lo || a.hi - b.hi; });
    var levelEnds = [];
    arcs.forEach(function (a) {
      var lvl = -1;
      for (var t = 0; t < levelEnds.length; t++) {
        if (levelEnds[t] < a.lo) { lvl = t; break; } // 上一条在本层已结束（严格小于）才可复用
      }
      if (lvl < 0) { lvl = levelEnds.length; levelEnds.push(a.hi); }
      else if (a.hi > levelEnds[lvl]) { levelEnds[lvl] = a.hi; }
      a.lvl = lvl;
    });
    var nLevels = levelEnds.length;
    var arcStep = nLevels > 0 ? Math.min(11, (rowY - 30) / nLevels) : 11;
    arcs.forEach(function (a) {
      var peakH = 8 + a.lvl * arcStep;
      var aFrom = x0 + a.hi * cellW + cellW / 2;   // 源 i（右端）
      var aTo = x0 + a.lo * cellW + cellW / 2;     // 目标 π[i]-1（左端）
      var aMid = (aFrom + aTo) / 2;
      var aColor = COLORS.factorColors[a.src % COLORS.factorColors.length];
      frag += elSelf('path', {
        d: 'M ' + aFrom.toFixed(2) + ' ' + (rowY - 2).toFixed(2) +
           ' Q ' + aMid.toFixed(2) + ' ' + (rowY - 2 * peakH).toFixed(2) +
           ', ' + aTo.toFixed(2) + ' ' + (rowY - 2).toFixed(2),
        fill: 'none', stroke: aColor, 'stroke-width': 1.6, opacity: 0.9,
        'marker-end': 'url(#str-arrow)'
      });
    });
    frag += drawStringRow(s, x0, rowY, cellW, cellH, { showIdx: true, base: data.base });
    var barBaseY = H - margin.bottom;
    var maxBarH = Math.max(30, barBaseY - (rowY + cellH) - 30);
    var maxPi = Math.max(1, n - 1);
    for (var i = 0; i < n; i++) {
      var bh = (pi[i] / maxPi) * maxBarH;
      var bx = x0 + i * cellW;
      if (pi[i] > 0) {
        frag += elSelf('rect', { x: (bx + cellW * 0.15).toFixed(2), y: (barBaseY - bh).toFixed(2), width: (cellW * 0.7).toFixed(2), height: bh.toFixed(2), fill: COLORS.bar, stroke: '#fff', 'stroke-width': 1, rx: 2 });
      }
      frag += el('text', { x: (bx + cellW / 2).toFixed(2), y: (barBaseY - (pi[i] > 0 ? bh : 0) - 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(pi[i]));
    }
    frag += elSelf('line', { x1: (x0 - 4).toFixed(2), y1: barBaseY.toFixed(2), x2: (x0 + cellW * n + 4).toFixed(2), y2: barBaseY.toFixed(2), stroke: COLORS.axis, 'stroke-width': 1 });
    frag += el('text', { x: (x0 - 12).toFixed(2), y: (barBaseY + 4).toFixed(2), 'text-anchor': 'end', 'font-size': 10, fill: COLORS.textLight }, esc('π'));
    return wrapSvgWithArrows(frag, W, H);
  }

  // ======================== Z ========================

  function renderZ(model, W, H) {
    var data = model.getZ();
    var s = data.string, z = data.z, n = s.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 50, right: 30, bottom: 50, left: 40 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var cellW = Math.min(40, plotW / n);
    var x0 = margin.left + (plotW - cellW * n) / 2;
    var rowY = margin.top + 20;
    var cellH = 28;
    var frag = title('Z 算法（z[i] = s 与 s[i..] 的最长公共前缀长度；z[0]=n）');

    // Z-box 弧线（在字符串上方）
    for (var bi = 1; bi < n; bi++) {
      if (z[bi] <= 0) continue;
      var bx = x0 + bi * cellW;
      var bw = z[bi] * cellW;
      var arcH = Math.min(18, 6 + bi * 1.5);
      var color = COLORS.factorColors[bi % COLORS.factorColors.length];
      frag += elSelf('path', {
        d: 'M ' + bx.toFixed(2) + ' ' + rowY.toFixed(2) +
          ' Q ' + (bx + bw / 2).toFixed(2) + ' ' + (rowY - arcH).toFixed(2) +
          ', ' + (bx + bw).toFixed(2) + ' ' + rowY.toFixed(2),
        fill: 'none', stroke: color, 'stroke-width': 1.6, opacity: 0.85
      });
      frag += el('text', { x: (bx + bw / 2).toFixed(2), y: (rowY - arcH - 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: color, 'font-weight': 600 }, esc('z=' + z[bi]));
    }

    frag += drawStringRow(s, x0, rowY, cellW, cellH, { showIdx: true, base: data.base });

    // z 值条形
    var barBaseY = H - margin.bottom;
    var maxBarH = Math.max(30, barBaseY - (rowY + cellH) - 30);
    var maxZ = Math.max(1, n);
    for (var i = 0; i < n; i++) {
      var bh = (z[i] / maxZ) * maxBarH;
      var bx2 = x0 + i * cellW;
      if (z[i] > 0) {
        frag += elSelf('rect', { x: (bx2 + cellW * 0.15).toFixed(2), y: (barBaseY - bh).toFixed(2), width: (cellW * 0.7).toFixed(2), height: bh.toFixed(2), fill: COLORS.bar, stroke: '#fff', 'stroke-width': 1, rx: 2 });
      }
      frag += el('text', { x: (bx2 + cellW / 2).toFixed(2), y: (barBaseY - (z[i] > 0 ? bh : 0) - 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(z[i]));
    }
    frag += elSelf('line', { x1: (x0 - 4).toFixed(2), y1: barBaseY.toFixed(2), x2: (x0 + cellW * n + 4).toFixed(2), y2: barBaseY.toFixed(2), stroke: COLORS.axis, 'stroke-width': 1 });
    frag += el('text', { x: (x0 - 12).toFixed(2), y: (barBaseY + 4).toFixed(2), 'text-anchor': 'end', 'font-size': 10, fill: COLORS.textLight }, esc('Z'));
    return wrapSvg(frag, W, H);
  }

  // ======================== Border 树 ========================

  function renderBorder(model, W, H) {
    var data = model.getBorderTree();
    var nodes = data.nodes, edges = data.edges, n = nodes.length;
    if (n <= 1) return emptySvg(W, H, '无数据');
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; });
    edges.forEach(function (e) { if (childrenMap[e.from]) childrenMap[e.from].push(e.to); });
    Object.keys(childrenMap).forEach(function (k) { childrenMap[k].sort(function (a, b) { return a - b; }); });
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var lay = layoutTreeNodes(data.root, childrenMap, W, H, margin);
    var pos = lay.pos;
    var nodeR = Math.min(16, Math.max(8, (W - 60) / n / 2.5));
    var frag = title('Border 树（节点 = 前缀长度，边 i → π[i] 的最长 border）');
    // 边
    edges.forEach(function (e) {
      var a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      frag += elSelf('line', { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: COLORS.edge, 'stroke-width': 1.5 });
    });
    // 节点
    nodes.forEach(function (nd) {
      var p = pos[nd.id];
      if (!p) return;
      var isRoot = nd.id === data.root;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: isRoot ? COLORS.primaryFill : '#ffffff', stroke: COLORS.primary, 'stroke-width': 2 });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.text, 'font-weight': 600 }, esc(nd.len));
      // 节点右下方：前缀串（左对齐，避开正下方边与下层节点）
      var bx = p.x + nodeR + 3, by = p.y + 2;
      var blbl = nd.len > 0 ? ('"' + data.string.substring(0, nd.len) + '"') : '∅';
      frag += el('text', { x: bx.toFixed(2), y: by.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.textLight, 'font-family': 'monospace' }, esc(blbl));
    });
    return wrapSvg(frag, W, H);
  }

  // ======================== Lyndon 分解 ========================

  function renderLyndon(model, W, H) {
    var data = model.getLyndon();
    var s = data.string, factors = data.factors, n = s.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 30, right: 30, bottom: 60, left: 30 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var cellW = Math.min(40, plotW / n);
    var x0 = margin.left + (plotW - cellW * n) / 2;
    var rowY = margin.top + 10;
    var cellH = 32;
    var highlight = {};
    factors.forEach(function (f, idx) {
      var color = COLORS.factorColors[idx % COLORS.factorColors.length];
      for (var p = f.start; p < f.end; p++) {
        highlight[p] = { bg: color + '33', stroke: color, fg: COLORS.text };
      }
    });
    var frag = title('Lyndon 分解（Duval 算法，共 ' + factors.length + ' 个因子，字典序非增）');
    frag += drawStringRow(s, x0, rowY, cellW, cellH, { showIdx: true, base: data.base, highlight: highlight });

    // 因子括号 + 文本
    var braceY = rowY + cellH + 16;
    factors.forEach(function (f, idx) {
      var color = COLORS.factorColors[idx % COLORS.factorColors.length];
      var bx = x0 + f.start * cellW;
      var bw = (f.end - f.start) * cellW;
      frag += elSelf('path', {
        d: 'M ' + bx.toFixed(2) + ' ' + braceY.toFixed(2) +
          ' L ' + bx.toFixed(2) + ' ' + (braceY + 6).toFixed(2) +
          ' L ' + (bx + bw).toFixed(2) + ' ' + (braceY + 6).toFixed(2) +
          ' L ' + (bx + bw).toFixed(2) + ' ' + braceY.toFixed(2),
        fill: 'none', stroke: color, 'stroke-width': 1.8
      });
      frag += el('text', { x: (bx + bw / 2).toFixed(2), y: (braceY + 20).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: color, 'font-weight': 600 }, esc('#' + (idx + 1) + ' "' + f.text + '"'));
    });
    return wrapSvg(frag, W, H);
  }

  // ======================== 后缀数组 ========================

  function renderSA(model, W, H) {
    var data = model.getSuffixArray();
    var s = data.string, sa = data.sa, rank = data.rank, height = data.height, n = sa.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var margin = { top: 30, right: 20, bottom: 30, left: 16 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var rowH = Math.min(22, Math.max(14, plotH / (n + 1)));
    var colRank = 40, colSA = 56, colH = 44;
    var colSuf = plotW - colRank - colSA - colH;
    var xRank = margin.left;
    var xSA = xRank + colRank;
    var xH = xSA + colSA;
    var xSuf = xH + colH;
    var frag = title('后缀数组 SA（字典序升序）+ rank + height(LCP)');
    // 表头
    var hy = margin.top;
    frag += el('text', { x: (xRank + colRank / 2).toFixed(2), y: hy.toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc('rank'));
    frag += el('text', { x: (xSA + colSA / 2).toFixed(2), y: hy.toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc('SA[i]'));
    frag += el('text', { x: (xH + colH / 2).toFixed(2), y: hy.toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc('height'));
    frag += el('text', { x: (xSuf + 4).toFixed(2), y: hy.toFixed(2), 'text-anchor': 'start', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc('后缀 s[SA[i]..]'));
    frag += elSelf('line', { x1: margin.left, y1: (hy + 4).toFixed(2), x2: margin.left + plotW, y2: (hy + 4).toFixed(2), stroke: COLORS.axis, 'stroke-width': 1 });

    var maxH = Math.max(1, Math.max.apply(null, height));
    for (var i = 0; i < n; i++) {
      var ry = hy + 10 + i * rowH;
      if (i % 2 === 1) {
        frag += elSelf('rect', { x: margin.left, y: (ry - 2).toFixed(2), width: plotW, height: rowH, fill: COLORS.gridMinor });
      }
      frag += el('text', { x: (xRank + colRank / 2).toFixed(2), y: (ry + rowH / 2 + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.textLight }, esc(i));
      frag += el('text', { x: (xSA + colSA / 2).toFixed(2), y: (ry + rowH / 2 + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(data.base + sa[i]));
      // height 条
      var hbw = (height[i] / maxH) * (colH - 8);
      if (height[i] > 0) {
        frag += elSelf('rect', { x: (xH + 2).toFixed(2), y: (ry + 2).toFixed(2), width: hbw.toFixed(2), height: Math.max(4, rowH - 8), fill: COLORS.bar, opacity: 0.7, rx: 2 });
      }
      frag += el('text', { x: (xH + colH - 3).toFixed(2), y: (ry + rowH / 2 + 3).toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.text }, esc(height[i]));
      var suf = s.substring(sa[i]);
      if (suf.length > 32) suf = suf.substring(0, 30) + '…';
      frag += el('text', { x: (xSuf + 4).toFixed(2), y: (ry + rowH / 2 + 3).toFixed(2), 'text-anchor': 'start', 'font-size': 10, fill: COLORS.text, 'font-family': 'monospace' }, esc(suf));
    }
    return wrapSvg(frag, W, H);
  }

  // ======================== 后缀树 ========================

  function renderSuffixTree(model, W, H) {
    var data = model.getSuffixTree();
    var nodes = data.nodes, root = data.root, s = data.string;
    if (nodes.length === 0) return emptySvg(W, H, '无数据');
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; });
    nodes.forEach(function (nd) { if (nd.parent >= 0 && childrenMap[nd.parent]) childrenMap[nd.parent].push(nd.id); });
    Object.keys(childrenMap).forEach(function (k) { childrenMap[k].sort(function (a, b) { return nodes[a].depth - nodes[b].depth; }); });
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var lay = layoutTreeNodes(root, childrenMap, W, H, margin);
    var pos = lay.pos;
    var nodeR = Math.min(14, Math.max(7, (W - 60) / nodes.length / 2.5));
    var frag = title('后缀树（由 SA+LCP 构建，边标注子串，绿色为叶子）');
    // 边 + 标签
    nodes.forEach(function (nd) {
      if (nd.parent < 0) return;
      var a = pos[nd.parent], b = pos[nd.id];
      if (!a || !b) return;
      frag += elSelf('line', { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: COLORS.edge, 'stroke-width': 1.4 });
      var label = s.substring(nd.edgeStart, nd.edgeEnd);
      if (label.length > 12) label = label.substring(0, 11) + '…';
      frag += edgeLabel((a.x + b.x) / 2, (a.y + b.y) / 2, label);
    });
    // 节点
    nodes.forEach(function (nd) {
      var p = pos[nd.id];
      if (!p) return;
      var isLeaf = nd.leaf >= 0;
      var isRoot = nd.id === root;
      var fill = isLeaf ? COLORS.leafFill : (isRoot ? COLORS.primaryFill : '#ffffff');
      var stroke = isLeaf ? COLORS.leaf : COLORS.primary;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: fill, stroke: stroke, 'stroke-width': 2 });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text, 'font-weight': 600 }, esc(isRoot ? 'R' : (isLeaf ? data.base + nd.leaf : '')));
      // 节点右下方：代表子串（从根到该节点路径）+ 叶子后缀位置
      if (!isRoot) {
        var sx = p.x + nodeR + 3, sy = p.y + 2;
        if (nd.repr) {
          var r2 = nd.repr.length > 12 ? nd.repr.substring(0, 11) + '…' : nd.repr;
          frag += el('text', { x: sx.toFixed(2), y: sy.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.accent, 'font-family': 'monospace' }, esc('"' + r2 + '"'));
          sy += 10;
        }
        if (isLeaf) {
          frag += el('text', { x: sx.toFixed(2), y: sy.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.leaf }, esc('pos=' + (data.base + nd.leaf)));
        }
      }
    });
    return wrapSvg(frag, W, H);
  }

  // ======================== 后缀平衡树 ========================

  function renderSuffixBST(model, W, H) {
    var data = model.getSuffixBalancedTree();
    var nodes = data.nodes, root = data.root, s = data.string;
    if (nodes.length === 0) return emptySvg(W, H, '无数据');
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; if (nd.left >= 0) childrenMap[nd.id].push(nd.left); if (nd.right >= 0) childrenMap[nd.id].push(nd.right); });
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var lay = layoutTreeNodes(root, childrenMap, W, H, margin);
    var pos = lay.pos;
    var nodeR = Math.min(16, Math.max(8, (W - 60) / nodes.length / 2.5));
    var frag = title('后缀平衡树（BST，中序遍历 = 后缀字典序；左子 < 根 < 右子）');
    // 边（标 L/R）
    nodes.forEach(function (nd) {
      if (nd.left >= 0) {
        var a = pos[nd.id], b = pos[nd.left];
        if (a && b) {
          frag += elSelf('line', { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: COLORS.edge, 'stroke-width': 1.4 });
        }
      }
      if (nd.right >= 0) {
        var a2 = pos[nd.id], b2 = pos[nd.right];
        if (a2 && b2) {
          frag += elSelf('line', { x1: a2.x.toFixed(2), y1: a2.y.toFixed(2), x2: b2.x.toFixed(2), y2: b2.y.toFixed(2), stroke: COLORS.edge, 'stroke-width': 1.4 });
        }
      }
    });
    // 节点
    nodes.forEach(function (nd) {
      var p = pos[nd.id];
      if (!p) return;
      var isRoot = nd.id === root;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: isRoot ? COLORS.primaryFill : '#ffffff', stroke: COLORS.primary, 'stroke-width': 2 });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-weight': 600 }, esc(data.base + nd.suffix));
      // 节点右下方：后缀串（左对齐）
      var suf = s.substring(nd.suffix);
      if (suf.length > 16) suf = suf.substring(0, 14) + '…';
      var bsx = p.x + nodeR + 3, bsy = p.y + 2;
      frag += el('text', { x: bsx.toFixed(2), y: bsy.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.textLight, 'font-family': 'monospace' }, esc('"' + suf + '"'));
    });
    return wrapSvg(frag, W, H);
  }

  // ======================== SAM ========================

  function renderSAM(model, W, H) {
    var data = model.getSAM();
    var states = data.states;
    if (states.length === 0) return emptySvg(W, H, '无数据');
    // 按 len 分层
    var lenMax = 0;
    states.forEach(function (st) { if (st.len > lenMax) lenMax = st.len; });
    var layers = [];
    for (var l = 0; l <= lenMax; l++) layers.push([]);
    states.forEach(function (st) { layers[st.len].push(st.id); });
    // 去掉空层，但保留 len 信息用于标签；为布局紧凑，重排非空层
    var compact = layers.filter(function (ly) { return ly.length > 0; });
    var maxLayerW = 1;
    compact.forEach(function (ly) { if (ly.length > maxLayerW) maxLayerW = ly.length; });
    var margin = { top: 40, right: 30, bottom: 30, left: 30 };
    var pos = layeredLayout(compact, W, H, margin);
    var nodeR = Math.min(14, Math.max(7, (W - margin.left - margin.right) / maxLayerW / 2.4));
    var frag = title('后缀自动机 SAM（按 len 分层；实线=转移，紫色虚线=suffix link，橙色=clone 态；节点下标 len 与代表子串/endpos）');
    var arrowContent = '';
    var endpos = data.endpos || [];
    var base = data.base || 0;

    // suffix link（虚线，先画在底层）
    states.forEach(function (st) {
      if (st.link < 0) return;
      var a = pos[st.id], b = pos[st.link];
      if (!a || !b || st.id === st.link) return;
      arrowContent += elSelf('path', {
        d: 'M ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' Q ' + ((a.x + b.x) / 2 + 22).toFixed(2) + ' ' + ((a.y + b.y) / 2).toFixed(2) + ', ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2),
        fill: 'none', stroke: COLORS.link, 'stroke-width': 1.0, 'stroke-dasharray': '4 3', opacity: 0.4
      });
    });

    // 转移边（实线 + 字符标签 + 箭头）
    states.forEach(function (st) {
      Object.keys(st.next).forEach(function (c) {
        var to = st.next[c];
        var a = pos[st.id], b = pos[to];
        if (!a || !b) return;
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var sx = a.x + ux * nodeR, sy = a.y + uy * nodeR;
        var ex = b.x - ux * (nodeR + 2), ey = b.y - uy * (nodeR + 2);
        arrowContent += elSelf('line', { x1: sx.toFixed(2), y1: sy.toFixed(2), x2: ex.toFixed(2), y2: ey.toFixed(2), stroke: COLORS.edgeArrow, 'stroke-width': 1.4, 'marker-end': 'url(#str-arrow)' });
        // 标签放在边 55% 处（靠近目标侧），避开源节点下方的 len/repr/endpos 标签区
        var lt = 0.55;
        arrowContent += edgeLabel(sx + (ex - sx) * lt, sy + (ey - sy) * lt - 3, c, 8);
      });
    });

    // 节点
    states.forEach(function (st) {
      var p = pos[st.id];
      if (!p) return;
      var fill = st.isClone ? COLORS.cloneFill : (st.id === 0 ? COLORS.primaryFill : '#ffffff');
      var stroke = st.isClone ? COLORS.clone : COLORS.primary;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: fill, stroke: stroke, 'stroke-width': 2, 'stroke-dasharray': st.isClone ? '3 2' : 'none' });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text, 'font-weight': 600 }, esc(st.id));
      // 节点右下方：len 区间 + 代表子串 + endpos（左对齐，避开正下方的边与下层节点）
      var lx = p.x + nodeR + 3;
      var ly = p.y + 2;
      frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.textLight }, esc('len=' + st.len + (st.minlen > 1 ? ('~' + st.minlen) : '')));
      ly += 10;
      if (st.repr) {
        var r2 = st.repr.length > 6 ? st.repr.substring(0, 5) + '…' : st.repr;
        frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.accent, 'font-family': 'monospace' }, esc('"' + r2 + '"'));
        ly += 10;
      }
      var ep = endpos[st.id] || [];
      if (ep.length > 0) {
        var epStr;
        if (ep.length <= 4) {
          epStr = '{' + ep.map(function (e) { return base + e; }).join(',') + '}';
        } else {
          epStr = '{' + ep.slice(0, 2).map(function (e) { return base + e; }).join(',') + ',…}(' + ep.length + ')';
        }
        frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 7.5, fill: COLORS.link }, esc(epStr));
      }
    });

    frag += arrowContent;
    return wrapSvgWithArrows(frag, W, H);
  }

  // ======================== AC 自动机 ========================

  function renderAC(model, W, H) {
    var data = model.getACAutomaton();
    var nodes = data.nodes, patterns = data.patterns;
    if (nodes.length <= 1) return emptySvg(W, H, '无模式串');
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; });
    nodes.forEach(function (nd) { Object.keys(nd.children).forEach(function (c) { childrenMap[nd.id].push(nd.children[c]); }); });
    Object.keys(childrenMap).forEach(function (k) { childrenMap[k].sort(function (a, b) { return (nodes[a].char < nodes[b].char) ? -1 : 1; }); });
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var lay = layoutTreeNodes(0, childrenMap, W, H, margin);
    var pos = lay.pos;
    var nodeR = Math.min(14, Math.max(7, (W - 60) / nodes.length / 2.5));
    var frag = title('AC 自动机（trie + fail 链；实线=转移，紫色虚线=fail；红环=模式串结尾；节点右下方为从根到该节点的串）');
    var arrowContent = '';

    // 计算每个节点从根到该节点的路径串（BFS）
    var pathStr = {};
    pathStr[0] = '';
    var queue = [0];
    while (queue.length > 0) {
      var u = queue.shift();
      Object.keys(nodes[u].children).forEach(function (c) {
        var v = nodes[u].children[c];
        pathStr[v] = pathStr[u] + c;
        queue.push(v);
      });
    }

    // fail 链（虚线）
    nodes.forEach(function (nd) {
      if (nd.id === 0 || nd.fail === 0 || nd.fail === nd.id) return;
      var a = pos[nd.id], b = pos[nd.fail];
      if (!a || !b) return;
      arrowContent += elSelf('path', {
        d: 'M ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' Q ' + ((a.x + b.x) / 2 + 20).toFixed(2) + ' ' + ((a.y + b.y) / 2).toFixed(2) + ', ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2),
        fill: 'none', stroke: COLORS.link, 'stroke-width': 1.1, 'stroke-dasharray': '4 3', opacity: 0.55, 'marker-end': 'url(#str-arrow-link)'
      });
    });

    // trie 转移边（实线 + 字符）
    nodes.forEach(function (nd) {
      Object.keys(nd.children).forEach(function (c) {
        var to = nd.children[c];
        var a = pos[nd.id], b = pos[to];
        if (!a || !b) return;
        frag += elSelf('line', { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: COLORS.edgeArrow, 'stroke-width': 1.4 });
        frag += edgeLabel((a.x + b.x) / 2, (a.y + b.y) / 2, c);
      });
    });

    // 节点
    nodes.forEach(function (nd) {
      var p = pos[nd.id];
      if (!p) return;
      var isRoot = nd.id === 0;
      var fill = nd.isEnd ? '#fef2f2' : (isRoot ? COLORS.primaryFill : '#ffffff');
      var stroke = nd.isEnd ? COLORS.end : COLORS.primary;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: fill, stroke: stroke, 'stroke-width': 2 });
      if (nd.isEnd) {
        frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR - 3, fill: 'none', stroke: COLORS.end, 'stroke-width': 1 });
      }
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text, 'font-weight': 600 }, esc(isRoot ? 'R' : nd.id));
      // 节点右下方：从根到该节点的串
      if (!isRoot) {
        var acx = p.x + nodeR + 3, acy = p.y + 2;
        var ps = pathStr[nd.id] || '';
        if (ps.length > 10) ps = ps.substring(0, 9) + '…';
        frag += el('text', { x: acx.toFixed(2), y: acy.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: nd.isEnd ? COLORS.end : COLORS.textLight, 'font-family': 'monospace' }, esc('"' + ps + '"'));
      }
    });

    frag += arrowContent;
    return wrapSvgWithArrows(frag, W, H);
  }

  // ======================== 序列自动机 ========================

  function renderSequence(model, W, H) {
    var data = model.getSequenceAutomaton();
    var nodes = data.nodes, alphabet = data.alphabet, n = data.n;
    if (n === 0) return emptySvg(W, H, '无数据');
    var base = data.base;
    var nAlpha = alphabet.length;
    var nCols = n + 1; // 状态数（含末态）
    // 表格布局：顶部表头行（状态节点），下方每行一个字符，单元格内画箭头指向目标列
    var margin = { top: 30, right: 16, bottom: 20, left: 30 };
    var labelColW = 28; // 行首字符列宽
    var cellW = Math.min(52, Math.max(20, (W - margin.left - margin.right - labelColW) / nCols));
    var headerH = 42;
    var rowH = Math.min(32, Math.max(18, (H - margin.top - margin.bottom - headerH) / Math.max(nAlpha, 1)));
    var tableX0 = margin.left + labelColW;
    var headerY = margin.top + 18;
    var rowY0 = margin.top + headerH;
    // 列 x 坐标（单元格中心）
    var colX = [];
    for (var k = 0; k < nCols; k++) colX.push(tableX0 + k * cellW + cellW / 2);
    var nodeR = Math.min(11, Math.max(5, cellW / 3.5));
    var frag = title('序列自动机（表格：列标头=状态，行=字符；单元格内箭头指向读该字符后的目标状态）');
    var arrowContent = '';

    // 表格外框 + 网格线
    var tableW = labelColW + nCols * cellW;
    var tableH = headerH + nAlpha * rowH;
    frag += elSelf('rect', { x: margin.left.toFixed(2), y: margin.top.toFixed(2), width: tableW, height: tableH, fill: 'none', stroke: COLORS.grid, 'stroke-width': 1 });
    // 表头底分隔线
    frag += elSelf('line', { x1: margin.left.toFixed(2), y1: (margin.top + headerH).toFixed(2), x2: (margin.left + tableW).toFixed(2), y2: (margin.top + headerH).toFixed(2), stroke: COLORS.grid, 'stroke-width': 1 });
    // 行首字符列分隔线
    frag += elSelf('line', { x1: tableX0.toFixed(2), y1: margin.top.toFixed(2), x2: tableX0.toFixed(2), y2: (margin.top + tableH).toFixed(2), stroke: COLORS.grid, 'stroke-width': 1 });
    // 列分隔线
    for (var ci2 = 1; ci2 < nCols; ci2++) {
      var lx = tableX0 + ci2 * cellW;
      frag += elSelf('line', { x1: lx.toFixed(2), y1: margin.top.toFixed(2), x2: lx.toFixed(2), y2: (margin.top + tableH).toFixed(2), stroke: COLORS.gridMinor, 'stroke-width': 0.6 });
    }
    // 行分隔线
    for (var ri2 = 1; ri2 < nAlpha; ri2++) {
      var ly = margin.top + headerH + ri2 * rowH;
      frag += elSelf('line', { x1: tableX0.toFixed(2), y1: ly.toFixed(2), x2: (margin.left + tableW).toFixed(2), y2: ly.toFixed(2), stroke: COLORS.gridMinor, 'stroke-width': 0.6 });
    }

    // 表头：每个状态节点 + 对应字符
    for (var t = 0; t < nCols; t++) {
      var cx = colX[t];
      var isTerm = t === n;
      var isRoot = t === 0;
      var fill = isTerm ? COLORS.leafFill : (isRoot ? COLORS.primaryFill : '#ffffff');
      var stroke = isTerm ? COLORS.leaf : COLORS.primary;
      // 节点圆
      frag += elSelf('circle', { cx: cx.toFixed(2), cy: (headerY - 2).toFixed(2), r: nodeR, fill: fill, stroke: stroke, 'stroke-width': 2 });
      frag += el('text', { x: cx.toFixed(2), y: (headerY + 1).toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.text, 'font-weight': 600 }, esc(isTerm ? '$' : (isRoot ? '0' : String(base + (t - 1 < 0 ? 0 : t - 1)))));
      // 节点下方标 st0..stn
      frag += el('text', { x: cx.toFixed(2), y: (headerY + nodeR + 8).toFixed(2), 'text-anchor': 'middle', 'font-size': 7.5, fill: COLORS.textLight }, esc('st' + t));
      // 该状态对应的字符：st t 对应原串位置 t-1 的字符（末态=$，根=ε）
      var chLabel = isTerm ? '$' : (isRoot ? 'ε' : data.string.charAt(t - 1));
      frag += el('text', { x: cx.toFixed(2), y: (headerY + nodeR + 19).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.accent, 'font-family': 'monospace', 'font-weight': 'bold' }, esc(chLabel));
    }

    // 行：每行一个字符
    alphabet.forEach(function (c, ri) {
      var ry = rowY0 + ri * rowH + rowH / 2;
      var color = COLORS.factorColors[ri % COLORS.factorColors.length];
      // 行首字符标签
      frag += el('text', { x: (tableX0 - 8).toFixed(2), y: (ry + 3).toFixed(2), 'text-anchor': 'end', 'font-size': 11, fill: color, 'font-weight': 'bold', 'font-family': 'monospace' }, esc(c));
      // 每个状态对该字符的转移：在单元格内画箭头指向目标列
      for (var s2 = 0; s2 < nCols; s2++) {
        var to = nodes[s2].next[c];
        if (to === undefined || to < 0) continue;
        var srcX = colX[s2];
        var dstX = colX[to];
        var cellLeft = tableX0 + s2 * cellW + 2;
        var cellRight = tableX0 + (s2 + 1) * cellW - 2;
        if (to === s2) {
          // 自环：单元格内小弧
          arrowContent += elSelf('path', {
            d: 'M ' + (srcX - 3).toFixed(2) + ' ' + (ry - 1).toFixed(2) +
               ' Q ' + (srcX).toFixed(2) + ' ' + (ry - 10).toFixed(2) +
               ', ' + (srcX + 3).toFixed(2) + ' ' + (ry - 1).toFixed(2),
            fill: 'none', stroke: color, 'stroke-width': 1.2, 'marker-end': 'url(#str-arrow)'
          });
        } else if (to > s2) {
          // 向右指：从单元格右侧出发到目标列
          var sx1 = srcX;
          var ex1 = dstX;
          arrowContent += elSelf('line', { x1: sx1.toFixed(2), y1: ry.toFixed(2), x2: (ex1 - 2).toFixed(2), y2: ry.toFixed(2), stroke: color, 'stroke-width': 1.2, 'marker-end': 'url(#str-arrow)' });
        } else {
          // 向左指
          var sx2 = srcX;
          var ex2 = dstX;
          arrowContent += elSelf('line', { x1: sx2.toFixed(2), y1: ry.toFixed(2), x2: (ex2 + 2).toFixed(2), y2: ry.toFixed(2), stroke: color, 'stroke-width': 1.2, 'marker-end': 'url(#str-arrow)' });
        }
      }
    });

    frag += arrowContent;
    return wrapSvgWithArrows(frag, W, H);
  }

  // ======================== 回文树 ========================

  function renderPalindrome(model, W, H) {
    var data = model.getPalindromeTree();
    var nodes = data.nodes, s = data.string;
    if (nodes.length <= 2) return emptySvg(W, H, '无回文子串');
    // 虚拟根 -1 连接奇根(1)与偶根(0)
    var childrenMap = {};
    childrenMap[-1] = [1, 0];
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; });
    nodes.forEach(function (nd) { Object.keys(nd.next).forEach(function (c) { childrenMap[nd.id].push(nd.next[c]); }); });
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var lay = layoutTreeNodes(-1, childrenMap, W, H, margin, -1);
    var pos = lay.pos;
    var nodeR = Math.min(15, Math.max(8, (W - 60) / nodes.length / 2.5));
    var frag = title('回文树 / Eertree（左：奇根 len=-1，右：偶根 len=0；紫色虚线=fail/suffix link；节点下标 len/代表回文/endpos）');
    var arrowContent = '';
    var endpos = data.endpos || [];
    var base = data.base || 0;

    // fail 链（虚线）
    nodes.forEach(function (nd) {
      if (nd.id <= 1) return;
      if (nd.link < 0 || nd.link === nd.id) return;
      var a = pos[nd.id], b = pos[nd.link];
      if (!a || !b) return;
      arrowContent += elSelf('path', {
        d: 'M ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' Q ' + ((a.x + b.x) / 2 + 16).toFixed(2) + ' ' + ((a.y + b.y) / 2).toFixed(2) + ', ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2),
        fill: 'none', stroke: COLORS.link, 'stroke-width': 1.1, 'stroke-dasharray': '4 3', opacity: 0.55, 'marker-end': 'url(#str-arrow-link)'
      });
    });

    // next 转移边（实线 + 字符）
    nodes.forEach(function (nd) {
      Object.keys(nd.next).forEach(function (c) {
        var to = nd.next[c];
        var a = pos[nd.id], b = pos[to];
        if (!a || !b) return;
        frag += elSelf('line', { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: COLORS.edgeArrow, 'stroke-width': 1.4 });
        frag += edgeLabel((a.x + b.x) / 2, (a.y + b.y) / 2, c);
      });
    });

    // 节点
    nodes.forEach(function (nd) {
      var p = pos[nd.id];
      if (!p) return;
      var isOdd = nd.id === 1, isEven = nd.id === 0;
      var fill = isOdd ? '#fef3c7' : (isEven ? COLORS.primaryFill : '#ffffff');
      var stroke = isOdd ? COLORS.clone : COLORS.primary;
      frag += elSelf('circle', { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: nodeR, fill: fill, stroke: stroke, 'stroke-width': 2, 'stroke-dasharray': isOdd ? '3 2' : 'none' });
      frag += el('text', { x: p.x.toFixed(2), y: (p.y + 3).toFixed(2), 'text-anchor': 'middle', 'font-size': 9, fill: COLORS.text, 'font-weight': 600 }, esc(isOdd ? 'odd' : (isEven ? 'even' : nd.len)));
      // 节点右下方：len + count + 代表回文 + endpos（左对齐，避开正下方边与下层节点）
      if (!isOdd && !isEven) {
        var lx = p.x + nodeR + 3;
        var ly = p.y + 2;
        frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.textLight }, esc('len=' + nd.len + ',cnt=' + nd.count));
        ly += 10;
        if (nd.repr) {
          var r2 = nd.repr.length > 8 ? nd.repr.substring(0, 7) + '…' : nd.repr;
          frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 8, fill: COLORS.accent, 'font-family': 'monospace' }, esc('"' + r2 + '"'));
          ly += 10;
        }
        var ep = endpos[nd.id] || [];
        if (ep.length > 0) {
          var epStr;
          if (ep.length <= 6) {
            epStr = '{' + ep.map(function (e) { return base + e; }).join(',') + '}';
          } else {
            epStr = '{' + ep.slice(0, 3).map(function (e) { return base + e; }).join(',') + ',…}(' + ep.length + ')';
          }
          frag += el('text', { x: lx.toFixed(2), y: ly.toFixed(2), 'text-anchor': 'start', 'font-size': 7.5, fill: COLORS.link }, esc(epStr));
        }
      }
    });

    frag += arrowContent;
    return wrapSvgWithArrows(frag, W, H);
  }

  // ======================== 主入口 ========================

  // 位并行匹配渲染所需的局部辅助：m 位二进制串（bit m-1 在最左）
  function maskStr(m, val) {
    var s = '';
    for (var b = m - 1; b >= 0; b--) s += ((val >> b) & 1) ? '1' : '0';
    return s;
  }

  // ======================== BWT（Burrows-Wheeler 变换） ========================
  function renderBWT(model, W, H) {
    var data = model.getBWT();
    if (data.n === 0) return emptySvg(W, H, '空串');
    var base = data.base;
    var frag = { value: '' };
    frag.value += el('text', { x: 8, y: 22, 'font-size': 14, fill: COLORS.text, 'font-weight': 'bold' }, esc('BWT（Burrows-Wheeler 变换）：排序后旋转串的末字符列即 BWT = L 列'));
    var xRank = 16, xPos = xRank + 44, xF = xPos + 52, xRot = xF + 50;
    var rotColW = Math.min(W - xRot - 90, Math.max(120, data.n * 11));
    var xL = xRot + rotColW + 18;
    var rowH = 20, top = 48;
    var headY = top - 4;
    frag.value += el('text', { x: xRank, y: headY, 'font-size': 11, fill: COLORS.textLight }, '序');
    frag.value += el('text', { x: xPos, y: headY, 'font-size': 11, fill: COLORS.textLight }, '原pos');
    frag.value += el('text', { x: xF, y: headY, 'font-size': 11, fill: COLORS.textLight }, 'F');
    frag.value += el('text', { x: xRot, y: headY, 'font-size': 11, fill: COLORS.textLight }, '旋转串（按字典序排序）');
    frag.value += el('text', { x: xL, y: headY, 'font-size': 11, fill: COLORS.textLight }, 'L(BWT)');
    var y = top;
    for (var r = 0; r < data.rows.length; r++) {
      var row = data.rows[r];
      var maxRotChars = Math.max(8, Math.floor(rotColW / 7));
      var rotDisp = row.rot.length > maxRotChars ? row.rot.substring(0, maxRotChars - 1) + '…' : row.rot;
      frag.value += el('text', { x: xRank, y: y + 12, 'font-size': 10, fill: COLORS.textLight }, esc(String(r)));
      frag.value += el('text', { x: xPos, y: y + 12, 'font-size': 10, fill: COLORS.textLight }, esc(String(base + row.origPos)));
      frag.value += el('text', { x: xF, y: y + 12, 'font-size': 12, fill: COLORS.primary, 'font-weight': 'bold' }, esc(row.F));
      frag.value += el('text', { x: xRot, y: y + 12, 'font-size': 10, fill: COLORS.text, 'font-family': 'monospace' }, esc(rotDisp));
      frag.value += el('text', { x: xL, y: y + 12, 'font-size': 12, fill: COLORS.accent, 'font-weight': 'bold' }, esc(row.L));
      y += rowH;
      frag.value += elSelf('line', { x1: 8, y1: y - rowH / 2 + 2, x2: xL + 40, y2: y - rowH / 2 + 2, stroke: '#eef2f7', 'stroke-width': 1 });
    }
    var by = y + 18;
    frag.value += el('text', { x: xRank, y: by, 'font-size': 13, fill: COLORS.text, 'font-weight': 'bold' }, 'BWT =');
    frag.value += el('text', { x: xRank + 54, y: by, 'font-size': 13, fill: COLORS.accent, 'font-weight': 'bold', 'letter-spacing': '1' }, esc(data.bwt));
    frag.value += el('text', { x: xRank, y: by + 18, 'font-size': 10, fill: COLORS.textLight }, '逆变换用 LF 映射：L 中第 k 次出现的字符 c 对应 F 中第 k 次出现的 c');
    return wrapSvg(frag.value, W, Math.max(H, by + 30));
  }

  // ======================== Runs（游程 / RLE） ========================
  function renderRuns(model, W, H) {
    var data = model.getRuns();
    var s = data.string;
    var base = data.base;
    var n = s.length;
    if (n === 0) return emptySvg(W, H, '空串');
    var frag = { value: '' };
    frag.value += el('text', { x: 8, y: 22, 'font-size': 14, fill: COLORS.text, 'font-weight': 'bold' }, esc('Runs（游程 / Run-Length Encoding）：连续相同字符的最大段'));
    var cellW = Math.min(26, (W - 60) / n);
    var x0 = 16, y0 = 44;
    var palette = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fbbf24', '#fb7185'];
    var runColors = [];
    for (var i = 0; i < data.runs.length; i++) runColors.push(palette[i % palette.length]);
    var cx = x0;
    for (var ri = 0; ri < data.runs.length; ri++) {
      var run = data.runs[ri];
      var segW = run.len * cellW;
      frag.value += elSelf('rect', { x: cx.toFixed(1), y: y0, width: segW.toFixed(1), height: 24, fill: runColors[ri], rx: 3, opacity: 0.9 });
      frag.value += el('text', { x: (cx + segW / 2).toFixed(1), y: y0 + 16, 'font-size': 12, fill: '#04293a', 'text-anchor': 'middle', 'font-weight': 'bold' }, esc(run.char));
      cx += segW;
    }
    var ry = y0 + 44;
    frag.value += el('text', { x: x0, y: ry, 'font-size': 13, fill: COLORS.text, 'font-weight': 'bold' }, 'RLE =');
    frag.value += el('text', { x: x0 + 50, y: ry, 'font-size': 13, fill: COLORS.accent, 'font-weight': 'bold', 'letter-spacing': '1' }, esc(data.rle));
    var ty = ry + 24;
    frag.value += el('text', { x: x0, y: ty, 'font-size': 11, fill: COLORS.textLight }, 'run#   字符   区间[起始,终止]   长度');
    ty += 16;
    for (var k = 0; k < data.runs.length; k++) {
      var rr = data.runs[k];
      var t = '#' + k + '     ' + rr.char + '     [' + (base + rr.start) + ', ' + (base + rr.end) + ']     长 ' + rr.len;
      frag.value += el('text', { x: x0, y: ty, 'font-size': 11, fill: runColors[k] }, esc(t));
      ty += 16;
    }
    frag.value += el('text', { x: x0, y: ty + 4, 'font-size': 11, fill: COLORS.textLight }, '共 ' + data.count + ' 个 run');
    return wrapSvg(frag.value, W, Math.max(H, ty + 20));
  }

  // ======================== 位并行匹配（Shift-And / Or / BNDM） ========================
  function renderBitParallel(model, W, H, kind) {
    var data = kind === 'shift-and' ? model.getShiftAnd() : (kind === 'shift-or' ? model.getShiftOr() : model.getBNDM());
    if (data.err) return emptySvg(W, H, data.err);
    var base = data.base;
    var m = data.m;
    var frag = { value: '' };
    var titleMap = {
      'shift-and': 'Shift-And（位并行精确匹配）：D = ((D<<1)|1) & M[T[i]]，最高位=1 即匹配',
      'shift-or': 'Shift-Or（位并行精确匹配）：D = (D<<1) | R[T[i]]，最高位=0 即匹配（1=不匹配位）',
      'bndm': 'BNDM（反向位并行）：窗口内从右向左 D = ((D<<1)|1) & M[c]，最高位=1 即匹配'
    };
    frag.value += el('text', { x: 8, y: 22, 'font-size': 13, fill: COLORS.text, 'font-weight': 'bold' }, esc(titleMap[kind]));
    frag.value += el('text', { x: 8, y: 38, 'font-size': 11, fill: COLORS.textLight }, '模式 P = ' + data.P + '    主串 T = ' + data.T);
    var cells = [];
    if (kind === 'shift-and' || kind === 'shift-or') {
      for (var i = 0; i < data.steps.length; i++) {
        var st = data.steps[i];
        cells.push({ pos: base + st.i, char: st.char, d: maskStr(m, st.D), match: st.match });
      }
    } else {
      for (var r = 0; r < data.rows.length; r++) {
        var row = data.rows[r];
        cells.push({ pos: base + row.e, char: (row.e < data.T.length ? data.T.charAt(row.e) : ''), d: maskStr(m, row.D), match: row.match });
      }
    }
    var cellSize = Math.min(22, Math.max(14, (W - 220) / m));
    var xPos = 16, xChar = xPos + 56, xD = xChar + 30, xMatch = xD + m * cellSize + 16;
    var y0 = 56;
    // Shift-And/Shift-Or：说明 M[c] / R[c] 掩码含义并逐字符列出
    if (kind === 'shift-and' || kind === 'shift-or') {
      var allOnes = (1 << m) - 1;
      var isAnd = kind === 'shift-and';
      var maskName = isAnd ? 'M' : 'R';
      var maskDesc = isAnd
        ? 'M[c]：字符 c 在 P 中出现的位置集合（bit j=1 表示 P[j]=c）；D & M[T[i]] 仅保留可与当前后缀继续匹配的位'
        : 'R[c] = ~M[c]（取反）：匹配位为 0、不匹配位为 1；D | R[T[i]] 把不匹配位置 1，故 D 中 0 表示“仍可能匹配”';
      frag.value += el('text', { x: 8, y: y0, 'font-size': 11, fill: COLORS.link, 'font-weight': 'bold' }, esc(maskName + '[c] 掩码：'));
      frag.value += el('text', { x: 8 + 88, y: y0, 'font-size': 10, fill: COLORS.textLight }, esc(maskDesc));
      y0 += 16;
      // 收集 P 中出现的字符（按首次出现顺序）
      var chars = [];
      var seen = {};
      for (var pi = 0; pi < data.P.length; pi++) {
        var ch = data.P.charAt(pi);
        if (!seen[ch]) { seen[ch] = true; chars.push(ch); }
      }
      // 表头第 1 行：P 的字符（图表左→右为 bit m-1..0，对应 P[m-1]..P[0]，即 P 末位在最左）
      frag.value += el('text', { x: xChar, y: y0, 'font-size': 10, fill: COLORS.textLight }, 'c\\P');
      for (var bi = 0; bi < m; bi++) {
        frag.value += el('text', { x: (xD + bi * cellSize + (cellSize - 2) / 2).toFixed(1), y: y0, 'font-size': 10, fill: COLORS.primaryDark, 'text-anchor': 'middle', 'font-weight': 'bold' }, esc(data.P.charAt(m - 1 - bi)));
      }
      y0 += 13;
      // 表头第 2 行：位序号（左→右 = b(m-1)..b0）
      for (var bi2 = 0; bi2 < m; bi2++) {
        frag.value += el('text', { x: (xD + bi2 * cellSize + (cellSize - 2) / 2).toFixed(1), y: y0, 'font-size': 8, fill: COLORS.textLight, 'text-anchor': 'middle' }, esc('b' + (m - 1 - bi2)));
      }
      y0 += 14;
      chars.forEach(function (ch) {
        var mc = data.M[ch] !== undefined ? data.M[ch] : 0;
        var bits = isAnd ? mc : ((~mc) & allOnes);
        var bstr = maskStr(m, bits);
        frag.value += el('text', { x: xChar, y: y0, 'font-size': 11, fill: COLORS.primaryDark, 'font-weight': 'bold' }, esc(ch));
        for (var b = 0; b < m; b++) {
          var bit = bstr.charAt(b);
          var fill = bit === '1' ? (isAnd ? '#22d3ee' : '#f59e0b') : '#ffffff';
          var stroke = bit === '1' ? (isAnd ? '#0891b2' : '#d97706') : '#cbd5e1';
          frag.value += elSelf('rect', { x: (xD + b * cellSize).toFixed(1), y: (y0 - 10).toFixed(1), width: cellSize - 2, height: 14, fill: fill, stroke: stroke, 'stroke-width': 1 });
          frag.value += el('text', { x: (xD + b * cellSize + (cellSize - 2) / 2).toFixed(1), y: y0, 'font-size': 9, fill: bit === '1' ? '#04293a' : '#94a3b8', 'text-anchor': 'middle' }, bit);
        }
        y0 += 18;
      });
      y0 += 6;
      // 说明位与 P 的对应（左→右 = bit m-1..0 = P 末位..首位）
      frag.value += el('text', { x: xD, y: y0, 'font-size': 9, fill: COLORS.textLight }, esc('（图表左→右为 bit ' + (m - 1) + '..0，对应 P 末位..首位；与下方 D 表同序；bit=1 ' + (isAnd ? '表示 P 该位=c' : '表示该位为不匹配位（R=¬M）') + '）'));
      y0 += 16;
    }
    frag.value += el('text', { x: xPos, y: y0, 'font-size': 11, fill: COLORS.textLight }, '位置');
    frag.value += el('text', { x: xChar, y: y0, 'font-size': 11, fill: COLORS.textLight }, 'c');
    frag.value += el('text', { x: xD, y: y0, 'font-size': 11, fill: COLORS.textLight }, 'D(' + m + '位)');
    frag.value += el('text', { x: xMatch, y: y0, 'font-size': 11, fill: COLORS.textLight }, '匹配');
    var y = y0 + 8;
    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c];
      y += 18;
      frag.value += el('text', { x: xPos, y: y + 4, 'font-size': 10, fill: COLORS.textLight }, esc(String(cell.pos)));
      frag.value += el('text', { x: xChar, y: y + 4, 'font-size': 11, fill: COLORS.primaryDark, 'font-weight': 'bold' }, esc(cell.char));
      for (var b = 0; b < m; b++) {
        var bit = cell.d.charAt(b);
        var fill = bit === '1' ? (kind === 'shift-or' ? '#f59e0b' : '#22d3ee') : '#ffffff';
        var stroke = bit === '1' ? (kind === 'shift-or' ? '#d97706' : '#0891b2') : '#cbd5e1';
        frag.value += elSelf('rect', { x: (xD + b * cellSize).toFixed(1), y: y.toFixed(1), width: cellSize - 2, height: 16, fill: fill, stroke: stroke, 'stroke-width': 1 });
        frag.value += el('text', { x: (xD + b * cellSize + (cellSize - 2) / 2).toFixed(1), y: y + 12, 'font-size': 10, fill: bit === '1' ? '#04293a' : '#64748b', 'text-anchor': 'middle' }, bit);
      }
      if (cell.match) frag.value += el('text', { x: xMatch, y: y + 12, 'font-size': 11, fill: '#dc2626', 'font-weight': 'bold' }, '✓');
      if (c < cells.length - 1) frag.value += elSelf('line', { x1: 8, y1: y + 16, x2: W - 10, y2: y + 16, stroke: '#eef2f7', 'stroke-width': 1 });
    }
    return wrapSvg(frag.value, W, Math.max(H, y + 20));
  }

  // ======================== BOM（Backward Oracle Matching） ========================
  function renderBOM(model, W, H) {
    var data = model.getBOM();
    if (data.err) return emptySvg(W, H, data.err);
    var base = data.base;
    var frag = { value: '' };
    frag.value += el('text', { x: 8, y: 22, 'font-size': 13, fill: COLORS.text, 'font-weight': 'bold' }, esc('BOM（Backward Oracle Matching）：基于 reverse(P) 后缀 oracle（SAM）计算位移'));
    frag.value += el('text', { x: 8, y: 38, 'font-size': 11, fill: COLORS.textLight }, '模式 P = ' + data.P + '    reverse(P) = ' + data.revP + '    主串 T = ' + data.T);
    var xE = 16, xLen = xE + 110, xMatch = xLen + 110, xShift = xMatch + 70;
    var y0 = 56;
    frag.value += el('text', { x: xE, y: y0, 'font-size': 11, fill: COLORS.textLight }, '窗口末位 e');
    frag.value += el('text', { x: xLen, y: y0, 'font-size': 11, fill: COLORS.textLight }, '最长匹配长');
    frag.value += el('text', { x: xMatch, y: y0, 'font-size': 11, fill: COLORS.textLight }, '匹配?');
    frag.value += el('text', { x: xShift, y: y0, 'font-size': 11, fill: COLORS.textLight }, '位移 shift');
    var y = y0 + 8;
    for (var i = 0; i < data.rows.length; i++) {
      var row = data.rows[i];
      y += 18;
      frag.value += el('text', { x: xE, y: y + 4, 'font-size': 10, fill: COLORS.textLight }, esc(String(base + row.e)));
      frag.value += el('text', { x: xLen, y: y + 4, 'font-size': 10, fill: COLORS.text }, esc(String(row.len)));
      if (row.match) frag.value += el('text', { x: xMatch, y: y + 4, 'font-size': 10, fill: '#dc2626', 'font-weight': 'bold' }, '✓');
      else frag.value += el('text', { x: xMatch, y: y + 4, 'font-size': 10, fill: COLORS.textLight }, '·');
      frag.value += el('text', { x: xShift, y: y + 4, 'font-size': 10, fill: COLORS.accent }, esc(String(row.shift)));
      if (i < data.rows.length - 1) frag.value += elSelf('line', { x1: 8, y1: y + 16, x2: W - 10, y2: y + 16, stroke: '#eef2f7', 'stroke-width': 1 });
    }
    var my = y + 24;
    var mtxt = data.matches.length ? ('匹配位置(起始): ' + data.matches.map(function (x) { return base + x; }).join(', ')) : '无匹配';
    frag.value += el('text', { x: xE, y: my, 'font-size': 12, fill: COLORS.text, 'font-weight': 'bold' }, esc(mtxt));
    return wrapSvg(frag.value, W, Math.max(H, my + 20));
  }

  // ======================== Manacher（最长回文子串） ========================
  function renderManacher(model, W, H) {
    var data = model.getManacher();
    var s = data.string, t = data.t, d = data.d, ranges = data.ranges;
    var n = s.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var tn = t.length;
    var margin = { top: 34, right: 30, bottom: 50, left: 40 };
    var plotW = W - margin.left - margin.right;
    var plotH = H - margin.top - margin.bottom;
    var cellW = Math.min(26, plotW / tn);
    var cellH = 26;
    var x0 = margin.left + (plotW - cellW * tn) / 2;
    var rowY = margin.top + 30;
    var frag = title('Manacher 最长回文子串（插入 # 后求各中心回文半径 d[]；最长=' + data.maxLen + '）');

    // 变换串 t 行（带 # 的中心串）
    frag += el('text', { x: (x0 - 6).toFixed(2), y: (rowY - 6).toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight }, 't');
    for (var i = 0; i < tn; i++) {
      var cx = x0 + i * cellW;
      var ch = t.charAt(i);
      var isSep = ch === '#';
      frag += elSelf('rect', { x: cx.toFixed(2), y: rowY.toFixed(2), width: cellW, height: cellH, fill: isSep ? '#f1f5f9' : '#e0f2fe', stroke: COLORS.grid, 'stroke-width': 0.6 });
      frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (rowY + cellH - 8).toFixed(2), 'text-anchor': 'middle', 'font-size': 11, fill: isSep ? COLORS.textLight : COLORS.primary, 'font-family': 'monospace', 'font-weight': isSep ? 400 : 700 }, esc(ch));
    }
    // 中心索引行
    var idxY = rowY + cellH + 12;
    frag += el('text', { x: (x0 - 6).toFixed(2), y: idxY.toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight }, '中心');
    for (var c = 0; c < tn; c++) {
      frag += el('text', { x: (x0 + c * cellW + cellW / 2).toFixed(2), y: idxY.toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc(String(c)));
    }

    // 回文半径 d[] 条形（向下生长）
    var barBaseY = idxY + 16;
    var maxD = 1;
    for (var k = 0; k < tn; k++) if (d[k] > maxD) maxD = d[k];
    var maxBarH = Math.max(40, H - barBaseY - 40);
    var dLabelY = barBaseY + maxBarH + 12;
    frag += el('text', { x: (x0 - 6).toFixed(2), y: dLabelY.toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight }, 'd[]');
    for (var b = 0; b < tn; b++) {
      var bx = x0 + b * cellW;
      var bh = (d[b] / maxD) * maxBarH;
      var palLen = d[b] - 1;
      var isMaxCenter = (b === data.maxCenter);
      var barColor = isMaxCenter ? COLORS.accent : (palLen > 0 ? COLORS.primary : COLORS.grid);
      if (palLen > 0) {
        frag += elSelf('rect', { x: (bx + 2).toFixed(2), y: (barBaseY + maxBarH - bh).toFixed(2), width: Math.max(2, cellW - 4), height: bh.toFixed(2), fill: barColor, opacity: 0.8 });
      }
      // d 值标签
      frag += el('text', { x: (bx + cellW / 2).toFixed(2), y: dLabelY.toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: isMaxCenter ? COLORS.accent : COLORS.textLight, 'font-weight': isMaxCenter ? 700 : 400 }, esc(String(d[b])));
    }

    // 最长回文区间标注：在原串行下方用括号/横条标出
    if (data.maxLen > 0 && data.maxLeft >= 0) {
      var origY = barBaseY + maxBarH + 30;
      frag += el('text', { x: (x0 - 6).toFixed(2), y: origY.toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight }, '原串');
      var oCellW = Math.min(26, plotW / n);
      var ox0 = margin.left + (plotW - oCellW * n) / 2;
      for (var oi = 0; oi < n; oi++) {
        var ocx = ox0 + oi * oCellW;
        var inPal = (oi >= data.maxLeft && oi < data.maxLeft + data.maxLen);
        frag += elSelf('rect', { x: ocx.toFixed(2), y: (origY - cellH + 4).toFixed(2), width: oCellW, height: cellH - 8, fill: inPal ? '#fde68a' : '#ffffff', stroke: COLORS.grid, 'stroke-width': 0.6 });
        frag += el('text', { x: (ocx + oCellW / 2).toFixed(2), y: origY.toFixed(2), 'text-anchor': 'middle', 'font-size': 11, fill: inPal ? '#b45309' : COLORS.text, 'font-family': 'monospace', 'font-weight': 700 }, esc(s.charAt(oi)));
        frag += el('text', { x: (ocx + oCellW / 2).toFixed(2), y: (origY + 12).toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc(String(model.base + oi)));
      }
    }
    return wrapSvg(frag, W, Math.max(H, dLabelY + 60));
  }

  // ======================== Boyer-Moore（坏字符 + 好后缀） ========================
  function renderBoyerMoore(model, W, H) {
    var data = model.getBoyerMoore();
    if (data.err) return emptySvg(W, H, data.err);
    var T = data.T, P = data.P, m = data.m, n = data.n;
    var steps = data.steps, bc = data.bc, gs = data.gs;
    var base = data.base;
    var margin = { top: 34, right: 20, bottom: 30, left: 20 };
    var plotW = W - margin.left - margin.right;
    var cellW = Math.min(24, plotW / Math.max(n, 1));
    var charH = 22;
    var x0 = margin.left;
    var frag = title('Boyer-Moore（坏字符 + 好后缀；从右向左比较，失配取 max(坏字符位移, 好后缀位移)）');
    frag += el('text', { x: x0, y: (margin.top - 4).toFixed(2), 'font-size': 10, fill: COLORS.textLight }, '主串 T：');
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * cellW;
      frag += elSelf('rect', { x: cx.toFixed(2), y: margin.top.toFixed(2), width: cellW, height: charH, fill: '#f8fafc', stroke: COLORS.grid, 'stroke-width': 0.6 });
      frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (margin.top + charH - 6).toFixed(2), 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.text, 'font-family': 'monospace', 'font-weight': 600 }, esc(T.charAt(i)));
      frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (margin.top + charH + 10).toFixed(2), 'text-anchor': 'middle', 'font-size': 7.5, fill: COLORS.textLight }, esc(String(base + i)));
    }
    var y = margin.top + charH + 24;
    // 每个匹配窗口：画模式串对齐行 + 失配标注 + 位移信息
    steps.forEach(function (st, idx) {
      var pos = st.pos;
      // P 对齐行
      for (var j = 0; j < m; j++) {
        var pcx = x0 + (pos + j) * cellW;
        var mismatch = (st.mismatch === j);
        var inSuffix = (!st.matched && j > st.mismatch);
        var fill = st.matched ? '#bbf7d0' : (mismatch ? '#fecaca' : (inSuffix ? '#fde68a' : '#ffffff'));
        var stroke = st.matched ? '#16a34a' : (mismatch ? '#dc2626' : COLORS.grid);
        frag += elSelf('rect', { x: pcx.toFixed(2), y: y.toFixed(2), width: cellW, height: charH, fill: fill, stroke: stroke, 'stroke-width': 1 });
        frag += el('text', { x: (pcx + cellW / 2).toFixed(2), y: (y + charH - 6).toFixed(2), 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.text, 'font-family': 'monospace', 'font-weight': 600 }, esc(P.charAt(j)));
      }
      // 窗口编号 + 位移信息
      var info = st.matched ? ('✓ 匹配 @' + (base + pos)) : ('失配 T[' + (base + pos + st.mismatch) + "]='" + st.badChar + "' bc移=" + st.bcShift + ' gs移=' + st.gsShift + ' →移' + st.shift);
      frag += el('text', { x: x0.toFixed(2), y: (y + charH + 12).toFixed(2), 'font-size': 9, fill: st.matched ? '#16a34a' : COLORS.textLight }, esc('#' + (idx + 1) + ' ' + info));
      y += charH + 18;
    });
    // 坏字符表
    y += 8;
    frag += el('text', { x: x0.toFixed(2), y: y.toFixed(2), 'font-size': 10, fill: COLORS.primary, 'font-weight': 'bold' }, '坏字符表 bc[c]（c 在 P 中最右位置）');
    y += 16;
    var bcKeys = Object.keys(bc);
    var bcStr = bcKeys.map(function (c) { return c + ':' + bc[c]; }).join('  ');
    frag += el('text', { x: x0.toFixed(2), y: y.toFixed(2), 'font-size': 9, fill: COLORS.textLight, 'font-family': 'monospace' }, esc(bcStr));
    return wrapSvg(frag, W, Math.max(H, y + 16));
  }

  // ======================== 最小表示法（最小字典序循环移位） ========================
  function renderMinRotation(model, W, H) {
    var data = model.getMinRotation();
    var s = data.string, n = s.length;
    if (n === 0) return emptySvg(W, H, '无数据');
    var rotations = data.rotations;
    var base = data.base;
    var margin = { top: 34, right: 20, bottom: 30, left: 60 };
    var plotW = W - margin.left - margin.right;
    var cellW = Math.min(22, plotW / n);
    var rowH = Math.min(20, Math.max(14, (H - margin.top - margin.bottom - 40) / n));
    var frag = title('最小表示法（Booth 算法求字典序最小循环移位；最小起始=' + data.start + '）');
    var y = margin.top;
    // 表头
    frag += el('text', { x: (margin.left - 6).toFixed(2), y: (y + 12).toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: COLORS.textLight }, '起始\\串');
    for (var c = 0; c < n; c++) {
      frag += el('text', { x: (margin.left + c * cellW + cellW / 2).toFixed(2), y: (y + 12).toFixed(2), 'text-anchor': 'middle', 'font-size': 8, fill: COLORS.textLight }, esc(String(base + c)));
    }
    y += 18;
    // 每个循环移位一行
    var s2 = s + s;
    rotations.forEach(function (rot, idx) {
      var start = rot.start;
      var isMin = (start === data.start);
      var fill = isMin ? '#bbf7d0' : '#ffffff';
      var stroke = isMin ? '#16a34a' : COLORS.grid;
      // 起始位置标签
      frag += el('text', { x: (margin.left - 6).toFixed(2), y: (y + rowH - 4).toFixed(2), 'text-anchor': 'end', 'font-size': 9, fill: isMin ? '#16a34a' : COLORS.textLight, 'font-weight': isMin ? 700 : 400 }, esc(String(base + start)));
      for (var j = 0; j < n; j++) {
        var cx = margin.left + j * cellW;
        var ch = s2.charAt(start + j);
        frag += elSelf('rect', { x: cx.toFixed(2), y: y.toFixed(2), width: cellW, height: rowH - 2, fill: fill, stroke: stroke, 'stroke-width': 0.6 });
        frag += el('text', { x: (cx + cellW / 2).toFixed(2), y: (y + rowH - 4).toFixed(2), 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.text, 'font-family': 'monospace', 'font-weight': isMin ? 700 : 400 }, esc(ch));
      }
      // 最小行右侧标注
      if (isMin) {
        frag += el('text', { x: (margin.left + n * cellW + 6).toFixed(2), y: (y + rowH - 4).toFixed(2), 'font-size': 9, fill: '#16a34a', 'font-weight': 'bold' }, '← 最小');
      }
      y += rowH;
    });
    // 结果串
    y += 8;
    var minStr = s2.substring(data.start, data.start + n);
    frag += el('text', { x: margin.left.toFixed(2), y: y.toFixed(2), 'font-size': 10, fill: COLORS.primary, 'font-weight': 'bold' }, esc('最小循环移位（起始 ' + (base + data.start) + '）："' + minStr + '"'));
    return wrapSvg(frag, W, Math.max(H, y + 20));
  }

  function generateCode(model) {
    var n = model.size();
    var W, H;
    // 树/DAG 类需要较大画布
    switch (model.vizType) {
      case 'kmp':
      case 'z':
      case 'lyndon':
        W = Math.max(440, n * 38 + 80); if (W > 980) W = 980;
        H = 360;
        break;
      case 'sa':
        W = 680; H = Math.max(360, Math.min(640, n * 24 + 60));
        break;
      case 'border':
      case 'suffix-bst':
        W = 760; H = Math.max(360, Math.max(n, 8) * 30 + 80);
        break;
      case 'suffix-tree':
        W = 760; H = Math.max(360, Math.min(900, Math.max(n, 8) * 34 + 90));
        break;
      case 'ac': {
        var acNodes = 0;
        try { acNodes = model.getACTrie().nodes.length; } catch (e) { acNodes = Math.max(n, 8); }
        W = Math.max(760, Math.min(1400, acNodes * 36 + 80));
        H = Math.max(360, Math.min(1100, Math.max(n, acNodes * 2, 8) * 26 + 100));
        break;
      }
      case 'palindrome':
        W = 760; H = Math.max(360, Math.min(900, Math.max(n, 8) * 38 + 100));
        break;
      case 'sam': {
        var samData = model.getSAM();
        var samLayers = {};
        var samMaxLayerW = 1;
        samData.states.forEach(function (st) {
          samLayers[st.len] = (samLayers[st.len] || 0) + 1;
          if (samLayers[st.len] > samMaxLayerW) samMaxLayerW = samLayers[st.len];
        });
        var samNLayer = Object.keys(samLayers).length;
        W = Math.max(680, Math.min(1280, samMaxLayerW * 96 + 80));
        H = Math.max(480, Math.min(1200, samNLayer * 100 + 110));
        break;
      }
      case 'sequence': {
        var seqAlpha = 0;
        var seen = {};
        for (var si = 0; si < n; si++) { if (!seen[model.string.charAt(si)]) { seen[model.string.charAt(si)] = 1; seqAlpha++; } }
        W = Math.max(560, Math.min(1400, (n + 1) * 50 + 80));
        H = Math.max(320, Math.min(900, 80 + Math.max(seqAlpha, 1) * 30 + 60));
        break;
      }
      case 'bwt':
        W = 760; H = Math.max(320, n * 22 + 130);
        break;
      case 'runs':
        W = Math.max(460, n * 38 + 80); if (W > 980) W = 980; H = Math.max(360, 200);
        break;
      case 'shift-and':
      case 'shift-or':
      case 'bndm':
        W = Math.max(460, n * 30 + 280); if (W > 980) W = 980;
        H = Math.max(360, n * 22 + 130);
        // Shift-And/Or 顶部有 M[c]/R[c] 掩码表，额外加高
        if (model.vizType === 'shift-and' || model.vizType === 'shift-or') {
          var pstr = model.patternP || '';
          var uniqP = {};
          for (var pc = 0; pc < pstr.length; pc++) uniqP[pstr.charAt(pc)] = 1;
          H += Object.keys(uniqP).length * 18 + 85;
        }
        break;
      case 'bom':
        W = 640; H = Math.max(360, n * 22 + 130);
        break;
      case 'manacher':
        W = Math.max(640, Math.min(1100, n * 32 + 80));
        H = Math.max(360, 220);
        break;
      case 'boyer-moore':
        W = Math.max(640, Math.min(1100, n * 30 + 200));
        H = Math.max(360, 160 + (n > 0 ? Math.min(n * 6, 120) : 0));
        break;
      case 'min-rotation':
        W = Math.max(560, Math.min(1100, n * 30 + 80));
        H = Math.max(360, n * 22 + 140);
        break;
      default:
        W = 640; H = 360;
    }
    var base = model.base || 0;
    var padTop = 50; // 顶部为原串参考表预留的带状空间
    var svg;
    switch (model.vizType) {
      case 'kmp': svg = renderKMP(model, W, H); break;
      case 'z': svg = renderZ(model, W, H); break;
      case 'border': svg = renderBorder(model, W, H); break;
      case 'lyndon': svg = renderLyndon(model, W, H); break;
      case 'sa': svg = renderSA(model, W, H); break;
      case 'suffix-tree': svg = renderSuffixTree(model, W, H); break;
      case 'suffix-bst': svg = renderSuffixBST(model, W, H); break;
      case 'sam': svg = renderSAM(model, W, H); break;
      case 'ac': svg = renderAC(model, W, H); break;
      case 'sequence': svg = renderSequence(model, W, H); break;
      case 'palindrome': svg = renderPalindrome(model, W, H); break;
      case 'bwt': svg = renderBWT(model, W, H); break;
      case 'runs': svg = renderRuns(model, W, H); break;
      case 'shift-and': svg = renderBitParallel(model, W, H, 'shift-and'); break;
      case 'shift-or': svg = renderBitParallel(model, W, H, 'shift-or'); break;
      case 'bndm': svg = renderBitParallel(model, W, H, 'bndm'); break;
      case 'bom': svg = renderBOM(model, W, H); break;
      case 'manacher': svg = renderManacher(model, W, H); break;
      case 'boyer-moore': svg = renderBoyerMoore(model, W, H); break;
      case 'min-rotation': svg = renderMinRotation(model, W, H); break;
      default: svg = emptySvg(W, H, '未知模型');
    }
    // 把渲染内容整体下移 padTop，顶部空出带状区域放原串+索引参考表（避免与图示重叠）
    var refTable = stringRefTable(model.string, base, 8, 30, false);
    if (refTable) {
      // 1) 把内部内容包进 <g transform="translate(0,padTop)">：在第一个 <svg ...> 之后插入开 g，在 </svg> 之前插入闭 g
      //    注意：可能含 <defs>，需在 defs 之后插入 <g>。简单做法：在 <svg ...> 后、<defs> 前插入，并把 </g> 放在 </svg> 前。
      svg = svg.replace(/^(<svg[^>]*>)(\s*<defs>[\s\S]*?<\/defs>)?/, function (_, open, defs) {
        return open + (defs || '') + '<g transform="translate(0,' + padTop + ')">';
      });
      svg = svg.replace(/<\/svg>\s*$/, '</g></svg>');
      // 2) 扩大 viewBox/width/height 的 H 增加 padTop
      svg = svg.replace(/viewBox="0 0 (\d+) (\d+)"/, function (_, w, h) { return 'viewBox="0 0 ' + w + ' ' + ((+h) + padTop) + '"'; });
      svg = svg.replace(/width="(\d+)"/, function (_, w) { return 'width="' + w + '"'; });
      svg = svg.replace(/height="(\d+)"/, function (_, h) { return 'height="' + ((+h) + padTop) + '"'; });
      // 3) 在 <g> 之前插入参考表（位于顶部带状区）
      svg = svg.replace('<g transform="translate(0,' + padTop + ')">', refTable + '<g transform="translate(0,' + padTop + ')">');
    }
    return svg;
  }

  function render(model, container) {
    var code = generateCode(model);
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'graph-svg-wrap str-svg-wrap';
    wrap.innerHTML = code;
    container.appendChild(wrap);
    return Promise.resolve(code);
  }

  NS.renderers.stringSvgRenderer = { generateCode: generateCode, render: render };
})();
