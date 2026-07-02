/**
 * Mermaid 渲染器
 * 生成 flowchart `graph TD` 语法并调用 mermaid 渲染为 SVG。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function escapeMermaid(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function generateCode(model) {
    var lines = ['graph TD'];
    model.getAllNodeIds().forEach(function (id) {
      var label = escapeMermaid(model.getNodeLabel(id));
      lines.push('    n' + id + '["' + label + '"]');
    });
    model.edges.forEach(function (e) {
      var elabel = model.getEdgeLabel(e);
      if (elabel) {
        lines.push('    n' + e.from + ' -->| ' + escapeMermaid(elabel) + ' | n' + e.to);
      } else {
        lines.push('    n' + e.from + ' --> n' + e.to);
      }
    });
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

    if (typeof mermaid === 'undefined') {
      wrap.innerHTML = '<div class="render-error">Mermaid 库未加载（请检查网络/CDN）。</div>';
      return Promise.resolve(code);
    }
    var renderId = 'mmd-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    return mermaid.render(renderId, code).then(function (res) {
      wrap.innerHTML = res.svg;
      return code;
    }).catch(function (err) {
      wrap.innerHTML = '<div class="render-error">Mermaid 渲染失败: ' +
        escapeHtml((err && err.message) ? err.message : String(err)) + '</div>';
      return code;
    });
  }

  NS.renderers.mermaidRenderer = { generateCode: generateCode, render: render };
})();
