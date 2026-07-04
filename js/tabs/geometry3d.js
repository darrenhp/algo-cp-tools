/**
 * 三维几何 Tab 控制器
 * 支持多类几何实体共存输入：点 / 线段 / 面 / 立方体 / 球体。
 * 折叠的输入区块跳过解析；展开/折叠时自动重新解析。
 * 负责 DOM 绑定、解析调度、结果展示、Three.js 渲染调度、状态持久化。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var P = NS.parsers.geometry3dParsers;
  var renderer = NS.renderers.geometry3dThreeRenderer;

  var STORAGE_KEY = 'algoCpTools.geometry3d';
  var SESSION_KEY = 'algoCpTools.geometry3d.session';

  function Geometry3DTab(rootEl) {
    this.rootEl = rootEl;
    this.model = null;
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
  Geometry3DTab.prototype.collectState = function () {
    return {
      pointsText: this.pointsText ? this.pointsText.value : '',
      segmentsText: this.segmentsText ? this.segmentsText.value : '',
      facesText: this.facesText ? this.facesText.value : '',
      cubesText: this.cubesText ? this.cubesText.value : '',
      spheresText: this.spheresText ? this.spheresText.value : '',
      showGrid: this.showGridChk ? this.showGridChk.checked : true,
      showAxes: this.showAxesChk ? this.showAxesChk.checked : true,
      showIndex: this.showIndexChk ? this.showIndexChk.checked : true,
      indexFrom1: this.indexFrom1Chk ? this.indexFrom1Chk.checked : false
    };
  };

  /** 同时写入 sessionStorage 和 localStorage。 */
  Geometry3DTab.prototype.saveState = function () {
    var data;
    try { data = JSON.stringify(this.collectState()); } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  /** 读取状态：优先 sessionStorage，回退 localStorage。 */
  Geometry3DTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {} }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  /** 将保存的状态应用到 UI。 */
  Geometry3DTab.prototype.applyState = function (saved) {
    if (saved.pointsText != null && this.pointsText) this.pointsText.value = saved.pointsText;
    if (saved.segmentsText != null && this.segmentsText) this.segmentsText.value = saved.segmentsText;
    if (saved.facesText != null && this.facesText) this.facesText.value = saved.facesText;
    if (saved.cubesText != null && this.cubesText) this.cubesText.value = saved.cubesText;
    if (saved.spheresText != null && this.spheresText) this.spheresText.value = saved.spheresText;
    if (saved.showGrid != null && this.showGridChk) this.showGridChk.checked = saved.showGrid;
    if (saved.showAxes != null && this.showAxesChk) this.showAxesChk.checked = saved.showAxes;
    if (saved.showIndex != null && this.showIndexChk) this.showIndexChk.checked = saved.showIndex;
    if (saved.indexFrom1 != null && this.indexFrom1Chk) this.indexFrom1Chk.checked = saved.indexFrom1;
  };

  Geometry3DTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  Geometry3DTab.prototype.clearAll = function () {
    this.clearStorage();
    this.loadSample();
    this.parse();
  };

  Geometry3DTab.prototype.bindPersistEvents = function () {
    var self = this;
    var inputs = [this.pointsText, this.segmentsText, this.facesText, this.cubesText, this.spheresText];
    inputs.forEach(function (el) {
      if (el) el.addEventListener('input', function () { self.saveState(); });
    });
    var chks = [this.showGridChk, this.showAxesChk, this.showIndexChk, this.indexFrom1Chk];
    chks.forEach(function (el) {
      if (el) el.addEventListener('change', function () { self.saveState(); });
    });
  };

  Geometry3DTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.pointsText = el.querySelector('#g3-points-text');
    this.segmentsText = el.querySelector('#g3-segments-text');
    this.facesText = el.querySelector('#g3-faces-text');
    this.cubesText = el.querySelector('#g3-cubes-text');
    this.spheresText = el.querySelector('#g3-spheres-text');
    this.parseBtn = el.querySelector('#g3-parse-btn');
    this.parseStatus = el.querySelector('#g3-parse-status');
    this.clearBtn = el.querySelector('#g3-clear-btn');

    this.showGridChk = el.querySelector('#g3-show-grid');
    this.showAxesChk = el.querySelector('#g3-show-axes');
    this.showIndexChk = el.querySelector('#g3-show-index');
    this.indexFrom1Chk = el.querySelector('#g3-index-from1');
    this.renderBtn = el.querySelector('#g3-render-btn');
    this.graphOutput = el.querySelector('#g3-graph-output');
    this.resultsEl = el.querySelector('#g3-results');
  };

  Geometry3DTab.prototype.bindEvents = function () {
    var self = this;
    if (this.parseBtn) this.parseBtn.addEventListener('click', function () { self.parse(); });
    if (this.clearBtn) this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    if (this.renderBtn) this.renderBtn.addEventListener('click', function () { self.render(); });
    // 输入框回车触发解析
    var inputs = [this.pointsText, this.segmentsText, this.facesText, this.cubesText, this.spheresText];
    inputs.forEach(function (el) {
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          self.parse();
        }
      });
    });
    // 折叠/展开输入区块时自动重新解析
    inputs.forEach(function (el) {
      if (!el) return;
      var details = el.closest('details');
      if (details) details.addEventListener('toggle', function () { self.parse(); });
    });
    // 渲染选项切换
    var renderChks = [this.showGridChk, this.showAxesChk, this.showIndexChk, this.indexFrom1Chk];
    renderChks.forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () { self.render(); });
    });
  };

  Geometry3DTab.prototype.loadSample = function () {
    if (this.pointsText) this.pointsText.value = '# 点：每行 x y z\n0 0 0\n1 2 0\n-2 3 1\n3 -1 2\n0 4 0';
    if (this.segmentsText) this.segmentsText.value = '# 线段：x1 y1 z1 x2 y2 z2，> 前缀表示有向\n0 0 0 2 2 2\n> 1 0 0 1 3 1\n-2 3 1 3 -1 2';
    if (this.facesText) this.facesText.value = '# 面：每行一个，平铺 x1 y1 z1 x2 y2 z2 ... xn yn zn\n0 0 0  3 0 0  3 3 0  0 3 0\n1 0 0  1 3 0  1 3 3  1 0 3';
    if (this.cubesText) this.cubesText.value = '# 立方体：x1 y1 z1 x2 y2 z2（对角线两端点）\n-3 -2 0  0 1 2\n2 2 -1  5 4 2';
    if (this.spheresText) this.spheresText.value = '# 球体：x y z r（球心 + 半径）\n0 0 0 2\n3 1 1 1.5';
    if (this.showGridChk) this.showGridChk.checked = true;
    if (this.showAxesChk) this.showAxesChk.checked = true;
    if (this.showIndexChk) this.showIndexChk.checked = true;
    if (this.indexFrom1Chk) this.indexFrom1Chk.checked = false;
  };

  /** 判断输入框所在的 details 是否展开（折叠则跳过解析）。 */
  function isOpen(el) {
    if (!el) return true;
    var d = el.closest('details');
    return d ? d.open : true;
  }

  /** 解析所有输入区块（折叠的区块跳过）。 */
  Geometry3DTab.prototype.parse = function () {
    var data = {};
    try {
      data.points = isOpen(this.pointsText) ? P.parsePoints3D(this.pointsText ? this.pointsText.value : '') : [];
      data.segments = isOpen(this.segmentsText) ? P.parseSegments3D(this.segmentsText ? this.segmentsText.value : '') : [];
      data.faces = isOpen(this.facesText) ? P.parseFaces3D(this.facesText ? this.facesText.value : '') : [];
      data.cubes = isOpen(this.cubesText) ? P.parseCubes3D(this.cubesText ? this.cubesText.value : '') : [];
      data.spheres = isOpen(this.spheresText) ? P.parseSpheres3D(this.spheresText ? this.spheresText.value : '') : [];
    } catch (e) {
      this.setParseStatus('解析失败: ' + e.message, true);
      return;
    }
    this.model = P.buildModel(data);
    var parts = [];
    if (data.points.length) parts.push(data.points.length + ' 点');
    if (data.segments.length) parts.push(data.segments.length + ' 线段');
    if (data.faces.length) parts.push(data.faces.length + ' 面');
    if (data.cubes.length) parts.push(data.cubes.length + ' 立方体');
    if (data.spheres.length) parts.push(data.spheres.length + ' 球体');
    this.setParseStatus('解析成功：' + (parts.length ? parts.join('，') : '无实体') + '。', false);
    this.renderResults();
    this.saveState();
    this.render();
  };

  Geometry3DTab.prototype.setParseStatus = function (msg, isError) {
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  Geometry3DTab.prototype.renderResults = function () {
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
    html += card('实体总数', m.size(), m.vertexCount() + ' 顶点', 'arr-result-blue');
    if (aabb) {
      html += card('AABB W×H×D', fmt(aabb.width) + '×' + fmt(aabb.height) + '×' + fmt(aabb.depth), '体积 = ' + fmt(aabb.volume), 'arr-result-purple');
    }
    html += '</div>';

    html += '<table class="attr-table" style="margin-top:8px;">';
    html += '<thead><tr><th>类型</th><th>数量</th></tr></thead><tbody>';
    html += row('点', m.points.length);
    html += row('线段', m.segments.length);
    html += row('面', m.faces.length);
    html += row('立方体', m.cubes.length);
    html += row('球体', m.spheres.length);
    html += '</tbody></table>';

    if (aabb) {
      html += '<table class="attr-table" style="margin-top:8px;">';
      html += '<thead><tr><th>AABB</th><th>值</th></tr></thead><tbody>';
      html += row('minX', fmt(aabb.minX));
      html += row('maxX', fmt(aabb.maxX));
      html += row('minY', fmt(aabb.minY));
      html += row('maxY', fmt(aabb.maxY));
      html += row('minZ', fmt(aabb.minZ));
      html += row('maxZ', fmt(aabb.maxZ));
      html += row('width', fmt(aabb.width));
      html += row('height', fmt(aabb.height));
      html += row('depth', fmt(aabb.depth));
      html += row('volume', fmt(aabb.volume));
      if (m.segments.length) html += row('线段总长', fmt(m.segmentsLength()));
      if (m.faces.length) html += row('面总面积', fmt(m.facesArea()));
      if (m.cubes.length) html += row('立方体体积', fmt(m.cubesVolume()));
      if (m.spheres.length) {
        html += row('球体体积', fmt(m.spheresVolume()));
        html += row('球体表面积', fmt(m.spheresSurfaceArea()));
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

  Geometry3DTab.prototype.render = function () {
    if (!this.model) return;
    renderer.render(this.model, this.graphOutput, {
      showGrid: this.showGridChk ? this.showGridChk.checked : true,
      showAxes: this.showAxesChk ? this.showAxesChk.checked : true,
      showIndex: this.showIndexChk ? this.showIndexChk.checked : true,
      indexBase: (this.indexFrom1Chk && this.indexFrom1Chk.checked) ? 1 : 0
    });
  };

  /** 容器尺寸变化时重新设置 Three.js 相机/渲染器尺寸。 */
  Geometry3DTab.prototype.resize = function () {
    renderer.resize(this.graphOutput);
  };

  NS.tabs.Geometry3DTab = Geometry3DTab;
})();
