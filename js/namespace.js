/**
 * 全局命名空间
 * 由于纯网页应用通过 file:// 打开，不支持 ES6 模块，
 * 故采用全局命名空间 + 传统 <script> 标签按序加载的方式。
 */
(function () {
  'use strict';
  var NS = (window.AlgoCPTools = window.AlgoCPTools || {});
  NS.models = NS.models || {};
  NS.parsers = NS.parsers || {};
  NS.renderers = NS.renderers || {};
  NS.utils = NS.utils || {};
  NS.tabs = NS.tabs || {};
  NS.state = NS.state || {};
})();
