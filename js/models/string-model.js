/**
 * 字符串数据模型
 * 持有主串 string、起始索引 base(0|1)、可视化类型 vizType。
 * 提供 11 种字符串数据结构的派生计算（纯计算，无 DOM）：
 *
 * vizType:
 *   单串匹配与函数: 'kmp' | 'z' | 'border' | 'lyndon'
 *   后缀结构:       'sa' | 'suffix-tree' | 'suffix-bst' | 'sam'
 *   自动机与回文:    'ac' | 'sequence' | 'palindrome'
 *
 * 各方法返回节点/边/数组数据，供 string-svg-renderer 绘制。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  var VIZ_TYPES = [
    'kmp', 'z', 'border', 'lyndon',
    'sa', 'suffix-tree', 'suffix-bst', 'sam',
    'ac', 'sequence', 'palindrome',
    'bwt', 'runs',
    'shift-and', 'shift-or', 'bndm', 'bom',
    'manacher', 'boyer-moore', 'min-rotation'
  ];

  // 需要「模式串 P」输入的位并行匹配算法
  var BITPARALLEL = ['shift-and', 'shift-or', 'bndm', 'bom'];

  // 需要模式串 P 输入的单模式匹配算法（含 BM）
  var NEEDS_PATTERN_P = ['shift-and', 'shift-or', 'bndm', 'bom', 'boyer-moore'];

  // ======================== 私有算法实现 ========================

  /** KMP 前缀函数 π：π[i] = s[0..i] 的最长公共前后缀长度（不含自身）。 */
  function prefixFunction(s) {
    var n = s.length;
    var pi = new Array(n).fill(0);
    for (var i = 1; i < n; i++) {
      var j = pi[i - 1];
      while (j > 0 && s.charAt(i) !== s.charAt(j)) j = pi[j - 1];
      if (s.charAt(i) === s.charAt(j)) j++;
      pi[i] = j;
    }
    return pi;
  }

  /** Z 数组：z[i] = s 与 s[i..] 的最长公共前缀长度；约定 z[0] = n。 */
  function zFunction(s) {
    var n = s.length;
    var z = new Array(n).fill(0);
    if (n === 0) return z;
    z[0] = n;
    var l = 0, r = 0;
    for (var i = 1; i < n; i++) {
      if (i < r) z[i] = Math.min(r - i, z[i - l]);
      while (i + z[i] < n && s.charAt(z[i]) === s.charAt(i + z[i])) z[i]++;
      if (i + z[i] > r) { l = i; r = i + z[i]; }
    }
    return z;
  }

  /**
   * 后缀数组（倍增排序 O(n log^2 n)）+ Kasai height（LCP）。
   * 返回 { sa, rank, height }，height[i] = LCP(sa[i-1], sa[i])，height[0]=0。
   */
  function buildSuffixArray(s) {
    var n = s.length;
    if (n === 0) return { sa: [], rank: [], height: [] };
    var sa = [];
    var rank = new Array(n);
    var tmp = new Array(n);
    for (var i0 = 0; i0 < n; i0++) { sa[i0] = i0; rank[i0] = s.charCodeAt(i0); }
    for (var k = 1; ; k <<= 1) {
      (function (kk) {
        sa.sort(function (a, b) {
          if (rank[a] !== rank[b]) return rank[a] - rank[b];
          var ra = (a + kk < n) ? rank[a + kk] : -1;
          var rb = (b + kk < n) ? rank[b + kk] : -1;
          return ra - rb;
        });
      })(k);
      tmp[sa[0]] = 0;
      for (var i = 1; i < n; i++) {
        var prev = sa[i - 1], cur = sa[i];
        var diff = 0;
        if (rank[prev] !== rank[cur]) diff = 1;
        else {
          var ra = (prev + k < n) ? rank[prev + k] : -1;
          var rb = (cur + k < n) ? rank[cur + k] : -1;
          if (ra !== rb) diff = 1;
        }
        tmp[cur] = tmp[prev] + diff;
      }
      for (var j = 0; j < n; j++) rank[j] = tmp[j];
      if (rank[sa[n - 1]] === n - 1) break;
      if (k >= n) break; // 安全兜底
    }
    // Kasai 求 height
    var height = new Array(n).fill(0);
    var h = 0;
    for (var i2 = 0; i2 < n; i2++) {
      if (rank[i2] > 0) {
        var j2 = sa[rank[i2] - 1];
        while (i2 + h < n && j2 + h < n && s.charAt(i2 + h) === s.charAt(j2 + h)) h++;
        height[rank[i2]] = h;
        if (h > 0) h--;
      } else {
        h = 0;
      }
    }
    return { sa: sa, rank: rank, height: height };
  }

  /**
   * 由 SA + LCP 栈式构建后缀树（隐式后缀树，不加哨兵）。
   * 节点：{ id, parent, edgeStart, edgeEnd, depth, leaf }
   *   leaf = 该节点对应的起始后缀位置（内部节点为 -1）。
   *   edgeLabel = s[edgeStart..edgeEnd-1]。
   */
  function buildSuffixTree(s) {
    var n = s.length;
    if (n === 0) return { nodes: [], root: -1 };
    var saRes = buildSuffixArray(s);
    var sa = saRes.sa;
    var lcp = saRes.height; // lcp[0]=0
    var nodes = [];

    function newNode(parent, edgeStart, edgeEnd, depth, leaf) {
      var id = nodes.length;
      nodes.push({ id: id, parent: parent, edgeStart: edgeStart, edgeEnd: edgeEnd, depth: depth, leaf: leaf });
      return id;
    }
    var root = newNode(-1, 0, 0, 0, -1);
    var stack = [{ id: root, depth: 0 }];
    var prev = root;

    for (var i = 0; i < n; i++) {
      var h = lcp[i];
      var suffix = sa[i];
      var sufLen = n - suffix;
      while (stack.length > 1 && stack[stack.length - 1].depth > h) {
        prev = stack[stack.length - 1].id;
        stack.pop();
      }
      var topEntry = stack[stack.length - 1];
      if (topEntry.depth === h) {
        var leaf = newNode(topEntry.id, suffix + h, n, sufLen, suffix);
        stack.push({ id: leaf, depth: sufLen });
        prev = leaf;
      } else {
        // topEntry.depth < h：在 top→prev 边上深度 h 处分裂
        var splitLen = h - topEntry.depth;
        var prevNode = nodes[prev];
        var mid = newNode(topEntry.id, prevNode.edgeStart, prevNode.edgeStart + splitLen, h, -1);
        prevNode.parent = mid;
        prevNode.edgeStart = prevNode.edgeStart + splitLen;
        var leaf2 = newNode(mid, suffix + h, n, sufLen, suffix);
        stack.push({ id: mid, depth: h });
        stack.push({ id: leaf2, depth: sufLen });
        prev = leaf2;
      }
    }
    return { nodes: nodes, root: root };
  }

  /** 由 SA 构建后缀平衡树（取中点为根的平衡 BST，中序遍历即 SA 顺序）。 */
  function buildSuffixBalancedTree(sa) {
    var nodes = [];
    function build(lo, hi) {
      if (lo > hi) return -1;
      var mid = (lo + hi) >> 1;
      var leftId = build(lo, mid - 1);
      var rightId = build(mid + 1, hi);
      var id = nodes.length;
      nodes.push({ id: id, suffix: sa[mid], left: leftId, right: rightId, rank: mid });
      return id;
    }
    var root = build(0, sa.length - 1);
    return { nodes: nodes, root: root };
  }

  /** SAM 后缀自动机（在线增量构造 O(n)）。状态：{ id, len, link, next:{char->id}, isClone }。 */
  function buildSAM(s) {
    var states = [];
    function newState(len, link, isClone) {
      var id = states.length;
      states.push({ id: id, len: len, link: link, next: {}, isClone: !!isClone });
      return id;
    }
    var last = newState(0, -1, false);
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var cur = newState(states[last].len + 1, -1, false);
      var p = last;
      while (p !== -1 && states[p].next[c] === undefined) {
        states[p].next[c] = cur;
        p = states[p].link;
      }
      if (p === -1) {
        states[cur].link = 0;
      } else {
        var q = states[p].next[c];
        if (states[p].len + 1 === states[q].len) {
          states[cur].link = q;
        } else {
          var clone = newState(states[p].len + 1, states[q].link, true);
          for (var key in states[q].next) states[clone].next[key] = states[q].next[key];
          while (p !== -1 && states[p].next[c] === q) {
            states[p].next[c] = clone;
            p = states[p].link;
          }
          states[q].link = clone;
          states[cur].link = clone;
        }
      }
      last = cur;
    }
    return { states: states, last: last };
  }

  /** AC 自动机：trie 插入 + BFS 构造 fail 链。 */
  function buildAC(patterns) {
    var nodes = [];
    function newNode(depth, char) {
      var id = nodes.length;
      nodes.push({ id: id, children: {}, fail: 0, isEnd: false, depth: depth, char: char, patterns: [] });
      return id;
    }
    newNode(0, '');
    for (var p = 0; p < patterns.length; p++) {
      var pat = patterns[p];
      if (pat.length === 0) continue;
      var cur = 0;
      for (var i = 0; i < pat.length; i++) {
        var c = pat.charAt(i);
        if (nodes[cur].children[c] === undefined) {
          nodes[cur].children[c] = newNode(nodes[cur].depth + 1, c);
        }
        cur = nodes[cur].children[c];
      }
      nodes[cur].isEnd = true;
      nodes[cur].patterns.push(p);
    }
    // BFS fail
    var queue = [];
    for (var c0 in nodes[0].children) {
      var ch = nodes[0].children[c0];
      nodes[ch].fail = 0;
      queue.push(ch);
    }
    while (queue.length > 0) {
      var u = queue.shift();
      for (var c1 in nodes[u].children) {
        var v = nodes[u].children[c1];
        var f = nodes[u].fail;
        while (f !== 0 && nodes[f].children[c1] === undefined) {
          f = nodes[f].fail;
        }
        if (nodes[f].children[c1] !== undefined && nodes[f].children[c1] !== v) {
          nodes[v].fail = nodes[f].children[c1];
        } else {
          nodes[v].fail = 0;
        }
        if (nodes[nodes[v].fail].isEnd) {
          nodes[v].patterns = nodes[v].patterns.concat(nodes[nodes[v].fail].patterns);
          nodes[v].isEnd = true;
        }
        queue.push(v);
      }
    }
    return { nodes: nodes, patterns: patterns };
  }

  /** 序列自动机（子序列自动机）：next[i][c] = 下一个 c 的位置，转移目标为 j+1。 */
  function buildSequenceAutomaton(s) {
    var n = s.length;
    var alphaSet = {};
    for (var i = 0; i < n; i++) alphaSet[s.charAt(i)] = true;
    var alphabet = Object.keys(alphaSet).sort();
    // nxt[i][c] = 最小 j>=i 使 s[j]==c，否则 n
    var nxt = new Array(n + 1);
    nxt[n] = {};
    alphabet.forEach(function (c) { nxt[n][c] = n; });
    for (var k = n - 1; k >= 0; k--) {
      nxt[k] = {};
      alphabet.forEach(function (c) { nxt[k][c] = nxt[k + 1][c]; });
      nxt[k][s.charAt(k)] = k;
    }
    var nodes = [];
    for (var t = 0; t <= n; t++) {
      var trans = {};
      alphabet.forEach(function (c) {
        var j = nxt[t][c];
        trans[c] = (j < n) ? (j + 1) : -1;
      });
      nodes.push({ id: t, next: trans, depth: t });
    }
    return { nodes: nodes, alphabet: alphabet, n: n, root: 0, terminal: n };
  }

  /** 回文树（Eertree）：奇偶双根 + suffix link。 */
  function buildPalindromeTree(s) {
    var n = s.length;
    var nodes = [];
    nodes.push({ id: 0, len: 0, link: 1, next: {}, count: 0, char: '' });  // even root
    nodes.push({ id: 1, len: -1, link: 1, next: {}, count: 0, char: '' }); // odd root
    var last = 0;

    function getLink(v, i) {
      while (true) {
        var j = i - nodes[v].len - 1;
        if (j >= 0 && s.charAt(j) === s.charAt(i)) return v;
        v = nodes[v].link;
      }
    }
    for (var i = 0; i < n; i++) {
      var c = s.charAt(i);
      var cur = getLink(last, i);
      if (nodes[cur].next[c] === undefined) {
        var newLen = nodes[cur].len + 2;
        var newId = nodes.length;
        nodes.push({ id: newId, len: newLen, link: 0, next: {}, count: 0, char: c });
        if (newLen === 1) {
          nodes[newId].link = 0;
        } else {
          var linkCur = getLink(nodes[cur].link, i);
          nodes[newId].link = nodes[linkCur].next[c] !== undefined ? nodes[linkCur].next[c] : 0;
        }
        nodes[cur].next[c] = newId;
      }
      last = nodes[cur].next[c];
      nodes[last].count++;
    }
    return { nodes: nodes, oddRoot: 1, evenRoot: 0, last: last };
  }

  // ======================== BWT（Burrows-Wheeler 变换） ========================
  // 所有循环移位按字典序排序，取每行的末字符（L 列）即 BWT 结果
  function buildBWT(s) {
    var n = s.length;
    if (n === 0) return { n: 0, rows: [], bwt: '', sortedIdx: [] };
    var rots = [];
    for (var i = 0; i < n; i++) {
      rots.push(s.substring(i) + s.substring(0, i));
    }
    var idx = [];
    for (var k = 0; k < n; k++) idx.push(k);
    idx.sort(function (a, b) {
      return rots[a] < rots[b] ? -1 : (rots[a] > rots[b] ? 1 : 0);
    });
    var rows = [], bwtChars = [];
    for (var r = 0; r < n; r++) {
      var oi = idx[r];
      var rot = rots[oi];
      var F = rot.charAt(0);
      var L = rot.charAt(n - 1);
      bwtChars.push(L);
      rows.push({ rank: r, origPos: oi, F: F, L: L, rot: rot });
    }
    return { n: n, rows: rows, bwt: bwtChars.join(''), sortedIdx: idx };
  }

  // ======================== Runs（游程 / Run-Length Encoding） ========================
  function buildRuns(s) {
    var n = s.length;
    var runs = [];
    var i = 0;
    while (i < n) {
      var c = s.charAt(i);
      var j = i;
      while (j < n && s.charAt(j) === c) j++;
      runs.push({ start: i, end: j - 1, char: c, len: j - i });
      i = j;
    }
    var rle = runs.map(function (r) { return r.char + r.len; }).join('');
    return { string: s, runs: runs, rle: rle, count: runs.length };
  }

  // ======================== 位并行匹配（Shift-And / Or / BNDM / BOM） ========================
  // 返回 m 位二进制串（bit m-1 在最左）
  function maskStr(m, val) {
    var s = '';
    for (var b = m - 1; b >= 0; b--) s += ((val >> b) & 1) ? '1' : '0';
    return s;
  }
  // 位掩码 M[c]：bit j = 1 当且仅当 P[j] == c
  function buildMaskM(P) {
    var m = P.length;
    var M = {};
    for (var j = 0; j < m; j++) {
      var c = P.charAt(j);
      if (M[c] === undefined) M[c] = 0;
      M[c] |= (1 << j);
    }
    return M;
  }

  // Shift-And：D = ((D<<1)|1) & M[T[i]]，匹配当 bit(m-1)=1
  function shiftAnd(T, P) {
    var m = P.length, n = T.length;
    var M = buildMaskM(P);
    var allOnes = (1 << m) - 1;
    var steps = [], matches = [], D = 0;
    for (var i = 0; i < n; i++) {
      var c = T.charAt(i);
      var mc = (M[c] !== undefined) ? M[c] : 0;
      D = ((D << 1) | 1) & mc;
      D = D & allOnes;
      var match = ((D >> (m - 1)) & 1) === 1;
      if (match) matches.push(i - m + 1);
      steps.push({ i: i, char: c, D: D, match: match });
    }
    return { T: T, P: P, m: m, n: n, M: M, steps: steps, matches: matches };
  }

  // Shift-Or：D = (D<<1) | R[T[i]]（R[c] 中匹配位为 0），匹配当 bit(m-1)=0
  function shiftOr(T, P) {
    var m = P.length, n = T.length;
    var M = buildMaskM(P);
    var allOnes = (1 << m) - 1;
    function Rc(c) {
      if (M[c] !== undefined) return (~M[c]) & allOnes;
      return allOnes;
    }
    var steps = [], matches = [], D = allOnes;
    for (var i = 0; i < n; i++) {
      var c = T.charAt(i);
      D = ((D << 1) & allOnes) | Rc(c);
      var match = ((D >> (m - 1)) & 1) === 0;
      if (match) matches.push(i - m + 1);
      steps.push({ i: i, char: c, D: D, match: match });
    }
    return { T: T, P: P, m: m, n: n, M: M, steps: steps, matches: matches };
  }

  // BNDM：逐窗口从右向左扫描（读取 T[j+m-1]..T[j]），位掩码按 reverse(P) 构造
  // D 初值 0，D = ((D<<1)|1) & Mrev[c]，最高位=1 即匹配（经验证与暴力匹配一致）
  function bndm(T, P) {
    var m = P.length, n = T.length;
    var rows = [], matches = [];
    if (m === 0 || n < m) return { T: T, P: P, m: m, n: n, rows: rows, matches: matches };
    var revP = '';
    for (var i = m - 1; i >= 0; i--) revP += P.charAt(i);
    var Mrev = buildMaskM(revP); // bit i 置位 当且仅当 reverse(P)[i] == c，即 P[m-1-i]==c
    for (var e = m - 1; e < n; e++) {
      var D = 0, match = false, pos = e, matchedAt = -1;
      for (var step = 0; step < m; step++) {
        var c = T.charAt(pos);
        var mc = (Mrev[c] !== undefined) ? Mrev[c] : 0;
        D = ((D << 1) | 1) & mc;
        if (((D >> (m - 1)) & 1) === 1) { match = true; matchedAt = e - m + 1; break; }
        if (D === 0) break;
        pos--;
      }
      if (match) matches.push(matchedAt);
      rows.push({ e: e, D: D, match: match });
    }
    return { T: T, P: P, m: m, n: n, rows: rows, matches: matches };
  }

  // BOM：基于 reverse(P) 后缀 oracle（SAM）的位并行，用 suffix link / border 计算位移
  function bom(T, P) {
    var m = P.length, n = T.length;
    var matches = [], rows = [];
    if (m === 0 || n < m) return { T: T, P: P, m: m, n: n, rows: rows, matches: matches };
    var revP = '';
    for (var i = m - 1; i >= 0; i--) revP += P.charAt(i);
    var sam = buildSAM(revP);
    // 模式 P 的最长 border 长度（= reverse(P) 满状态的 suffix link 长度），用于匹配后位移
    var borderLen = 0;
    var lastLink = sam.states[sam.last].link;
    if (lastLink >= 0) borderLen = sam.states[lastLink].len;
    var e = m - 1;
    while (e < n) {
      var state = 0, len = 0, pos = e, match = false;
      while (pos >= e - m + 1) {
        var c = T.charAt(pos);
        var nx = sam.states[state].next[c];
        if (nx === undefined) break;
        state = nx;
        len = sam.states[state].len;
        if (len === m) { match = true; break; }
        pos--;
      }
      var shift;
      if (match) {
        matches.push(e - m + 1);
        shift = m - borderLen; // 匹配后位移由 border 决定，避免漏掉重叠出现
        if (shift < 1) shift = 1;
      } else {
        shift = (len > 0) ? (m - len) : m; // 失配位移 = m - 已匹配后缀长
      }
      rows.push({ e: e, len: len, match: match, shift: shift });
      e += shift;
    }
    return { T: T, P: P, m: m, n: n, revP: revP, rows: rows, matches: matches };
  }

  // ======================== Manacher（最长回文子串） ========================
  // 在原串中插入分隔符 #，求每个中心的回文半径 d[]：
  //   t = #c0#c1#...#c_{n-1}#（长度 2n+1）
  //   d[i] = 以 i 为中心的最长回文半径（含中心），对应原串回文长度 = d[i]（原串回文长度 = d[i]）
  // 返回 { string, t, d, maxLen, maxCenter, maxLeft, ranges }
  function manacher(s) {
    var n = s.length;
    if (n === 0) return { string: s, t: '', d: [], maxLen: 0, maxCenter: -1, maxLeft: -1, ranges: [] };
    // 构造变换串 t = #s[0]#s[1]#...#s[n-1]#
    var tChars = [];
    for (var i = 0; i < n; i++) { tChars.push('#'); tChars.push(s.charAt(i)); }
    tChars.push('#');
    var t = tChars.join('');
    var tn = t.length;
    var d = new Array(tn).fill(0);
    var l = 0, r = -1; // [l, r] 为当前最右回文区间
    for (var k = 0; k < tn; k++) {
      var init = 1;
      if (k <= r) init = Math.min(d[l + r - k], r - k + 1);
      // 向两侧扩展
      while (k - init >= 0 && k + init < tn && t.charAt(k - init) === t.charAt(k + init)) init++;
      d[k] = init; // 半径（含中心），即回文区间半长
      if (k + init - 1 > r) { l = k - init + 1; r = k + init - 1; }
    }
    // 找最长回文
    var maxLen = 0, maxCenter = -1;
    for (var c = 0; c < tn; c++) {
      // 原串回文长度 = d[c] - 1（半径含中心，变换串中回文长度 = 2*d[c]-1，对应原串 = d[c]-1）
      var palLen = d[c] - 1;
      if (palLen > maxLen) { maxLen = palLen; maxCenter = c; }
    }
    // maxCenter 在 t 中 → 原串左端 left = (maxCenter - maxLen) / 2
    var maxLeft = maxCenter >= 0 ? Math.floor((maxCenter - maxLen) / 2) : -1;
    // 为可视化准备每个中心对应的原串回文区间 [left, right]（0-based，闭区间）
    var ranges = [];
    for (var cc = 0; cc < tn; cc++) {
      var pl = d[cc] - 1;
      if (pl <= 0) { ranges.push(null); continue; }
      var left = Math.floor((cc - pl) / 2);
      ranges.push({ left: left, right: left + pl - 1, len: pl });
    }
    return { string: s, t: t, d: d, maxLen: maxLen, maxCenter: maxCenter, maxLeft: maxLeft, ranges: ranges };
  }

  // ======================== Boyer-Moore（坏字符 + 好后缀） ========================
  // 经典单模式匹配：从右向左比较，失配时取 max(坏字符位移, 好后缀位移)
  // 坏字符表 bc[c] = c 在 P 中最右出现位置（不含则为 -1）
  // 好后缀表 gs[i]：当 P[0..m-1] 与窗口右端对齐、P[i] 失配时（P[i+1..m-1] 已匹配 = 好后缀），
  //   gs[i] = 模式串应右移使得 P 的某个前缀/另一段与好后缀对齐的位置偏移
  // 返回 { T, P, m, n, bc, gs, steps, matches }
  function boyerMoore(T, P) {
    var m = P.length, n = T.length;
    if (m === 0 || n === 0 || m > n) return { T: T, P: P, m: m, n: n, bc: {}, gs: [], steps: [], matches: [] };
    // 坏字符表
    var bc = {};
    for (var i = 0; i < m; i++) bc[P.charAt(i)] = i;
    // 好后缀表 gs（长度 m+1，gs[i] 为 P[i] 失配时的位移）
    // 标准 BM 好后缀预处理：suffix 数组 + gs 数组
    var suff = new Array(m).fill(0);
    suff[m - 1] = m;
    var g = m - 1, f = 0;
    for (var ii = m - 2; ii >= 0; ii--) {
      if (ii > g && suff[ii + m - 1 - f] < ii - g) {
        suff[ii] = suff[ii + m - 1 - f];
      } else {
        if (ii < g) g = ii;
        f = ii;
        while (g >= 0 && P.charAt(g) === P.charAt(g + m - 1 - f)) g--;
        suff[ii] = f - g;
      }
    }
    var gs = new Array(m).fill(m);
    // case 3：无好后缀可匹配时，对齐 P 的最长前缀
    var j = 0;
    for (var i3 = 0; i3 < m; i3++) {
      if (i3 + 1 === suff[i3]) {
        for (; j < m - 1 - i3; j++) {
          if (gs[j] === m) gs[j] = m - 1 - i3;
        }
      }
    }
    // case 1,2：有匹配段
    for (var i4 = 0; i4 < m - 1; i4++) {
      gs[m - 1 - suff[i4]] = m - 1 - i4;
    }
    // 匹配过程
    var steps = [];
    var matches = [];
    var s3 = 0; // 当前窗口左端
    while (s3 <= n - m) {
      var j2 = m - 1;
      while (j2 >= 0 && P.charAt(j2) === T.charAt(s3 + j2)) j2--;
      var matchedSuffixStart = j2 + 1; // P[matchedSuffixStart..m-1] 已匹配（好后缀）
      var matched = (j2 < 0); // 完全匹配
      if (matched) {
        matches.push(s3);
        steps.push({ pos: s3, mismatch: -1, badChar: '', bcShift: 1, gsShift: gs[0], shift: 1, matched: true, matchedLen: m });
        s3 += 1; // 找到后移动 1 继续找下一个
      } else {
        var badC = T.charAt(s3 + j2);
        var bcPos = (bc[badC] !== undefined) ? bc[badC] : -1;
        var bcShift = Math.max(1, j2 - bcPos);
        var gsShift = gs[j2];
        var shift = Math.max(bcShift, gsShift);
        steps.push({
          pos: s3, mismatch: j2, badChar: badC,
          bcPos: bcPos, bcShift: bcShift, gsShift: gsShift, shift: shift,
          matched: false, matchedLen: m - matchedSuffixStart
        });
        s3 += shift;
      }
    }
    return { T: T, P: P, m: m, n: n, bc: bc, gs: gs, steps: steps, matches: matches };
  }

  // ======================== 最小表示法（最小字典序循环移位） ========================
  // Booth 算法：O(n) 求串 s 的字典序最小循环移位的起始位置
  // 返回 { string, start, rotations, kmp }
  function minRotation(s) {
    var n = s.length;
    if (n === 0) return { string: s, start: 0, rotations: [], comparisons: [] };
    var s2 = s + s; // 双倍串
    var f = new Array(2 * n).fill(-1); // failure 数组
    var k = 0; // 当前最小循环移位起点
    var comparisons = [];
    for (var j = 1; j < 2 * n; j++) {
      var i = f[j - k - 1];
      while (i !== -1 && s2.charAt(j) !== s2.charAt(k + i + 1)) {
        if (s2.charAt(j) < s2.charAt(k + i + 1)) {
          comparisons.push({ j: j, k: k, oldK: k, type: 'shift', a: s2.charAt(j), b: s2.charAt(k + i + 1) });
          k = j - i - 1;
        }
        i = f[i];
      }
      if (i === -1 && s2.charAt(j) !== s2.charAt(k + i + 1)) {
        if (s2.charAt(j) < s2.charAt(k + i + 1)) {
          comparisons.push({ j: j, k: k, oldK: k, type: 'shift', a: s2.charAt(j), b: s2.charAt(k + i + 1) });
          k = j;
        }
        f[j - k] = -1;
      } else {
        f[j - k] = i + 1;
        comparisons.push({ j: j, k: k, oldK: k, type: 'cmp', a: s2.charAt(j), b: s2.charAt(k + i + 1) });
      }
    }
    // 枚举所有循环移位供可视化
    var rotations = [];
    for (var r = 0; r < n; r++) {
      rotations.push({ start: r, str: s2.substring(r, r + n) });
    }
    rotations.sort(function (a, b) { return a.str < b.str ? -1 : (a.str > b.str ? 1 : 0); });
    return { string: s, start: k, rotations: rotations, comparisons: comparisons, kmp: f.slice(0, n) };
  }

  // ======================== 模型类 ========================

  function StringModel() {
    this.string = '';
    this.base = 1;
    this.vizType = 'kmp';
    this.patterns = []; // AC 自动机用
    this.patternP = ''; // 位并行匹配（Shift-And/Or/BNDM/BOM）的模式串 P
  }

  StringModel.prototype.VIZ_TYPES = VIZ_TYPES;
  StringModel.prototype.BITPARALLEL = BITPARALLEL;

  StringModel.prototype.setData = function (s, base, vizType) {
    this.string = s || '';
    this.base = (base === 0) ? 0 : 1;
    this.vizType = vizType || 'kmp';
  };

  StringModel.prototype.setPatterns = function (patterns) {
    this.patterns = patterns || [];
  };

  StringModel.prototype.setPatternP = function (p) {
    this.patternP = p || '';
  };

  StringModel.prototype.size = function () {
    return this.string.length;
  };

  /** 显示用索引：position -> base+position。 */
  StringModel.prototype.displayIdx = function (pos) {
    return this.base + pos;
  };

  // ---------- KMP ----------
  StringModel.prototype.getKMP = function () {
    var pi = prefixFunction(this.string);
    return { string: this.string, prefix: pi, base: this.base };
  };

  // ---------- Z ----------
  StringModel.prototype.getZ = function () {
    var z = zFunction(this.string);
    return { string: this.string, z: z, base: this.base };
  };

  // ---------- Border 树 ----------
  StringModel.prototype.getBorderTree = function () {
    var s = this.string;
    var n = s.length;
    var pi = prefixFunction(s);
    var nodes = [];
    for (var i = 0; i <= n; i++) nodes.push({ id: i, len: i });
    var edges = [];
    for (var k = 1; k <= n; k++) {
      edges.push({ from: pi[k - 1], to: k });
    }
    return { nodes: nodes, edges: edges, root: 0, prefix: pi, string: s, base: this.base };
  };

  // ---------- Lyndon 分解 ----------
  StringModel.prototype.getLyndon = function () {
    var s = this.string;
    var n = s.length;
    var factors = [];
    var i = 0;
    while (i < n) {
      var j = i + 1, k = i;
      while (j < n && s.charAt(k) <= s.charAt(j)) {
        if (s.charAt(k) < s.charAt(j)) k = i;
        else k++;
        j++;
      }
      var w = j - k; // 每个因子的长度
      while (i <= k) {
        factors.push({ start: i, end: i + w, text: s.substring(i, i + w) });
        i += w;
      }
    }
    return { string: s, factors: factors, base: this.base };
  };

  // ---------- 后缀数组 ----------
  StringModel.prototype.getSuffixArray = function () {
    var res = buildSuffixArray(this.string);
    return {
      string: this.string,
      sa: res.sa,
      rank: res.rank,
      height: res.height,
      base: this.base
    };
  };

  // ---------- 后缀树 ----------
  StringModel.prototype.getSuffixTree = function () {
    var res = buildSuffixTree(this.string);
    var s = this.string;
    var nodes = res.nodes;
    // 计算每个节点的代表子串（从根到该节点路径拼接）：
    // 叶子 → 完整后缀 s[leaf..n]；内部节点 → 取其子树中任一叶子的后缀前 depth 字符
    // 先建 childrenMap 找每个内部节点的代表叶子
    var childrenMap = {};
    nodes.forEach(function (nd) { childrenMap[nd.id] = []; });
    nodes.forEach(function (nd) { if (nd.parent >= 0 && childrenMap[nd.parent]) childrenMap[nd.parent].push(nd.id); });
    // 对每个节点向下找首个叶子
    function firstLeaf(id) {
      if (nodes[id].leaf >= 0) return nodes[id].leaf;
      var ch = childrenMap[id] || [];
      for (var i = 0; i < ch.length; i++) {
        var fl = firstLeaf(ch[i]);
        if (fl >= 0) return fl;
      }
      return -1;
    }
    nodes.forEach(function (nd) {
      if (nd.id === res.root) { nd.repr = ''; return; }
      if (nd.leaf >= 0) {
        nd.repr = s.substring(nd.leaf); // 完整后缀
      } else if (nd.depth > 0) {
        var fl = firstLeaf(nd.id);
        nd.repr = fl >= 0 ? s.substring(fl, fl + nd.depth) : '';
      } else {
        nd.repr = '';
      }
    });
    return { string: s, nodes: nodes, root: res.root, base: this.base };
  };

  // ---------- 后缀平衡树 ----------
  StringModel.prototype.getSuffixBalancedTree = function () {
    var saRes = buildSuffixArray(this.string);
    var res = buildSuffixBalancedTree(saRes.sa);
    return { string: this.string, nodes: res.nodes, root: res.root, sa: saRes.sa, base: this.base };
  };

  // ---------- SAM ----------
  StringModel.prototype.getSAM = function () {
    var s = this.string;
    var res = buildSAM(s);
    var states = res.states;
    var n = s.length;
    // 计算每个状态的 endpos 集合：沿 suffix link 树自底向上合并
    // 先用每个“前缀态”（last 链上的态）初始化一个 endpos
    var childrenOf = [];
    states.forEach(function () { childrenOf.push([]); });
    states.forEach(function (st) {
      if (st.link >= 0) childrenOf[st.link].push(st.id);
    });
    // 沿 last 链回溯得到每次插入对应的状态，记录其右端点
    // 简单做法：对每个前缀 i，从 last_i 沿 link 上行标记 i；但更直接是树形合并
    // 这里用“每个状态在 link 树的子树中包含多少个前缀态”来推 endpos
    // 先标记前缀态：插入第 k 个字符后的 last 即对应结束位置 k-1（0-based）
    // 重新跑一次构建以记录每步 last
    var stepLast = [];
    var st2 = [{ id: 0, len: 0, link: -1, next: {}, isClone: false }];
    var last2 = 0;
    for (var i = 0; i < n; i++) {
      var c = s.charAt(i);
      var cur = st2.length;
      st2.push({ id: cur, len: st2[last2].len + 1, link: -1, next: {}, isClone: false });
      var p = last2;
      while (p !== -1 && st2[p].next[c] === undefined) { st2[p].next[c] = cur; p = st2[p].link; }
      if (p === -1) { st2[cur].link = 0; }
      else {
        var q = st2[p].next[c];
        if (st2[p].len + 1 === st2[q].len) { st2[cur].link = q; }
        else {
          var clone = st2.length;
          st2.push({ id: clone, len: st2[p].len + 1, link: st2[q].link, next: {}, isClone: true });
          for (var key in st2[q].next) st2[clone].next[key] = st2[q].next[key];
          while (p !== -1 && st2[p].next[c] === q) { st2[p].next[c] = clone; p = st2[p].link; }
          st2[q].link = clone; st2[cur].link = clone;
        }
      }
      last2 = cur;
      stepLast.push({ last: cur, pos: i });
    }
    // endpos 集合：前缀态初始化为 {pos}，沿 link 树自底向上合并子集
    // 为控制体积，超过 8 个 endpos 只保留前几个 + 计数
    var endpos = [];
    states.forEach(function () { endpos.push([]); });
    stepLast.forEach(function (rec) { endpos[rec.last].push(rec.pos); });
    // link 树自底向上（按 len 降序）
    var order = states.slice().sort(function (a, b) { return b.len - a.len; });
    order.forEach(function (st) {
      if (st.link >= 0 && st.link !== st.id) {
        endpos[st.link] = endpos[st.link].concat(endpos[st.id]);
      }
    });
    states.forEach(function (st) {
      endpos[st.id].sort(function (a, b) { return a - b; });
    });
    // 每个状态代表的子串长度区间 [minlen, len]，minlen = link.len+1（link=-1 时为 1）
    // 取一个代表子串：利用 endpos 中任一位置 p，s[p-len+1..p] 即长度 len 的代表
    states.forEach(function (st) {
      var minlen = st.link >= 0 ? states[st.link].len + 1 : 1;
      st.minlen = minlen;
      var ep = endpos[st.id];
      if (ep.length > 0 && st.len > 0) {
        var p = ep[0];
        st.repr = s.substring(p - st.len + 1, p + 1);
      } else {
        st.repr = '';
      }
    });
    return {
      string: s, states: states, last: res.last, base: this.base,
      endpos: endpos
    };
  };

  // ---------- AC 自动机 ----------
  StringModel.prototype.getACAutomaton = function () {
    var res = buildAC(this.patterns);
    return { nodes: res.nodes, patterns: res.patterns, base: this.base };
  };

  // ---------- 序列自动机 ----------
  StringModel.prototype.getSequenceAutomaton = function () {
    var res = buildSequenceAutomaton(this.string);
    return { string: this.string, nodes: res.nodes, alphabet: res.alphabet, n: res.n, root: res.root, terminal: res.terminal, base: this.base };
  };

  // ---------- 回文树 ----------
  StringModel.prototype.getPalindromeTree = function () {
    var s = this.string;
    var res = buildPalindromeTree(s);
    var nodes = res.nodes;
    var n = s.length;
    // 重新跑一遍构建，记录每次插入后 last 对应的结束位置 i，作为该节点 endpos 初值
    // （buildPalindromeTree 内部未暴露每步 last，这里重跑以记录）
    var stepLast = [];
    // 复用 buildPalindromeTree 的逻辑记录每步 last
    var stNodes = [];
    stNodes.push({ id: 0, len: 0, link: 1, next: {}, count: 0, char: '' });
    stNodes.push({ id: 1, len: -1, link: 1, next: {}, count: 0, char: '' });
    var last2 = 0;
    function getLink2(v, i) {
      while (true) {
        var j = i - stNodes[v].len - 1;
        if (j >= 0 && s.charAt(j) === s.charAt(i)) return v;
        v = stNodes[v].link;
      }
    }
    for (var i = 0; i < n; i++) {
      var c = s.charAt(i);
      var cur = getLink2(last2, i);
      if (stNodes[cur].next[c] === undefined) {
        var newLen = stNodes[cur].len + 2;
        var newId = stNodes.length;
        stNodes.push({ id: newId, len: newLen, link: 0, next: {}, count: 0, char: c });
        if (newLen === 1) { stNodes[newId].link = 0; }
        else {
          var linkCur = getLink2(stNodes[cur].link, i);
          stNodes[newId].link = stNodes[linkCur].next[c] !== undefined ? stNodes[linkCur].next[c] : 0;
        }
        stNodes[cur].next[c] = newId;
      }
      last2 = stNodes[cur].next[c];
      stNodes[last2].count++;
      stepLast.push({ last: last2, pos: i });
    }
    // endpos 初值：每个被命中的 last 记录 pos
    var endpos = [];
    nodes.forEach(function () { endpos.push([]); });
    stepLast.forEach(function (rec) { endpos[rec.last].push(rec.pos); });
    // fail link 树自底向上合并（按 len 升序的逆序，但根节点 len=-1/0 在最前，需排除）
    // 按 len 降序排序（len 大的先处理，向 link 合并）
    var order = nodes.slice().sort(function (a, b) { return b.len - a.len; });
    order.forEach(function (nd) {
      if (nd.link >= 0 && nd.link !== nd.id && nd.id > 1) {
        endpos[nd.link] = endpos[nd.link].concat(endpos[nd.id]);
      }
    });
    nodes.forEach(function (nd) { endpos[nd.id].sort(function (a, b) { return a - b; }); });
    // 代表回文子串：用首个 endpos p，s[p-len+1..p]
    nodes.forEach(function (nd) {
      if (nd.len > 0 && endpos[nd.id].length > 0) {
        var p = endpos[nd.id][0];
        nd.repr = s.substring(p - nd.len + 1, p + 1);
      } else {
        nd.repr = '';
      }
    });
    return {
      string: s, nodes: nodes, oddRoot: res.oddRoot, evenRoot: res.evenRoot, last: res.last,
      base: this.base, endpos: endpos
    };
  };

  // ---- BWT / Runs / 位并行匹配 ----
  StringModel.prototype.getBWT = function () {
    var d = buildBWT(this.string);
    d.base = this.base;
    return d;
  };

  StringModel.prototype.getRuns = function () {
    var d = buildRuns(this.string);
    d.base = this.base;
    return d;
  };

  StringModel.prototype.getShiftAnd = function () {
    if (!this.patternP) return { err: '请输入模式串 P（位并行匹配输入框）' };
    var d = shiftAnd(this.string, this.patternP);
    d.base = this.base;
    return d;
  };

  StringModel.prototype.getShiftOr = function () {
    if (!this.patternP) return { err: '请输入模式串 P（位并行匹配输入框）' };
    var d = shiftOr(this.string, this.patternP);
    d.base = this.base;
    return d;
  };

  StringModel.prototype.getBNDM = function () {
    if (!this.patternP) return { err: '请输入模式串 P（位并行匹配输入框）' };
    var d = bndm(this.string, this.patternP);
    d.base = this.base;
    return d;
  };

  StringModel.prototype.getBOM = function () {
    if (!this.patternP) return { err: '请输入模式串 P（位并行匹配输入框）' };
    var d = bom(this.string, this.patternP);
    d.base = this.base;
    return d;
  };

  // ---------- Manacher ----------
  StringModel.prototype.getManacher = function () {
    var d = manacher(this.string);
    d.base = this.base;
    return d;
  };

  // ---------- Boyer-Moore ----------
  StringModel.prototype.getBoyerMoore = function () {
    if (!this.patternP) return { err: '请输入模式串 P（位并行匹配输入框）' };
    var d = boyerMoore(this.string, this.patternP);
    d.base = this.base;
    return d;
  };

  // ---------- 最小表示法 ----------
  StringModel.prototype.getMinRotation = function () {
    var d = minRotation(this.string);
    d.base = this.base;
    return d;
  };

  NS.models.StringModel = StringModel;
  NS.models.StringModel.BITPARALLEL = BITPARALLEL;
  NS.models.StringModel.NEEDS_PATTERN_P = NEEDS_PATTERN_P;
})();
