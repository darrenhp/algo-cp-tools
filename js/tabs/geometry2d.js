/**
 * 二维几何 Tab 控制器
 * 负责 DOM 绑定、输入方式切换、解析调度、结果展示、渲染调度、状态持久化。
 * 沿用 RootedTreeTab 的生命周期：cacheDom -> bindEvents -> loadState/loadSample -> parse -> render -> bindPersistEvents。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var P = NS.parsers.geometry2dParsers;
  var renderer = NS.renderers.geometry2dSvgRenderer;

  var STORAGE_KEY = 'algoCpTools.geometry2d';
  var SESSION_KEY = 'algoCpTools.geometry2d.session';

  function Geometry2DTab(rootEl) {
    this.rootEl = rootEl;
    this.model = null;
    this.inputMode = 'points';
    this.showAABB = true;
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

  /** 收集当前 UI 状态。 */
  Geometry2DTab.prototype.collectState = function () {
    return {
      inputMode: this.inputMode,
      inputText: this.inputText.value,
      showAABB: this.showAABBChk.checked,
      connectPts: this.connectPtsChk ? this.connectPtsChk.checked : false,
      showGrid: this.showGridChk ? this.showGridChk.checked : true,
      showCoords: this.showCoordsChk ? this.showCoordsChk.checked : false,
      showIndex: this.showIndexChk ? this.showIndexChk.checked : true,
      indexFrom1: this.indexFrom1Chk ? this.indexFrom1Chk.checked : false
    };
  };

  /** 同时写入 sessionStorage 和 localStorage。 */
  Geometry2DTab.prototype.saveState = function () {
    var data;
    try {
      data = JSON.stringify(this.collectState());
    } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  /** 读取状态：优先 sessionStorage，回退 localStorage。 */
  Geometry2DTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  /** 将保存的状态应用到 UI。 */
  Geometry2DTab.prototype.applyState = function (saved) {
    if (saved.inputMode != null) this.setInputMode(saved.inputMode);
    if (saved.inputText != null) this.inputText.value = saved.inputText;
    if (saved.showAABB != null) {
      this.showAABB = saved.showAABB;
      this.showAABBChk.checked = saved.showAABB;
    }
    if (saved.connectPts != null && this.connectPtsChk) {
      this.connectPtsChk.checked = saved.connectPts;
    }
    if (saved.showGrid != null && this.showGridChk) {
      this.showGridChk.checked = saved.showGrid;
    }
    if (saved.showCoords != null && this.showCoordsChk) {
      this.showCoordsChk.checked = saved.showCoords;
    }
    if (saved.showIndex != null && this.showIndexChk) {
      this.showIndexChk.checked = saved.showIndex;
    }
    if (saved.indexFrom1 != null && this.indexFrom1Chk) {
      this.indexFrom1Chk.checked = saved.indexFrom1;
    }
  };

  /** 清除存储。 */
  Geometry2DTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  /** 清理：清空存储、重置为示例并重新渲染。 */
  Geometry2DTab.prototype.clearAll = function () {
    this.clearStorage();
    this.loadSample();
    this.parse();
  };

  /** 为输入控件绑定持久化事件。 */
  Geometry2DTab.prototype.bindPersistEvents = function () {
    var self = this;
    var inputs = [this.inputText];
    inputs.forEach(function (el) {
      if (el) el.addEventListener('input', function () { self.saveState(); });
    });
    var chks = [this.showAABBChk, this.connectPtsChk, this.showGridChk, this.showCoordsChk, this.showIndexChk, this.indexFrom1Chk];
    chks.forEach(function (el) {
      if (el) el.addEventListener('change', function () { self.saveState(); });
    });
    if (this.inputTabsEl) this.inputTabsEl.addEventListener('click', function () { self.saveState(); });
  };

  Geometry2DTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.inputTabsEl = el.querySelector('#g2-input-tabs');
    this.inputText = el.querySelector('#g2-input-text');
    this.parseBtn = el.querySelector('#g2-parse-btn');
    this.parseStatus = el.querySelector('#g2-parse-status');
    this.clearBtn = el.querySelector('#g2-clear-btn');

    this.showAABBChk = el.querySelector('#g2-show-aabb');
    this.connectPtsChk = el.querySelector('#g2-connect-pts');
    this.showGridChk = el.querySelector('#g2-show-grid');
    this.showCoordsChk = el.querySelector('#g2-show-coords');
    this.showIndexChk = el.querySelector('#g2-show-index');
    this.indexFrom1Chk = el.querySelector('#g2-index-from1');
    this.renderBtn = el.querySelector('#g2-render-btn');
    this.graphOutput = el.querySelector('#g2-graph-output');
    this.codeOutput = el.querySelector('#g2-code-output');
    this.resultsEl = el.querySelector('#g2-results');
  };

  Geometry2DTab.prototype.bindEvents = function () {
    var self = this;
    if (this.parseBtn) this.parseBtn.addEventListener('click', function () { self.parse(); });
    if (this.clearBtn) this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    if (this.renderBtn) this.renderBtn.addEventListener('click', function () { self.render(); });
    if (this.inputText) this.inputText.addEventListener('keydown', function (e) {
      // 回车换行时触发解析（排除 IME 组合输入）
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        self.parse();
      }
    });
    if (this.inputTabsEl) this.inputTabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.input-tab-btn');
      if (!btn) return;
      self.setInputMode(btn.getAttribute('data-input-mode'));
    });
    if (this.showAABBChk) this.showAABBChk.addEventListener('change', function () {
      self.showAABB = self.showAABBChk.checked;
      self.render();
    });
    if (this.connectPtsChk) this.connectPtsChk.addEventListener('change', function () {
      self.renderResults();
      self.render();
    });
    if (this.showGridChk) this.showGridChk.addEventListener('change', function () {
      self.render();
    });
    if (this.showCoordsChk) this.showCoordsChk.addEventListener('change', function () {
      self.render();
    });
    if (this.showIndexChk) this.showIndexChk.addEventListener('change', function () {
      self.render();
    });
    if (this.indexFrom1Chk) this.indexFrom1Chk.addEventListener('change', function () {
      self.render();
    });
  };

  /** 切换输入方式选项卡。 */
  Geometry2DTab.prototype.setInputMode = function (mode) {
    this.inputMode = mode;
    if (!this.inputTabsEl) return;
    var btns = this.inputTabsEl.querySelectorAll('.input-tab-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-input-mode') === mode) {
        btns[i].classList.add('active');
      } else {
        btns[i].classList.remove('active');
      }
    }
    this.updatePlaceholder();
  };

  Geometry2DTab.prototype.updatePlaceholder = function () {
    var placeholders = {
      points: '点列表：每行 x y（空格或逗号分隔）\n支持 # 与 // 注释行\n例如：\n0 0\n1 2\n-3 4\n2 -1',
      xy: 'xy 数组模式：\n第一行为 x 数组，第二行为 y 数组\n两行长度必须相等\n支持 # 与 // 注释\n例如：\n0 1 -3 2\n0 2 4 -1'
    };
    this.inputText.placeholder = placeholders[this.inputMode] || '';
  };

  Geometry2DTab.prototype.loadSample = function () {
    this.setInputMode('points');
    this.updatePlaceholder();
    this.inputText.value = '0 0\n1 2\n-3 4\n2 -1\n3 5\n-2 -3\n4 3';
    if (this.showAABBChk) this.showAABBChk.checked = true;
    this.showAABB = true;
    if (this.showGridChk) this.showGridChk.checked = true;
    if (this.showCoordsChk) this.showCoordsChk.checked = false;
    if (this.showIndexChk) this.showIndexChk.checked = true;
    if (this.indexFrom1Chk) this.indexFrom1Chk.checked = false;
  };

  Geometry2DTab.prototype.parse = function () {
    var text = this.inputText.value;
    var points;
    try {
      if (this.inputMode === 'xy') points = P.parseXYArrays(text);
      else points = P.parsePointsList(text);
    } catch (e) {
      this.setParseStatus('解析失败: ' + e.message, true);
      return;
    }
    this.model = P.buildModel(points);
    this.setParseStatus('解析成功：' + this.model.size() + ' 个点。', false);
    this.renderResults();
    this.saveState();
    this.render();
  };

  Geometry2DTab.prototype.setParseStatus = function (msg, isError) {
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  Geometry2DTab.prototype.renderResults = function () {
    var el = this.resultsEl;
    el.innerHTML = '';
    if (!this.model || this.model.size() === 0) {
      el.textContent = '无点集数据';
      return;
    }
    var aabb = this.model.getAABB();
    var html = '';
    html += '<div class="arr-result-cards">';
    html += '<div class="arr-result-card arr-result-blue">';
    html += '<div class="arr-result-label">点数</div>';
    html += '<div class="arr-result-value">' + this.model.size() + '</div>';
    html += '<div class="arr-result-sub">points</div>';
    html += '</div>';
    if (aabb) {
      html += '<div class="arr-result-card arr-result-purple">';
      html += '<div class="arr-result-label">AABB 宽 × 高</div>';
      html += '<div class="arr-result-value">' + fmt(aabb.width) + ' × ' + fmt(aabb.height) + '</div>';
      html += '<div class="arr-result-sub">面积 = ' + fmt(aabb.area) + '</div>';
      html += '</div>';
      html += '</div>'; // close cards
      html += '<table class="attr-table" style="margin-top:8px;">';
      html += '<thead><tr><th>属性</th><th>值</th></tr></thead><tbody>';
      html += row('minX', fmt(aabb.minX));
      html += row('maxX', fmt(aabb.maxX));
      html += row('minY', fmt(aabb.minY));
      html += row('maxY', fmt(aabb.maxY));
      html += row('width', fmt(aabb.width));
      html += row('height', fmt(aabb.height));
      html += row('area', fmt(aabb.area));
      var connectOn = this.connectPtsChk && this.connectPtsChk.checked;
      if (connectOn && this.model.size() >= 2) {
        html += row('连接段数', this.model.size() - 1);
        html += row('路径总长', fmt(this.computePathLength()));
      }
      html += '</tbody></table>';
    } else {
      html += '</div>';
    }
    el.innerHTML = html;
  };

  function fmt(v) {
    if (Number.isInteger(v)) return String(v);
    return Number(v.toFixed(4)).toString();
  }

  function row(k, v) {
    return '<tr><td class="attr-id-cell">' + k + '</td><td style="font-family:monospace;">' + v + '</td></tr>';
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 计算连接路径总长。 */
  Geometry2DTab.prototype.computePathLength = function () {
    var pts = this.model.points;
    var n = pts.length;
    if (n < 2) return 0;
    var total = 0;
    for (var i = 0; i < n - 1; i++) {
      total += dist(pts[i], pts[i + 1]);
    }
    return total;
  };

  Geometry2DTab.prototype.render = function () {
    if (!this.model) return;
    var self = this;
    this.codeOutput.textContent = '';
    renderer.render(this.model, this.graphOutput, {
      showAABB: this.showAABBChk.checked,
      showConnections: this.connectPtsChk ? this.connectPtsChk.checked : false,
      showGrid: this.showGridChk ? this.showGridChk.checked : true,
      showCoords: this.showCoordsChk ? this.showCoordsChk.checked : false,
      showIndex: this.showIndexChk ? this.showIndexChk.checked : true,
      indexBase: (this.indexFrom1Chk && this.indexFrom1Chk.checked) ? 1 : 0
    }).then(function (code) {
      self.codeOutput.textContent = code;
    });
  };

  NS.tabs.Geometry2DTab = Geometry2DTab;
})();
