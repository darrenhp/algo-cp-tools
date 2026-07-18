/**
 * 表达式计算器 Tab 控制器
 * 集成 Algebrite（符号）与 numeric.js（数值），交互式地暴露：
 *   1) 通用计算器（化简 / 因式分解 / 求导 / 积分 / 代入求值 / 函数绘制 / 数值积分·求导·求根）
 *   2) 算法复杂度估算（科学计数法规模 + 可行性）
 *   3) 数论 / CP 工具（gcd / lcm / modpow / comb / factorial / 素数 / 欧拉函数 / 对数 / 方程求根 / 线性方程组）
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function CalculatorTab(rootEl) {
    this.rootEl = rootEl;
    this.model = new NS.models.CalculatorModel();
    this.cacheDom();
    this.bindSubTabs();
    this.bindGeneral();
    this.bindComplexity();
    this.bindSolve();
    this.bindLinalg();
    this.restoreOrSample();
    this.model.refreshDeps();
    this.renderDepStatus();
  }

  // ===================== DOM 缓存 =====================
  CalculatorTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    var q = function (id) { return el.querySelector(id); };
    this.subtabBtns = el.querySelectorAll('.calc-subtab-btn');
    this.subPanels = el.querySelectorAll('.calc-panel');

    // 通用计算器
    this.expr = q('#calc-expr');
    this.genResult = q('#calc-gen-result');
    this.diffVar = q('#calc-diff-var');
    this.intVar = q('#calc-int-var');
    this.subsVars = q('#calc-subs-vars');
    this.subsResult = q('#calc-subs-result');

    this.plotFns = q('#calc-plot-fns');
    this.plotXmin = q('#calc-plot-xmin');
    this.plotXmax = q('#calc-plot-xmax');
    this.plotSamples = q('#calc-plot-samples');
    this.plotType = q('#calc-plot-type');
    this.plotTypeValue = 'continuous';
    this.plotParams = q('#calc-plot-params');
    this.plotCustom = q('#calc-plot-custom');
    this.plotOutput = q('#calc-plot-output');

    // 方程求解
    this.solveEq = q('#calc-solve-eq');
    this.solveVar = q('#calc-solve-var');
    this.solveSubs = q('#calc-solve-subs');
    this.solveResult = q('#calc-solve-result');
    this.numIntA = q('#calc-num-int-a');
    this.numIntB = q('#calc-num-int-b');
    this.numDiffX0 = q('#calc-num-diff-x0');
    this.rootX0 = q('#calc-root-x0');
    this.rootX1 = q('#calc-root-x1');

    // 复杂度
    this.cxExpr = q('#calc-cx-expr');
    this.cxN = q('#calc-cx-N');
    this.cxResult = q('#calc-cx-result');
    this.cxTable = q('#calc-cx-table');
    this.cxPresets = q('#calc-cx-presets');
    this.cxNpresets = q('#calc-cx-npresets');

    // 依赖状态
    this.depStatus = q('#calc-dep-status');
    this.laResult = q('#la-result');

    // 线性代数：变量 / 自定义函数
    this.laVars = q('#la-vars');
    this.laFuncs = q('#la-funcs');
  };

  // ===================== 内部子标签 =====================
  CalculatorTab.prototype.bindSubTabs = function () {
    var self = this;
    if (!this.subtabBtns) return;
    this.subtabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-sub');
        self.subtabBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        self.subPanels.forEach(function (p) {
          p.classList.toggle('active', p.getAttribute('data-panel') === target);
        });
      });
    });
  };

  CalculatorTab.prototype.setStatus = function (el, msg, isError) {
    if (!el) return;
    el.innerHTML = msg;
    el.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  CalculatorTab.prototype.renderDepStatus = function () {
    if (!this.depStatus) return;
    var alg = this.model.algAvailable();
    var num = this.model.numericAvail();
    var mj = this.model.mathAvail();
    var nr = this.model.nerdamerAvail();
    var mk = function (ok, name) {
      return '<span class="' + (ok ? 'calc-dep-ok' : 'calc-dep-off') + '">' +
        (ok ? '●' : '○') + ' ' + name + (ok ? ' 已加载' : ' 未加载') + '</span>';
    };
    this.depStatus.innerHTML = mk(alg, 'Algebrite') + ' &nbsp; ' + mk(num, 'numeric.js') + ' &nbsp; ' +
      mk(mj, 'math.js') + ' &nbsp; ' + mk(nr, 'nerdamer') +
      ((alg || num || mj || nr) ? '' : ' <span class="calc-dep-tip">（各项功能将受限，需联网加载 CDN）</span>');
    // 线性代数面板依赖 numeric.js
    if (this.laResult) {
      var laDep = this.rootEl.querySelector('#la-dep');
      if (laDep) {
        laDep.innerHTML = num
          ? '<span class="calc-dep-ok">● numeric.js 已加载，线性代数运算可用</span>'
          : '<span class="calc-dep-off">○ numeric.js 未加载，线性代数运算不可用（需联网）</span>';
      }
    }
  };

  // ===================== 1. 通用计算器 =====================
  CalculatorTab.prototype.bindGeneral = function () {
    var self = this;
    function runAlg(btnId, fn, label) {
      var btn = self.rootEl.querySelector(btnId);
      if (!btn) return;
      btn.addEventListener('click', function () {
        var expr = self.expr ? self.expr.value.trim() : '';
        if (!expr) { self.setStatus(self.genResult, '请输入表达式', true); return; }
        try {
          var out = fn(expr);
          var num = self.model.numFromAlg(out);
          var html = '<div class="calc-out-line"><span class="calc-out-label">' + label + '</span>' +
            '<code>' + escapeHtml(out) + '</code></div>';
          if (num !== null && num !== undefined) {
            html += '<div class="calc-out-line"><span class="calc-out-label">数值</span><code>' +
              escapeHtml(String(num)) + '</code></div>';
          }
          self.genResult.innerHTML = html;
          self.genResult.className = 'calc-result';
        } catch (e) {
          self.setStatus(self.genResult, label + '失败: ' + e.message, true);
        }
      });
    }
    runAlg('#calc-simplify', function (e) { return self.model.simplify(e); }, '化简');
    runAlg('#calc-factor', function (e) { return self.model.factor(e); }, '因式分解');
    runAlg('#calc-diff', function (e) { return self.model.derivative(e, self.diffVar && self.diffVar.value.trim() || 'x'); }, '导数');
    runAlg('#calc-int', function (e) { return self.model.integral(e, self.intVar && self.intVar.value.trim() || 'x'); }, '不定积分');

    // 代入求值
    var subsBtn = self.rootEl.querySelector('#calc-subs-btn');
    if (subsBtn) subsBtn.addEventListener('click', function () {
      var expr = self.expr ? self.expr.value.trim() : '';
      if (!expr) { self.setStatus(self.subsResult, '请输入表达式', true); return; }
      try {
        var ps = self.model.parseScope(self.subsVars ? self.subsVars.value : '');
        var html = '<div class="calc-out-line"><span class="calc-out-label">代入</span><code>' +
          escapeHtml(ps.vars.length ? ps.vars.join(', ') : '（无）') + '</code></div>';
        // 优先用 math.js 求精确结果（分数 / BigNumber / 复数），失败再回退到 Algebrite / 内置求值器
        if (self.model.mathAvail()) {
          try {
            var sm = self.model.smartEvaluate(expr, ps.scope);
            html += '<div class="calc-out-line"><span class="calc-out-label">精确</span><code>' + escapeHtml(sm.exact) + '</code></div>';
            if (sm.value !== null && sm.value !== undefined) {
              html += '<div class="calc-out-line"><span class="calc-out-label">数值</span><code>' +
                escapeHtml(self.model.formatSci(sm.value)) + '</code></div>';
            }
            if (sm.complex) html += '<div class="calc-out-note">（结果为复数，未给出实数数值；精确值为 math.js 输出）</div>';
            self.subsResult.innerHTML = html;
            self.subsResult.className = 'calc-result';
            return;
          } catch (me) {
            html += '<div class="calc-out-note">（math.js 不可用，回退：' + escapeHtml(me.message) + '）</div>';
          }
        }
        var r = self.model.substitute(expr, ps.scope);
        html += '<div class="calc-out-line"><span class="calc-out-label">结果</span><code>' + escapeHtml(r.expr) + '</code></div>';
        if (r.value !== null && r.value !== undefined) {
          html += '<div class="calc-out-line"><span class="calc-out-label">数值</span><code>' +
            escapeHtml(self.model.formatSci(r.value)) + '</code></div>';
        }
        if (!r.symbolic) html += '<div class="calc-out-note">（Algebrite 不可用，使用内置求值器数值代入）</div>';
        self.subsResult.innerHTML = html;
        self.subsResult.className = 'calc-result';
      } catch (e) {
        self.setStatus(self.subsResult, '代入失败: ' + e.message, true);
      }
    });

    // 绘制类型按钮切换（连续型 / 离散型）
    if (self.plotType) self.plotType.addEventListener('click', function (e) {
      var btn = e.target.closest('.graph-type-btn');
      if (!btn) return;
      self.setPlotType(btn.getAttribute('data-plot-type'));
    });

    // 绘制
    var plotBtn = self.rootEl.querySelector('#calc-plot-btn');
    if (plotBtn) plotBtn.addEventListener('click', function () { self.doPlot(); });

    // 数值积分 / 求导 / 求根
    var niBtn = self.rootEl.querySelector('#calc-num-int-btn');
    if (niBtn) niBtn.addEventListener('click', function () {
      var expr = self.expr.value.trim();
      var a = Number(self.numIntA.value), b = Number(self.numIntB.value);
      if (!expr) { self.setStatus(self.genResult, '请输入函数表达式', true); return; }
      try {
        var ps = self.model.parseScope(self.plotParams ? self.plotParams.value : '');
        var v = self.model.numericIntegrate(expr, a, b, ps.scope);
        self.setStatus(self.genResult, '∫[' + a + ', ' + b + '] ' + expr + ' dx ≈ ' + self.model.formatSci(v), false);
      } catch (e) { self.setStatus(self.genResult, '数值积分失败: ' + e.message, true); }
    });
    var ndBtn = self.rootEl.querySelector('#calc-num-diff-btn');
    if (ndBtn) ndBtn.addEventListener('click', function () {
      var expr = self.expr.value.trim();
      var x0 = Number(self.numDiffX0.value);
      if (!expr) { self.setStatus(self.genResult, '请输入函数表达式', true); return; }
      try {
        var ps = self.model.parseScope(self.plotParams ? self.plotParams.value : '');
        var v = self.model.numericDerivative(expr, x0, ps.scope);
        self.setStatus(self.genResult, "d/dx " + expr + " | x=" + x0 + " ≈ " + self.model.formatSci(v), false);
      } catch (e) { self.setStatus(self.genResult, '数值求导失败: ' + e.message, true); }
    });
    var rootBtn = self.rootEl.querySelector('#calc-root-btn');
    if (rootBtn) rootBtn.addEventListener('click', function () {
      var expr = self.expr.value.trim();
      var x0 = Number(self.rootX0.value), x1 = Number(self.rootX1.value);
      if (!expr) { self.setStatus(self.genResult, '请输入函数表达式 f(x)', true); return; }
      try {
        var ps = self.model.parseScope(self.plotParams ? self.plotParams.value : '');
        var v = self.model.findRoot(expr, x0, x1, ps.scope);
        self.setStatus(self.genResult, expr + ' = 0 的根 ≈ x = ' + self.model.formatSci(v), false);
      } catch (e) { self.setStatus(self.genResult, '方程求根失败: ' + e.message, true); }
    });
    // 输入变化时持久化到 sessionStorage / localStorage
    self.bindPersistInputs();
  };

  /** 收集所有可持久化的输入字段（含线性代数面板的动态元素）。 */
  CalculatorTab.prototype.inputFields = function () {
    var self = this;
    var list = [];
    var ids = [
      'calc-expr', 'calc-diff-var', 'calc-int-var', 'calc-subs-vars',
      'calc-plot-fns', 'calc-plot-xmin', 'calc-plot-xmax', 'calc-plot-samples',
      'calc-plot-params', 'calc-plot-custom',
      'calc-solve-eq', 'calc-solve-var', 'calc-solve-subs',
      'calc-num-int-a', 'calc-num-int-b', 'calc-num-diff-x0', 'calc-root-x0', 'calc-root-x1',
      'calc-cx-expr', 'calc-cx-N', 'la-vars', 'la-funcs'
    ];
    ids.forEach(function (id) {
      var el = self.rootEl.querySelector('#' + id);
      if (el) list.push(el);
    });
    // 线性代数矩阵输入为动态元素
    ['la-A', 'la-B', 'la-k', 'la-b'].forEach(function (id) {
      var el = self.rootEl.querySelector('#' + id);
      if (el) list.push(el);
    });
    return list;
  };

  /** 注册输入监听：任何值变化即写入 sessionStorage 与 localStorage。 */
  CalculatorTab.prototype.bindPersistInputs = function () {
    var self = this;
    this.inputFields().forEach(function (el) {
      var ev = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, function () { self.saveInputs(); });
    });
    // 绘制类型按钮切换时也要保存
    if (this.plotType) {
      this.plotType.addEventListener('click', function () { self.saveInputs(); });
    }
  };

  /** 写入持久化存储。 */
  CalculatorTab.prototype.saveInputs = function () {
    try {
      var data = {};
      this.inputFields().forEach(function (el) { data[el.id] = el.value; });
      data['__plotType'] = this.plotTypeValue || 'continuous';
      var json = JSON.stringify(data);
      sessionStorage.setItem('calc-inputs', json);
      localStorage.setItem('calc-inputs', json);
    } catch (e) { /* 存储不可用时静默忽略 */ }
  };

  /** 从持久化存储恢复输入（sessionStorage 优先，其次 localStorage）。 */
  CalculatorTab.prototype.restoreInputs = function () {
    var raw = null;
    try {
      raw = sessionStorage.getItem('calc-inputs') || localStorage.getItem('calc-inputs');
    } catch (e) { return false; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    this.inputFields().forEach(function (el) {
      if (data.hasOwnProperty(el.id) && data[el.id] !== undefined) el.value = data[el.id];
    });
    if (data['__plotType']) this.setPlotType(data['__plotType']);
    return true;
  };

  /** 首次加载：有保存值则恢复，否则填充默认样例。 */
  CalculatorTab.prototype.restoreOrSample = function () {
    if (!this.restoreInputs()) this.loadSample();
  };

  /** 切换绘制类型（continuous / discrete），更新按钮 active 态并重绘。 */
  CalculatorTab.prototype.setPlotType = function (type) {
    this.plotTypeValue = (type === 'discrete') ? 'discrete' : 'continuous';
    if (this.plotType) {
      var btns = this.plotType.querySelectorAll('.graph-type-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-plot-type') === this.plotTypeValue);
      }
    }
    // 已有图像时切换类型即时重绘
    if (this.plotOutput && this.plotOutput.querySelector('svg')) this.doPlot();
  };

  CalculatorTab.prototype.doPlot = function () {
    var fns = this.plotFns.value.trim();
    var xmin = Number(this.plotXmin.value), xmax = Number(this.plotXmax.value);
    var samples = parseInt(this.plotSamples.value, 10) || 200;
    if (!fns) { this.setStatus(this.plotOutput, '请输入函数（一行一个，可引用自定义函数）', true); return; }
    if (!(xmax > xmin)) { this.setStatus(this.plotOutput, 'x 上限须大于下限', true); return; }
    if (samples < 2 || samples > 5000) { this.setStatus(this.plotOutput, '采样点数应在 2~5000', true); return; }
    // 解析自定义函数（可选）
    var userFuncs = {};
    if (this.plotCustom && this.plotCustom.value.trim()) {
      try {
        userFuncs = this.model.parseUserFunctions(this.plotCustom.value);
      } catch (e) {
        this.setStatus(this.plotOutput, '自定义函数解析失败: ' + e.message, true);
        return;
      }
    }
    try {
      var ps = this.model.parseScope(this.plotParams ? this.plotParams.value : '');
      // 绘制类型：用户通过按钮明确选择 continuous / discrete（已取消自动判定）
      var forced = this.plotTypeValue || 'continuous';
      var data = this.model.plot(fns, xmin, xmax, samples, ps.scope, userFuncs, forced);
      var svg = this.plotToSVG(data, forced);
      if (data.warnings && data.warnings.length) {
        svg += '<div class="calc-plot-warn">' + data.warnings.map(function (w) { return escapeHtml(w); }).join('<br>') + '</div>';
      }
      this.plotOutput.innerHTML = svg + this.buildValueTable(data);
      this.plotOutput.className = 'graph-output';
    } catch (e) {
      this.setStatus(this.plotOutput, '绘制失败: ' + e.message, true);
    }
  };

  /**
   * 求值后生成「最多 100 个采样值」表格（x 及各个函数的 y）。
   * 当实际采样点超过 100 时，从首到尾均匀取样 100 个点。
   */
  CalculatorTab.prototype.buildValueTable = function (data) {
    var labels = data.labels || String(this.plotFns.value).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var nSeries = data.series.length;
    // 取各 series 中点数最多的长度作为基线
    var n = 0;
    for (var s = 0; s < nSeries; s++) n = Math.max(n, data.series[s].points.length);
    if (n === 0) return '';
    var MAX = 100;
    var step = Math.max(1, Math.ceil(n / MAX));
    var idxList = [];
    for (var i = 0; i < n; i += step) idxList.push(i);
    if (idxList[idxList.length - 1] !== n - 1) idxList.push(n - 1); // 始终包含末点

    var html = '<div class="calc-valtable-wrap"><div class="calc-valtable-title">求值结果（前 ' + idxList.length + ' 个采样值，x 与各函数值）</div>';
    html += '<table class="calc-valtable"><thead><tr><th>x</th>';
    for (var li = 0; li < labels.length; li++) {
      html += '<th>' + escapeHtml(labels[li]) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var t = 0; t < idxList.length; t++) {
      var xi = idxList[t];
      // 用第一个 series 的 x（各 series 在连续型共享相同 x，离散型按各自 x）
      var xv = data.series[0].points[xi] ? data.series[0].points[xi].x : '';
      html += '<tr><td>' + fmtTick(xv) + '</td>';
      for (var sj = 0; sj < nSeries; sj++) {
        var p = data.series[sj].points[xi];
        var yv = (p && isFinite(p.y)) ? self_format(p.y) : '—';
        html += '<td>' + yv + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  };

  function self_format(v) {
    if (typeof v === 'number' && (Math.abs(v) >= 1e6 || (v !== 0 && Math.abs(v) < 1e-4))) return v.toExponential(4);
    return String(Math.round(v * 1e6) / 1e6);
  }

  /** 鲁棒 y 范围（忽略极端离群，避免渐近线/尖峰撑爆画面）。 */
  function robustRange(series) {
    var all = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) { if (isFinite(p.y)) all.push(p.y); });
    });
    if (!all.length) return { lo: -1, hi: 1 };
    all.sort(function (a, b) { return a - b; });
    var lo = all[Math.floor(all.length * 0.02)];
    var hi = all[Math.floor(all.length * 0.98)];
    if (lo === hi) { lo -= 1; hi += 1; }
    return { lo: lo, hi: hi };
  }

  CalculatorTab.prototype.plotToSVG = function (data, forcedType) {
    forcedType = forcedType || 'continuous';
    var W = 640, H = 380, padL = 50, padR = 16, padT = 16, padB = 36;
    var xmin = data.xmin, xmax = data.xmax;
    var rr = robustRange(data.series);
    var ymin = rr.lo, ymax = rr.hi;
    function sx(x) { return padL + (x - xmin) / (xmax - xmin || 1) * (W - padL - padR); }
    function sy(y) { return H - padB - (y - ymin) / (ymax - ymin || 1) * (H - padT - padB); }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" class="calc-plot-svg">';
    // 背景
    svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0f172a"/>';
    // 网格
    var xticks = 8, yticks = 6;
    for (var i = 0; i <= xticks; i++) {
      var gx = padL + i / xticks * (W - padL - padR);
      svg += '<line x1="' + gx + '" y1="' + padT + '" x2="' + gx + '" y2="' + (H - padB) + '" stroke="#1e293b"/>';
      var xv = xmin + i / xticks * (xmax - xmin);
      svg += '<text x="' + gx + '" y="' + (H - padB + 14) + '" fill="#94a3b8" font-size="10" text-anchor="middle">' + fmtTick(xv) + '</text>';
    }
    for (var j = 0; j <= yticks; j++) {
      var gy = padT + j / yticks * (H - padT - padB);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#1e293b"/>';
      var yv = ymax - j / yticks * (ymax - ymin);
      svg += '<text x="' + (padL - 6) + '" y="' + (gy + 3) + '" fill="#94a3b8" font-size="10" text-anchor="end">' + fmtTick(yv) + '</text>';
    }
    // 坐标轴
    svg += '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#475569"/>';
    svg += '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#475569"/>';
    // 零线
    if (ymin < 0 && ymax > 0) {
      var zy = sy(0);
      svg += '<line x1="' + padL + '" y1="' + zy + '" x2="' + (W - padR) + '" y2="' + zy + '" stroke="#475569" stroke-dasharray="4 3"/>';
    }
    if (xmin < 0 && xmax > 0) {
      var zx = sx(0);
      svg += '<line x1="' + zx + '" y1="' + padT + '" x2="' + zx + '" y2="' + (H - padB) + '" stroke="#475569" stroke-dasharray="4 3"/>';
    }
    // 曲线 / 散点：按类型区分绘制（离散型画圆点，连续型画连线）
    for (var s = 0; s < data.series.length; s++) {
      var pts = data.series[s].points;
      var color = COLORS[s % COLORS.length];
      var stype = data.series[s].type === 'discrete' ? 'discrete' : 'continuous';
      if (forcedType === 'discrete') stype = 'discrete';
      else if (forcedType === 'continuous') stype = 'continuous';
      if (stype === 'discrete') {
        // 离散型：实心圆点（数论类整数点 / 强制散点）
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k];
          if (!isFinite(p.y) || p.y < ymin - (ymax - ymin) || p.y > ymax + (ymax - ymin)) continue;
          var X = sx(p.x), Y = sy(p.y);
          svg += '<circle cx="' + X.toFixed(2) + '" cy="' + Y.toFixed(2) + '" r="3.2" fill="' + color + '"/>';
        }
      } else {
        // 连续型：连线
        var d = '';
        var started = false;
        for (var k2 = 0; k2 < pts.length; k2++) {
          var p2 = pts[k2];
          if (!isFinite(p2.y) || p2.y < ymin - (ymax - ymin) || p2.y > ymax + (ymax - ymin)) { started = false; continue; }
          var X2 = sx(p2.x), Y2 = sy(p2.y);
          d += (started ? ' L' : 'M') + X2.toFixed(2) + ' ' + Y2.toFixed(2);
          started = true;
        }
        svg += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
      }
    }
    svg += '</svg>';
    // 图例（使用模型返回的 labels，单函数时也展示类型标识）
    var fns = data.labels || String(this.plotFns.value).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var leg = '<div class="calc-legend">';
    for (var li = 0; li < fns.length; li++) {
      var st = data.series[li] && data.series[li].type === 'discrete' ? 'discrete' : 'continuous';
      if (forcedType === 'discrete') st = 'discrete';
      else if (forcedType === 'continuous') st = 'continuous';
      var tag = st === 'discrete' ? '离散' : '连续';
      leg += '<span class="calc-legend-item"><span class="calc-legend-dot' +
        (st === 'discrete' ? ' calc-legend-dot-disc' : '') + '" style="background:' +
        COLORS[li % COLORS.length] + '"></span>' + escapeHtml(fns[li]) +
        '<span class="calc-legend-type">·' + tag + '</span></span>';
    }
    leg += '</div>';
    svg += leg;
    return svg;
  };

  function fmtTick(v) {
    if (!isFinite(v)) return '';
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e4)) return v.toExponential(1).replace('e+', 'e').replace('e-0', 'e-');
    return (Math.round(v * 1000) / 1000).toString();
  }

  // ===================== 1.5 方程求解 =====================

  CalculatorTab.prototype.bindSolve = function () {
    var self = this;
    var btn = self.rootEl.querySelector('#calc-solve-btn');
    if (btn) btn.addEventListener('click', function () { self.doSolve(); });
    // 点击 LaTeX 行复制
    if (this.solveResult) {
      this.solveResult.addEventListener('click', function (e) {
        var el = e.target.closest('.calc-out-latex');
        if (!el) return;
        var code = el.querySelector('.calc-latex-src') || el.querySelector('code');
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code.textContent).then(function () {
            var tag = el.querySelector('.calc-latex-tag');
            var old = tag ? tag.textContent : '';
            if (tag) tag.textContent = '已复制';
            setTimeout(function () { if (tag) tag.textContent = old; }, 1200);
          });
        }
      });
    }
  };

  CalculatorTab.prototype.doSolve = function () {
    if (!this.solveEq || !this.solveVar) return;
    var eq = this.solveEq.value.trim();
    var v = this.solveVar.value.trim();
    if (!eq) { this.setStatus(this.solveResult, '请输入方程', true); return; }
    if (!v) { this.setStatus(this.solveResult, '请指定求解变量', true); return; }
    var subsScope = {};
    var subsVars = [];
    var subsRaw = this.solveSubs ? this.solveSubs.value.trim() : '';
    if (subsRaw) {
      try {
        var psa = this.model.parseScope(subsRaw);
        subsScope = psa.scope;
        subsVars = psa.vars;
      } catch (e) {
        this.setStatus(this.solveResult, '代入数值解析失败: ' + e.message, true);
        return;
      }
    }
    try {
      var r = this.model.solveEquation(eq, v);
      var lines = this.renderSolutions(r, v, eq, subsScope, subsVars);
      var subsHint = subsVars.length
        ? '（代入 ' + escapeHtml(subsVars.join(', ')) + ' 验算）'
        : '（未提供代入数值；若有具体数值可填入上方输入框以验算）';
      var html = '<div class="calc-out-note">方程 <code>' + escapeHtml(eq) + '</code> 关于 <code>' + escapeHtml(v) +
        '</code> 的解析解（' + escapeHtml(r.engine) + '）：</div>' + lines +
        '<div class="calc-out-note">' + subsHint + '</div>';
      this.solveResult.innerHTML = html;
      this.solveResult.className = 'calc-result';
    } catch (e) {
      this.setStatus(this.solveResult, '求解失败: ' + e.message, true);
    }
  };

  /** 将 LaTeX 源码渲染为公式 HTML；KaTeX 未加载或渲染失败时降级为源码文本。 */
  function renderLatex(tex) {
    if (window.katex && typeof window.katex.renderToString === 'function') {
      try {
        return window.katex.renderToString(tex, { throwOnError: false, displayMode: false });
      } catch (e) { /* 渲染失败则降级 */ }
    }
    return '<code>' + escapeHtml(tex) + '</code>';
  }

  /** 渲染每个解的易读形式 + LaTeX + 自动代入验算。 */
  CalculatorTab.prototype.renderSolutions = function (r, v, eq, subsScope, subsVars) {
    var self = this;
    return r.solutions.map(function (s, i) {
      var pretty = self.model.prettify(s);
      var label = r.multi ? ('解 ' + (i + 1)) : (v + ' =');
      var html = '<div class="calc-out-line"><span class="calc-out-label">' + escapeHtml(label) + '</span>' +
        '<code>' + escapeHtml(pretty.pretty) + '</code></div>';
      if (pretty.ok && pretty.latex) {
        html += '<div class="calc-out-latex" title="点击复制 LaTeX">' +
          '<span class="calc-latex-tag">LaTeX</span>' +
          '<span class="calc-latex-render">' + renderLatex(pretty.latex) + '</span>' +
          '<code class="calc-latex-src" hidden>' + escapeHtml(pretty.latex) + '</code></div>';
      }
      try {
        var vr = self.model.verifySolution(eq, v, s, subsScope);
        var vstat = vr.equal
          ? '<span class="calc-verify-ok">验算通过（残差 ' + self.model.formatSci(vr.residual) + '）</span>'
          : '<span class="calc-verify-bad">验算未通过（残差 ' + self.model.formatSci(vr.residual) + '）</span>';
        html += '<div class="calc-out-verify">' + escapeHtml(vr.subsText) + ' -&gt; ' + vstat + '</div>';
      } catch (ve) {
        html += '<div class="calc-out-verify calc-verify-note">（验算跳过：' + escapeHtml(ve.message) + '）</div>';
      }
      return html;
    }).join('');
  };

  // ===================== 2. 算法复杂度估算 =====================
  CalculatorTab.prototype.bindComplexity = function () {
    var self = this;
    if (this.cxPresets) this.cxPresets.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-expr]');
      if (b) self.cxExpr.value = b.getAttribute('data-expr');
    });
    if (this.cxNpresets) this.cxNpresets.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (b) self.cxN.value = b.getAttribute('data-n');
    });
    var btn = self.rootEl.querySelector('#calc-cx-btn');
    if (btn) btn.addEventListener('click', function () { self.doComplexity(); });
  };

  CalculatorTab.prototype.doComplexity = function () {
    var expr = this.cxExpr.value.trim();
    var N = Number(this.cxN.value);
    if (!expr) { this.setStatus(this.cxResult, '请输入运算量表达式（自变量为 n）', true); return; }
    if (!isFinite(N) || N <= 0) { this.setStatus(this.cxResult, '最大数据范围 N 须为正数', true); return; }
    try {
      var r = this.model.complexity(expr, N);
      var html =
        '<div class="calc-cx-head">表达式 <code>' + escapeHtml(expr) + '</code> 在 n = ' + escapeHtml(this.cxN.value) + ' 时：</div>' +
        '<div class="calc-cx-sci"><span class="calc-cx-sci-label">科学计数法</span>' + escapeHtml(r.sci) + '</div>' +
        '<div class="calc-cx-mag"><span class="calc-cx-sci-label">数量级</span>' + escapeHtml(r.magnitudeSup) + '</div>' +
        '<div class="calc-cx-feas calc-feas-' + r.feasible.level + '">' + escapeHtml(r.feasible.text) + '</div>';
      this.cxResult.innerHTML = html;
      this.cxResult.className = 'calc-result';

      // 多规模对比表
      var Ns = [1000, 10000, 100000, 1000000, 10000000];
      var rows = this.model.complexityTable(expr, Ns);
      var t = '<table class="attr-table calc-table"><thead><tr><th class="attr-id-cell">n</th><th>运算量(科学计数法)</th><th>数量级</th><th>可行性</th></tr></thead><tbody>';
      for (var i = 0; i < rows.length; i++) {
        t += '<tr><td class="attr-id-cell">' + rows[i].N.toLocaleString() + '</td><td><code>' +
          escapeHtml(rows[i].sci) + '</code></td><td>' + escapeHtml(rows[i].magnitudeSup) +
          '</td><td class="calc-feas-' + rows[i].feasible.level + '">' + escapeHtml(rows[i].feasible.text.split('（')[0]) + '</td></tr>';
      }
      t += '</tbody></table>';
      this.cxTable.innerHTML = t;
    } catch (e) {
      this.setStatus(this.cxResult, '估算失败: ' + e.message, true);
    }
  };

  // ===================== 3. 线性代数 =====================

  /** 把单个数值（可能含 numeric 复数 {re,im}）格式化为字符串。 */
  function trimNum(v) {
    if (typeof v !== 'number') return String(v);
    if (!isFinite(v)) return String(v);
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e5)) return v.toExponential(4).replace('e+', 'e').replace('e-0', 'e-');
    return (Math.round(v * 1e4) / 1e4).toString();
  }
  function fmtCell(v) {
    if (v === null || v === undefined) return '·';
    if (typeof v === 'object' && v !== null && ('re' in v)) {
      var re = v.re, im = v.im;
      var s = '';
      if (Math.abs(re) > 1e-12) s += trimNum(re);
      if (Math.abs(im) > 1e-12) {
        s += (s && im > 0 ? ' + ' : (im < 0 ? ' − ' : '')) + trimNum(Math.abs(im)) + 'i';
      }
      if (!s) s = '0';
      return s;
    }
    return trimNum(v);
  }
  /** 将矩阵（或向量）渲染为 HTML 表格。支持向量（1D）自动按行。 */
  function formatMatrix(M) {
    if (!Array.isArray(M) || !M.length) return '（空）';
    var is2D = Array.isArray(M[0]);
    var rows = is2D ? M : [M];
    var html = '<table class="calc-mat"><tbody>';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr>';
      for (var j = 0; j < rows[i].length; j++) html += '<td>' + escapeHtml(fmtCell(rows[i][j])) + '</td>';
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }
  function formatEig(e) {
    var lambdas = e.lambda, E = e.E;
    var html = '<div class="calc-eig"><span class="calc-out-label">特征值 λ</span>' +
      formatMatrix(lambdas.map(function (l) { return [l]; })) + '</div>';
    if (E) html += '<div class="calc-eig"><span class="calc-out-label">特征向量（列）</span>' + formatMatrix(E) + '</div>';
    return html;
  }

  CalculatorTab.prototype.setLinalg = function (html) {
    if (!this.laResult) return;
    this.laResult.innerHTML = html;
    this.laResult.className = 'la-result';
  };
  CalculatorTab.prototype.setLinalgErr = function (msg) {
    if (!this.laResult) return;
    this.laResult.innerHTML = '<span class="calc-tool-out-err">错误: ' + escapeHtml(msg) + '</span>';
    this.laResult.className = 'la-result la-result-err';
  };

  CalculatorTab.prototype.bindLinalg = function () {
    var self = this;
    function mat(id) { var e = self.rootEl.querySelector(id); return e ? e.value : ''; }
    /** 读取变量作用域与自定义函数（供含表达式的矩阵元素求值）。 */
    function getScope() {
      var scope = self.laVars ? self.model.parseScope(self.laVars.value).scope : {};
      var funcs = {};
      if (self.laFuncs && self.laFuncs.value.trim()) {
        funcs = self.model.parseUserFunctions(self.laFuncs.value);
      }
      return { scope: scope, funcs: funcs };
    }
    function getA() { var s = getScope(); return self.model.parseMatrixExpr(mat('#la-A'), s.scope, s.funcs); }
    function getB() { var s = getScope(); return self.model.parseMatrixExpr(mat('#la-B'), s.scope, s.funcs); }

    function run(op) {
      try {
        var a = getA();
        var res, label;
        switch (op) {
          case 'det': res = self.model.matrixDet(a); label = 'det(A) ='; break;
          case 'inv': res = self.model.matrixInv(a); label = 'A⁻¹ ='; break;
          case 'transpose': res = self.model.matrixTranspose(a); label = 'Aᵀ ='; break;
          case 'trace': res = self.model.matrixTrace(a); label = 'tr(A) ='; break;
          case 'rank': res = self.model.matrixRank(a); label = 'rank(A) ='; break;
          case 'neg': res = self.model.matrixNeg(a); label = '−A ='; break;
          case 'pow': {
            var k = Number(mat('#la-k'));
            res = self.model.matrixPow(a, k); label = 'A^' + k + ' ='; break;
          }
          case 'eig': {
            var e = self.model.matrixEig(a);
            self.setLinalg(formatEig(e)); return;
          }
          case 'add': res = self.model.matrixAdd(a, getB()); label = 'A + B ='; break;
          case 'sub': res = self.model.matrixSub(a, getB()); label = 'A − B ='; break;
          case 'mul': res = self.model.matrixMul(a, getB()); label = 'A × B ='; break;
          case 'scalarmul': {
            var kk = Number(mat('#la-k'));
            res = self.model.matrixScalarMul(kk, a); label = kk + ' · A ='; break;
          }
          default: throw new Error('未知运算: ' + op);
        }
        self.setLinalg('<span class="calc-out-label">' + escapeHtml(label) + '</span>' + formatMatrix(res));
      } catch (e) {
        self.setLinalgErr(e.message);
      }
    }

    var urow = self.rootEl.querySelector('#la-unary-row');
    if (urow) urow.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-op]'); if (b) run(b.getAttribute('data-op'));
    });
    var brow = self.rootEl.querySelector('#la-binary-row');
    if (brow) brow.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-op]'); if (b) run(b.getAttribute('data-op'));
    });

    // 线性方程组 Ax = b
    var sbtn = self.rootEl.querySelector('#la-solve-btn');
    if (sbtn) sbtn.addEventListener('click', function () {
      try {
        var a = getA();
        var s = getScope();
        var b = self.model.parseVectorExpr(mat('#la-b'), s.scope, s.funcs);
        var x = self.model.solveLinear(a, b);
        self.setLinalg('<span class="calc-out-label">Ax = b 的解 x =</span>' + formatMatrix([x]));
      } catch (e) {
        self.setLinalgErr(e.message);
      }
    });

    // 演示样例
    var srow = self.rootEl.querySelector('#la-sample-row');
    if (srow) srow.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-s]'); if (!b) return;
      var A = self.rootEl.querySelector('#la-A');
      var B = self.rootEl.querySelector('#la-B');
      var samples = {
        '2x2': { A: ['1 2', '3 4'] },
        'sym': { A: ['2 -1 0', '-1 2 -1', '0 -1 2'] },
        'rot': { A: ['0 -1', '1 0'] },
        'identity': { A: ['1 0 0', '0 1 0', '0 0 1'] },
        'nonsquare': { A: ['1 2 3', '4 5 6'] },
        // 变量矩阵：列用双空格分隔，元素为变量表达式
        'symbolic': {
          A: ['a  b', 'c  d'],
          vars: 'a=1, b=2, c=3, d=4'
        },
        // 函数矩阵：元素为函数调用 / 三角表达式
        'funcmat': {
          A: ['f(1)  sin(t)', 'g(2,3)  cos(t)'],
          vars: 't=0',
          funcs: 'f(x)=x^2+1\ng(x,y)=x*y'
        }
      };
      var s = samples[b.getAttribute('data-s')];
      if (!s || !A) return;
      A.value = s.A.join('\n');
      if (B) B.value = '';
      if (self.laVars) self.laVars.value = s.vars || '';
      if (self.laFuncs) self.laFuncs.value = s.funcs || '';
    });
  };

  // ===================== 4. 数论函数（单值） =====================

  // ===================== 样例 =====================
  CalculatorTab.prototype.loadSample = function () {
    if (this.expr) this.expr.value = '2*x^2 + 3*x + 1';
    if (this.diffVar) this.diffVar.value = 'x';
    if (this.intVar) this.intVar.value = 'x';
    if (this.subsVars) this.subsVars.value = 'x=2';
    if (this.plotFns) this.plotFns.value = '2*x^2 + 3*x + 1\neulerPhi(x)';
    if (this.plotXmin) this.plotXmin.value = '1';
    if (this.plotXmax) this.plotXmax.value = '30';
    if (this.plotSamples) this.plotSamples.value = '240';
    this.setPlotType('discrete');
    if (this.plotParams) this.plotParams.value = '';
    if (this.plotCustom) this.plotCustom.value = 'f(x) = 2*x + 1';
    if (this.solveEq) this.solveEq.value = 'c0 = p1*c1 + p0*c0 + 1';
    if (this.solveVar) this.solveVar.value = 'c0';
    if (this.solveSubs) this.solveSubs.value = 'c1=1, p0=2, p1=3';
    if (this.numIntA) this.numIntA.value = '0';
    if (this.numIntB) this.numIntB.value = '1';
    if (this.numDiffX0) this.numDiffX0.value = '1';
    if (this.rootX0) this.rootX0.value = '0';
    if (this.rootX1) this.rootX1.value = '2';
    if (this.cxExpr) this.cxExpr.value = 'n*log(n)';
    if (this.cxN) this.cxN.value = '100000';
    var laA = this.rootEl.querySelector('#la-A'); if (laA) laA.value = 'a  b\nc  d';
    var laB = this.rootEl.querySelector('#la-B'); if (laB) laB.value = '5 6\n7 8';
    var laK = this.rootEl.querySelector('#la-k'); if (laK) laK.value = '2';
    var laBvec = this.rootEl.querySelector('#la-b'); if (laBvec) laBvec.value = '5, 11';
    if (this.laVars) this.laVars.value = 'a=1, b=2, c=3, d=4';
    if (this.laFuncs) this.laFuncs.value = '';
  };

  NS.tabs.CalculatorTab = CalculatorTab;
})();
