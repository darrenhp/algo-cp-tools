/**
 * 一维数组 Tab 控制器
 * 通用数组可视化辅助工具：负责 DOM 绑定、模型选择、起始索引切换、解析调度、SVG 渲染。
 * 沿用 RootedTreeTab 的状态持久化模式。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var P = NS.parsers.arrayParsers;
  var renderer = NS.renderers.arraySvgRenderer;

  var STORAGE_KEY = 'algoCpTools.array';
  var SESSION_KEY = 'algoCpTools.array.session';

  // 模型定义：分组 + 名称（不含算法描述，定位为通用可视化工具）
  var MODEL_GROUPS = [
    {
      name: '几何与可视化',
      models: [
        { type: 'scatter', label: '散点图' },
        { type: 'histogram', label: '柱状图' },
        { type: 'bits', label: '位解析' }
      ]
    },
    {
      name: '图论与树形',
      models: [
        { type: 'graph', label: '图' },
        { type: 'cartesian', label: '笛卡尔树' },
        { type: 'heap', label: '完全二叉树' }
      ]
    }
  ];

  // 各模型默认示例数组
  var SAMPLES = {
    scatter: '3 1 4 1 5 9 2 6 5 3',
    histogram: '2 1 5 6 2 3',
    bits: '5 3 12 7 10',
    graph: '3 1 2 4 6 5',
    cartesian: '3 1 4 1 5 9 2 6',
    heap: '9 8 7 6 5 4 3 2 1'
  };

  function ArrayTab(rootEl) {
    this.rootEl = rootEl;
    this.model = new NS.models.ArrayModel();
    this.vizType = 'scatter';
    this.base = 0;
    this.scatterConnect = false; // 散点图是否连线，仅 scatter 模型使用
    this.bitOrient = 'horizontal'; // 'horizontal' | 'vertical'，仅 bits 模型使用
    this.bitOrder = 'lsb'; // 'lsb' | 'msb'，仅 bits 模型使用，LSB优先=低位在前
    this.cartesianRootMode = 'min'; // 'min' | 'max'，仅 cartesian 模型使用
    this.cartesianTieMode = 'small'; // 'small' | 'large'，仅 cartesian 模型使用
    this._buildModelButtons();
    this.cacheDom();
    this.bindEvents();
    var saved = this.loadState();
    if (saved) {
      this.applyState(saved);
    } else {
      this.loadSample();
    }
    this.parse();
    this.bindPersistEvents();
  }

  // ======================== 模型按钮构建 ========================

  ArrayTab.prototype._buildModelButtons = function () {
    var container = this.rootEl.querySelector('#arr-model-groups');
    if (!container) return;
    container.innerHTML = '';
    MODEL_GROUPS.forEach(function (group) {
      var groupEl = document.createElement('div');
      groupEl.className = 'arr-model-group';
      var title = document.createElement('div');
      title.className = 'arr-model-group-title';
      title.textContent = group.name;
      groupEl.appendChild(title);
      group.models.forEach(function (m) {
        var btn = document.createElement('button');
        btn.className = 'arr-model-btn';
        btn.setAttribute('data-viz-type', m.type);
        btn.textContent = m.label;
        groupEl.appendChild(btn);
      });
      container.appendChild(groupEl);
    });
  };

  // ======================== DOM 缓存 ========================

  ArrayTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.modelGroupsEl = el.querySelector('#arr-model-groups');
    this.inputText = el.querySelector('#arr-input-text');
    this.baseBtns = el.querySelectorAll('.arr-base-btn');
    this.parseBtn = el.querySelector('#arr-parse-btn');
    this.parseStatus = el.querySelector('#arr-parse-status');
    this.clearBtn = el.querySelector('#arr-clear-btn');
    this.graphOutput = el.querySelector('#arr-graph-output');
    this.codeOutput = el.querySelector('#arr-code-output');
    this.scatterOptsWrap = el.querySelector('#arr-scatter-opts');
    this.scatterConnectInput = el.querySelector('#arr-scatter-connect');
    this.bitOrientWrap = el.querySelector('#arr-bit-orient');
    this.bitOrientBtns = el.querySelectorAll('.arr-orient-btn');
    this.bitOrderBtns = el.querySelectorAll('.arr-bit-order-btn');
    this.cartesianOptsWrap = el.querySelector('#arr-cartesian-opts');
    this.cartesianRootBtns = el.querySelectorAll('.arr-cart-root-btn');
    this.cartesianTieBtns = el.querySelectorAll('.arr-cart-tie-btn');
  };

  // ======================== 事件绑定 ========================

  ArrayTab.prototype.bindEvents = function () {
    var self = this;
    if (this.parseBtn) this.parseBtn.addEventListener('click', function () { self.parse(); });
    if (this.clearBtn) this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    if (this.scatterConnectInput) this.scatterConnectInput.addEventListener('change', function () {
      self.setScatterConnect(this.checked);
      self.parse();
    });
    if (this.modelGroupsEl) this.modelGroupsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.arr-model-btn');
      if (!btn) return;
      self.setVizType(btn.getAttribute('data-viz-type'));
      self.parse();
    });
    for (var i = 0; i < this.baseBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.setBase(Number(btn.getAttribute('data-base')));
          self.parse();
        });
      })(this.baseBtns[i]);
    }
    for (var j = 0; j < this.bitOrientBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.setBitOrient(btn.getAttribute('data-orient'));
          self.parse();
        });
      })(this.bitOrientBtns[j]);
    }
    for (var bo = 0; bo < this.bitOrderBtns.length; bo++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.setBitOrder(btn.getAttribute('data-order'));
          self.parse();
        });
      })(this.bitOrderBtns[bo]);
    }
    for (var r = 0; r < this.cartesianRootBtns.length; r++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.setCartesianRootMode(btn.getAttribute('data-root'));
          self.parse();
        });
      })(this.cartesianRootBtns[r]);
    }
    for (var t = 0; t < this.cartesianTieBtns.length; t++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.setCartesianTieMode(btn.getAttribute('data-tie'));
          self.parse();
        });
      })(this.cartesianTieBtns[t]);
    }
    if (this.inputText) this.inputText.addEventListener('input', function () {
      // 自动解析
      self.parse();
    });
  };

  ArrayTab.prototype.bindPersistEvents = function () {
    var self = this;
    if (this.inputText) this.inputText.addEventListener('input', function () { self.saveState(); });
    if (this.modelGroupsEl) this.modelGroupsEl.addEventListener('click', function () { self.saveState(); });
  };

  // ======================== 状态切换 ========================

  ArrayTab.prototype.setVizType = function (type) {
    this.vizType = type;
    var btns = this.rootEl.querySelectorAll('.arr-model-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-viz-type') === type);
    }
    // 散点图连线选项仅在 scatter 模型时显示
    if (this.scatterOptsWrap) {
      this.scatterOptsWrap.style.display = (type === 'scatter') ? '' : 'none';
    }
    // 位方向切换 UI 仅在 bits 模型时显示
    if (this.bitOrientWrap) {
      this.bitOrientWrap.style.display = (type === 'bits') ? '' : 'none';
    }
    // 笛卡尔树选项 UI 仅在 cartesian 模型时显示
    if (this.cartesianOptsWrap) {
      this.cartesianOptsWrap.style.display = (type === 'cartesian') ? '' : 'none';
    }
  };

  ArrayTab.prototype.setBase = function (base) {
    this.base = (base === 1) ? 1 : 0;
    for (var i = 0; i < this.baseBtns.length; i++) {
      var btn = this.baseBtns[i];
      btn.classList.toggle('active', Number(btn.getAttribute('data-base')) === this.base);
    }
  };

  ArrayTab.prototype.setScatterConnect = function (on) {
    this.scatterConnect = !!on;
    if (this.scatterConnectInput) this.scatterConnectInput.checked = this.scatterConnect;
  };

  ArrayTab.prototype.setBitOrient = function (orient) {
    this.bitOrient = (orient === 'vertical') ? 'vertical' : 'horizontal';
    for (var i = 0; i < this.bitOrientBtns.length; i++) {
      var btn = this.bitOrientBtns[i];
      btn.classList.toggle('active', btn.getAttribute('data-orient') === this.bitOrient);
    }
  };

  ArrayTab.prototype.setBitOrder = function (order) {
    this.bitOrder = (order === 'msb') ? 'msb' : 'lsb';
    for (var i = 0; i < this.bitOrderBtns.length; i++) {
      var btn = this.bitOrderBtns[i];
      btn.classList.toggle('active', btn.getAttribute('data-order') === this.bitOrder);
    }
  };

  ArrayTab.prototype.setCartesianRootMode = function (mode) {
    this.cartesianRootMode = (mode === 'max') ? 'max' : 'min';
    for (var i = 0; i < this.cartesianRootBtns.length; i++) {
      var btn = this.cartesianRootBtns[i];
      btn.classList.toggle('active', btn.getAttribute('data-root') === this.cartesianRootMode);
    }
  };

  ArrayTab.prototype.setCartesianTieMode = function (mode) {
    this.cartesianTieMode = (mode === 'large') ? 'large' : 'small';
    for (var i = 0; i < this.cartesianTieBtns.length; i++) {
      var btn = this.cartesianTieBtns[i];
      btn.classList.toggle('active', btn.getAttribute('data-tie') === this.cartesianTieMode);
    }
  };

  ArrayTab.prototype.loadSample = function () {
    this.setVizType('scatter');
    this.setBase(1);
    this.setScatterConnect(false);
    this.setBitOrient('horizontal');
    this.setBitOrder('lsb');
    this.setCartesianRootMode('min');
    this.setCartesianTieMode('small');
    this.inputText.value = SAMPLES['scatter'];
  };

  // ======================== 解析 ========================

  ArrayTab.prototype.parse = function () {
    var text = this.inputText.value;
    try {
      var values = P.parseArray(text);
      this.model.setData(values, this.base, this.vizType);
      this.model.scatterConnect = this.scatterConnect;
      this.model.bitOrient = this.bitOrient;
      this.model.bitOrder = this.bitOrder;
      this.model.cartesianRootMode = this.cartesianRootMode;
      this.model.cartesianTieMode = this.cartesianTieMode;
      var n = values.length;
      this.setParseStatus('解析成功：' + n + ' 个元素，起始索引 = ' + this.base + '。', false);
    } catch (e) {
      this.model.setData([], this.base, this.vizType);
      this.model.scatterConnect = this.scatterConnect;
      this.model.bitOrient = this.bitOrient;
      this.model.bitOrder = this.bitOrder;
      this.model.cartesianRootMode = this.cartesianRootMode;
      this.model.cartesianTieMode = this.cartesianTieMode;
      this.setParseStatus('解析失败: ' + e.message, true);
    }
    try {
      this.render();
    } catch (renderErr) {
      if (window.console) console.error('渲染失败:', renderErr);
    }
    this.saveState();
  };

  ArrayTab.prototype.setParseStatus = function (msg, isError) {
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  // ======================== 渲染 ========================

  ArrayTab.prototype.render = function () {
    var self = this;
    this.codeOutput.textContent = '';
    renderer.render(this.model, this.graphOutput).then(function (code) {
      self.codeOutput.textContent = code;
    });
  };

  // ======================== 状态持久化 ========================

  ArrayTab.prototype.collectState = function () {
    return {
      vizType: this.vizType,
      base: this.base,
      scatterConnect: this.scatterConnect,
      bitOrient: this.bitOrient,
      bitOrder: this.bitOrder,
      cartesianRootMode: this.cartesianRootMode,
      cartesianTieMode: this.cartesianTieMode,
      inputText: this.inputText.value
    };
  };

  ArrayTab.prototype.saveState = function () {
    var data;
    try {
      data = JSON.stringify(this.collectState());
    } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  ArrayTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  ArrayTab.prototype.applyState = function (saved) {
    if (saved.vizType != null) this.setVizType(saved.vizType);
    if (saved.base != null) this.setBase(saved.base);
    if (saved.scatterConnect != null) this.setScatterConnect(saved.scatterConnect);
    if (saved.bitOrient != null) this.setBitOrient(saved.bitOrient);
    if (saved.bitOrder != null) this.setBitOrder(saved.bitOrder);
    if (saved.cartesianRootMode != null) this.setCartesianRootMode(saved.cartesianRootMode);
    if (saved.cartesianTieMode != null) this.setCartesianTieMode(saved.cartesianTieMode);
    if (saved.inputText != null) this.inputText.value = saved.inputText;
  };

  ArrayTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  ArrayTab.prototype.clearAll = function () {
    this.clearStorage();
    this.setVizType('scatter');
    this.setBase(1);
    this.setScatterConnect(false);
    this.setBitOrient('horizontal');
    this.setBitOrder('lsb');
    this.setCartesianRootMode('min');
    this.setCartesianTieMode('small');
    this.inputText.value = SAMPLES['scatter'];
    this.parse();
  };

  NS.tabs.ArrayTab = ArrayTab;
})();
