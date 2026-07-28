/**
 * 字符串 Tab 控制器
 * 通用字符串结构可视化：负责 DOM 绑定、模型选择、起始索引切换、解析调度、SVG 渲染。
 * 沿用 ArrayTab 的状态持久化模式（localStorage + sessionStorage 双写）。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var P = NS.parsers.stringParsers;
  var renderer = NS.renderers.stringSvgRenderer;

  var STORAGE_KEY = 'algoCpTools.string';
  var SESSION_KEY = 'algoCpTools.string.session';

  // 模型分组（5 组 17 项）
  var MODEL_GROUPS = [
    {
      name: '单串匹配与函数',
      models: [
        { type: 'kmp', label: 'KMP 前缀函数' },
        { type: 'z', label: 'Z 算法' },
        { type: 'border', label: 'Border 树' },
        { type: 'lyndon', label: 'Lyndon 分解' }
      ]
    },
    {
      name: '后缀结构',
      models: [
        { type: 'sa', label: '后缀数组' },
        { type: 'suffix-tree', label: '后缀树' },
        { type: 'suffix-bst', label: '后缀平衡树' },
        { type: 'sam', label: 'SAM 后缀自动机' }
      ]
    },
    {
      name: '自动机与回文',
      models: [
        { type: 'ac', label: 'AC 自动机' },
        { type: 'sequence', label: '序列自动机' },
        { type: 'palindrome', label: '回文树' }
      ]
    },
    {
      name: '变换与性质',
      models: [
        { type: 'bwt', label: 'BWT 变换' },
        { type: 'runs', label: 'Runs 游程' }
      ]
    },
    {
      name: '位并行匹配',
      models: [
        { type: 'shift-and', label: 'Shift-And / Bitap' },
        { type: 'shift-or', label: 'Shift-Or' },
        { type: 'bndm', label: 'BNDM' },
        { type: 'bom', label: 'BOM' }
      ]
    },
    {
      name: '经典算法',
      models: [
        { type: 'manacher', label: 'Manacher 最长回文' },
        { type: 'boyer-moore', label: 'Boyer-Moore' },
        { type: 'min-rotation', label: '最小表示法' }
      ]
    }
  ];

  // 位并行匹配（需要模式串 P 输入）
  var BITPARALLEL = NS.models.StringModel.BITPARALLEL || ['shift-and', 'shift-or', 'bndm', 'bom'];

  // 需要模式串 P 输入的算法（位并行 + Boyer-Moore）
  var NEEDS_PATTERN_P = NS.models.StringModel.NEEDS_PATTERN_P || ['shift-and', 'shift-or', 'bndm', 'bom', 'boyer-moore'];

  // 各模型默认示例
  var SAMPLES = {
    'kmp': 'ababcabab',
    'z': 'aabcaabxaaz',
    'border': 'abacabac',
    'lyndon': 'aabaaabab',
    'sa': 'banana',
    'suffix-tree': 'banana',
    'suffix-bst': 'banana',
    'sam': 'abcbc',
    'ac': 'abababab',
    'sequence': 'abacaba',
    'palindrome': 'abacaba',
    'bwt': 'banana',
    'runs': 'aaabbbbaaaccc',
    'shift-and': 'abcabcabxabcab',
    'shift-or': 'abcabcabxabcab',
    'bndm': 'abcabcabxabcab',
    'bom': 'abcabcabxabcab',
    'manacher': 'abacaba',
    'boyer-moore': 'abcabcabxabcab',
    'min-rotation': 'banana'
  };

  // AC 自动机专用模式串示例
  var AC_PATTERN_SAMPLE = 'ab\nbab\nabab\nb';

  // 位并行匹配专用模式串 P 示例
  var PATTERN_P_SAMPLE = 'abcab';

  function StringTab(rootEl) {
    this.rootEl = rootEl;
    this.model = new NS.models.StringModel();
    this.vizType = 'kmp';
    this.base = 1;
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

  StringTab.prototype._buildModelButtons = function () {
    var container = this.rootEl.querySelector('#str-model-groups');
    if (!container) return;
    container.innerHTML = '';
    MODEL_GROUPS.forEach(function (group) {
      var groupEl = document.createElement('div');
      groupEl.className = 'str-model-group';
      var titleEl = document.createElement('div');
      titleEl.className = 'str-model-group-title';
      titleEl.textContent = group.name;
      groupEl.appendChild(titleEl);
      group.models.forEach(function (m) {
        var btn = document.createElement('button');
        btn.className = 'str-model-btn';
        btn.setAttribute('data-viz-type', m.type);
        btn.textContent = m.label;
        groupEl.appendChild(btn);
      });
      container.appendChild(groupEl);
    });
  };

  // ======================== DOM 缓存 ========================

  StringTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.modelGroupsEl = el.querySelector('#str-model-groups');
    this.inputText = el.querySelector('#str-input-text');
    this.patternBlock = el.querySelector('#str-pattern-block');
    this.patternText = el.querySelector('#str-pattern-text');
    this.patternPBlock = el.querySelector('#str-pattern-p-block');
    this.patternPText = el.querySelector('#str-pattern-p-text');
    this.baseBtns = el.querySelectorAll('.str-base-btn');
    this.parseBtn = el.querySelector('#str-parse-btn');
    this.parseStatus = el.querySelector('#str-parse-status');
    this.clearBtn = el.querySelector('#str-clear-btn');
    this.graphOutput = el.querySelector('#str-graph-output');
    this.codeOutput = el.querySelector('#str-code-output');
  };

  // ======================== 事件绑定 ========================

  StringTab.prototype.bindEvents = function () {
    var self = this;
    if (this.parseBtn) this.parseBtn.addEventListener('click', function () { self.parse(); });
    if (this.clearBtn) this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    if (this.modelGroupsEl) this.modelGroupsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.str-model-btn');
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
    if (this.inputText) this.inputText.addEventListener('input', function () { self.parse(); });
    if (this.patternText) this.patternText.addEventListener('input', function () { self.parse(); });
    if (this.patternPText) this.patternPText.addEventListener('input', function () { self.parse(); });
  };

  StringTab.prototype.bindPersistEvents = function () {
    var self = this;
    if (this.inputText) this.inputText.addEventListener('input', function () { self.saveState(); });
    if (this.patternText) this.patternText.addEventListener('input', function () { self.saveState(); });
    if (this.patternPText) this.patternPText.addEventListener('input', function () { self.saveState(); });
    if (this.modelGroupsEl) this.modelGroupsEl.addEventListener('click', function () { self.saveState(); });
  };

  // ======================== 状态切换 ========================

  StringTab.prototype.setVizType = function (type) {
    this.vizType = type;
    var btns = this.rootEl.querySelectorAll('.str-model-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-viz-type') === type);
    }
    // AC 自动机时显示模式串列表；位并行匹配时显示模式串 P
    if (this.patternBlock) {
      this.patternBlock.classList.toggle('visible', type === 'ac');
    }
    if (this.patternPBlock) {
      this.patternPBlock.classList.toggle('visible', NEEDS_PATTERN_P.indexOf(type) >= 0);
    }
  };

  StringTab.prototype.setBase = function (base) {
    this.base = (base === 1) ? 1 : 0;
    for (var i = 0; i < this.baseBtns.length; i++) {
      var btn = this.baseBtns[i];
      btn.classList.toggle('active', Number(btn.getAttribute('data-base')) === this.base);
    }
  };

  StringTab.prototype.loadSample = function () {
    this.setVizType('kmp');
    this.setBase(1);
    this.inputText.value = SAMPLES['kmp'];
    if (this.patternText) this.patternText.value = AC_PATTERN_SAMPLE;
    if (this.patternPText) this.patternPText.value = PATTERN_P_SAMPLE;
  };

  // ======================== 解析 ========================

  StringTab.prototype.parse = function () {
    var text = this.inputText.value;
    var s = P.parseString(text);
    // AC 自动机需模式串列表
    var patterns = [];
    if (this.vizType === 'ac' && this.patternText) {
      patterns = P.parsePatterns(this.patternText.value);
    }
    // 位并行匹配 / Boyer-Moore 需模式串 P
    var patternP = '';
    if (NEEDS_PATTERN_P.indexOf(this.vizType) >= 0 && this.patternPText) {
      patternP = P.parseString(this.patternPText.value);
    }
    try {
      this.model.setData(s, this.base, this.vizType);
      this.model.setPatterns(patterns);
      this.model.setPatternP(patternP);
      var n = s.length;
      var msg = '解析成功：长度 ' + n + '，起始索引 = ' + this.base + '。';
      if (this.vizType === 'ac') {
        msg += ' 模式串 ' + patterns.length + ' 个。';
      }
      if (NEEDS_PATTERN_P.indexOf(this.vizType) >= 0) {
        msg += ' 模式串 P 长度 ' + patternP.length + '。';
      }
      if (n > 300) msg += ' （提示：长度 > 300，SVG 可能较大。）';
      this.setParseStatus(msg, false);
    } catch (e) {
      this.model.setData('', this.base, this.vizType);
      this.model.setPatterns(patterns);
      this.model.setPatternP(patternP);
      this.setParseStatus('解析失败: ' + e.message, true);
    }
    try {
      this.render();
    } catch (renderErr) {
      if (window.console) console.error('渲染失败:', renderErr);
    }
    this.saveState();
  };

  StringTab.prototype.setParseStatus = function (msg, isError) {
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  // ======================== 渲染 ========================

  StringTab.prototype.render = function () {
    var self = this;
    this.codeOutput.textContent = '';
    renderer.render(this.model, this.graphOutput).then(function (code) {
      self.codeOutput.textContent = code;
    });
  };

  // ======================== 状态持久化 ========================

  StringTab.prototype.collectState = function () {
    return {
      vizType: this.vizType,
      base: this.base,
      inputText: this.inputText.value,
      patternText: this.patternText ? this.patternText.value : '',
      patternPText: this.patternPText ? this.patternPText.value : ''
    };
  };

  StringTab.prototype.saveState = function () {
    var data;
    try {
      data = JSON.stringify(this.collectState());
    } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  StringTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  StringTab.prototype.applyState = function (saved) {
    if (saved.vizType != null) this.setVizType(saved.vizType);
    if (saved.base != null) this.setBase(saved.base);
    if (saved.inputText != null) this.inputText.value = saved.inputText;
    if (saved.patternText != null && this.patternText) this.patternText.value = saved.patternText;
    if (saved.patternPText != null && this.patternPText) this.patternPText.value = saved.patternPText;
  };

  StringTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  StringTab.prototype.clearAll = function () {
    this.clearStorage();
    var sampleKey = this.vizType in SAMPLES ? this.vizType : 'kmp';
    this.setBase(1);
    this.inputText.value = SAMPLES[sampleKey] || SAMPLES['kmp'];
    if (this.patternText) this.patternText.value = AC_PATTERN_SAMPLE;
    if (this.patternPText) this.patternPText.value = PATTERN_P_SAMPLE;
    this.parse();
  };

  NS.tabs.StringTab = StringTab;
})();
