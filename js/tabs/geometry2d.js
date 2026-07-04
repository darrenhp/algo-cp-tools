/**
 * 二维几何 Tab 控制器
 * 支持多类几何实体共存输入：点 / 线段 / 直线 / 多边形 / 长方形 / 圆。
 * 负责 DOM 绑定、输入方式切换、解析调度、结果展示、渲染调度、状态持久化。
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
      pointsText: this.pointsText ? this.pointsText.value : '',
      segmentsText: this.segmentsText ? this.segmentsText.value : '',
      linesText: this.linesText ? this.linesText.value : '',
      polygonsText: this.polygonsText ? this.polygonsText.value : '',
      rectsText: this.rectsText ? this.rectsText.value : '',
      circlesText: this.circlesText ? this.circlesText.value : '',
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
    try { data = JSON.stringify(this.collectState()); } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  /** 读取状态：优先 sessionStorage，回退 localStorage。 */
  Geometry2DTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {} }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  /** 将保存的状态应用到 UI（兼容旧版 inputText 字段）。 */
  Geometry2DTab.prototype.applyState = function (saved) {
    if (saved.inputMode != null) this.setInputMode(saved.inputMode);
    var pointsVal = saved.pointsText != null ? saved.pointsText : saved.inputText;
    if (pointsVal != null && this.pointsText) this.pointsText.value = pointsVal;
    if (saved.segmentsText != null && this.segmentsText) this.segmentsText.value = saved.segmentsText;
    if (saved.linesText != null && this.linesText) this.linesText.value = saved.linesText;
    if (saved.polygonsText != null && this.polygonsText) this.polygonsText.value = saved.polygonsText;
    if (saved.rectsText != null && this.rectsText) this.rectsText.value = saved.rectsText;
    if (saved.circlesText != null && this.circlesText) this.circlesText.value = saved.circlesText;
    if (saved.showAABB != null) { this.showAABB = saved.showAABB; this.showAABBChk.checked = saved.showAABB; }
    if (saved.connectPts != null && this.connectPtsChk) this.connectPtsChk.checked = saved.connectPts;
    if (saved.showGrid != null && this.showGridChk) this.showGridChk.checked = saved.showGrid;
    if (saved.showCoords != null && this.showCoordsChk) this.showCoordsChk.checked = saved.showCoords;
    if (saved.showIndex != null && this.showIndexChk) this.showIndexChk.checked = saved.showIndex;
    if (saved.indexFrom1 != null && this.indexFrom1Chk) this.indexFrom1Chk.checked = saved.indexFrom1;
  };

  Geometry2DTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  Geometry2DTab.prototype.clearAll = function () {
    this.clearStorage();
    this.loadSample();
    this.parse();
  };

  Geometry2DTab.prototype.bindPersistEvents = function () {
    var self = this;
    var inputs = [this.pointsText, this.segmentsText, this.linesText, this.polygonsText, this.rectsText, this.circlesText];
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
    this.pointsText = el.querySelector('#g2-input-text');
    this.segmentsText = el.querySelector('#g2-segments-text');
    this.linesText = el.querySelector('#g2-lines-text');
    this.polygonsText = el.querySelector('#g2-polygons-text');
    this.rectsText = el.querySelector('#g2-rects-text');
    this.circlesText = el.querySelector('#g2-circles-text');
    // 缓存各输入区块所属 <details>，用于判断是否展开（折叠则不解析/不展示）
    this.pointsDetails = this.pointsText ? this.pointsText.closest('details') : null;
    this.segmentsDetails = this.segmentsText ? this.segmentsText.closest('details') : null;
    this.linesDetails = this.linesText ? this.linesText.closest('details') : null;
    this.polygonsDetails = this.polygonsText ? this.polygonsText.closest('details') : null;
    this.rectsDetails = this.rectsText ? this.rectsText.closest('details') : null;
    this.circlesDetails = this.circlesText ? this.circlesText.closest('details') : null;
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
    // 所有输入框回车换行触发解析
    var inputs = [this.pointsText, this.segmentsText, this.linesText, this.polygonsText, this.rectsText, this.circlesText];
    inputs.forEach(function (el) {
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          self.parse();
        }
      });
    });
    if (this.inputTabsEl) this.inputTabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.input-tab-btn');
      if (!btn) return;
      self.setInputMode(btn.getAttribute('data-input-mode'));
    });
    var renderChks = [this.showAABBChk, this.showGridChk, this.showCoordsChk, this.showIndexChk, this.indexFrom1Chk];
    renderChks.forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        if (el === self.showAABBChk) self.showAABB = el.checked;
        self.render();
      });
    });
    if (this.connectPtsChk) this.connectPtsChk.addEventListener('change', function () {
      self.renderResults();
      self.render();
    });
    // 折叠/展开输入区块时即时重新解析（折叠的区块不参与解析与展示）
    var detailsEls = [this.pointsDetails, this.segmentsDetails, this.linesDetails,
      this.polygonsDetails, this.rectsDetails, this.circlesDetails];
    detailsEls.forEach(function (d) {
      if (!d) return;
      d.addEventListener('toggle', function () { self.parse(); });
    });
  };

  /** 切换点输入方式选项卡。 */
  Geometry2DTab.prototype.setInputMode = function (mode) {
    this.inputMode = mode;
    if (!this.inputTabsEl) return;
    var btns = this.inputTabsEl.querySelectorAll('.input-tab-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-input-mode') === mode) btns[i].classList.add('active');
      else btns[i].classList.remove('active');
    }
    this.updatePlaceholder();
  };

  Geometry2DTab.prototype.updatePlaceholder = function () {
    var placeholders = {
      points: '点列表：每行 x y（空格或逗号分隔）\n支持 # 与 // 注释行\n例如：\n0 0\n1 2\n-3 4\n2 -1',
      xy: 'xy 数组模式：\n第一行为 x 数组，第二行为 y 数组\n两行长度必须相等\n支持 # 与 // 注释\n例如：\n0 1 -3 2\n0 2 4 -1'
    };
    if (this.pointsText) this.pointsText.placeholder = placeholders[this.inputMode] || '';
  };

  Geometry2DTab.prototype.loadSample = function () {
    this.setInputMode('points');
    this.updatePlaceholder();
    if (this.pointsText) this.pointsText.value = '0 0\n1 2\n-3 4\n2 -1\n3 5\n-2 -3\n4 3';
    if (this.segmentsText) this.segmentsText.value = '# 线段：x1 y1 x2 y2，> 前缀表示有向\n0 0 3 3\n> 1 0 4 2\n-2 -3 -2 3';
    if (this.linesText) this.linesText.value = '# 直线：x1 y1 x2 y2（两点确定直线）\n0 0 1 1\n0 4 1 0';
    if (this.polygonsText) this.polygonsText.value = '# 多边形：每行一个，平铺 x1 y1 x2 y2 ... xn yn\n0 0 4 0 4 3 0 3\n-2 -2 -1 -2 -1 -1 -2 -1';
    if (this.rectsText) this.rectsText.value = '# 长方形：x1 y1 x2 y2（对角线两端点）\n-3 -2 1 1';
    if (this.circlesText) this.circlesText.value = '# 圆：cx cy r（圆心与半径）\n0 0 2\n3 3 1.5';
    if (this.showAABBChk) this.showAABBChk.checked = true;
    this.showAABB = true;
    if (this.showGridChk) this.showGridChk.checked = true;
    if (this.showCoordsChk) this.showCoordsChk.checked = false;
    if (this.showIndexChk) this.showIndexChk.checked = true;
    if (this.indexFrom1Chk) this.indexFrom1Chk.checked = false;
  };

  /** 判断输入区块是否展开（未折叠）。details 为 null 视为展开。 */
  function isOpen(details) {
    return !details || details.hasAttribute('open');
  }

  /** 解析所有「已展开」输入区块；被折叠的区块不解析、不展示。 */
  Geometry2DTab.prototype.parse = function () {
    var data = {};
    try {
      if (isOpen(this.pointsDetails)) {
        if (this.inputMode === 'xy') data.points = P.parseXYArrays(this.pointsText ? this.pointsText.value : '');
        else data.points = P.parsePointsList(this.pointsText ? this.pointsText.value : '');
      } else data.points = [];
      if (isOpen(this.segmentsDetails)) data.segments = P.parseSegments(this.segmentsText ? this.segmentsText.value : '');
      else data.segments = [];
      if (isOpen(this.linesDetails)) data.lines = P.parseLines(this.linesText ? this.linesText.value : '');
      else data.lines = [];
      if (isOpen(this.polygonsDetails)) data.polygons = P.parsePolygons(this.polygonsText ? this.polygonsText.value : '');
      else data.polygons = [];
      if (isOpen(this.rectsDetails)) data.rectangles = P.parseRectangles(this.rectsText ? this.rectsText.value : '');
      else data.rectangles = [];
      if (isOpen(this.circlesDetails)) data.circles = P.parseCircles(this.circlesText ? this.circlesText.value : '');
      else data.circles = [];
    } catch (e) {
      this.setParseStatus('解析失败: ' + e.message, true);
      return;
    }
    this.model = P.buildModel(data);
    var parts = [];
    if (data.points.length) parts.push(data.points.length + ' 点');
    if (data.segments.length) parts.push(data.segments.length + ' 线段');
    if (data.lines.length) parts.push(data.lines.length + ' 直线');
    if (data.polygons.length) parts.push(data.polygons.length + ' 多边形');
    if (data.rectangles.length) parts.push(data.rectangles.length + ' 长方形');
    if (data.circles.length) parts.push(data.circles.length + ' 圆');
    this.setParseStatus('解析成功：' + (parts.length ? parts.join('，') : '无实体') + '。', false);
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
    if (!this.model || this.model.isEmpty()) {
      el.textContent = '无几何数据';
      return;
    }
    var m = this.model;
    var aabb = m.getAABB();
    var html = '';
    html += '<div class="arr-result-cards">';
    html += card('实体总数', m.size(), (m.vertexCount()) + ' 顶点', 'arr-result-blue');
    if (aabb) {
      html += card('AABB 宽 × 高', fmt(aabb.width) + ' × ' + fmt(aabb.height), '面积 = ' + fmt(aabb.area), 'arr-result-purple');
    }
    html += '</div>';

    html += '<table class="attr-table" style="margin-top:8px;">';
    html += '<thead><tr><th>类型</th><th>数量</th></tr></thead><tbody>';
    html += row('点', m.points.length);
    html += row('线段', m.segments.length);
    html += row('直线', m.lines.length);
    html += row('多边形', m.polygons.length);
    html += row('长方形', m.rectangles.length);
    html += row('圆', m.circles.length);
    html += '</tbody></table>';

    if (aabb) {
      html += '<table class="attr-table" style="margin-top:8px;">';
      html += '<thead><tr><th>AABB</th><th>值</th></tr></thead><tbody>';
      html += row('minX', fmt(aabb.minX));
      html += row('maxX', fmt(aabb.maxX));
      html += row('minY', fmt(aabb.minY));
      html += row('maxY', fmt(aabb.maxY));
      html += row('width', fmt(aabb.width));
      html += row('height', fmt(aabb.height));
      html += row('area', fmt(aabb.area));
      if (m.segments.length) html += row('线段总长', fmt(m.segmentsLength()));
      if (m.polygons.length) html += row('多边形周长', fmt(m.polygonsPerimeter()));
      if (m.circles.length) {
        html += row('圆周长和', fmt(m.circlesPerimeter()));
        html += row('圆面积和', fmt(m.circlesArea()));
      }
      var connectOn = this.connectPtsChk && this.connectPtsChk.checked;
      if (connectOn && m.points.length >= 2) {
        html += row('点连接段数', m.points.length - 1);
        html += row('点路径总长', fmt(this.computePointsPathLength()));
      }
      html += '</tbody></table>';
    }
    el.innerHTML = html;
  };

  function card(label, value, sub, cls) {
    return '<div class="arr-result-card ' + cls + '">' +
      '<div class="arr-result-label">' + label + '</div>' +
      '<div class="arr-result-value">' + value + '</div>' +
      '<div class="arr-result-sub">' + sub + '</div></div>';
  }

  function fmt(v) {
    if (Number.isInteger(v)) return String(v);
    return Number(v.toFixed(4)).toString();
  }

  function row(k, v) {
    return '<tr><td class="attr-id-cell">' + k + '</td><td style="font-family:monospace;">' + v + '</td></tr>';
  }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 计算点的顺序连接路径总长。 */
  Geometry2DTab.prototype.computePointsPathLength = function () {
    var pts = this.model.points;
    var n = pts.length;
    if (n < 2) return 0;
    var total = 0;
    for (var i = 0; i < n - 1; i++) total += dist(pts[i], pts[i + 1]);
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
