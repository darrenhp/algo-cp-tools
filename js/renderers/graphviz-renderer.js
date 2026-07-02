/**
 * Graphviz 渲染器
 * 生成 DOT 语法，使用 viz.js (v2.1.2 UMD) 渲染为 SVG。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var _viz = null;
  function getViz() {
    if (_viz) return Promise.resolve(_viz);
    if (typeof Viz === 'undefined') {
      return Promise.reject(new Error('viz.js 库未加载（请检查网络/CDN）'));
    }
    _viz = new Viz();
    return Promise.resolve(_viz);
  }

  function escapeDot(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function generateCode(model) {
    var lines = [
      'digraph G {',
      '    rankdir=TB;',
      '    graph [fontname="Helvetica"];',
      '    node [shape=box, style="rounded,filled", fillcolor="#eef3ff", fontname="Helvetica"];',
      '    edge [fontname="Helvetica", fontsize=10];'
    ];
    model.getAllNodeIds().forEach(function (id) {
      var label = escapeDot(model.getNodeLabel(id));
      lines.push('    n' + id + ' [label="' + label + '"];');
    });
    model.edges.forEach(function (e) {
      var elabel = model.getEdgeLabel(e);
      if (elabel) {
        lines.push('    n' + e.from + ' -> n' + e.to + ' [label="' + escapeDot(elabel) + '"];');
      } else {
        lines.push('    n' + e.from + ' -> n' + e.to + ';');
      }
    });
    lines.push('}');
    return lines.join('\n');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(model, container) {
    var code = generateCode(model);
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'graph-svg-wrap';
    container.appendChild(wrap);

    return getViz().then(function (viz) {
      return viz.renderSVGElement(code);
    }).then(function (svg) {
      wrap.appendChild(svg);
      return code;
    }).catch(function (err) {
      _viz = null; // worker 可能已损坏，下次重建
      wrap.innerHTML = '<div class="render-error">Graphviz 渲染失败: ' +
        escapeHtml((err && err.message) ? err.message : String(err)) + '</div>';
      return code;
    });
  }

  NS.renderers.graphvizRenderer = { generateCode: generateCode, render: render };
})();
