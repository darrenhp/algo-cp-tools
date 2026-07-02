/**
 * 应用入口
 * 初始化 Mermaid、Tab 切换、有根树 Tab。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function initMermaid() {
    if (typeof mermaid !== 'undefined') {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
      } catch (e) {
        console.warn('mermaid 初始化失败:', e);
      }
    }
  }

  function initTabs() {
    var buttons = document.querySelectorAll('.tab-btn');
    var contents = document.querySelectorAll('.tab-content');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
        contents.forEach(function (c) {
          c.classList.toggle('active', c.id === 'tab-' + target);
        });
      });
    });
  }

  function initRootedTree() {
    var el = document.getElementById('tab-rooted-tree');
    if (el) {
      NS.state.rootedTree = new NS.tabs.RootedTreeTab(el);
    }
  }

  function init() {
    initMermaid();
    initTabs();
    initRootedTree();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
