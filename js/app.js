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

  var TAB_STORAGE_KEY = 'algoCpTools.activeTab';
  var TAB_SESSION_KEY = 'algoCpTools.activeTab.session';

  function setActiveTab(target) {
    var buttons = document.querySelectorAll('.tab-btn');
    var contents = document.querySelectorAll('.tab-content');
    buttons.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === target);
    });
    contents.forEach(function (c) {
      c.classList.toggle('active', c.id === 'tab-' + target);
    });
  }

  function initTabs() {
    var buttons = document.querySelectorAll('.tab-btn');
    // 恢复上次激活的 tab
    var savedTab = null;
    try { savedTab = sessionStorage.getItem(TAB_SESSION_KEY); } catch (e) {}
    if (!savedTab) {
      try { savedTab = localStorage.getItem(TAB_STORAGE_KEY); } catch (e) {}
    }
    if (savedTab) {
      setActiveTab(savedTab);
    }
    // 点击切换并持久化
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        setActiveTab(target);
        try { sessionStorage.setItem(TAB_SESSION_KEY, target); } catch (e) {}
        try { localStorage.setItem(TAB_STORAGE_KEY, target); } catch (e) {}
      });
    });
  }

  function initRootedTree() {
    var el = document.getElementById('tab-rooted-tree');
    if (el) {
      NS.state.rootedTree = new NS.tabs.RootedTreeTab(el);
    }
  }

  function initArray() {
    var el = document.getElementById('tab-array');
    if (el) {
      NS.state.array = new NS.tabs.ArrayTab(el);
    }
  }

  function initGeometry2D() {
    var el = document.getElementById('tab-geometry2d');
    if (el && NS.tabs.Geometry2DTab) {
      NS.state.geometry2d = new NS.tabs.Geometry2DTab(el);
    }
  }

  function init() {
    initMermaid();
    initTabs();
    initRootedTree();
    initArray();
    initGeometry2D();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
