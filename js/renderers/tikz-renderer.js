/**
 * TikZ 渲染器
 * 使用 tree-layout 计算坐标，生成绝对定位 node 代码，
 * 通过 TikZJax 在浏览器内编译为 SVG。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var TIKZ_SPECIALS = {
    '\\': '\\textbackslash{}',
    '%': '\\%',
    '&': '\\&',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}'
  };

  function escapeTikz(s) {
    return String(s).replace(/[\\%&$#_{}~^]/g, function (c) { return TIKZ_SPECIALS[c]; });
  }

  /** 圆形布局：节点均匀分布在圆周上，供非树图使用。 */
  function computeCircleLayout(model) {
    var positions = {};
    var ids = model.getAllNodeIds().sort(function (a, b) { return Number(a) - Number(b); });
    var n = ids.length;
    var radius = Math.max(2, n / (2 * Math.PI));
    for (var i = 0; i < n; i++) {
      var angle = (2 * Math.PI * i) / n;
      positions[ids[i]] = { x: (radius * Math.cos(angle)).toFixed(2), y: (radius * Math.sin(angle)).toFixed(2) };
    }
    return positions;
  }

  function generateCode(model) {
    var graphType = model.graphType;
    var directed = model.isDirected();
    var positions;
    if (graphType === 'rooted-tree') {
      var childrenMap = model.getChildrenMap();
      var treePos = NS.utils.treeLayout.computeLayout(model.root, childrenMap);
      var scale = 1.6;
      positions = {};
      Object.keys(treePos).forEach(function (id) {
        positions[id] = { x: (treePos[id].x * scale).toFixed(2), y: (-treePos[id].y * scale).toFixed(2) };
      });
    } else {
      positions = computeCircleLayout(model);
    }
    var LB = String.fromCharCode(92); // backslash
    var arrowOpt = directed ? '[-Stealth]' : '';

    var lines = [];
    lines.push(LB + 'begin{tikzpicture}[');
    lines.push('  every node/.style={circle, draw, inner sep=2pt, align=center, font=' + LB + 'small}');
    lines.push(']');

    model.getAllNodeIds().forEach(function (id) {
      var p = positions[id];
      if (!p) return;
      var x = p.x;
      var y = p.y;
      var label = escapeTikz(model.getNodeLabel(id));
      lines.push(LB + 'node (n' + id + ') at (' + x + ',' + y + ') {' + label + '};');
    });

    model.edges.forEach(function (e) {
      var elabel = model.getEdgeLabel(e);
      if (elabel) {
        var lbl = escapeTikz(elabel);
        lines.push(LB + 'draw' + arrowOpt + ' (n' + e.from + ') -- node[midway, draw=none, fill=white, font=' + LB + 'tiny] {' + lbl + '} (n' + e.to + ');');
      } else {
        lines.push(LB + 'draw' + arrowOpt + ' (n' + e.from + ') -- (n' + e.to + ');');
      }
    });

    lines.push(LB + 'end{tikzpicture}');
    return lines.join('\n');
  }

  function tikzjaxLoaded() {
    return !!document.querySelector('script[src*="tikzjax"]');
  }

  function render(model, container) {
    var code = generateCode(model);
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'graph-svg-wrap tikz-wrap';
    container.appendChild(wrap);

    var script = document.createElement('script');
    script.type = 'text/tikz';
    script.textContent = code;
    wrap.appendChild(script);

    var note = document.createElement('div');
    note.className = 'render-note';
    if (!tikzjaxLoaded()) {
      note.textContent = 'TikZJax 未加载（需联网），已显示生成代码供复制到 LaTeX。';
    } else {
      note.textContent = 'TikZJax 编译中（首次加载约 5MB，可能较慢）…';
    }
    wrap.appendChild(note);
    return Promise.resolve(code);
  }

  NS.renderers.tikzRenderer = { generateCode: generateCode, render: render };
})();
