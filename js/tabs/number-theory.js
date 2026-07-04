/**
 * 数论 Tab 控制器
 * 输入区间 [L, R]，调用 NumberTheoryModel 计算，渲染单张表格。
 * 每个数据列通过 checkbox 控制显隐（n 列固定显示）。
 * 沿用 geometry2d.js 的状态持久化模式。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var STORAGE_KEY = 'algoCpTools.numberTheory';
  var SESSION_KEY = 'algoCpTools.numberTheory.session';

  // 列定义：key 对应 result 字段，label 为表头，desc 为中文含义说明，defaultVisible 为默认显隐
  var COLUMNS = [
    { key: 'isPrime',       label: '素数',       desc: '',                 defaultVisible: true  },
    { key: 'mu',            label: 'μ(n)',       desc: '莫比乌斯函数',     defaultVisible: true  },
    { key: 'phi',           label: 'φ(n)',       desc: '欧拉函数',         defaultVisible: true  },
    { key: 'd',             label: 'd(n)',       desc: '约数个数',         defaultVisible: true  },
    { key: 'sigma',         label: 'σ(n)',       desc: '约数和',           defaultVisible: false },
    { key: 'omegaOmega',    label: 'ω/Ω',        desc: '质因子个数',       defaultVisible: false },
    { key: 'factorization', label: '质因数分解', desc: '',                 defaultVisible: true  },
    { key: 'divisors',      label: '约数列表',   desc: '',                 defaultVisible: false }
  ];

  function NumberTheoryTab(rootEl) {
    this.rootEl = rootEl;
    this.model = new NS.models.NumberTheoryModel();
    this.visible = {}; // 各列显隐状态
    for (var i = 0; i < COLUMNS.length; i++) {
      this.visible[COLUMNS[i].key] = COLUMNS[i].defaultVisible;
    }
    this.orientation = 'horizontal'; // 表格方向：horizontal（数在行）或 vertical（数在列）
    this.cacheDom();
    this.bindEvents();
    var saved = this.loadState();
    if (saved) {
      this.applyState(saved);
    } else {
      this.loadSample();
    }
    this.compute();
    this.bindPersistEvents();
  }

  // ======================== DOM 缓存 ========================

  NumberTheoryTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.loInput = el.querySelector('#nt-lo');
    this.hiInput = el.querySelector('#nt-hi');
    this.computeBtn = el.querySelector('#nt-compute-btn');
    this.clearBtn = el.querySelector('#nt-clear-btn');
    this.parseStatus = el.querySelector('#nt-parse-status');
    this.colToggleWrap = el.querySelector('#nt-col-toggle');
    this.orientBtns = el.querySelectorAll('.nt-orient-btn');
    this.primeSummaryWrap = el.querySelector('#nt-prime-summary');
    this.tableWrap = el.querySelector('#nt-table-wrap');
  };

  // ======================== 事件绑定 ========================

  NumberTheoryTab.prototype.bindEvents = function () {
    var self = this;
    if (this.computeBtn) this.computeBtn.addEventListener('click', function () { self.compute(); });
    if (this.clearBtn) this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    // 回车触发计算
    [this.loInput, this.hiInput].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          self.compute();
        }
      });
    });
    // 列 checkbox 由 buildColToggles 动态生成，事件委托
    if (this.colToggleWrap) this.colToggleWrap.addEventListener('change', function (e) {
      var chk = e.target.closest('input[type="checkbox"]');
      if (!chk) return;
      var key = chk.getAttribute('data-col');
      if (key) {
        self.visible[key] = chk.checked;
        self.renderTable();
      }
    });
    // 表格方向切换
    if (this.orientBtns && this.orientBtns.length) {
      this.orientBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var orient = btn.getAttribute('data-orient');
          if (!orient || orient === self.orientation) return;
          self.orientation = orient;
          self.updateOrientBtns();
          self.renderTable();
          self.saveState();
        });
      });
    }
  };

  NumberTheoryTab.prototype.bindPersistEvents = function () {
    var self = this;
    [this.loInput, this.hiInput].forEach(function (inp) {
      if (inp) inp.addEventListener('input', function () { self.saveState(); });
    });
    if (this.colToggleWrap) this.colToggleWrap.addEventListener('change', function () { self.saveState(); });
  };

  // ======================== 列控制 ========================

  /** 同步方向按钮的 active 状态。 */
  NumberTheoryTab.prototype.updateOrientBtns = function () {
    if (!this.orientBtns || !this.orientBtns.length) return;
    this.orientBtns.forEach(function (btn) {
      var orient = btn.getAttribute('data-orient');
      if (orient === this.orientation) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }, this);
  };

  /** 构建列显隐 checkbox 列表。 */
  NumberTheoryTab.prototype.buildColToggles = function () {
    if (!this.colToggleWrap) return;
    var html = '';
    for (var i = 0; i < COLUMNS.length; i++) {
      var c = COLUMNS[i];
      var checked = this.visible[c.key] ? ' checked' : '';
      var pillText = c.label + (c.desc ? '<span class="nt-pill-desc">' + c.desc + '</span>' : '');
      html += '<label class="checkbox-label nt-col-pill">' +
        '<input type="checkbox" data-col="' + c.key + '"' + checked + ' />' +
        '<span>' + pillText + '</span></label>';
    }
    this.colToggleWrap.innerHTML = html;
  };

  // ======================== 计算 ========================

  NumberTheoryTab.prototype.compute = function () {
    var lo = this.loInput ? this.loInput.value : '';
    var hi = this.hiInput ? this.hiInput.value : '';
    try {
      var res = this.model.compute(lo, hi);
      var msg = '计算成功：区间 [' + this.model.lo + ', ' + this.model.hi + ']，共 ' +
        res.count + ' 个数，素数 ' + res.primeCount + ' 个，最大因数个数 ' +
        res.maxDivisor + '（n=' + res.maxDivisorN + '）。';
      if (res.truncated) msg += ' 仅显示前 ' + res.displayCount.toLocaleString() + ' 个。';
      else if (res.warn) msg += ' 区间较大，筛可能较慢。';
      this.setParseStatus(msg, false);
      this.renderPrimeSummary();
    } catch (e) {
      this.model.results = [];
      this.model.primeCount = 0;
      this.model.maxDivisor = 0;
      this.model.maxDivisorN = 1;
      this.setParseStatus('计算失败: ' + e.message, true);
      this.renderPrimeSummary();
    }
    this.renderTable();
    this.saveState();
  };

  /** 渲染素数数量与最大因数个数统计区。 */
  NumberTheoryTab.prototype.renderPrimeSummary = function () {
    if (!this.primeSummaryWrap) return;
    var lo = this.model.lo;
    var hi = this.model.hi;
    var cnt = this.model.primeCount;
    var maxD = this.model.maxDivisor;
    var maxDN = this.model.maxDivisorN;
    var total = (hi >= lo && hi >= 1) ? (hi - Math.max(lo, 1) + 1) : 0;
    var density = total > 0 ? (cnt / total * 100).toFixed(2) : '0.00';
    var html = '<div class="nt-prime-stat">' +
      '<span class="nt-prime-stat-label">素数个数</span>' +
      '<span class="nt-prime-stat-value">' + cnt + '</span>' +
      '<span class="nt-prime-stat-sub">/ ' + total + '（密度 ' + density + '%）</span>' +
      '</div>' +
      '<div class="nt-prime-stat">' +
      '<span class="nt-prime-stat-label">最大因数个数</span>' +
      '<span class="nt-prime-stat-value">' + maxD + '</span>' +
      '<span class="nt-prime-stat-sub">（n=' + maxDN + '）</span>' +
      '</div>';
    this.primeSummaryWrap.innerHTML = html;
  };

  NumberTheoryTab.prototype.setParseStatus = function (msg, isError) {
    if (!this.parseStatus) return;
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  // ======================== 表格渲染 ========================

  /** 构造表头标签 HTML（含中文含义小字）。 */
  function colHeader(c) {
    if (c.desc) {
      return escapeHtml(c.label) + '<br><small class="nt-th-desc">' + escapeHtml(c.desc) + '</small>';
    }
    return escapeHtml(c.label);
  }

  NumberTheoryTab.prototype.renderTable = function () {
    var el = this.tableWrap;
    if (!el) return;
    var results = this.model.results;
    if (!results || results.length === 0) {
      el.innerHTML = '<div class="nt-empty">无数据</div>';
      return;
    }
    if (this.orientation === 'vertical') {
      this.renderTableVertical(results);
    } else {
      this.renderTableHorizontal(results);
    }
  };

  /** 横向表格：每行一个数，每列一个函数（默认）。 */
  NumberTheoryTab.prototype.renderTableHorizontal = function (results) {
    var el = this.tableWrap;
    var html = '<table class="attr-table nt-table"><thead><tr>';
    html += '<th class="attr-id-cell">n</th>';
    for (var i = 0; i < COLUMNS.length; i++) {
      var c = COLUMNS[i];
      if (!this.visible[c.key]) continue;
      html += '<th>' + colHeader(c) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var r = 0; r < results.length; r++) {
      var item = results[r];
      html += '<tr>';
      html += '<td class="attr-id-cell">' + item.n + '</td>';
      for (var j = 0; j < COLUMNS.length; j++) {
        var col = COLUMNS[j];
        if (!this.visible[col.key]) continue;
        html += '<td>' + renderCell(col.key, item) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  };

  /** 竖向表格（转置）：每行一个函数，每列一个数。适合小区间横向对比。 */
  NumberTheoryTab.prototype.renderTableVertical = function (results) {
    var el = this.tableWrap;
    var MAX_VCOLS = 1000;
    var display = results;
    var truncatedNote = '';
    if (results.length > MAX_VCOLS) {
      display = results.slice(0, MAX_VCOLS);
      truncatedNote = '<div class="nt-vtrunc-note">竖向仅展示前 ' + MAX_VCOLS +
        ' 个数（共 ' + results.length + ' 个），查看更多请切换为横向。</div>';
    }
    var html = truncatedNote + '<table class="attr-table nt-table nt-table-vertical"><thead><tr>';
    html += '<th class="attr-id-cell nt-row-label">函数 \\ n</th>';
    for (var r = 0; r < display.length; r++) {
      html += '<th class="attr-id-cell">' + display[r].n + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var i = 0; i < COLUMNS.length; i++) {
      var c = COLUMNS[i];
      if (!this.visible[c.key]) continue;
      html += '<tr>';
      html += '<th class="attr-id-cell nt-row-label">' + colHeader(c) + '</th>';
      for (var r2 = 0; r2 < display.length; r2++) {
        html += '<td>' + renderCell(c.key, display[r2]) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  };

  /** 渲染单个单元格内容。 */
  function renderCell(key, item) {
    switch (key) {
      case 'isPrime':
        return item.isPrime
          ? '<span class="nt-yes">是</span>'
          : '<span class="nt-no">否</span>';
      case 'mu':
        return '<span class="nt-num">' + item.mu + '</span>';
      case 'phi':
        return '<span class="nt-num">' + item.phi + '</span>';
      case 'd':
        return '<span class="nt-num">' + item.d + '</span>';
      case 'sigma':
        return '<span class="nt-num">' + item.sigma + '</span>';
      case 'omegaOmega':
        return '<span class="nt-num">' + item.omega + '/' + item.Omega + '</span>';
      case 'factorization':
        return '<span class="nt-factor">' + escapeHtml(item.factorization) + '</span>';
      case 'divisors':
        return '<span class="nt-divisors">' + item.divisors.join(', ') + '</span>';
      default:
        return '';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ======================== 状态持久化 ========================

  NumberTheoryTab.prototype.collectState = function () {
    return {
      lo: this.loInput ? this.loInput.value : '',
      hi: this.hiInput ? this.hiInput.value : '',
      visible: this.visible,
      orientation: this.orientation
    };
  };

  NumberTheoryTab.prototype.saveState = function () {
    var data;
    try { data = JSON.stringify(this.collectState()); } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  NumberTheoryTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {} }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  NumberTheoryTab.prototype.applyState = function (saved) {
    if (saved.lo != null && this.loInput) this.loInput.value = saved.lo;
    if (saved.hi != null && this.hiInput) this.hiInput.value = saved.hi;
    if (saved.visible) {
      for (var k in saved.visible) {
        if (Object.prototype.hasOwnProperty.call(saved.visible, k) && k in this.visible) {
          this.visible[k] = !!saved.visible[k];
        }
      }
    }
    if (saved.orientation === 'vertical' || saved.orientation === 'horizontal') {
      this.orientation = saved.orientation;
    }
    this.buildColToggles();
    this.updateOrientBtns();
  };

  NumberTheoryTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  NumberTheoryTab.prototype.loadSample = function () {
    if (this.loInput) this.loInput.value = '1';
    if (this.hiInput) this.hiInput.value = '30';
    this.buildColToggles();
    this.updateOrientBtns();
  };

  NumberTheoryTab.prototype.clearAll = function () {
    this.clearStorage();
    // 重置列显隐为默认
    for (var i = 0; i < COLUMNS.length; i++) {
      this.visible[COLUMNS[i].key] = COLUMNS[i].defaultVisible;
    }
    this.orientation = 'horizontal';
    this.loadSample();
    this.compute();
  };

  NS.tabs.NumberTheoryTab = NumberTheoryTab;
})();
