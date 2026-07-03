/**
 * 一维数组数据模型
 * 持有原始数组 values[]、起始索引 base(0|1)、可视化类型 vizType。
 * 提供 8 种模型的派生结构与结果计算。
 *
 * vizType:
 *   几何类: 'scatter' | 'histogram' | 'bits'
 *   图论树类: 'graph' | 'cartesian' | 'heap'
 *
 * 说明：'graph' 统一表示「函数式图 / 置换环」——基于有向边 i -> A[i]。
 *       当数组是 base..base+n-1 的排列时为置换环（不相交简单环）；
 *       否则为函数式图（基环内向树森林）。
 *       'bits' 将每个元素按二进制 01 展开为位矩阵，支持横向/竖向排列。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var VIZ_TYPES = [
    'scatter', 'histogram', 'bits',
    'graph', 'cartesian', 'heap'
  ];

  function ArrayModel() {
    this.values = [];
    this.base = 0;       // 起始索引 0 或 1
    this.vizType = 'scatter';
  }

  ArrayModel.prototype.VIZ_TYPES = VIZ_TYPES;

  ArrayModel.prototype.reset = function () {
    this.values = [];
    this.base = 0;
    this.vizType = 'scatter';
  };

  ArrayModel.prototype.setData = function (values, base, vizType) {
    this.values = values || [];
    this.base = (base === 1) ? 1 : 0;
    this.vizType = vizType || 'scatter';
  };

  /** 数组长度。 */
  ArrayModel.prototype.size = function () {
    return this.values.length;
  };

  /** 返回显示用的索引数组 [base, base+1, ..., base+n-1]。 */
  ArrayModel.prototype.getDisplayIndices = function () {
    var res = [];
    for (var i = 0; i < this.values.length; i++) res.push(this.base + i);
    return res;
  };

  // ======================== 几何类派生 ========================

  /** 前缀和数组 P，P[0]=0, P[i]=sum(A[0..i-1])，长度 n+1。 */
  ArrayModel.prototype.getPrefixSums = function () {
    var ps = [0];
    for (var i = 0; i < this.values.length; i++) {
      ps.push(ps[i] + this.values[i]);
    }
    return ps;
  };

  /**
   * 位解析：将每个数组元素展开为二进制 01 序列。
   * - 负数取其绝对值的二进制，并标记 sign=true（不使用补码，便于直观阅读）。
   * - 位宽 = 所有元素绝对值二进制位数的最大值（至少 1）。
   * - 每个元素的位序列从高位（MSB）到低位（LSB）排列，左侧补零对齐到位宽。
   *
   * 返回 {
   *   bitWidth: int,                 // 统一位宽
   *   rows: [{                       // 每个元素一行
   *     idx, displayIdx, value,
   *     sign: bool,                  // true 表示负数
   *     bits: [0|1, ...]             // 长度 = bitWidth，从 MSB 到 LSB
   *   }]
   * }
   */
  ArrayModel.prototype.getBits = function () {
    var n = this.values.length;
    if (n === 0) return { bitWidth: 0, rows: [] };

    // 计算位宽
    var bitWidth = 1;
    for (var i = 0; i < n; i++) {
      var mag = Math.abs(Math.trunc(this.values[i]));
      if (mag === 0) continue;
      var bw = Math.floor(Math.log2(mag)) + 1;
      if (bw > bitWidth) bitWidth = bw;
    }

    var rows = [];
    for (var j = 0; j < n; j++) {
      var v = Math.trunc(this.values[j]);
      var sign = v < 0;
      var mag = Math.abs(v);
      var bits = new Array(bitWidth).fill(0);
      for (var b = bitWidth - 1; b >= 0; b--) {
        bits[b] = mag & 1;
        mag = Math.floor(mag / 2);
        if (mag === 0) break;
      }
      rows.push({
        idx: j,
        displayIdx: this.base + j,
        value: this.values[j],
        sign: sign,
        bits: bits
      });
    }
    return { bitWidth: bitWidth, rows: rows };
  };

  // ======================== 图论树类派生 ========================

  /**
   * 笛卡尔树。
   * @param {object} opts - { rootMode: 'min'|'max', tieMode: 'small'|'large' }
   *   rootMode: 'min' 最小值为根（默认），'max' 最大值为根
   *   tieMode:  'small' 相等时下标小的当父（默认），'large' 下标大的当父
   * 返回 { nodes, edges, root, left, right }
   * 使用单调栈 O(n) 构建。
   */
  ArrayModel.prototype.getCartesianTree = function (opts) {
    opts = opts || {};
    var rootMode = opts.rootMode === 'max' ? 'max' : 'min';
    var tieMode = opts.tieMode === 'large' ? 'large' : 'small';
    var n = this.values.length;
    var nodes = [];
    var edges = [];
    if (n === 0) return { nodes: nodes, edges: edges, root: -1, left: [], right: [] };

    // 比较函数：返回 true 表示「栈顶元素应被弹出」（即当前 i 更适合当根/父）
    // min 模式：栈顶值 > 当前值 时弹出；相等时按 tieMode 决定
    // max 模式：栈顶值 < 当前值 时弹出；相等时按 tieMode 决定
    // tieMode='small'：相等时下标小的当父 → 下标大的(i)更适合当根 → 弹出栈顶(下标小)
    // tieMode='large'：相等时下标大的当父 → 下标小的(栈顶)当父 → 不弹出
    var self = this;
    function shouldPop(stackTopIdx, i) {
      var a = self.values[stackTopIdx], b = self.values[i];
      if (a === b) {
        // 相等
        if (tieMode === 'small') {
          // 下标小当父 → 栈顶(小)留下当父，弹出? 不，下标小当父意味着栈顶留下
          // 实际上：弹出栈顶意味着 i 取代栈顶位置，i 当父
          // 要让下标小当父 → 栈顶(下标小)留下 → 不弹出
          return false;
        } else {
          // 下标大当父 → i(下标大)当父 → 弹出栈顶
          return true;
        }
      }
      if (rootMode === 'min') return a > b;
      return a < b;
    }

    var left = new Array(n).fill(-1);
    var right = new Array(n).fill(-1);
    var stack = [];
    for (var i = 0; i < n; i++) {
      var last = -1;
      while (stack.length > 0 && shouldPop(stack[stack.length - 1], i)) {
        last = stack.pop();
      }
      if (last !== -1) left[i] = last;
      if (stack.length > 0) right[stack[stack.length - 1]] = i;
      stack.push(i);
    }
    // 找根：没有父节点的节点即为根
    var hasParent = new Array(n).fill(false);
    for (var k = 0; k < n; k++) {
      if (left[k] !== -1) { hasParent[left[k]] = true; edges.push({ from: k, to: left[k] }); }
      if (right[k] !== -1) { hasParent[right[k]] = true; edges.push({ from: k, to: right[k] }); }
    }
    var root = 0;
    for (var m = 0; m < n; m++) {
      if (!hasParent[m]) { root = m; break; }
    }
    nodes = this.values.map(function (v, idx) {
      return { idx: idx, displayIdx: this.base + idx, value: v };
    }, this);

    return { nodes: nodes, edges: edges, root: root, left: left, right: right };
  };

  /**
   * 完全二叉树（隐式树）。
   * 索引 i（0-based 内部）左子 2i+1 右子 2i+2，显示时映射为 base+内部索引。
   * 返回 { nodes, edges, root }
   */
  ArrayModel.prototype.getHeapTree = function () {
    var n = this.values.length;
    var nodes = [];
    var edges = [];
    for (var i = 0; i < n; i++) {
      nodes.push({ idx: i, displayIdx: this.base + i, value: this.values[i] });
      var left = 2 * i + 1;
      var right = 2 * i + 2;
      if (left < n) edges.push({ from: i, to: left });
      if (right < n) edges.push({ from: i, to: right });
    }
    return { nodes: nodes, edges: edges, root: 0 };
  };

  /**
   * 函数式图（跳转表）：有向边 i -> A[i]。
   * A[i] 视为目标索引，按 base 解释（若 base=1，A[i]=3 表示指向显示索引 3）。
   * 返回 { nodes, edges, cycles }
   */
  ArrayModel.prototype.getFunctionalGraph = function () {
    var n = this.values.length;
    var nodes = [];
    var edges = [];
    for (var i = 0; i < n; i++) {
      nodes.push({ idx: i, displayIdx: this.base + i, value: this.values[i] });
    }
    for (var j = 0; j < n; j++) {
      var target = this.values[j];
      // target 是显示索引，转换为内部索引
      var targetIdx = target - this.base;
      if (targetIdx < 0 || targetIdx >= n) {
        // 越界，跳过该边
        continue;
      }
      edges.push({ from: j, to: targetIdx });
    }
    // 找环
    var cycles = [];
    var visited = new Array(n).fill(false);
    for (var s = 0; s < n; s++) {
      if (visited[s]) continue;
      var path = [];
      var cur = s;
      while (cur >= 0 && cur < n && !visited[cur]) {
        visited[cur] = true;
        path.push(this.base + cur);
        cur = this.values[cur] - this.base;
      }
      // 若回到路径中某点，截取环
      if (cur >= 0 && cur < n) {
        var cycleStart = path.indexOf(this.base + cur);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }
    return { nodes: nodes, edges: edges, cycles: cycles };
  };

  /**
   * 置换环：当数组是 base..base+n-1 的排列时，连边 i -> A[i] 形成不相交环。
   * 返回 { nodes, edges, cycles, valid }
   */
  ArrayModel.prototype.getPermutationCycles = function () {
    var n = this.values.length;
    var nodes = [];
    var edges = [];
    for (var i = 0; i < n; i++) {
      nodes.push({ idx: i, displayIdx: this.base + i, value: this.values[i] });
    }
    var valid = this.isPermutation();
    if (valid) {
      for (var j = 0; j < n; j++) {
        var targetIdx = this.values[j] - this.base;
        edges.push({ from: j, to: targetIdx });
      }
    }
    // 找环（使用显示索引值作为跳转目标）
    var cycles = [];
    if (valid) {
      var visited = new Array(n).fill(false);
      for (var s = 0; s < n; s++) {
        if (visited[s]) continue;
        var cycle = [];
        var cur = s;
        while (!visited[cur]) {
          visited[cur] = true;
          cycle.push(this.base + cur);
          cur = this.values[cur] - this.base;
        }
        if (cycle.length > 0) cycles.push(cycle);
      }
    }
    return { nodes: nodes, edges: edges, cycles: cycles, valid: valid };
  };

  /**
   * 统一的「图」模型：合并函数式图与置换环。
   * - 当数组是 base..base+n-1 的排列时，isPermutation=true，此时所有节点恰属于一个环。
   * - 否则为函数式图（基环内向树森林），部分节点位于环外的树枝上。
   *
   * 返回 {
   *   nodes:        [{idx, displayIdx, value}],
   *   edges:        [{from, to}],          // from/to 为内部索引
   *   cycles:       [[displayIdx,...]],    // 检测到的环（用显示索引表示）
   *   isPermutation: bool,
   *   cycleCount:   int,
   *   minSwaps:     int|null               // 仅排列时有意义 = n - 环数
   * }
   */
  ArrayModel.prototype.getGraph = function () {
    var n = this.values.length;
    var nodes = [];
    var edges = [];
    for (var i = 0; i < n; i++) {
      nodes.push({ idx: i, displayIdx: this.base + i, value: this.values[i] });
    }
    // 构造边：i -> A[i]（A[i] 视为显示索引，转内部索引）
    for (var j = 0; j < n; j++) {
      var targetIdx = this.values[j] - this.base;
      if (targetIdx < 0 || targetIdx >= n) continue; // 越界跳过
      edges.push({ from: j, to: targetIdx });
    }
    // 环检测
    var cycles = [];
    var visited = new Array(n).fill(false);
    for (var s = 0; s < n; s++) {
      if (visited[s]) continue;
      var path = [];
      var pathSet = {};
      var cur = s;
      while (cur >= 0 && cur < n && !visited[cur]) {
        visited[cur] = true;
        pathSet[cur] = true;
        path.push(this.base + cur);
        cur = this.values[cur] - this.base;
      }
      if (cur >= 0 && cur < n && pathSet[cur]) {
        var cycleStart = path.indexOf(this.base + cur);
        if (cycleStart >= 0) cycles.push(path.slice(cycleStart));
      }
    }
    var isPerm = this.isPermutation();
    return {
      nodes: nodes,
      edges: edges,
      cycles: cycles,
      isPermutation: isPerm,
      cycleCount: cycles.length,
      minSwaps: isPerm ? (n - cycles.length) : null
    };
  };

  /** 校验当前数组是否为 base..base+n-1 的排列。 */
  ArrayModel.prototype.isPermutation = function () {
    var n = this.values.length;
    var seen = {};
    for (var i = 0; i < n; i++) {
      var v = this.values[i];
      if (seen[v]) return false;
      seen[v] = true;
    }
    for (var j = 0; j < n; j++) {
      var expected = this.base + j;
      if (!seen[expected]) return false;
    }
    return true;
  };

  // ======================== 结果计算 ========================

  /**
   * 最大矩形面积（单调栈），用于柱状图模型。
   * 返回 { maxArea, leftBound, rightBound, bestLeft, bestRight, bestHeight }
   */
  ArrayModel.prototype.getMaxRectangle = function () {
    var n = this.values.length;
    if (n === 0) return { maxArea: 0, leftBound: [], rightBound: [], bestLeft: -1, bestRight: -1, bestHeight: 0 };
    var heights = this.values;
    var leftBound = new Array(n);
    var rightBound = new Array(n);
    var stack = [];

    for (var i = 0; i < n; i++) {
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= heights[i]) stack.pop();
      leftBound[i] = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
      stack.push(i);
    }
    stack = [];
    for (var j = n - 1; j >= 0; j--) {
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= heights[j]) stack.pop();
      rightBound[j] = stack.length === 0 ? n - 1 : stack[stack.length - 1] - 1;
      stack.push(j);
    }

    var maxArea = 0;
    var bestLeft = 0, bestRight = 0, bestHeight = heights[0];
    for (var k = 0; k < n; k++) {
      var area = heights[k] * (rightBound[k] - leftBound[k] + 1);
      if (area > maxArea) {
        maxArea = area;
        bestLeft = leftBound[k];
        bestRight = rightBound[k];
        bestHeight = heights[k];
      }
    }
    return { maxArea: maxArea, leftBound: leftBound, rightBound: rightBound, bestLeft: bestLeft, bestRight: bestRight, bestHeight: bestHeight };
  };

  /** 接雨水（单调栈/双指针），用于柱状图模型。 */
  ArrayModel.prototype.getTrappedWater = function () {
    var n = this.values.length;
    if (n === 0) return 0;
    var left = new Array(n);
    var right = new Array(n);
    left[0] = this.values[0];
    for (var i = 1; i < n; i++) left[i] = Math.max(left[i - 1], this.values[i]);
    right[n - 1] = this.values[n - 1];
    for (var j = n - 2; j >= 0; j--) right[j] = Math.max(right[j + 1], this.values[j]);
    var total = 0;
    for (var k = 0; k < n; k++) total += Math.max(0, Math.min(left[k], right[k]) - this.values[k]);
    return total;
  };

  /** 置换环个数。 */
  ArrayModel.prototype.getCycleCount = function () {
    var pc = this.getPermutationCycles();
    return pc.valid ? pc.cycles.length : 0;
  };

  /** 最少交换次数 = n - 环数。 */
  ArrayModel.prototype.getMinSwaps = function () {
    return this.values.length - this.getCycleCount();
  };

  /** 函数式图的环个数。 */
  ArrayModel.prototype.getFunctionalCycleCount = function () {
    var n = this.values.length;
    var visited = new Array(n).fill(false);
    var count = 0;
    for (var s = 0; s < n; s++) {
      if (visited[s]) continue;
      var cur = s;
      var pathSet = {};
      var formedCycle = false;
      while (cur >= 0 && cur < n && !visited[cur]) {
        visited[cur] = true;
        pathSet[cur] = true;
        cur = this.values[cur] - this.base;
      }
      // 若 cur 在当前路径中，说明形成环
      if (cur >= 0 && cur < n && pathSet[cur]) formedCycle = true;
      if (formedCycle) count++;
    }
    return count;
  };

  NS.models.ArrayModel = ArrayModel;
})();
